function generatePreview(tymeObject, fakturoidObject) {
    tymeObject.importEntries();
    let output = "";
    output += `<tt>${tymeObject.debug_info_dates.join("") + fakturoidObject.loginStatus()}</tt>`;

    for (let i = 0; i < tymeObject.time_entries.length; i++) {
        output += `<br>${tymeObject.time_entries[i]["duration"]}`;
    }

    output += `<br><strong>Total: ${tymeObject.getTotalDuration()}</strong>`

    return output;
}

class FakturoidStuff {
    login_username;
    login_key;

    constructor() {
    }

    readForm() {
        this.login_username = formValue.login_username;
        this.login_key = formValue.login_key;
    }

    login() {

    }

    loginStatus() {
        return "<p style=\"color: red\">Fakturoid login error!</p>";
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
        this.task_selection = formValue.tyme_tasks;
    }

    evaluateFormDate(form_date_string, is_start) {
        const interpreted_date = new Date(form_date_string);
        if (isFinite(interpreted_date)) {
            if (is_start) {
                this.debug_info_dates[0] = `<br><span style=\"color: green\">Start date: ${interpreted_date.toDateString()}</span>`;
            } else {
                this.debug_info_dates[1] = `<br><span style=\"color: green\">End date: ${interpreted_date.toDateString()}</span>`;
            }
            return interpreted_date;

        } else if (is_start) {
            if (form_date_string === "") {
                this.debug_info_dates[0] = "<br><span style=\"color: green\">Start date: None </span>";
            } else {
                this.debug_info_dates[0] = `<br><span style=\"color: orange\">Start date: Ignored \"${form_date_string}\". Please use valid date in YYYY-MM-DD format.</span>`;
            }
            return new Date("1971-01-02");
        } else {
            if (form_date_string === "") {
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