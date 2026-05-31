const fs = require("fs");
const path = require("path");

const c = fs.readFileSync(path.join(process.env.TEMP, "discord-web.js"), "utf8");
const idx = c.indexOf('"discord-shop"');
console.log("discord-shop idx", idx);
if (idx >= 0) console.log(c.slice(Math.max(0, idx - 400), idx + 120));

let pos = 0;
let n = 0;
while ((pos = c.indexOf('"friends"', pos)) >= 0 && n < 50) {
    const sn = c.slice(Math.max(0, pos - 100), pos + 250);
    if (sn.includes("COLLECTIBLES") || sn.includes("selected") && sn.includes("NAVIGATION"))
        console.log("--- match", n, sn);
    pos++;
    n++;
}
