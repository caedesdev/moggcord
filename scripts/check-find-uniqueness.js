const fs = require("fs");
const s = fs.readFileSync(require("path").join(process.env.TEMP, "discord-web.js"), "utf8");

const finds = [
    "tab===AV.G2.GAME_SHOPS&&null!=n",
    "I=eL.BVt.COLLECTIBLES_SHOP;return(0,U.jsxs)(U.Fragment,{children:[m&&(0,U.jsx)(A$",
    'name:"CollectiblesShop"',
    "COLLECTIBLES_SHOP,render:vL(),disableTrack",
    "shopButtonDisplayOptions:s,dismissShopButtonDC:a",
];

for (const f of finds) {
    console.log(JSON.stringify(f), "->", s.split(f).length - 1);
}

// Route patch alternative
const routeRe = /path:\i\.\i\.COLLECTIBLES_SHOP,render:\i\(\),disableTrack:!0/g;
const canon = new RegExp(routeRe.source.replaceAll(/(\\*)\\i/g, (_, esc) =>
    esc.length % 2 === 0 ? `${esc}(?:[A-Za-z_$][\\w$]*)` : _.slice(1)
), "g");
console.log("route patch matches", [...s.matchAll(canon)].length);
