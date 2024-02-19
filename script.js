let username;
let key;

function login() {
    username = formValue.login_username;
    key = formValue.login_key;
    generatePreview();
}

function generatePreview() {
    return `This is a preview<br>${username}<br>${key}`;
}