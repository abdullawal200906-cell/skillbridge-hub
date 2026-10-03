import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
// If something fails inside a route (for example the database), answer with a clear error instead of crashing or hanging.
for (const method of ["get", "post", "put"]) {
  const original = app[method].bind(app);
  app[method] = (route, ...handlers) => original(route, ...handlers.map((h) =>
    typeof h === "function" && h.constructor.name === "AsyncFunction"
      ? async (req, res, next) => {
          try { await h(req, res, next); }
          catch (e) { console.error("route error:", req.path, e.message); if (!res.headersSent) res.status(503).json({ error: "The server is busy. Please try again in a moment." }); }
        }
      : h));
}
app.use(express.json({ limit: "400kb" }));
app.use(express.static(path.join(__dirname, "public")));

/* ---------- read the .env that sits next to this file; its values win over leftover system variables ---------- */
const ENV_PATH = path.join(__dirname, ".env");
try {
  const txt = await fs.readFile(ENV_PATH, "utf8");
  for (const line of txt.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v.indexOf(q, 1) > 0) v = v.slice(1, v.indexOf(q, 1));
    else v = v.replace(/\s+#.*$/, "").trim();
    if (v !== "") process.env[m[1]] = v;
  }
  console.log(`Settings loaded from ${ENV_PATH}`);
} catch {
  console.log(`No .env file at ${ENV_PATH}. Using system environment variables only.`);
}

const {
  JOB_API_KEY, JOB_COUNTRY = "ng", RESEND_API_KEY, EMAIL_FROM, EMAIL_TO,
  ANTHROPIC_API_KEY, TUTOR_MODEL = "claude-haiku-4-5-20251001",
  GEMINI_API_KEY, GEMINI_MODEL = "gemini-2.5-flash",
  GROQ_API_KEY, GROQ_MODEL = "openai/gpt-oss-20b", GROQ_EXAM_MODEL = "openai/gpt-oss-120b",
  EXAM_MODEL = "claude-sonnet-5-5", COACH_NAME = "Ayo", EXAM_SIZE = "50", PASS_MARK = "70", PUBLIC_URL = "",
} = process.env;
const EXAM_MAX = Math.min(Math.max(parseInt(EXAM_SIZE) || 50, 10), 80);
const PASS = Math.min(Math.max(parseInt(PASS_MARK) || 70, 50), 95);
let CERT_SECRET = process.env.CERT_SECRET;
if (!CERT_SECRET) {
  CERT_SECRET = crypto.randomBytes(32).toString("hex");
  console.warn("CERT_SECRET is not set. Using a random one, so passes are lost when the server restarts. Set CERT_SECRET in production.");
}

/* ---------- AI provider: Groq (free) if GROQ_API_KEY is set, else Gemini (free tier), else Claude ---------- */
const AI_ENABLED = !!(GROQ_API_KEY || GEMINI_API_KEY || ANTHROPIC_API_KEY);
const AI_PROVIDER = GROQ_API_KEY ? "groq" : GEMINI_API_KEY ? "gemini" : ANTHROPIC_API_KEY ? "claude" : "none";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (GROQ_API_KEY) {
  const k = GROQ_API_KEY.trim();
  console.log(`Groq key check: starts with "${k.slice(0, 4)}", ${k.length} characters.` + (k.startsWith("gsk_") ? "" : "  WARNING: a Groq key must start with gsk_. This one looks like it is from another website."));
}

// tier: "tutor" (Sage chat) or "exam" (question generation). messages: [{ role: "user" | "assistant", content }]
async function callAI({ tier, system, messages, max_tokens }) {
  if (GROQ_API_KEY) {
    const isOss = (m) => /gpt-oss/.test(m);
    // Sage uses the small fast model, exams the bigger one. If Groq says a model is not available, try the other.
    const models = [...new Set(tier === "exam" ? [GROQ_EXAM_MODEL, GROQ_MODEL] : [GROQ_MODEL, GROQ_EXAM_MODEL])];
    for (const model of models) {
      const payload = { model, messages: [{ role: "system", content: system }, ...messages], max_completion_tokens: max_tokens + (isOss(model) ? 1500 : 0), temperature: 0.7 };
      if (isOss(model)) payload.reasoning_effort = "low"; // these models think first; keep it short so the answer fits
      const send = () => fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${GROQ_API_KEY.trim()}` },
        body: JSON.stringify(payload),
      });
      let r = await send();
      if (r.status === 429) { // free-tier speed limit: wait a few seconds and try once more
        const wait = Math.min(Math.max(parseFloat(r.headers.get("retry-after")) || 5, 1), 20);
        await sleep(wait * 1000);
        r = await send();
      }
      if (r.status === 404) {
        console.error(`Groq: model "${model}" is not available for your account. Trying another one...`);
        continue;
      }
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        console.error("Groq error", r.status, detail.slice(0, 400));
        if (r.status === 401) console.error("-> Groq rejected the key. Fix GROQ_API_KEY in .env (it must start with gsk_), save the file, then stop and restart the server.");
        throw new Error(`AI provider returned ${r.status}`);
      }
      const data = await r.json();
      return String(data.choices?.[0]?.message?.content || "").trim();
    }
    console.error("Groq: none of the models worked. Open console.groq.com/docs/models to see which models your account can use, then set GROQ_MODEL in .env.");
    throw new Error("AI provider returned 404");
  }

  if (GEMINI_API_KEY) {
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: max_tokens, temperature: 0.7 },
    };
    // 2.5 models "think" first, which eats the token budget. Turn that off to keep replies fast and cheap.
    if (/2\.5-flash/.test(GEMINI_MODEL)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("Gemini error", r.status, detail.slice(0, 400));
      throw new Error(`AI provider returned ${r.status}`);
    }
    const data = await r.json();
    return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("\n").trim();
  }

  const model = tier === "exam" ? EXAM_MODEL : TUTOR_MODEL;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens, system, messages }),
  });
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    console.error("Claude error", r.status, detail.slice(0, 400));
    throw new Error(`AI provider returned ${r.status}`);
  }
  const body = await r.json();
  return (body.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

/* ---------- storage: Upstash database if configured (data survives restarts), else local files ---------- */
const REDIS_URL = (process.env.UPSTASH_REDIS_REST_URL || "").trim().replace(/\/+$/, "").replace(/^(?!https?:\/\/)(?=.)/, "https://");
const REDIS_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
const USE_REDIS = !!(REDIS_URL && REDIS_TOKEN);
async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${REDIS_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(`database error: ${data.error || "status " + r.status}`);
  return data.result;
}
function pathFor(key) { // keys: users, certificates, messages, state:<id>, gen:<topic>
  const [kind, id] = key.split(":");
  if (kind === "state") return path.join(__dirname, "data", "state", `${id}.json`);
  if (kind === "gen") return path.join(__dirname, "data", "generated", `${id}.json`);
  return path.join(__dirname, "data", `${kind}.json`);
}
async function dbGet(key, fallback) { // throws if the database cannot be reached, so we never overwrite good data by mistake
  if (USE_REDIS) {
    const v = await redis(["GET", key]);
    return v == null ? fallback : JSON.parse(v);
  }
  return readJson(pathFor(key), fallback);
}
async function dbSet(key, value) {
  if (USE_REDIS) { await redis(["SET", key, JSON.stringify(value)]); return; }
  const file = pathFor(key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}
console.log(USE_REDIS ? "Storage: Upstash database (your data survives restarts)" : "Storage: local files in the data folder (erased on Render's free plan)");
if (USE_REDIS) redis(["PING"]).then(() => console.log("Database connected.")).catch((e) => console.error("Database check failed:", e.message, "<- check UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN"));

/* ---------- tiny in-memory rate limiter ---------- */
function limiter(max, windowMs) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const rec = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (rec.length >= max) return res.status(429).json({ error: "Too many requests. Try again shortly." });
    rec.push(now);
    hits.set(req.ip, rec);
    next();
  };
}

/* ---------- jobs: several providers, the first one with results wins ---------- */
const cache = new Map(); // key -> { at, data }
const TTL = 10 * 60 * 1000;
const EXP = new Set(["no_experience", "under_3_years_experience", "more_than_3_years_experience", "no_degree"]);
const strip = (t) => String(t || "").replace(/<[^>]+>/g, "").trim();
// JOB_API_KEY = JSearch. JOB_API_KEY_3 = a spare JSearch key (second RapidAPI account) used when the first runs out.
const JSEARCH_KEYS = [JOB_API_KEY, process.env.JOB_API_KEY_3].map((k) => (k || "").trim()).filter(Boolean);
// JOB_API_KEY_2 (or JOOBLE_API_KEY) = Jooble, which covers Nigeria.
const JOOBLE_KEY = (process.env.JOOBLE_API_KEY || process.env.JOB_API_KEY_2 || "").trim();
// OPENWEBNINJA_API_KEY = the same JSearch data straight from the maker (app.openwebninja.com). Free tier, no card needed.
const OWN_KEY = (process.env.OPENWEBNINJA_API_KEY || "").trim();

const jsCursors = new Map(); // remembers the "next page" cursor that JSearch gives us for each query

async function viaJSearch({ query, location, page, exp }) {
  const q = location ? `${query} in ${location}` : query;
  const base = JSON.stringify([q, exp]);
  const params = new URLSearchParams({ query: q, country: JOB_COUNTRY });
  if (exp) params.set("job_requirements", exp);
  if (page > 1) { // /search-v2 pages with a cursor, not a page number
    const cursor = jsCursors.get(base + (page - 1));
    if (!cursor) return [];
    params.set("cursor", cursor);
  }
  const targets = [];
  if (OWN_KEY) targets.push({ name: "OpenWeb Ninja", url: "https://api.openwebninja.com/jsearch/search-v2", headers: { "x-api-key": OWN_KEY } });
  for (const key of JSEARCH_KEYS) targets.push({ name: "RapidAPI", url: "https://jsearch.p.rapidapi.com/search-v2", headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" } });
  let last = "no key";
  for (const t of targets) {
    let r;
    try {
      r = await fetch(`${t.url}?${params}`, { headers: t.headers, signal: AbortSignal.timeout(20000) });
    } catch (e) { // network problem (no internet, DNS, firewall, timeout): say why, then try the next key
      last = `${t.name} network error: ${e.cause?.code || e.name || e.message}`;
      console.error("JSearch:", last);
      continue;
    }
    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 200);
      last = `${t.name} status ${r.status} ${detail}`.trim();
      console.error("JSearch error:", last); // e.g. 403 "You are not subscribed to this API."
      continue; // try the next key
    }
    const body = await r.json();
    const list = Array.isArray(body.data) ? body.data : Array.isArray(body.data?.jobs) ? body.data.jobs : Array.isArray(body.jobs) ? body.jobs : null;
    if (!list) { last = "unexpected response, top-level keys: " + Object.keys(body).join(", "); console.error("JSearch:", last); continue; }
    const next = body.cursor ?? body.data?.cursor ?? body.meta?.cursor ?? body.next_cursor ?? null;
    if (next) jsCursors.set(base + page, next);
    return list.map((j) => ({
      id: j.job_id, title: j.job_title, company: j.employer_name,
      location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(", "),
      type: j.job_employment_type || "", salary: j.job_min_salary || null, salaryMax: j.job_max_salary || null,
      currency: j.job_salary_currency || "", period: (j.job_salary_period || "").toLowerCase(),
      url: j.job_apply_link, source: j.job_publisher || "JSearch", postedAt: j.job_posted_at_datetime_utc || null, remote: !!j.job_is_remote,
    }));
  }
  throw new Error(last);
}
async function viaJooble({ query, location, page }) {
  const r = await fetch(`https://jooble.org/api/${encodeURIComponent(JOOBLE_KEY)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ keywords: query, location: location || "Nigeria", page: String(page) }),
  });
  if (!r.ok) {
    const raw = await r.text().catch(() => "");
    const detail = /<html/i.test(raw) ? "blocked by Jooble's bot protection (Cloudflare)" : raw.slice(0, 200);
    throw new Error(`status ${r.status} ${detail}`.trim());
  }
  const body = await r.json();
  return (body.jobs || []).map((j) => ({
    id: "jb-" + j.id, title: strip(j.title), company: strip(j.company), location: strip(j.location),
    type: strip(j.type).toUpperCase(), salary: null, salaryMax: null, currency: "", period: "",
    url: j.link, source: j.source || "Jooble", postedAt: j.updated || null, remote: /remote/i.test(j.location || ""),
  }));
}
async function viaRemotive({ query, page }) { // free, no key, remote jobs only
  if (page > 1) return [];
  const r = await fetch(`https://remotive.com/api/remote-jobs?limit=30&search=${encodeURIComponent(query)}`);
  if (!r.ok) throw new Error(`status ${r.status}`);
  const body = await r.json();
  return (body.jobs || []).map((j) => ({
    id: "rm-" + j.id, title: strip(j.title), company: strip(j.company_name), location: j.candidate_required_location || "Remote",
    type: String(j.job_type || "").toUpperCase(), salary: null, salaryMax: null, currency: "", period: "",
    url: j.url, source: "Remotive", postedAt: j.publication_date || null, remote: true,
  }));
}
const PROVIDERS = [];
if (JSEARCH_KEYS.length || OWN_KEY) PROVIDERS.push(["JSearch", viaJSearch]);
if (JOOBLE_KEY) PROVIDERS.push(["Jooble", viaJooble]);
PROVIDERS.push(["Remotive", viaRemotive]);
console.log(`Job sources: ${PROVIDERS.map((p) => p[0]).join(", ")} | RapidAPI keys loaded: ${JSEARCH_KEYS.length}${OWN_KEY ? " | OpenWeb Ninja key loaded" : ""}`);

app.get("/api/jobs", limiter(30, 60 * 1000), async (req, res) => {
  const query = String(req.query.query || "jobs").slice(0, 100);
  const location = String(req.query.location || "").slice(0, 60);
  const page = Math.min(Math.max(parseInt(req.query.page) || 1, 1), 10);
  const exp = EXP.has(req.query.experience) ? req.query.experience : "";
  const key = JSON.stringify([query, location, page, exp]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return res.json(hit.data);

  const notes = []; let errors = 0;
  for (const [name, fn] of PROVIDERS) {
    try {
      const jobs = (await fn({ query, location, page, exp })).filter((j) => j.title);
      if (jobs.length) {
        const data = { jobs, page, hasMore: jobs.length >= 10, source: name };
        cache.set(key, { at: Date.now(), data });
        return res.json(data);
      }
      notes.push(`${name}: no results`);
    } catch (e) { errors++; notes.push(`${name}: ${e.message}`); console.error("jobs provider failed:", name, e.message); }
  }
  if (errors === PROVIDERS.length) return res.status(502).json({ error: "Job providers are not answering. " + notes.join("; ") });
  res.json({ jobs: [], page, hasMore: false, source: "", note: notes.join("; ") });
});

/* ---------- contact form ---------- */
const MSG_FILE = path.join(__dirname, "data", "messages.json");

app.post("/api/contact", limiter(5, 10 * 60 * 1000), async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 100);
  const email = String(req.body?.email || "").trim().slice(0, 150);
  const message = String(req.body?.message || "").trim().slice(0, 3000);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !message) {
    return res.status(400).json({ error: "Enter your name, a valid email and a message." });
  }

  // 1) store the message
  try {
    const all = await dbGet("messages", []);
    all.push({ name, email, message, at: new Date().toISOString() });
    await dbSet("messages", all.slice(-500));
  } catch (e) {
    console.error("store error:", e.message);
  }

  // 2) email via Resend (optional). Tries twice if the internet hiccups, and says why when it fails.
  let emailed = false;
  if (RESEND_API_KEY && EMAIL_TO) {
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    for (let attempt = 1; attempt <= 2 && !emailed; attempt++) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY.trim()}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: EMAIL_FROM || "onboarding@resend.dev",
            to: [EMAIL_TO],
            reply_to: email,
            subject: `New message from ${name}`,
            html: `<p><b>${esc(name)}</b> (${esc(email)})</p><p>${esc(message).replace(/\n/g, "<br>")}</p>`,
          }),
          signal: AbortSignal.timeout(20000),
        });
        emailed = r.ok;
        if (!r.ok) { // Resend answered but refused: print its reason and stop trying
          const detail = await r.text().catch(() => "");
          console.error("Resend error", r.status, detail.slice(0, 300));
          break;
        }
      } catch (e) { // could not reach Resend at all (internet, DNS, firewall, timeout)
        console.error(`email error (try ${attempt} of 2): could not reach Resend:`, e.cause?.code || e.name || e.message);
        if (attempt === 1) await sleep(2000);
      }
    }
    if (emailed) console.log("Contact email sent.");
  }
  res.json({ ok: true, emailed });
});

/* ---------- AI tutor "Sage" (Gemini or Anthropic) ---------- */
const TUTOR_SYSTEM = `You are ${COACH_NAME}, a friendly and funny skill coach inside the Job & Skills Opportunity Hub.
Your learners are mostly in Nigeria and Africa, often on phones with limited data.
Help them choose a skill, teach concepts in simple words, quiz them one question at a time, and suggest free resources.
Skills in the app: web development, data analysis, UI/UX design, digital marketing, cybersecurity.
Rules: keep replies under 120 words, plain text only (no markdown tables or headings), ask at most one question at a time,
be encouraging with light humor (never mock the learner), and gently steer unrelated topics back to learning and careers.
Never ask for passwords, payment details or other sensitive personal information.`;

app.post("/api/tutor", limiter(15, 60 * 1000), async (req, res) => {
  if (!AI_ENABLED) return res.status(503).json({ error: "AI tutor is not configured." });
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = raw
    .slice(-10)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 1500) }))
    .filter((m) => m.content);
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return res.status(400).json({ error: "Send a message first." });
  }
  try {
    const reply = await callAI({ tier: "tutor", system: TUTOR_SYSTEM, messages, max_tokens: 500 });
    res.json({ reply: reply || "I went blank. Try asking again." });
  } catch (e) {
    console.error("tutor error:", e.message);
    res.status(502).json({ error: e.message.startsWith("AI provider") ? `${e.message}.` : "Could not reach the AI provider." });
  }
});

/* ================= ACCOUNTS (email + password) & PROGRESS SYNC ================= */
const USERS_FILE = path.join(__dirname, "data", "users.json");
const STATE_DIR = path.join(__dirname, "data", "state");
await fs.mkdir(STATE_DIR, { recursive: true });
const STATE_KEYS = ["saved", "apps", "road", "pass", "certs", "meta", "notes", "log"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const hashPw = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 64, (e, k) => (e ? no(e) : ok(k))));
function makeToken(uid) {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const sig = crypto.createHmac("sha256", CERT_SECRET).update(`auth.${uid}.${exp}`).digest("hex");
  return `${uid}.${exp}.${sig}`;
}
function readToken(h) {
  const m = /^Bearer ([\w-]+)\.(\d+)\.([a-f0-9]{64})$/.exec(h || "");
  if (!m) return null;
  const [, uid, exp, sig] = m;
  if (Number(exp) < Date.now()) return null;
  const want = crypto.createHmac("sha256", CERT_SECRET).update(`auth.${uid}.${exp}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? uid : null;
}
async function authed(req, res, next) {
  const uid = readToken(req.headers?.authorization);
  if (!uid) return res.status(401).json({ error: "Please sign in again." });
  const users = await dbGet("users", []);
  const user = users.find((u) => u.id === uid);
  if (!user) return res.status(401).json({ error: "Account not found." });
  req.user = user;
  next();
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email });

app.post("/api/auth/register", limiter(8, 10 * 60 * 1000), async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 150);
  const password = String(req.body?.password || "");
  if (!NAME_RE.test(name)) return res.status(400).json({ error: "Enter your full name using letters only." });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error: "Use a password of at least 8 characters." });
  const users = await dbGet("users", []);
  if (users.some((u) => u.email === email)) return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
  const salt = crypto.randomBytes(16).toString("hex");
  const user = { id: crypto.randomUUID(), name, email, salt, hash: (await hashPw(password, salt)).toString("hex"), createdAt: new Date().toISOString() };
  users.push(user);
  await dbSet("users", users);
  res.json({ token: makeToken(user.id), user: publicUser(user) });
});

app.post("/api/auth/login", limiter(10, 10 * 60 * 1000), async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const users = await dbGet("users", []);
  const user = users.find((u) => u.email === email);
  const bad = () => res.status(401).json({ error: "Wrong email or password." });
  if (!user) { await hashPw(password, "0".repeat(32)); return bad(); }
  const got = await hashPw(password, user.salt);
  if (!crypto.timingSafeEqual(got, Buffer.from(user.hash, "hex"))) return bad();
  res.json({ token: makeToken(user.id), user: publicUser(user) });
});

app.get("/api/me", limiter(60, 60 * 1000), authed, (req, res) => res.json({ user: publicUser(req.user) }));

app.get("/api/state", limiter(60, 60 * 1000), authed, async (req, res) => {
  const st = await dbGet("state:" + req.user.id, null);
  res.json(st || { state: null, updatedAt: 0 });
});

app.put("/api/state", limiter(60, 60 * 1000), authed, async (req, res) => {
  const incoming = req.body?.state;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return res.status(400).json({ error: "Bad data." });
  const state = {};
  for (const k of STATE_KEYS) if (incoming[k] !== undefined && typeof incoming[k] === "object") state[k] = incoming[k];
  const text = JSON.stringify(state);
  if (text.length > 300000) return res.status(413).json({ error: "Your saved data is too large. Delete some notes." });
  const updatedAt = Date.now();
  await dbSet("state:" + req.user.id, { state, updatedAt });
  res.json({ ok: true, updatedAt });
});

/* ================= EXAMS & CERTIFICATES ================= */
const CATALOG = JSON.parse(await fs.readFile(path.join(__dirname, "catalog.json"), "utf8"));
const TOPICS = new Map(); // topicId -> { skill, track, topic }
for (const s of CATALOG) for (const t of s.tracks) for (const tp of t.topics) TOPICS.set(tp.id, { skill: s, track: t, topic: tp });

const BANK_DIR = path.join(__dirname, "bank");
const GEN_DIR = path.join(__dirname, "data", "generated");
const CERT_FILE = path.join(__dirname, "data", "certificates.json");
await fs.mkdir(GEN_DIR, { recursive: true });

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim(); // keeps symbols: "//" and "/*" are different answers
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function validQ(q) {
  return q && typeof q.q === "string" && q.q.length > 8 && q.q.length <= 500 && typeof q.c === "string" && q.c.length <= 200 &&
    Array.isArray(q.w) && q.w.length === 3 && q.w.every((x) => typeof x === "string" && x.length > 0 && x.length <= 200) &&
    new Set([q.c, ...q.w].map(norm)).size === 4 && typeof q.t === "string" && q.t.length <= 500;
}
const cleanQ = (q) => ({ q: q.q.trim(), c: q.c.trim(), w: q.w.map((x) => x.trim()), t: q.t.trim() });

async function loadPool(topicId) {
  const bank = await readJson(path.join(BANK_DIR, `${topicId}.json`), []);
  const gen = await dbGet("gen:" + topicId, []);
  return { bank, gen, all: [...bank, ...gen].filter(validQ) };
}

async function generateQuestions(info, n, avoid) {
  const { skill, track, topic } = info;
  const system = "You write hard, fair certification exam questions. Output ONLY a JSON array, no markdown fences, no commentary.";
  const user = `Write ${n} multiple-choice exam questions.
Skill: ${skill.name}. Path: ${track.name}. Topic: ${topic.name}. Topic scope: ${topic.desc}.
Difficulty: this is a hard exam. About 20% intermediate, 50% advanced, 30% tricky (code reading, scenarios, "what happens if", common mistakes). No trivia, no definitions that can be guessed.
Rules: exactly one clearly correct answer; 3 plausible wrong answers that real learners would pick; never use "all of the above" or "none of the above"; keep each option under 140 characters; questions must be independent and cover different sub-topics; if code helps, include a short snippet inline as plain text.
Random seed for variety: ${crypto.randomBytes(4).toString("hex")}.
${avoid.length ? "Do NOT repeat or rephrase these existing questions:\n- " + avoid.join("\n- ") : ""}
Return a JSON array. Each item: {"q":"question","c":"the correct option","w":["wrong 1","wrong 2","wrong 3"],"t":"1 to 2 sentence explanation of why the correct answer is right"}`;
  const text = await callAI({ tier: "exam", system, messages: [{ role: "user", content: user }], max_tokens: 6000 });
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try { return JSON.parse(m[0]).filter(validQ).map(cleanQ); } catch { return []; }
}

const genLocks = new Map();
async function ensurePool(topicId, need) {
  let pool = await loadPool(topicId);
  if (!AI_ENABLED || pool.all.length >= need * 2) return pool.all;
  if (genLocks.has(topicId)) { await genLocks.get(topicId).catch(() => {}); return (await loadPool(topicId)).all; }
  const job = (async () => {
    const info = TOPICS.get(topicId);
    const want = need * 2 - pool.all.length;
    const batches = Math.min(Math.ceil(want / 12), 5);
    const avoid = shuffle(pool.all.map((q) => q.q.slice(0, 80))).slice(0, 30);
    const results = await Promise.allSettled(Array.from({ length: batches }, () => generateQuestions(info, Math.min(12, want), avoid)));
    const seen = new Set(pool.all.map((q) => norm(q.q)));
    const fresh = [];
    for (const r of results) if (r.status === "fulfilled") for (const q of r.value) { const k = norm(q.q); if (!seen.has(k)) { seen.add(k); fresh.push(q); } }
    if (fresh.length) await dbSet("gen:" + topicId, [...pool.gen, ...fresh]);
  })();
  genLocks.set(topicId, job);
  try { await job; } catch (e) { console.error("generate error:", e.message); } finally { genLocks.delete(topicId); }
  return (await loadPool(topicId)).all;
}

const exams = new Map(); // examId -> { topicId, name, key:[idx], why:[str], qs:[...], expires, submitted }
setInterval(() => { const now = Date.now(); for (const [id, e] of exams) if (e.expires < now) exams.delete(id); }, 5 * 60 * 1000).unref();

const NAME_RE = /^[\p{L}][\p{L}\p{M} .'\-]{1,59}$/u;
const sign = (payload) => crypto.createHmac("sha256", CERT_SECRET).update(JSON.stringify(payload)).digest("hex");

app.post("/api/exam/start", limiter(12, 10 * 60 * 1000), async (req, res) => {
  const topicId = String(req.body?.topicId || "");
  const info = TOPICS.get(topicId);
  if (!info) return res.status(400).json({ error: "Unknown topic." });
  const name = String(req.body?.name || "").trim();
  if (!NAME_RE.test(name)) return res.status(400).json({ error: "Enter your full name (letters only) before starting." });
  let size = Math.min(Math.max(parseInt(req.body?.size) || EXAM_MAX, 10), EXAM_MAX);
  try {
    const pool = await ensurePool(topicId, size);
    if (pool.length < 10) return res.status(503).json({ error: "This topic has no questions yet. Add a bank file or set GROQ_API_KEY (or GEMINI_API_KEY) so questions can be generated." });
    size = Math.min(size, pool.length);
    const picked = shuffle(pool).slice(0, size);
    const qs = [], key = [], why = [];
    for (const q of picked) {
      const opts = shuffle([q.c, ...q.w]);
      qs.push({ q: q.q, o: opts }); key.push(opts.indexOf(q.c)); why.push(q.t);
    }
    const seconds = size * 60;
    const id = crypto.randomUUID();
    exams.set(id, { topicId, name, key, why, qs, expires: Date.now() + (seconds + 300) * 1000, submitted: false });
    res.json({ examId: id, questions: qs, seconds, pass: PASS });
  } catch (e) {
    console.error("exam start error:", e.message);
    res.status(500).json({ error: "Could not prepare the exam. Try again." });
  }
});

app.post("/api/exam/submit", limiter(20, 10 * 60 * 1000), (req, res) => {
  const e = exams.get(String(req.body?.examId || ""));
  if (!e) return res.status(404).json({ error: "This exam expired or does not exist. Start a new one." });
  if (e.submitted) return res.status(409).json({ error: "This exam was already submitted." });
  e.submitted = true;
  const given = Array.isArray(req.body?.answers) ? req.body.answers : [];
  let score = 0;
  const review = e.qs.map((q, i) => {
    const yours = Number.isInteger(given[i]) && given[i] >= 0 && given[i] < 4 ? given[i] : -1;
    if (yours === e.key[i]) score++;
    return { q: q.q, o: q.o, yours, correct: e.key[i], t: e.why[i] };
  });
  const total = e.qs.length, pct = Math.round((score / total) * 100), passed = pct >= PASS;
  const out = { score, total, pct, passed, pass: PASS, review };
  if (passed) {
    const info = TOPICS.get(e.topicId);
    const payload = { skillId: info.skill.id, trackId: info.track.id, topicId: e.topicId, name: e.name, pct, date: new Date().toISOString().slice(0, 10) };
    out.token = { payload, sig: sign(payload) };
  }
  res.json(out);
});

app.post("/api/certificate", limiter(10, 10 * 60 * 1000), async (req, res) => {
  const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens.slice(0, 20) : [];
  const valid = tokens.filter((t) => t && t.payload && typeof t.sig === "string" && t.sig.length === 64 &&
    crypto.timingSafeEqual(Buffer.from(sign(t.payload)), Buffer.from(t.sig)) && t.payload.pct >= PASS);
  if (!valid.length) return res.status(400).json({ error: "No valid passed tests found." });
  const { skillId, trackId, name } = valid[0].payload;
  const skill = CATALOG.find((s) => s.id === skillId), track = skill?.tracks.find((t) => t.id === trackId);
  if (!track) return res.status(400).json({ error: "Unknown track." });
  const mine = valid.filter((t) => t.payload.skillId === skillId && t.payload.trackId === trackId && t.payload.name === name);
  const byTopic = new Map(mine.map((t) => [t.payload.topicId, t.payload]));
  const missing = track.topics.filter((tp) => !byTopic.has(tp.id));
  if (missing.length) return res.status(400).json({ error: "You still need to pass: " + missing.map((m) => m.name).join(", ") + "." });
  const topics = track.topics.map((tp) => ({ n: tp.name, p: byTopic.get(tp.id).pct }));
  const avg = Math.round(topics.reduce((a, t) => a + t.p, 0) / topics.length);
  const all = await dbGet("certificates", []);
  let cert = all.find((c) => c.name === name && c.trackId === trackId && c.skillId === skillId);
  if (!cert) {
    cert = { id: "SB-" + crypto.randomBytes(5).toString("hex").toUpperCase(), name, skillId, trackId, skillName: skill.name, trackName: track.name, avg, topics, date: new Date().toISOString().slice(0, 10) };
    all.push(cert);
    await dbSet("certificates", all);
  }
  res.json({ cert, verifyUrl: PUBLIC_URL ? `${PUBLIC_URL.replace(/\/$/, "")}/?verify=${cert.id}` : "" });
});

app.get("/api/certificate/:id", limiter(30, 60 * 1000), async (req, res) => {
  if (!/^SB-[A-F0-9]{10}$/.test(req.params.id)) return res.status(404).json({ valid: false });
  const all = await dbGet("certificates", []);
  const c = all.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ valid: false });
  res.json({ valid: true, cert: c });
});

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, jobApiConfigured: JSEARCH_KEYS.length > 0 || !!OWN_KEY, jobProviders: PROVIDERS.map((p) => p[0]), emailConfigured: !!(RESEND_API_KEY && EMAIL_TO), accounts: true, storage: USE_REDIS ? "database" : "files", aiProvider: AI_PROVIDER, tutorConfigured: AI_ENABLED, examGeneratorConfigured: AI_ENABLED, certSecretConfigured: !!process.env.CERT_SECRET })
);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SkillBridge Hub running on http://localhost:${port} (AI: ${AI_PROVIDER})`));