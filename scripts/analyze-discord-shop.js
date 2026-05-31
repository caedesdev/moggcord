const fs = require("fs");
const path = require("path");

const file = path.join(process.env.TEMP, "discord-web.js");
const s = fs.readFileSync(file, "utf8");

const keys = [
    "discord-shop",
    "CollectiblesShop",
    "COLLECTIBLES_SHOP",
    'tutorialId:"direct-messages"',
    '.FRIENDS},"friends"',
    "/shop",
    "NAVIGATION_LINK",
];

for (const k of keys) {
    let i = 0;
    let c = 0;
    while ((i = s.indexOf(k, i)) !== -1 && c < 5) {
        console.log(`\n--- ${k} @ ${i} ---`);
        console.log(s.slice(Math.max(0, i - 150), i + k.length + 200));
        i += k.length;
        c++;
    }
}
