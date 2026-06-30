import { readFileSync } from "fs";
import { transformSync } from "esbuild";
const src = readFileSync("src/lib/outfitValidation.ts","utf8");
const js = transformSync(src,{loader:"ts",format:"esm"}).code;
const mod = await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const { validateOutfitItems } = mod;
const I = (category, name) => ({ category, user_facing_name: name });
const cases = [
  ["kurta + kurta", [I("Kurta","Blue kurta"), I("Kurta","Pink kurta")], false],
  ["kurta + t-shirt", [I("Kurta","Kurta"), I("Top","White tee")], false],
  ["top + top", [I("Top","Shirt"), I("Top","Blouse")], false],
  ["dress + top", [I("Dress","Gown"), I("Top","Tee")], false],
  ["two one-piece", [I("Dress","A"), I("Saree","B")], false],
  ["top only (no bottom)", [I("Top","Tee")], false],
  ["bottom only", [I("Bottom","Jeans")], false],
  ["accessory only", [I("Accessory","Bag")], false],
  ["unknown only", [I(null,"mystery thing")], false],
  ["VALID upper+bottom", [I("Top","Tee"), I("Bottom","Jeans")], true],
  ["VALID kurta+bottom+dupatta", [I("Kurta","Kurta"), I("Bottom","Palazzo"), I("Dupatta","Dupatta")], true],
  ["VALID dress+footwear+accessory", [I("Dress","Gown"), I("Footwear","Heels"), I("Accessory","Bag")], true],
  ["VALID top+bottom+blazer", [I("Top","Tee"), I("Bottom","Jeans"), I("Outerwear","Blazer")], true],
  ["VALID saree alone", [I("Saree","Silk saree")], true],
];
let pass=0, fail=0;
for (const [label, items, expected] of cases){
  const r = validateOutfitItems(items);
  const ok = r.valid === expected; ok ? pass++ : fail++;
  console.log(`${ok?"PASS":"FAIL"} | ${label} => valid=${r.valid}${r.reason?` ("${r.reason}")`:""}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
