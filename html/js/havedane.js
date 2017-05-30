var intervalId;
var alias = "";
updatePage();

$(function(){
    intervalId = setInterval(updatePage, 5000);
}); //function

function copyAddresses() {
    var copyInput = document.getElementById("generatedaddresses");
    copyInput.select();
    document.execCommand('copy');
} //copyAddresses

function updatePage() {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            var response = JSON.parse(this.responseText);
            switch (response.state)
            {
                case "newalias": // A new alias was created by the server
                    alias = response.alias;
                    var addresses = "No DANE <" + response.alias + "@dont.havedane.net>, ";
                    addresses = addresses.concat("Correct DANE <" + response.alias + "@do.havedane.net>, ");
                    addresses = addresses.concat("Invalid DANE <" + response.alias + "@wrong.havedane.net>");
                    document.getElementById("generatedaddresses").value = addresses;
                    encodedAddresses = addresses.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                    document.getElementById("generatedaddresses-well").innerHTML = encodedAddresses;
                case "update": // A regular update of the received status
                    if (response.timeout) { // Stop polling, set alerts to timeout values
                        clearInterval(intervalId);
                        if (!response.hasnodane) {
                            $(".nondane").hide();
                            $(".nondane.alert-danger").show();
                        } //if
                        if (!response.hasdane) {
                            $(".havedane").hide();
                            $(".havedane.alert-danger").show();
                        } //if
                        if (!response.haswrongdane) {
                            $(".wrongdane").hide();
                            $(".wrongdane.alert-success").show();
                        } //if
                    } //if
                    if (response.hasnodane) { // Email has arrived; Good!
                        $(".nondane").hide();
                        $(".nondane.alert-success").show();
                    } //if
                    if (response.hasdane) { // Email has arrived; Good!
                        $(".havedane").hide();
                        $(".havedane.alert-success").show();
                    } //if
                    if (response.haswrongdane) { // Email has arrived; Bad!
                        $(".wrongdane").hide();
                        $(".wrongdane.alert-danger").show();
                    } //if
            } //switch
        } //if
    }; //function
    xhttp.open("GET", "ajax.php?alias=".concat(alias), true);
    xhttp.send();
} //updatePage
