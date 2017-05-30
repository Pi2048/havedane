#!/usr/bin/python3

import fileinput
import re
import sqlite3
from datetime import datetime, date

for line in fileinput.input():
    result = re.search("([a-z0-9]*)\@do\.havedane\.net", line)
    if result:
        con = sqlite3.connect("/var/www/db/havedane.net.sqlite3")
        cur = con.cursor()
        cur.execute("SELECT firstreceived FROM tests WHERE alias = ?", (result.group(1),))
        data = cur.fetchall()
        for row in data:
            if (row[0] == 0):
                cur.execute("UPDATE tests SET firstreceived = ? WHERE alias = ?", (datetime.now(), result.group(1)))
            cur.execute("UPDATE tests SET do = 1 WHERE alias = ?", (result.group(1),))
            con.commit()
            break

        print(result.group(1))
        break
