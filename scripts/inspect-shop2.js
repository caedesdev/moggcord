const fs = require("fs");
const s = fs.readFileSync(require("path").join(process.env.TEMP, "discord-web.js"), "utf8");

// Find usages of lazy var CI near CollectiblesShop definition
const defPos = s.indexOf('name:"CollectiblesShop"');
console.log("CollectiblesShop def at", defPos);

// Look backwards for variable name
const before = s.slice(defPos - 10, defPos);
const varMatch = before.match(/(\w+)=\(\d+,rs\.Fe\)\(\{createPromise/);
console.log("var before end:", before);
console.log("varMatch:", varMatch);

// Search for patterns like "CollectiblesShop:CI" or "component:CI" near route definitions
const patterns = [
    /CollectiblesShop:\w+/g,
    /COLLECTIBLES_SHOP:\w+/g,
    /,\w+:CI[,}]/g,
    /component:CI/g,
    /render:\w*CI/g,
    /CI\}/g,
];

for (const p of patterns) {
    const m = [...s.matchAll(p)].slice(0, 5);
    if (m.length) console.log("\n", p, "->", m.map(x => x[0] + " @" + x.index));
}

// Find module 42109 export pattern
const mod42109 = s.indexOf("42109:");
console.log("\n42109 module at", mod42109);
if (mod42109 > 0) console.log(s.slice(mod42109, mod42109 + 500));

// A3 component - search for function near discord-shop tutorial
const a3pos = s.indexOf('},"discord-shop")');
console.log("\nA3 usage context:", s.slice(a3pos - 200, a3pos + 100));

// vL route render -> rT component
const vlPos = s.indexOf("vL=()=>");
console.log("\n=== vL ===\n", s.slice(vlPos, vlPos + 400));

const rtPos = s.indexOf("rT,{tab:t");
const chunk = s.slice(rtPos - 8000, rtPos);
const rtDefs = [...chunk.matchAll(/(?:let rT=|var rT=|,rT=|function rT\(|rT=\()/g)];
console.log("\nrT defs near vL:", rtDefs.slice(-3).map(m => chunk.slice(m.index, m.index + 120)));

// Find A3 component definition - search for discord-shop in intl or config
const shopNavIntl = s.indexOf('pWG4ze');
console.log("\nshop intl key context:", s.slice(shopNavIntl - 100, shopNavIntl + 100));

const dmTutorial = s.indexOf('tutorialId:"direct-messages"');
console.log("\n=== DM NAV SECTION (first 3000 chars) ===\n");
console.log(s.slice(dmTutorial, dmTutorial + 3000));

console.log("\n/shop occurrences:", (s.match(/"\/shop"/g) || []).length);
console.log("/collectibles-shop in BVt:", s.includes('COLLECTIBLES_SHOP:"/collectibles-shop"'));
for (const m of s.matchAll(/"\/shop[^"]*"/g)) console.log(" shop path:", m[0]);




