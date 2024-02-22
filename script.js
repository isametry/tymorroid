function generatePreview(tymeObject, fakturoidObject) {
    tymeObject.importEntries();
    fakturoidObject.login();
    let output = "";

    // Debug info only:
    output += `<tt>${tymeObject.debug_info_dates.join("")}<br>${fakturoidObject.login_status[0]}</tt>`;

    // INVOICE:
    output += "<div style=\"border: 1px solid; padding: 6px\">";
    for (let i = 0; i < tymeObject.time_entries.length; i++) {
        output += `<br>${tymeObject.time_entries[i]["duration"]}`;
    }

    output += `<br><strong>Total: ${tymeObject.getTotalDuration()}</strong>`

    return output;
}

class FakturoidStuff {
    login_slug;
    login_username;
    login_key;
    login_status;

    constructor() {
        this.login_status = [""];
    }

    readForm() {
        const form_URL = formValue.login_URL;
        let slug_candidate;
        const prefix = "app.fakturoid.cz/"

        //  avoiding regex at all costs:
        slug_candidate = form_URL.slice((form_URL.indexOf(prefix)+prefix.length))
        slug_candidate = slug_candidate.slice(0, slug_candidate.indexOf("/"));

        this.login_slug = slug_candidate;
        this.login_username = formValue.login_username;
        this.login_key = formValue.login_key;

        this.login_status[0] = `Fakturoid username: ${this.login_slug}`;
    }

    login() {
        this.readForm();
        // try {
        //     const response = await utils.request(url, method, headers, parameters);
        //     if (!response.ok) {
        //         throw new Error(`HTTP error! status: ${response.status}`);
        //     }
        //     const data = await response.json();
        //     // Use the data as needed
        // } catch (error) {
        //     console.error(error);
        // }
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
        // either use the date from the form, or ignore it entirely:
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
        // This is the only purpose of the inner if-statements. Otherwise, they are not needed.

        const interpreted_date = new Date(form_date_string);
        if (isFinite(interpreted_date)) {
            if (is_start) { // for information only
                this.debug_info_dates[0] = `<br><span style=\"color: green\">Start date: ${interpreted_date.toDateString()}</span>`;
            } else {
                this.debug_info_dates[1] = `<br><span style=\"color: green\">End date: ${interpreted_date.toDateString()}</span>`;
            }
            return interpreted_date;

        } else if (is_start) {
            if (form_date_string === "") { // for information only
                this.debug_info_dates[0] = "<br><span style=\"color: green\">Start date: None </span>";
            } else {
                this.debug_info_dates[0] = `<br><span style=\"color: orange\">Start date: Ignored \"${form_date_string}\". Please use valid date in YYYY-MM-DD format.</span>`;
            }
            return new Date("1971-01-02");
        } else {
            if (form_date_string === "") { // for information only
                this.debug_info_dates[1] = "<br><span style=\"color: green\">End date: None </span>";
            } else {
                this.debug_info_dates[1] = `<br><span style=\"color: orange\">End date: Ignored \"${form_date_string}\". Please use valid date in YYYY-MM-DD format.</span>`;
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
}

const tymeThing = new TymeStuff();
const fakturoidThing = new FakturoidStuff();