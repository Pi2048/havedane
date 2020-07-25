#!/usr/bin/python3

import sqlite3

con = sqlite3.connect("/var/www/db/havedane.net.sqlite3")
cur = con.cursor()
cur.execute("DELETE FROM tests")
con.commit()
