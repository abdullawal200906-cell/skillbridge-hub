# SkillBridge Hub

Live site: https://skillbridge-hub-el3d.onrender.com/

## About
SkillBridge Hub helps people find jobs and build the skills to get them. You can search live job listings, follow a roadmap for 25 skills, take timed tests, and earn a certificate you can verify online. An AI coach named Ayo teaches and answers questions along the way.

Built by Abdulhafiz Olorunfemi.

## Features
- Live job search from three sources, with automatic fallback if one fails
- 25 skills, each with an intro, a staged roadmap and free learning resources
- Web Development split into Frontend and Backend, and Cyber Security split into Defender and Hacker tracks
- Timed tests per topic: one minute per question, 70% to pass, questions shuffled for each user
- Certificates with different designs per skill, signed and verifiable by ID
- Ayo, an AI coach that teaches and answers questions
- Accounts, a personal dashboard, notes, XP and daily streaks
- Contact form that sends email
- Light and dark theme

## Architecture
Browser (HTML, CSS, JavaScript)
  -> Express server (Node.js)
      -> Job APIs: JSearch, Jooble, Remotive
      -> AI provider (Groq) for the tutor and exam questions
      -> Upstash Redis for accounts and progress
      -> Email service for the contact form

- Frontend: a single-page app in vanilla JavaScript (public/). Progress is cached in the browser and synced to the server.
- Backend: server.js handles jobs, accounts, tests, certificates and the AI coach.
- Tests: question banks live in bank/. The server grades answers, and correct answers are never sent to the browser before submission.
- Certificates: a passed test produces a signed token. The certificate ID can be checked at /?verify=<ID>.
- Accounts: passwords are hashed, and sessions use signed tokens.
- Hosting: Render, with the database on Upstash so data survives restarts.

## Tech stack
Node.js, Express, JavaScript, HTML, CSS, Upstash Redis, Groq, Render.

## Run locally
1. Install Node.js 20 or newer.
2. Run npm install.
3. Copy .env.example to .env and fill in your own keys.
4. Run npm run dev and open the address shown in the terminal.

## Environment variables
Set these in .env locally or in Render's Environment page. Never commit real keys.
Examples: JOB_API_KEY, JOB_API_KEY_2, CERT_SECRET, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, RESEND_API_KEY, EXAM_SIZE, PASS_MARK, PUBLIC_URL, plus your AI provider key. Check .env.example for the exact names.

## Contact
Abdulhafiz Olorunfemi