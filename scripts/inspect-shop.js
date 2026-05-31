const fs = require("fs");
const s = fs.readFileSync(require("path").join(process.env.TEMP, "discord-web.js"), "utf8");

console.log("CollectiblesShop count:", (s.match(/name:"CollectiblesShop"/g) || []).length);

let pos = 0;
for (let i = 0; i < 5; i++) {
    pos = s.indexOf('name:"CollectiblesShop"', pos);
    if (pos === -1) break;
    console.log("\n---", i, "at", pos);
    console.log(s.slice(Math.max(0, pos - 500), pos + 100));
    pos++;
}

const navRe = /\(0,\i\.jsx\)\(\i,\{selected:(\i===\i\.\i\.COLLECTIBLES_SHOP(?:\|\|\i\?\.startsWith\(\i\.\i\.COLLECTIBLES_SHOP\))?).{0,500}NAVIGATION_LINK\}\}\},"discord-shop"\)/;
const canon = new RegExp(navRe.source.replaceAll(/(\\*)\\i/g, (_, esc) =>
    esc.length % 2 === 0 ? `${esc}(?:[A-Za-z_$][\\w$]*)` : _.slice(1)
));
const nav = s.match(canon);
if (nav) {
    console.log("\n=== NAV PRIMARY FULL ===\n");
    console.log(nav[0]);
}

const shopPos = s.indexOf('name:"CollectiblesShop"');
const start = s.lastIndexOf("(0,rs.Fe)({createPromise", shopPos);
console.log("\n=== COLLECTIBLES LAZY START ===\n");
console.log(s.slice(start - 80, shopPos + 120));

// Simulate patch replace
const lazyRe = /createPromise:\(\)=>Promise\.all\(\[[^\]]*\]\)\.then\(\i\.bind\(\i,\d+\)\),webpackId:(\d+),name:"CollectiblesShop"/;
const lazyCanon = new RegExp(lazyRe.source.replaceAll(/(\\*)\\i/g, (_, esc) =>
    esc.length % 2 === 0 ? `${esc}(?:[A-Za-z_$][\\w$]*)` : _.slice(1)
));
const lazyM = s.match(lazyCanon);
if (lazyM) {
    const patched = lazyM[0].replace(lazyM[0],
        `createPromise:()=>Promise.resolve({default:()=>null}),webpackId:${lazyM[1]},name:"CollectiblesShop"`);
    console.log("\n=== PATCH SIM OK ===", patched.slice(0, 80));
}

// Find where CI (CollectiblesShop lazy) is used
const ciIdx = s.indexOf('name:"CollectiblesShop"');
const ciVar = s.slice(ciIdx - 5, ciIdx).match(/(\w+)=\(0,rs\.Fe\)/);
console.log("\n=== CI VAR ===", ciVar && ciVar[1]);

// Search COLLECTIBLES_SHOP route render
const routeIdx = s.indexOf("COLLECTIBLES_SHOP");
for (let i = 0; i < 3; i++) {
    const idx = s.indexOf("COLLECTIBLES_SHOP", routeIdx + (i ? 1 : 0));
    if (idx === -1) break;
    console.log("\nCOLLECTIBLES_SHOP at", idx, ":", s.slice(idx - 40, idx + 120));
}
