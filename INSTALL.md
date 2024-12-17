Use STARTTLS and DANE for your mail servers. The advice from RFC 7672[^1] is easy enough to give, but harder to implement. For incoming connections, online verifiers are [available](https://en.internet.nl/) (also [here](https://dane.sys4.de/)) that show whether you have properly configured your server and associated TLSA records. Outgoing connections are another matter. How do you scan an organisation's outgoing mail connections? The answer: you ask people to send emails to a specifically prepared mail server and check which messages arrive.

This is what [HaveDane.net](https://havedane.net) does. You can build your own HaveDane.net - this post explains how to do it.

I assume you have a regularly hardened Debian server on which you have root, and a domain name (havedane.net) which you use for only this purpose.

For my ease of writing, I will assume everywhere that you are the domain name owner of havedane.net. Obviously, you are not, as I own that domain. Change the instructions (and scripts!) to reflect the domain name you choose to use.

## Broad overview of the system

The system consists of two main components:

* a web application that creates email aliases on the fly whenever someone visits the site. It keeps the user up-to-date about the delivery of email messages to these aliases by regularly polling the server.
* a mail transfer agent (MTA) that receives email for three domains: do.havedane.net, which does have proper DANE records, dont.havedane.net, which doesn't, and wrong.havedane.net, which has DANE records that are invalid. It passes the messages on to scripts that process these, depending on the alias to which they were sent.

These two components are tied together by a database. In the database, the web application generates an alias for each visitor. In this row, the mail transfer agent records which emails have been delivered. The web application consults the row to update the user on the delivery of the emails he has sent.

## Install software

Install the required software:

    sudo apt-get install nginx
    sudo apt-get install php php-fpm sqlite3 php-sqlite3 easy-rsa
    sudo apt-get remove apache*

## Create database

We will use an SQLite3-database. If you expect many visitors, you may want to use a separate database server. The database will contain the aliases that the web application generates and for which the mail transfer agent will process email.

Create a directory `/var/www/db`. In this directory, create a database file: `sqlite3 havedane.net.sqlite3`. Make sure the database is writable to both the user that runs the web server and the user that runs the mail transfer agent. For example, make both the database and the directory that contains it world-writable.

In the database, create a table 'tests':

    CREATE TABLE tests (id INT PRIMARY KEY, alias TEXT, firstreceived DATETIME, do BOOLEAN, dont BOOLEAN, wrong BOOLEAN);

Next, add a trigger to delete old tests whenever a new one is started:

    CREATE TRIGGER delete_old_tests AFTER INSERT ON tests
    BEGIN
      DELETE FROM tests WHERE id < (SELECT MAX(id) FROM tests) - 1000;
    END;

This ensures that the database will not grow arbitrarily large, even when faced with a huge number of requests. However, it causes a small denial of service risk: if someone sends the server hundreds to thousands of requests per minute, other users will not be able to complete their tests. If this happens, you can increase the number of tests to keep in the trigger.

## Web application

Configure the web server to serve the contents of /var/www/html, while passing .php files to PHP-FPM.

Configure PHP-FPM to use the same timezone as the system time. This is important because the timestamps that PHP and bash generate have to match.

Import the code from the repository[^2] and install it in /var/www/html.

Copy config-example.php to config.php. Generate a secret string and set it as the value of the variable 'secret' in config.php. You can use `pwgen -s 42 1` to generate a random string. This secret value will be used to generate random email addresses. If an attacker knows this value, he can predict the email addresses other people will be served. He can then mess with their test results.

Reload the web server: `sudo service nginx reload`.

## Mail transfer agent: Postfix

First, create the certificates to which the DANE records will point.

Copy the easy-rsa directory to your /etc directory:

    sudo cp -R /usr/share/easy-rsa/ /etc/

Edit /etc/easy-rsa/vars to set the lifetime of the certificate to some very large value, such as 36500 (= about one hundred years). Set other values as you like them.

Source the vars script, run the cleanup script and then build the internal CA and the certificate:

    sudo -i
    cd /etc/easy-rsa
    mv vars.example vars
    ./easyrsa init-pki
    ./easyrsa build-ca nopass
    ./easyrsa build-server-full do.havedane.net nopass

Download the keys/do.havedane.net.crt and keys/ca.crt files to your workstation. We will use these to generate the DANE records later.

Postfix only accepts full x509 certificate chains, so concatenate the CA certificate and the server certificate:

    sudo -i
    cat issued/do.havedane.net.crt ca.crt > issued/do.havedane.net.fullchain.crt

Now, install postfix with `sudo apt install postfix`. Choose 'internet with smarthost' and set the system mail name to 'havedane.net'. Leave the relay host empty.

In /etc/postfix/main.cf, change or add the following settings:

    smtpd_tls_cert_file=/etc/easy-rsa/issued/do.havedane.net.fullchain.crt
    smtpd_tls_key_file=/etc/easy-rsa/issued/do.havedane.net.key
    smtpd_tls_security_level = may
    myhostname = havedane.net
    mydestination = havedane.net, localhost.net, localhost
    virtual_alias_domains = do.havedane.net, dont.havedane.net, wrong.havedane.net
    virtual_alias_maps = hash:/etc/postfix/virtual
    export_environment = TZ MAIL_CONFIG LANG PYTHONIOENCODING=UTF-8

The last line is to make sure diacritical characters do not crash the script. By default, Postfix on Debian passes the received emails in ANSI_X3.4-1968 encoding. This fixes that. The part 'TZ MAIL_CONFIG LANG' should be based on the output of `postconf -d | grep export_environment` - this is the default for Debian. Thanks to [Jeroen](https://twitter.com/1sand0s) for pointing out this bug.

Create /etc/postfix/virtual, containing catchall addresses for the three domains on which we will receive email:

    @do.havedane.net    dohavedanenet
    @dont.havedane.net  donthavedanenet
    @wrong.havedane.net wronghavedanenet

Run `postmap /etc/postfix/virtual` to process the virtual alias maps file.

Edit /etc/aliases to redirect the messages to the appropriate scripts, by adding:

    dohavedanenet: "|/root/bin/do-havedane-net.py 2>&1 > /tmp/do-havedane-net.log"
    donthavedanenet: "|/root/bin/dont-havedane-net.py 2>&1 > /tmp/dont-havedane-net.log"
    wronghavedanenet: "|/root/bin/wrong-havedane-net.py 2>&1 > /tmp/wrong-havedane-net.log"

Run `newaliases` to process the aliases file.

Put the three Python scripts {do,dont,wrong}-havedane-net.py[^2] in the /root/bin directory and make them world-executable. Make sure the user postfix can reach them, by making /root and /root/bin readable and executable for others too.

Reload the mail transfer agent: `sudo service postfix reload`.

## Domain name and DNS

On your workstation, install the tool [hash-slinger](https://github.com/letoams/hash-slinger). It may also be available through your package manager. As an alternative, you can use an online generator such as [this one](https://www.huque.com/bin/gen_tlsa).

First, generate legitimate TLSA records for do.havedane.net:

    tlsa --create --port 25 --usage 2 --selector 1 --certificate ca.crt do.havedane.net
    tlsa --create --port 25 --usage 3 --selector 1 --certificate do.havedane.net.crt do.havedane.net

On your DNS server (or at your DNS provider), set these as the TLSA record for TCP port 25 on do.havedane.net.

Next, make small modifications in the hash values that hash-slinger just computed, and set these as the TLSA records for wrong.havedane.net. Now, DANE verification of the certificate at wrong.havedane.net should fail. You can test this at the [sys4 DANE checker](https://dane.sys4.de).

For dont.havedane.net you don't have to set any TLSA records, as the point of this domain is that it does not have TLSA records.

Set A and AAAA records for havedane.net, do.havedane.net, dont.havedane.net and wrong.havedane.net. They should all point to your server. No separate MX records should be necessary, as mail servers use A and AAAA records in the absence of one.

Your DNS server or DNS provider must support DNSSEC. You can check whether this is the case at [internet.nl](https://en.internet.nl).

## I think that's it!

Obviously, I have written these instructions after I finished building HaveDane.net. Therefore, stuff will probably be missing. Contact me if you try these instructions but they do not work.

#### Footnotes

[^1]: [RFC 7672](https://datatracker.ietf.org/doc/rfc7672/): SMTP Security via Opportunistic DNS-Based Authentication of Named Entities (DANE) Transport Layer Security (TLS)
[^2]: The code for this project is available on [GitHub](https://github.com/Pi2048/havedane) under an MIT license.
