// Injects catalog.json into public/index.html. The --preview page inlines style.css and app.js into one file. Add --preview to also write a demo page with the sample question bank.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const safe = (j) => j.replace(/</g, "\\u003c");
const catalog = JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8")));
const htmlPath = path.join(root, "public", "index.html");
let html = fs.readFileSync(htmlPath, "utf8");
html = html.replace(/<!--CATALOG-->[\s\S]*?<!--\/CATALOG-->/, () => `<!--CATALOG--><script type="application/json" id="catalog-data">${safe(catalog)}</script><!--/CATALOG-->`);
html = html.replace(/<!--BANK-->[\s\S]*?<!--\/BANK-->/, "<!--BANK--><!--/BANK-->"); // never ship answers in the real site
fs.writeFileSync(htmlPath, html);
console.log("public/index.html updated with catalog.json");

const i = process.argv.indexOf("--preview");
if (i > -1) {
  const out = process.argv[i + 1] || path.join(root, "preview.html");
  const bank = {};
  for (const f of fs.readdirSync(path.join(root, "bank"))) {
    if (f.endsWith(".json")) bank[f.replace(".json", "")] = JSON.parse(fs.readFileSync(path.join(root, "bank", f), "utf8"));
  }
  const css = fs.readFileSync(path.join(root, "public", "style.css"), "utf8").trim();
  const js = fs.readFileSync(path.join(root, "public", "app.js"), "utf8").trimEnd();
  const single = html
    .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
    .replace('<script src="app.js"></script>', () => `<script>\n${js}\n</script>`);
  const prev = single.replace("<!--BANK--><!--/BANK-->", () => `<!--BANK--><script>window.__BANK__=${safe(JSON.stringify(bank))}</script><!--/BANK-->`);
  fs.writeFileSync(out, prev);
  console.log("preview written to " + out + " (contains answers, do not deploy)");
}
