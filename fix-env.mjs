import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(dir, ".env");
if (!fs.existsSync(file)) {
  console.log(`\nNo .env file found in:\n${dir}\nPut fix-env.mjs in the same folder as server.js and your .env, then run it again.`);
  process.exit(1);
}
fs.copyFileSync(file, file + ".backup");
console.log(`\nFixing: ${file}\n(a copy was saved as .env.backup)\n`);

const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
const fixed = [];
const notes = [];

for (const line of raw) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
  if (!m) { fixed.push({ text: line }); continue; }
  let [, name, rest] = m;
  rest = rest.trim();
  let comment = "";
  const q = rest[0];
  if ((q === '"' || q === "'") && rest.indexOf(q, 1) > 0) {
    const end = rest.indexOf(q, 1);
    const after = rest.slice(end + 1).trim();
    comment = after.startsWith("#") ? after : "";
    rest = rest.slice(0, end + 1);
  } else {
    const c = /\s+#.*$/.exec(rest);
    if (c) { comment = c[0].trim(); rest = rest.slice(0, c.index).trim(); }
  }
  let value = rest;
  const secretLike = /(_KEY(_\d+)?|SECRET)$/.test(name);
  if (secretLike) value = value.replace(/^["']|["']$/g, "").trim();
  fixed.push({ name, value, comment });
}

const entries = fixed.filter((e) => e.name);
const idx = (n) => entries.filter((e) => e.name === n);
const val = (n) => idx(n).at(-1)?.value || "";
const set = (n, v) => { for (const e of idx(n)) e.value = v; };

for (const name of [...new Set(entries.map((e) => e.name))]) {
  const list = idx(name);
  if (list.length < 2) continue;
  let keep = list.filter((e) => e.value).at(-1) || list.at(-1);
  if (name === "GROQ_API_KEY") keep = list.find((e) => e.value.startsWith("gsk_")) || keep;
  for (const e of list) if (e !== keep) { e.drop = true; }
  notes.push(`${name} was written ${list.length} times. Kept one, removed the rest.`);
}

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rapidish = (v) => /msh|jsn/.test(v);
const a = val("JOB_API_KEY"), b = val("JOB_API_KEY_2");
if (guid.test(a) && !guid.test(b) && b) {
  set("JOB_API_KEY", b); set("JOB_API_KEY_2", a);
  notes.push("JOB_API_KEY and JOB_API_KEY_2 were swapped. I swapped them back (RapidAPI key first, Jooble key second).");
}

let cert = val("CERT_SECRET");
const stripped = cert.replace(/^(CERT_SECRET=)+/, "");
if (stripped !== cert) { cert = stripped; set("CERT_SECRET", cert); notes.push("CERT_SECRET had the name written twice. Fixed."); }
if (!cert) {
  cert = crypto.randomBytes(32).toString("hex");
  if (idx("CERT_SECRET").length) set("CERT_SECRET", cert); else fixed.push({ name: "CERT_SECRET", value: cert, comment: "" });
  notes.push("CERT_SECRET was empty. Generated a new one.");
}

const out = fixed.filter((e) => !e.drop).map((e) => (e.name ? `${e.name}=${e.value}${e.comment ? "   " + e.comment : ""}` : e.text));
fs.writeFileSync(file, out.join("\n").replace(/\n+$/, "") + "\n");

const final = (n) => fixed.filter((e) => e.name === n && !e.drop).at(-1)?.value || "";
const show = (v) => (v ? `starts with "${v.slice(0, 4)}", ${v.length} characters` : "EMPTY");
const check = (label, name, ok, hint) => {
  const v = final(name);
  console.log(`${v && ok(v) ? "OK   " : "FIX  "} ${label.padEnd(26)} ${show(v)}${v && ok(v) ? "" : "  <- " + hint}`);
};
console.log("What I changed:");
console.log(notes.length ? notes.map((n) => " - " + n).join("\n") : " - nothing needed changing");
console.log("\nCheck of your keys:");
check("Groq (Sage + exams)", "GROQ_API_KEY", (v) => v.startsWith("gsk_"), "must start with gsk_ . Make a new one at console.groq.com/keys (Groq, not Grok)");
check("RapidAPI JSearch", "JOB_API_KEY", rapidish, "should be the long key from rapidapi.com (no dashes)");
check("Jooble", "JOB_API_KEY_2", (v) => guid.test(v), "should have dashes like 65c99edc-b7c7-...");
check("OpenWeb Ninja (optional)", "OPENWEBNINJA_API_KEY", (v) => v.startsWith("ak_"), "should start with ak_");
check("CERT_SECRET", "CERT_SECRET", (v) => v.length >= 32, "should be a long random text");
console.log("\nNow save, then stop the server (Ctrl+C) and start it again.\n");