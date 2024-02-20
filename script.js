let username;
let key;

function generatePreview(tymeObject, fakturoidObject) {
    let output = "";
    output += fakturoidObject.loginStatus();
    
    for (let i = 0; i < tymeObject.time_entries.length; i++) {
        output += `<br>${tymeObject.time_entries[i]["duration"]}`;
    }

    output += `<br><strong>Total: ${tymeObject.getTotalDuration()}</strong>`

    return output;
}

class FakturoidStuff {
    constructor() {

    }

    login() {
        tyme.setSecureValue("fakturoid_username", formValue.login_username);
        tyme.setSecureValue("fakturoid_api_key", formValue.login_key);
    }

    loginStatus() {
        return "<p style=\"color: red\">Fakturoid login error!</p>";
    }
}


class TymeStuff {
    constructor() {
        this.time_entries;
        this.start_date;
        this.end_date;
        this.task_selection;
    }

    readForm() {
        let new_start_date;
        let new_end_date;

        if (formValue.start_date === "") {
            new_start_date = new Date("1971-01-02");
        } else {
            new_start_date = new Date(formValue.start_date);
        };

        if (formValue.end_date === "") {
            new_end_date = new Date(864000000000000);
        } else {
            new_end_date = new Date(formValue.end_date);
        };

        this.start_date = new_start_date;
        this.end_date = new_end_date;
        this.task_selection = formValue.tyme_tasks;
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
            utils.log("tymorroid: " + this.time_entries[i]["duration"]);
        }

        return sum;
    }
}

const tymeThing = new TymeStuff();
const fakturoidThing = new FakturoidStuff();
tymeThing.importEntries();