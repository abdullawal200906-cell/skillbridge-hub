# Job & Skills Opportunity Hub

Express server + single-page site.

- **Jobs:** live search through JSearch (RapidAPI).
- **Accounts:** sign up and sign in (email and password). Progress, notes, streak and certificates are saved per user (`data/users.json`, `data/state/`).
- **Learn:** Ayo the skill coach, 25 skills with roadmaps and free resources, timed tests per topic, and certificates.
- **Contact form:** saved on the server and emailed with Resend (optional).

## Files
- `public/index.html` is the page structure (HTML).
- `public/style.css` is the colors and layout (CSS).
- `public/app.js` is the website code (JavaScript).
- `server.js` is the backend. `catalog.json` is the skills data.

## Run locally
1. Install Node 18+.
2. `npm install`
3. `cp .env.example .env` and fill in what you have. Nothing is mandatory to see the site.
4. `npm run dev`, then open http://localhost:3000
5. Check http://localhost:3000/api/health to see which keys the server found.

## Deploy on Render
1. Push this folder to GitHub.
2. Render > New > Web Service > pick the repo. Build: `npm install`. Start: `npm start`.
3. Add the environment variables from `.env.example`. Set `CERT_SECRET` to a long random text and `PUBLIC_URL` to your Render address.

## How the exams work
- Skills, paths and topics live in `catalog.json`. Example: Web development > Frontend developer > HTML, CSS, JavaScript.
- A test is one topic (for example HTML), up to 50 questions, 1 minute per question, pass mark 70%.
- Questions come from `bank/<topic-id>.json` (hand-written) plus questions the AI writes and saves to `data/generated/`. Each test picks a fresh random set, so users get different tests. The AI part needs `ANTHROPIC_API_KEY`.
- Answers never leave the server until the test is submitted. Grading happens on the server.
- Passing a topic gives a signed pass token. Passing every topic in a path lets the user claim a certificate with a unique ID (`SB-XXXXXXXXXX`), saved in `data/certificates.json`.
- Anyone can check a certificate at `/?verify=SB-XXXXXXXXXX` or in the Check a certificate box.
- Topics with no bank file need `ANTHROPIC_API_KEY`, otherwise the test explains that questions are missing.

## Good to know
- The coach is called Ayo. To rename it, search for `Ayo` in `public/index.html` and `server.js` (or set `COACH_NAME` on the server).
- Set `CERT_SECRET` before launch. It signs login sessions and test passes.
- Forgot-password is not built yet.
- AI-written questions can contain mistakes. Skim `data/generated/*.json` now and then, and delete bad ones. Add hand-written questions to `bank/` as you can (format: `[{"q","c","w":[3 wrong],"t"}]`).
- The file storage (`data/`) resets on Render's free tier when you redeploy. Move certificates to a database (Postgres) before you rely on them.
- After editing `catalog.json`, run `npm run build` to copy it into `public/index.html`.
- The certificate says Abdulhafiz Olorunfemi signed it. It is a completion certificate from your platform, not an accredited qualification. Say so on your site.

## Check your keys (one command)
`npm run check` tests your job and AI keys and tells you what to fix. `npm run secret` prints a value for `CERT_SECRET`.

## Deploy on Render with render.yaml
1. Push the project to GitHub.
2. On render.com choose New, then Blueprint, and pick your repo. Render reads `render.yaml`.
3. Fill in `JOB_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY` and `PUBLIC_URL` when it asks. `CERT_SECRET` is generated for you.

## Job providers (fallback order)
1. JSearch with `JOB_API_KEY`, then the spare `JOB_API_KEY_3` if the first key is out of quota.
2. Jooble with `JOB_API_KEY_2` (covers Nigeria).
3. Remotive, free and needs no key (remote jobs only).
The first provider that returns jobs wins. `/api/health` shows which providers are active.

## One Anthropic key does both AI jobs
`ANTHROPIC_API_KEY` powers Ayo (chat and Explain buttons, model `TUTOR_MODEL`) and the AI-written test questions (model `EXAM_MODEL`).
