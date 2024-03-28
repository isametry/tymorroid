// CONFIG:

const invoice_unit_name = "h"; // word for "hour" shown on the invoice. change the text between the quotes.

// END OF CONFIG


const TYME_DATA_HIERARCHY = [
    "category", // 0
    "project", // 1
    "task", // 2
    "subtask", // 3
    "entry" // 4
];

const TYME_ID_HIERARCHY = {
    "category": "category_id",
    "project": "project_id",
    "task": "task_id",
    "subtask": "subtask_id",
    "entry": "id"
}

const ok_regex = /2\d\d/;

function roundToSixth(number) {
    return Math.round(number * 1000000) / 1000000;
}

function minsToHoursString(minutes) {
    const whole_minutes = Math.round(minutes);
    let rest = Math.round(whole_minutes % 60);
    let hours = (whole_minutes - rest) / 60;
    return `${hours}:${rest}`;
}

function minsToHourFloat(minutes, places = -1, mode = 0) {
    if (places >= 0) {
        const magnitude = 10 ** places;
        if (mode > 0) {
            // ROUND DOWN
            return Math.ceil((minutes / 60) * magnitude) / magnitude;
        } else if (mode < 0) {
            // ROUND UP
            return Math.floor((minutes / 60) * magnitude) / magnitude;
        } else {
            // ROUND PLAIN
            return Math.round((minutes / 60) * magnitude) / magnitude;
        }
    }

    return (minutes / 60);
}

function tryParseJson(json) {
    try {
        var o = JSON.parse(json);
        if (o && typeof o === "object") {
            return o;
        }
    } catch (e) {
    }
    return undefined;
}

class GroupedTimeEntries {

    // group time entries based on a given property, so that they can be merged into a single invoice item.
    // apart from the property (id) being identical, entries also need to have the same hourly rate.
    // groupable items are put in arrays, this.list keeps a master array of the group arrays.

    grouping_id_type;
    list;

    constructor(entries = [], grouping_type) {
        this.grouping_id_type = TYME_ID_HIERARCHY[grouping_type]; // "category_id" / "project_id" / "task_id" / "subtask_id" / "id"
        this.list = [];

        for (const entry of entries) {
            this.addEntry(entry);
        }
    }

    addEntry(entry) {
        const curr_id = entry[this.grouping_id_type];
        let found_index;
        let is_groupable = false;

        // ENTRY ID LOOKUP:

        if (curr_id) { // if exists and isn't ""
            for (let i = 0; i < this.list.length; i++) {
                if (this.list[i][0][this.grouping_id_type] == curr_id) {
                    found_index = i;
                    break;
                }
            }
        }

        // ENTRY COMPATIBILITY CHECKING:

        if (found_index != null && // a matching id is found on the list…
            entry.duration_unit === this.list[found_index][0].duration_unit &&
            entry.rate === this.list[found_index][0].rate // …and the two entries are actually comparable
        ) {
            is_groupable = true;
        }

        // ENTRY HANDLING:

        if (is_groupable) {
            this.list[found_index].push(entry);
            return;
        } else {
            const addition = new Array(entry);
            this.list.push(addition);
            return;
        }
    }

    addEntries(entries) { // adding multiple entries at once
        for (const element in entries) {
            this.addEntry(element);
        }
    }

    getEntriesInArrays() {
        return this.list;
    }
}

class FakturoidInvoiceItem {

    // Created from one or multiple time entries, objects of this class can be passed to Fakturoid as invoice lines.
    // With multiple entries, we assume the entries are compatible (same rate, same units – this is handled by GroupedTimeEntries) and sum up their duration.
    // Common data (name, rate and units) will be taken from the first entry received.

    name;
    quantity;
    unit_name;
    unit_price;

    constructor(input, bridge) {

        // overloaded constructor. the invoice item is always created from an array of time entries.
        // if only a single entry is received, it is placed in a single-item array.

        let entries;

        if (!(input instanceof Array)) {
            entries = new Array(input);
        } else {
            entries = input;
        }

        const first_entry = entries[0];
        this.unit_name = bridge.fakt_obj.time_unit_name;
        this.unit_price = first_entry.rate;

        // NAMING:
        // search for an applicable name from the time entry for the invoice line.

        //   look no deeper than the grouping_id:

        const current_lvl = TYME_DATA_HIERARCHY.indexOf(bridge.tyme_obj.grouping_type);
        if (current_lvl === -1) {
            current_lvl = TYME_DATA_HIERARCHY.length - 1;
        }

        //   start at the deepest level (e.g. subtask), if the name is empty, jump out (e.g. task):

        this.name = "";
        
        for (let i = current_lvl; i >= 0; i--) {
            if (first_entry[TYME_DATA_HIERARCHY[i]]) {
                this.name = bridge.fakt_obj.item_prefix + first_entry[TYME_DATA_HIERARCHY[i]];
                break;
            }
        }

        while (this.name.length <= 2) {
            this.name = this.name + ".";
        }

        let quantity_candidate = 0;
        for (const entry of entries) {
            quantity_candidate += entry.duration;
        }

        this.quantity = minsToHourFloat(
            quantity_candidate,
            bridge.fakt_obj.round_places,
            bridge.fakt_obj.round_method
        );

    }

    // no getter here. pass me directly to Fakturoid! 
}

class TymeStuff {
    time_entries;
    grouped_entries;
    unbilled_only;

    start_date;
    end_date;
    task_selection;
    grouping_type;
    debug_info;

    constructor() {
        this.debug_info = [];
        this.time_entries = [];
    }

    readForm() {
        // START DATE:
        if (formValue.dates_enabled && isFinite(formValue.start_date)) {
            this.start_date = formValue.start_date;
        } else {
            this.start_date = new Date("1970-01-02")
        }

        // END DATE:
        if (formValue.dates_enabled && isFinite(formValue.end_date)) {
            this.end_date = formValue.end_date;
        } else {
            this.end_date = new Date("2199-12-31");
        }

        this.task_selection = formValue.tyme_tasks;
        this.grouping_type = formValue.joining_dropdown;
        this.unbilled_only = formValue.unbilled_only_toggle;
    }

    importEntries() {
        utils.log("tymorroid: importing time entries…");
        this.time_entries = tyme.timeEntries(
            this.start_date,
            this.end_date,
            this.task_selection,
            null, // no limit
            (this.unbilled_only) ? 0 : null,
            true // => billable only
        );
        utils.log(`tymorroid: time entries imported, array length = ${this.time_entries.length}`);
    }

    processEntries() {
        this.readForm();
        this.importEntries();
        this.grouped_entries = new GroupedTimeEntries(
            this.time_entries,
            this.grouping_type
        );
    }

    getEntries() {
        return this.grouped_entries.getEntriesInArrays();
    }
}

class FakturoidStuff {
    credentials;
    headers;
    network_status;

    account_data;
    client_list;
    client_dropdown_items;
    selected_client;

    round_places;
    round_method;
    item_prefix;
    time_unit_name;

    constructor() {
        this.network_status = {
            login_successful: false,
            clients_successful: false,
            login_message: "Warning",
            login_detail: "Fakturoid connection status unknown",
            found_cached_user: false,
        };

        this.client_list = [];

        this.account_data = {};

        const cache_account_candidate = tyme.getSecureValue("tyme-fakturoid-cached-account-data");
        if (cache_account_candidate != null) {
            this.account_data = JSON.parse(cache_account_candidate);
            this.network_status.found_cached_user = true;
        }

        this.credentials = {
            slug: "",
            email: "",
            key: ""
        }

        this.time_unit_name = invoice_unit_name;
        this.readForm();
    }

    readForm() {
        const input_URL = formValue.login_URL;
        let slug_candidate;
        const URL_prefix = "app.fakturoid.cz/"

        // extract the "slug" (username) from the URL
        // (and avoiding regex at all costs, lol):

        slug_candidate = input_URL.slice((input_URL.indexOf(URL_prefix) + URL_prefix.length))
        slug_candidate = slug_candidate.slice(0, ((slug_candidate.includes("/")) ? slug_candidate.indexOf("/") : slug_candidate.length));

        this.credentials.slug = slug_candidate;
        this.credentials.email = formValue.login_email;
        this.credentials.key = formValue.login_key;

        this.headers = {
            "Authorization": `Basic ${utils.base64Encode(`${this.credentials.email}:${this.credentials.key}`)}`,
            "User-Agent": "Fakturoid Exporter for Tyme (max@akrman.com)",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        this.round_places = parseInt(formValue.round_places);
        this.round_method = parseInt(formValue.round_method);
        this.item_prefix = formValue.item_prefix;
        this.selected_client = formValue.clients_dropdown;
    }

    login() {
        this.readForm();
        utils.log("tymorroid: logging in…");
        try {
            const response = utils.request(`https://app.fakturoid.cz/api/v2/accounts/${this.credentials.slug}/account.json`, "GET", this.headers);
            if (ok_regex.test(response.statusCode)) {

                // SUCCESS:

                this.network_status.login_successful = true;
                this.account_data = JSON.parse(response.result);
                this.network_status.login_message = "Success!"
                this.network_status.login_detail = `Fakturoid connection successful as ${this.account_data.name}`;

                // write to storage:

                tyme.setSecureValue("tyme-fakturoid-cached-account-data", response.result);
            } else {

                // FAKTUROID (HTML) ERROR:

                this.network_status.login_message = "Error"
                this.network_status.login_detail = `Fakturoid connection: HTML error ${response.statusCode}`;
            }
        } catch (error) {

            // NETWORK / OTHER ERROR:

            this.network_status.login_message = "Error";
            this.network_status.login_detail = `Fakturoid connection error (${error})`;
        }

        tyme.showAlert(this.network_status.login_message, this.network_status.login_detail);
    }

    importClients() {
        this.readForm();
        utils.log("tymorroid: importing clients…");

        for (let i = 1; i < 100; i++) {
            try {
                const response = utils.request(`https://app.fakturoid.cz/api/v2/accounts/${this.credentials.slug}/subjects.json`, "GET", this.headers, { "page": i });

                if (ok_regex.test(response.statusCode)) {
                    // clients SUCCESS:

                    this.network_status.clients_successful = true;
                    const page = JSON.parse(response.result);

                    if (page.length > 0) {
                        for (const item of page) {
                            this.client_list.push(item);
                        }
                    } else {
                        break;
                    }
                } else {

                    // clients FAKTUROID ERROR:

                    this.network_status.clients_successful = false;
                    break;
                }
            } catch (error) {

                // clients NETWORK ERROR:

                this.network_status.clients_successful = false;
                break;
            }
        }
    }

    getClientList() {
        this.importClients();
        this.client_dropdown_items = [];
        if (this.network_status.clients_successful) {
            for (const client of this.client_list) {
                const next_item = {
                    "name": ("" + client["name"]),
                    "value": ("" + client["id"])
                };
                this.client_dropdown_items.push(next_item);
            }
            return this.client_dropdown_items;
        } // else:
        return [{ "name": "Error: no clients available!", "value": "" }];
    }
}

class TymorroidBridge {
    tyme_obj;
    fakt_obj;

    currency;

    invoice_items;
    invoice_body;

    constructor(tymeObject, fakturoidObject) {
        this.tyme_obj = tymeObject;
        this.fakt_obj = fakturoidObject;
    }

    generateInvoiceItems() {
        this.currency = tyme.currencyCode();

        this.tyme_obj.processEntries();
        this.fakt_obj.readForm();

        this.invoice_items = [];

        for (const group of this.tyme_obj.getEntries()) {

            const next_item = new FakturoidInvoiceItem(group, this);
            this.invoice_items.push(next_item);
        }

        utils.log(`tymorroid: prepared ${this.invoice_items.length} invoice items`);
    }

    getTotalDuration() {
        let output = 0;
        for (const entry of this.tyme_obj.time_entries) {
            output += entry.duration;
        }
        return output;
    }

    getPreview() {
        this.generateInvoiceItems();

        // INVOICE PREVIEW:

        const html_invoice_header =
            `<div style="float: left; text-align: center; width: 49%">
            <h3>${((this.fakt_obj.account_data.hasOwnProperty("name")) ? this.fakt_obj.account_data.name : "")}</h3>
            </div><div style="float: right; text-align: center; width: 49%">
            <h3></h3>
            </div>`

        let html_invoice_items = `<table style=\"border: none\">
        <thead>
            <tr>
                <td></td>
                <td></td>
                <td></td>
                <td>Per Unit</td>
                <td>Total</td>
            </tr>
        </thead>`;

        let total = {
            quantity: 0,
            price: 0,
            unit_name: (this.invoice_items.length > 0) ? this.invoice_items[0].unit_name : "",
            vat_amount: 0,
            price_incl_vat: 0
        };

        html_invoice_items += "<tbody>";
        for (const item of this.invoice_items) {
            html_invoice_items +=
                `<tr>
                    <td>${item.quantity}</td>
                    <td>${item.unit_name}</td>
                    <td>${item.name}</td>
                    <td>${item.unit_price} ${this.currency}</td>
                    <td style="align: left">${roundToSixth(item.quantity * item.unit_price)} ${this.currency}</td>
                </tr>`;

            if (item.unit_name == total.unit_name) {
                total.quantity += item.quantity;
            }
            total.price += item.unit_price * item.quantity;
        }
        html_invoice_items +=
            `<tr>
                    <td colspan="100%"></td>
                </tr>
            </tbody>`;

        let html_invoice_total = `<tfoot style="font-weight: bold;">`;

        if (
            (this.fakt_obj.network_status.login_successful || this.fakt_obj.network_status.found_cached_user) &&
            this.fakt_obj.account_data.vat_rate > 0 &&
            this.fakt_obj.account_data === "vat_payer" || this.fakt_obj.account_data === "identified_person"
        ) {
            if (this.fakt_obj.account_data.vat_price_mode === "from_total_with_vat") {
                for (const item of this.invoice_items) {
                    total.price_incl_vat += (item.quantity * item.unit_price) * ((100 + this.fakt_obj.account_data.vat_rate) / 100);
                }
                total.vat_amount = total.price_incl_vat - total.price;

            } else {
                total.vat_amount = total.price * (this.fakt_obj.account_data.vat_rate / 100);
                total.price_incl_vat = total.price + total.vat_amount;
            }

            html_invoice_total +=
                `<tr>
                    <td colspan="4">Total without VAT</td>
                    <td>${roundToSixth(total.price).toLocaleString()} ${this.currency}</td>
                </tr>
                <tr>
                    <td colspan="4">VAT ${this.fakt_obj.account_data.vat_rate}%</td>
                    <td>${roundToSixth(total.vat_amount).toLocaleString()} ${this.currency}</td>
                </tr>
                <tr>
                    <td colspan="4"></td>
                    <td>${roundToSixth(total.price_incl_vat).toLocaleString()} ${this.currency}</td>
                </tr>`
        } else {
            html_invoice_total +=
                `<tr>
                    <td colspan="4">Total</td>
                    <td>${total.price.toLocaleString()} ${this.currency}</td>
                </tr>`
        }

        html_invoice_total += "</tfoot></table>";

        let html_invoice =
            "<h2>Invoice Preview</h2><div style=\"border: solid 1px; padding: 6pt; margin: 8pt 0 8pt 0;\">"
            + html_invoice_header
            + html_invoice_items
            + html_invoice_total
            + "</div>";

        // OTHER INFO (dates, account tidbits):

        const html_debug =
            `<h2>Tyme Info</h2>
        <tt>
            Start date: ${this.tyme_obj.start_date.toDateString()}<br>
            End date: ${this.tyme_obj.end_date.toDateString()}<br>
            Real total duration: ${minsToHourFloat(this.getTotalDuration(), this.fakt_obj.round_places)} h (${minsToHoursString(this.getTotalDuration())})<br>
            Invoice total duration: ${roundToSixth(total.quantity)} ${total.unit_name}<br>
        </tt>`;

        const html_vat_note = `(The real sum${((total.vat_amount == 0) ? "" : " and VAT")} calculation is handled by Fakturoid, the above is just for illustration. If you've changed your Fakturoid tax defaults, please click "Check Login" and reopen this window.)`;

        return (html_debug + html_invoice + html_vat_note);
    }

    sendInvoice() {
        this.generateInvoiceItems();
        this.invoice_body = {
            "subject_id": formValue.clients_dropdown,
            "currency": this.currency,
            "lines": this.invoice_items
        }

        if (!isNaN(parseInt(formValue.clients_dropdown))) {
            utils.log(`tymorroid: sending invoice…`);
            try {
                const response = utils.request(
                    `https://app.fakturoid.cz/api/v2/accounts/${this.fakt_obj.credentials.slug}/invoices.json`,
                    "POST",
                    this.fakt_obj.headers,
                    this.invoice_body
                );

                if (ok_regex.test(response.statusCode)) {
                    const parsed_response = JSON.parse(response.result);
                    tyme.showAlert("Success", "Invoice generated with the number " + parsed_response.number);

                    if (formValue.mark_billed_toggle) {
                        let ids_to_mark = [];
                        for (const entry of this.tyme_obj.time_entries) {
                            ids_to_mark.push(entry.id);
                        }
                        tyme.setBillingState(ids_to_mark, 1);
                        this.generateInvoiceItems();
                    }

                    tyme.openURL(parsed_response.html_url);
                } else {
                    tyme.showAlert("Error", `Error ${response.statusCode}: ${response.result}`);
                }

            } catch (error) {
                tyme.showAlert("Error", `${error}`);
            }
        } else {
            tyme.showAlert("Error", "Please log in with Fakturoid and select a client!");
        }
    }
}

const tymeThing = new TymeStuff();
const fakturoidThing = new FakturoidStuff();
const mainThing = new TymorroidBridge(tymeThing, fakturoidThing);