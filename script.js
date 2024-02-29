const tyme_id_hierarchy = [
    ["category", "category_id"],
    ["project", "project_id"],
    ["task", "task_id"],
    ["subtask", "subtask_id"]
];

function htmlColor(string, color) {
    return `<span style=\"color: ${color}\">${string}</span>`;
}

function minsToHoursString(minutes) {
    const whole_minutes = Math.round(minutes);
    let rest = Math.round(whole_minutes % 60);
    let hours = (whole_minutes - rest) / 60;
    return `${hours}:${rest}`;
}

class TymorroidBridge {
    tyme_object;
    fakturoid_object;

    constructor(tymeObject, fakturoidObject) {
        this.tyme_object = tymeObject;
        this.fakturoid_object = fakturoidObject;
    }

    getPreview() {
        let output = "";

        // Debug info:
        output += `<tt>${this.tyme_object.debug_info_dates.join("<br>")}</tt>`;

        // INVOICE PREVIEW:
        output += "<div style=\"border: 1px solid; padding: 6px\">";
        for (let i = 0; i < this.tyme_object.time_entries.length; i++) {
            output += `<br>${minsToHoursString(this.tyme_object.time_entries[i]["duration"])} | ${this.tyme_object.time_entries[i]["task"]}`;
        }

        output += `<br><strong>Total: ${minsToHoursString(this.tyme_object.getTotalDuration())}</strong>`
        for (const line of this.tyme_object.invoice_entries) {
            output += "<br>";
            for (const label of tyme_id_hierarchy) {
                output += line.tyme_labels[label[0]] + " > ";
            }
            output += line.quantity;
        }

        return output;
    }
}

class FakturoidStuff {
    login_slug;
    login_email;
    login_key;
    headers;
    login_status;
    account_data;

    constructor() {
        this.login_status = {
            successful: false,
            message: "Warning",
            detail: "Fakturoid connection status unknown"
        };
    }

    readForm() {
        const form_URL = formValue.login_URL;
        let slug_candidate;
        const prefix = "app.fakturoid.cz/"

        // extract the "slug" (username) from the URL
        // (and avoiding regex at all costs, lol):

        slug_candidate = form_URL.slice((form_URL.indexOf(prefix) + prefix.length))
        slug_candidate = slug_candidate.slice(0, slug_candidate.indexOf("/"));

        this.login_slug = slug_candidate;
        this.login_email = formValue.login_email;
        this.login_key = formValue.login_key;
    }

    login() {
        this.readForm();
        this.headers = {
            "Authorization": `Basic ${utils.base64Encode(`${this.login_email}:${this.login_key}`)}`,
            "User-Agent": "Fakturoid Exporter for Tyme (max@akrman.com)",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        try {
            const response = utils.request(`https://app.fakturoid.cz/api/v2/accounts/${this.login_slug}/account.json`, "GET", this.headers);
            const ok = /2\d\d/;
            if (!ok.test(response.result)) {
                this.login_status.message = "Error"
                this.login_status.detail = `Fakturoid connection: HTML error ${response.statusCode}`;
            }
            this.login_status.successful = true;
            this.account_data = JSON.parse(response.result);
            this.login_status.message = "Success!"
            this.login_status.detail = `Fakturoid connection successful as ${this.account_data.name}`;

        } catch (error) {
            this.login_status.message = "Error";
            this.login_status["detail"] = `Fakturoid connection error (${error})`;
        }
        tyme.showAlert(this.login_status.message, this.login_status.detail);
    }
}

class InvoiceItem {
    quantity;
    unit_name;
    unit_price;
    vat_rate;

    tyme_labels = {};
    tyme_IDs = {};

    constructor(time_entry) {
        this.name = time_entry.name;
        this.quantity = time_entry.duration;
        this.unit_name = time_entry.duration_unit;
        this.unit_price = time_entry.rate;
        this.currency = time_entry.rate_unit;
        this.vat_rate = 0; // #TODO

        this.tyme_IDs["category_id"] = time_entry.category_id;
        this.tyme_IDs["project_id"] = time_entry.project_id;
        this.tyme_IDs["task_id"] = time_entry.task_id;
        this.tyme_IDs["subtask_id"] = time_entry.subtask_id;

        this.tyme_labels["category"] = time_entry.category;
        this.tyme_labels["project"] = time_entry.project;
        this.tyme_labels["task"] = time_entry.task;
        this.tyme_labels["subtask"] = time_entry.subtask;
    }

    addEntry(joinee, joining_id_type) {
        if (
            this.unit_name === joinee.duration_unit &&
            this.unit_price === joinee.rate &&
            this.currency === joinee.rate_unit
        ) {
            this.quantity += joinee.duration;

            let common_id_passed = false;
            for (const id of tyme_id_hierarchy) {
                if (!common_id_passed) {
                    this.tyme_IDs[id[1]] = joinee[id[1]];
                    this.tyme_labels[id[0]] = joinee[id[0]];
                } else {
                    this.tyme_IDs[id[1]] = "";
                    this.tyme_labels[id[0]] = "";
                }

                if (id[0] === joining_id_type) {
                    common_id_passed = true;
                }
            }
            return true;
        } else {
            return false;
        }
    }
}

class TymeStuff {
    time_entries;
    invoice_entries;
    start_date;
    end_date;
    task_selection;
    debug_info_dates;

    constructor() {
        this.debug_info_dates = ["", ""];
        this.exportEntries();
    }

    readForm() {
        this.start_date = this.evaluateFormDate(formValue.start_date, true);
        this.end_date = this.evaluateFormDate(formValue.end_date, false);

        // gather tasks from Tyme dropdown:
        this.task_selection = formValue.tyme_tasks;
    }

    evaluateFormDate(form_date_string, is_start) {
        // Evaluate string as a date:
        // -   if the string is a valid date YYYY-MM-DD, convert it and use it.
        // -   otherwise, throw a super early / super late date (depending on is_start).

        // Additionally, describe the result in .debug_info_dates
        // This is the only purpose of the inner if--else statements. Otherwise, they are not needed.

        const interpreted_date = new Date(form_date_string);
        if (isFinite(interpreted_date)) {
            if (is_start) { // for information only
                this.debug_info_dates[0] = htmlColor(`Start date: ${interpreted_date.toDateString()}</span>`, "green");
            } else {
                this.debug_info_dates[1] = htmlColor(`End date: ${interpreted_date.toDateString()}</span>`, "green");
            }
            return interpreted_date;

        } else if (is_start) {
            if (form_date_string === "") { // for information only
                this.debug_info_dates[0] = htmlColor("Start date: None </span>", "green");
            } else {
                this.debug_info_dates[0] = htmlColor(`Start date: Ignored \"${form_date_string}\". Use valid date in YYYY-MM-DD.</span>`, "orange");
            }
            return new Date("1971-01-02");
        } else {
            if (form_date_string === "") { // for information only
                this.debug_info_dates[1] = htmlColor("End date: None </span>", "green");
            } else {
                this.debug_info_dates[1] = htmlColor(`End date: Ignored \"${form_date_string}\". Use valid date in YYYY-MM-DD.</span>`, "orange");
            }
            return new Date("2099-12-31");
        }
    }

    importEntries() {
        this.readForm();
        this.time_entries = tyme.timeEntries(
            this.start_date,
            this.end_date,
            this.task_selection
        );
    }

    getTotalDuration() {
        let sum = 0;

        for (let i = 0; i < this.time_entries.length; i++) {
            sum += this.time_entries[i]["duration"];
        }

        return sum;
    }

    exportEntries() {
        const merging_property = formValue.joining_dropdown;
        this.importEntries();

        let merged_items = [];

        for (const time_entry of this.time_entries) {
            let search_property;

            // filter the joining method to only valid time time_entry IDs.
            // if parameter is something else, search_property remains empty and no joining is done.
            if (
                merging_property === "category_id" ||
                merging_property === "project_id" ||
                merging_property === "task_id" ||
                merging_property === "subtask_id"
            ) {
                search_property = merging_property;

            }

            let index_to_merge;

            // find existing invoice entry to merge with:

            for (let i = 0; i < merged_items.length; i++) {
                if (time_entry[search_property] === merged_items[i].tyme_IDs[search_property]) {
                    index_to_merge = i;
                    utils.log("tymorroid: index_to_merge: " + index_to_merge);
                }
            }

            if (!isNaN(index_to_merge)) {
                merged_items[index_to_merge].addEntry(time_entry, search_property);
            } else {
                merged_items.push(new InvoiceItem(time_entry));
            }
        }

        this.invoice_entries = merged_items;
    }
}

const tymeThing = new TymeStuff();
tymeThing.exportEntries();
const fakturoidThing = new FakturoidStuff();
const mainThing = new TymorroidBridge(tymeThing, fakturoidThing);