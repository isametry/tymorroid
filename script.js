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

function htmlColor(string, color) {
    return `<span style=\"color: ${color}\">${string}</span>`;
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

class GroupedTimeEntries {

    // group time entries based on a given property, so that they can be merged into a single invoice item.
    // apart from the property (id) being identical, entries also need to have the same currency and hourly rate.
    // groupable items are put in arrays, this.list keeps a master array of the group arrays.

    grouping_id_type;
    list;

    constructor(grouping_type, entries = []) {
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
            entry.rate === this.list[found_index][0].rate &&
            entry.rate_unit === this.list[found_index][0].rate_unit // …and the two entries are actually comparable
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
    name;
    quantity;
    currency;
    unit_name;
    unit_price;
    vat_rate;

    #grouping_type;
    #round_places;
    #round_method;

    constructor(input, vat_rate, grouping_type, round_places, round_method) {
        this.vat_rate = vat_rate;
        this.#grouping_type = grouping_type;
        this.#round_places = round_places;
        this.#round_method = round_method;

        // overloaded constructor. the invoice item is always created from an array of time entries.
        // if only a single entry is received, it shall be put in a single-item array below:

        if (!(input instanceof Array)) {
            input = new Array(input);
        }

        this.createFromEntries(input);

    }

    createFromEntries(entries) {
        const first_entry = entries[0];
        this.unit_name = "h";
        this.unit_price = first_entry.rate;
        this.currency = first_entry.rate_unit;

        const current_lvl = TYME_DATA_HIERARCHY.indexOf(this.#grouping_type);
        if (current_lvl === -1) {
            current_lvl = TYME_DATA_HIERARCHY.length - 1;
        }

        for (let i = current_lvl; i >= 0; i--) {
            if (this.name) {
                break;
            }
            this.name = first_entry[TYME_DATA_HIERARCHY[i]];
        }

        let quantity_candidate = 0;
        for (const entry of entries) {
            quantity_candidate += entry.duration;
        }

        this.quantity = minsToHourFloat(quantity_candidate, this.#round_places, this.#round_method);
    }

    // no getter here. pass me directly to Fakturoid! 
}

class TymeStuff {
    time_entries;
    grouping_id_type;

    start_date;
    end_date;
    task_selection;
    debug_info;

    constructor() {
        this.debug_info = [];
        this.time_entries = [];
        this.readForm();
        this.importEntries();
    }

    refresh() {
        this.readForm();
        this.importEntries();
    }

    readForm() {
        this.start_date = this.evaluateDateString(formValue.start_date, true);
        this.end_date = this.evaluateDateString(formValue.end_date, false);

        this.task_selection = formValue.tyme_tasks;
        this.grouping_id_type = formValue.joining_dropdown;
    }

    importEntries() {
        this.time_entries = tyme.timeEntries(
            this.start_date,
            this.end_date,
            this.task_selection,
            null, // no limit
            0, // => un-billed
            true // => billable
        );
    }

    getGroupingIDType() {
        return this.grouping_id_type;
    }

    getTimeEntries() {
        return this.time_entries;
    }

    getTotalDuration() {
        let output = 0;
        for (const entry of this.time_entries) {
            output += entry.duration;
        }
        return output;
    }

    evaluateDateString(input_date_string, is_start) {
        //  if the string is a valid date YYYY-MM-DD, convert it and use it.
        //  otherwise, return a super early / super late date (depending on is_start).

        const interpreted_date = new Date(input_date_string);
        if (isFinite(interpreted_date)) {
            return interpreted_date;
        } else if (is_start) {
            return new Date("1971-01-02");
        }
        return new Date("2099-12-31");
    }
}

class FakturoidStuff {
    credentials;

    headers;
    network_status;
    account_data;
    vat_rate;
    client_list;

    round_places;
    round_method;

    constructor() {
        this.network_status = {
            login_successful: false,
            login_message: "Warning",
            login_detail: "Fakturoid connection status unknown",
            clients_successful: false
        };

        this.credentials = {
            slug: "",
            email: "",
            key: ""
        }
    }

    readForm() {
        try {
            const input_URL = formValue.login_URL;
            let slug_candidate;
            const prefix = "app.fakturoid.cz/"

            // extract the "slug" (username) from the URL
            // (and avoiding regex at all costs, lol):

            slug_candidate = input_URL.slice((input_URL.indexOf(prefix) + prefix.length))
            slug_candidate = slug_candidate.slice(0, slug_candidate.indexOf("/"));

            this.credentials.slug = slug_candidate;
            this.credentials.email = formValue.login_email;
            this.credentials.key = formValue.login_key;

            this.headers = {
                "Authorization": `Basic ${utils.base64Encode(`${this.credentials.email}:${this.credentials.key}`)}`,
                "User-Agent": "Fakturoid Exporter for Tyme (max@akrman.com)",
                "Content-Type": "application/json",
                "Accept": "application/json"
            }

            if (!isNaN(formValue.vat_rate)) {
                this.vat_rate = formValue.vat_rate;
            } else {
                this.vat_rate = 0;
            }

            this.round_places = parseInt(formValue.round_places);
            this.round_method = parseInt(formValue.round_method);

        } catch (error) {
            tyme.showAlert("Error", "Could not launch plugin GUI");
        }
    }

    login() {
        this.readForm();
        try {
            const response = utils.request(`https://app.fakturoid.cz/api/v2/accounts/${this.credentials.slug}/account.json`, "GET", this.headers);
            const ok_regex = /2\d\d/;
            if (ok_regex.test(response.statusCode)) {
                this.network_status.login_successful = true;
                this.account_data = JSON.parse(response.result);
                this.network_status.login_message = "Success!"
                this.network_status.login_detail = `Fakturoid connection successful as ${this.account_data.name}`;
            } else {
                this.network_status.login_message = "Error"
                this.network_status.login_detail = `Fakturoid connection: HTML error ${response.statusCode}`;
            }

        } catch (error) {
            this.network_status.login_message = "Error";
            this.network_status.login_detail = `Fakturoid connection error (${error})`;
        }
        tyme.showAlert(this.network_status.login_message, this.network_status.login_detail);
    }

    importClients() {
        this.readForm();
        try {
            const response = utils.request(`https://app.fakturoid.cz/api/v2/accounts/${this.credentials.slug}/subjects.json`, "GET", this.headers);
            const ok_regex = /2\d\d/;
            utils.log("tymorroid contacts list: " + response.statusCode);
            if (ok_regex.test(response.statusCode)) {
                this.network_status.clients_successful = true;
                this.client_list = JSON.parse(response.result);
            } else {
                this.network_status.clients_successful = false;
            }
        } catch (error) {
            this.network_status.clients_successful = false;
        }
    }

    getClientList() {
        this.importClients();
        if (this.network_status.clients_successful) {
            const dropdown_items = [];
            for (const client of this.client_list) {
                const next_item = {
                    "name": ("" + client["name"]),
                    "value": ("" + client["id"])
                };
                dropdown_items.push(next_item);
            }
            return dropdown_items;
        } else {
            return [{ "name": "Error: no clients available!", "value": "" }];
        }
    }
}

class TymorroidBridge {
    tyme_obj;
    fakt_obj;
    currency;

    grouped_entries;
    invoice_items;

    constructor(tymeObject, fakturoidObject) {
        this.tyme_obj = tymeObject;
        this.fakt_obj = fakturoidObject;
    }

    generateInvoiceItems() {
        this.tyme_obj.refresh();
        this.fakt_obj.readForm();
        this.grouped_entries = new GroupedTimeEntries(this.tyme_obj.getGroupingIDType(), this.tyme_obj.getTimeEntries());

        this.invoice_items = [];
        this.currency = this.tyme_obj.time_entries[0].rate_unit;

        for (const group of this.grouped_entries.getEntriesInArrays()) {
            const next_item = new FakturoidInvoiceItem(
                group,
                this.fakt_obj.vat_rate,
                this.tyme_obj.getGroupingIDType(),
                formValue.round_places,
                formValue.round_method
            );

            if (this.currency != undefined && next_item.currency != this.currency) {
                this.currency = undefined;
            }

            this.invoice_items.push(next_item);
        }
    }

    getPreview() {
        this.generateInvoiceItems();

        // INVOICE PREVIEW:

        let html_invoice_table = "<h2>Invoice Preview</h2><div style=\"border: 1px solid; padding: 6px\"><table style=\"border: 0pt\">";

        html_invoice_table += 
        `<thead>
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
            unit_name: this.invoice_items[0].unit_name,
            price: 0,
            currency: this.invoice_items[0].currency
        }

        html_invoice_table += "<tbody>";
        for (const item of this.invoice_items) {
            html_invoice_table +=
                `<tr>
                    <td>${item.quantity}</td>
                    <td>${item.unit_name}</td>
                    <td>${item.name}</td>
                    <td>${item.unit_price} ${item.currency}</td>
                    <td>${item.unit_price * item.quantity} ${item.currency}</td>
                </tr>`;

            if (item.unit_name == total.unit_name) {
                total.quantity += item.quantity;
            }
            total.price += item.unit_price * item.quantity;
        }
        html_invoice_table += "</tbody>";

        html_invoice_table += 
            `<tfoot>
                <tr style="font-weight: bold; border-top: 2pt solid">
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td>${total.price} ${total.currency}</td>
                </tr>
            </tfoot>`;

        html_invoice_table += "</table></div>";

        const html_debug =
        `<h2>Tyme Info</h2>
        <tt>
            Start date: ${this.tyme_obj.start_date.toDateString()}<br>
            End date: ${this.tyme_obj.end_date.toDateString()}<br>
            Real total duration: ${minsToHourFloat(this.tyme_obj.getTotalDuration(), this.fakt_obj.round_places)} h (${minsToHoursString(this.tyme_obj.getTotalDuration())})<br>
            Invoice total duration: ${Math.round(total.quantity*1000000)/1000000} ${total.unit_name}<br>
        </tt>`;

        return html_debug + html_invoice_table;
    }
}

const tymeThing = new TymeStuff();
tymeThing.refresh();
const fakturoidThing = new FakturoidStuff();
const mainThing = new TymorroidBridge(tymeThing, fakturoidThing);