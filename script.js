function htmlColor(string, color) {
    return `<span style=\"color: ${color}\">${string}</span>`;
}

function minsToHoursString(minutes) {
    const whole_minutes = Math.round(minutes);
    let rest = Math.round(whole_minutes % 60);
    let hours = (whole_minutes - rest) / 60;
    return `${hours}:${rest}`;
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
            tldr: "Warning",
            message: "Fakturoid connection status unknown"
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
                this.login_status.tldr = "Error"
                this.login_status.message = `Fakturoid connection: HTML error ${response.statusCode}`;
            }
            this.login_status.successful = true;
            this.account_data = JSON.parse(response.result);
            this.login_status.tldr = "Success!"
            this.login_status.message = `Fakturoid connection successful as ${this.account_data.name}`;

        } catch (error) {
            this.login_status.tldr = "Error";
            this.login_status["message"] = `Fakturoid connection error (${error})`;
        }
        tyme.showAlert(this.login_status.tldr, this.login_status.message);
    }
}


class TymeStuff {
    time_entries;
    start_date;
    end_date;
    task_selection;
    debug_info_dates;

    constructor() {
        this.debug_info_dates = ["", ""];
        this.importEntries();
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

    getPreview() {
        this.importEntries();

        let output = "";

        // Debug info:
        output += `<tt>${this.debug_info_dates.join("<br>")}</tt>`;

        // INVOICE PREVIEW:
        output += "<div style=\"border: 1px solid; padding: 6px\">";
        for (let i = 0; i < this.time_entries.length; i++) {
            output += `<br>${minsToHoursString(this.time_entries[i]["duration"])} | ${this.time_entries[i]["task"]}`;
        }

        output += `<br><strong>Total: ${minsToHoursString(this.getTotalDuration())}</strong>`

        return output;
    }

}

const tymeThing = new TymeStuff();
const fakturoidThing = new FakturoidStuff();