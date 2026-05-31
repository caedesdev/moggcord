const fs = require("fs");
const path = require("path");

const s = fs.readFileSync(path.join(process.env.TEMP, "discord-web.js"), "utf8");

const patterns = [
    [/createPromise:\(\)=>[^,]+,webpackId:(\d+),name:"CollectiblesShop"/, "lazy OLD"],
    [/createPromise:\(\)=>Promise\.all\(\[[^\]]*\]\)\.then\(\i\.bind\(\i,\d+\)\),webpackId:(\d+),name:"CollectiblesShop"/, "lazy NEW"],
    [/render:\i\(\),disableTrack:!0/g, "route render vL"],
    [/return Object\.values\(\i\.G2\)\.includes\(t\)\?\(0,\i\.jsx\)\(\i,\{tab:t,\.\.\.e\}\):\(0,\i\.jsx\)\(\i,\{\.\.\.e\}\)/, "vL inner return"],
    [/icon:\i\?\?\i\.U,text:na\.intl\.string\(na\.t\.pWG4ze\)/, "Az nav label"],
];

const finds = [
    ["tab===AV.G2.GAME_SHOPS&&null!=n", "vL find WRONG"],
    ["t===AV.G2.GAME_SHOPS&&null!=n", "vL find CORRECT"],
    ["render:vL(),disableTrack:!0", "route find"],
    ["shopButtonDisplayOptions:s,dismissShopButtonDC:a", "Az find"],
    ['name:"CollectiblesShop"', "lazy find"],
];

function canon(re) {
    return new RegExp(re.source.replaceAll(/(\\*)\\i/g, (_, esc) =>
        esc.length % 2 === 0 ? `${esc}(?:[A-Za-z_$][\\w$]*)` : _.slice(1)
    ));
}

for (const [re, name] of patterns) {
    const m = s.match(canon(re));
    console.log(`${name}: ${m ? "MATCH len=" + m[0].length : "NO MATCH"}`);
}

console.log("\n--- find strings ---");
for (const [f, name] of finds) {
    console.log(`${name}: ${s.includes(f) ? "FOUND" : "MISSING"}`);
}
