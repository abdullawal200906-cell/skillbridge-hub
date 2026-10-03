// Checks your .env and tests your keys. Values are never printed.
// Run:  node --env-file=.env scripts/check.mjs
const env = process.env;
const has = (k) => !!(env[k] && env[k].trim());
const ok = (m) => console.log("  OK    " + m);
const fix = (m) => console.log("  FIX   " + m);

console.log("\nChecking your .env (values are never shown)\n");
for (const k of ["JOB_API_KEY", "ANTHROPIC_API_KEY", "CERT_SECRET", "RESEND_API_KEY"]) has(k) ? ok(k + " is set") : fix(k + " is empty");
if (has("CERT_SECRET") && env.CERT_SECRET.trim().length < 32) fix("CERT_SECRET is too short. Use 32 or more characters.");

async function jobs() {
  if (!has("JOB_API_KEY")) return;
  try {
    const r = await fetch("https://jsearch.p.rapidapi.com/search?query=developer%20in%20Lagos&page=1&num_pages=1&country=" + (env.JOB_COUNTRY || "ng"), {
      headers: { "X-RapidAPI-Key": env.JOB_API_KEY.trim(), "X-RapidAPI-Host": "jsearch.p.rapidapi.com" },
    });
    if (r.ok) ok("Job search works (JSearch answered)");
    else if (r.status === 403) fix("JSearch says 403. Open JSearch on RapidAPI and tap Subscribe on the free plan, then try again.");
    else if (r.status === 401) fix("JSearch says 401. The JOB_API_KEY is wrong. Copy it again from RapidAPI.");
    else if (r.status === 429) fix("JSearch says 429. You used your free quota for now.");
    else fix("JSearch returned status " + r.status);
  } catch (e) { fix("Could not reach JSearch. Check your internet."); }
}
async function jooble() {
  const key = (env.JOOBLE_API_KEY || env.JOB_API_KEY_2 || "").trim();
  if (!key) return;
  try {
    const r = await fetch("https://jooble.org/api/" + encodeURIComponent(key), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords: "developer", location: "Nigeria", page: "1" }) });
    r.ok ? ok("Jooble works") : fix("Jooble returned status " + r.status + ". Check JOB_API_KEY_2.");
  } catch (e) { fix("Could not reach Jooble. Check your internet."); }
}
async function ai() {
  if (!has("ANTHROPIC_API_KEY")) return;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY.trim(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: env.TUTOR_MODEL || "claude-haiku-4-5-20251001", max_tokens: 8, messages: [{ role: "user", content: "Say hi" }] }),
    });
    if (r.ok) ok("AI works (Anthropic answered)");
    else if (r.status === 401) fix("Anthropic says 401. The ANTHROPIC_API_KEY is wrong. Create a new key in the console.");
    else if (r.status === 404) fix("Anthropic says 404. The model name in TUTOR_MODEL is wrong.");
    else if (r.status === 400) fix("Anthropic says 400. Most often your account has no credit. Add credit in the Anthropic console.");
    else if (r.status === 429) fix("Anthropic says 429. Too many requests. Wait a minute.");
    else fix("Anthropic returned status " + r.status);
  } catch (e) { fix("Could not reach Anthropic. Check your internet."); }
}
await jobs();
await jooble();
await ai();
console.log("\nDone. Fix every line that says FIX, save .env, then run this again.\n");
