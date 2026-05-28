# SecureBank Loan Kiosk

A fully voice-enabled bank loan kiosk web app — click or speak to fill every field, powered by **Groq AI** and a **Node.js scoring backend**.

![Kiosk Preview](https://img.shields.io/badge/Status-Live-brightgreen) ![HTML](https://img.shields.io/badge/Frontend-HTML%2FJS-orange) ![Node](https://img.shields.io/badge/Backend-Node.js-green) ![Groq](https://img.shields.io/badge/AI-Groq%20LLaMA-blue)

---

## Features

- **6 Loan Types** — Personal, Home, Car, Business, Education, Gold
- **Voice Fill** — speak to fill every field on every screen
  - *"My name is Aastha Kataria"* → fills first & last name
  - *"Phone 9876543210"* → fills mobile
  - *"aastha at the rate gmail dot com"* → fills email as `aastha@gmail.com`
  - *"Date of birth 15 march 1990"* → fills DOB
  - *"PAN ABCDE1234F"* → fills PAN
  - *"Five lakh"* / *"10 lakh"* → sets loan amount slider
  - *"Three years"* / *"36 months"* → sets tenure slider
  - *"I am salaried"*, *"I work at Infosys"*, *"Income 75000"* → fills employment details
  - *"Credit score 750"* / *"Excellent"* → selects credit score
  - *"Next"* / *"Back"* → navigate between steps
- **Always-on mic** — one click to activate; auto-restarts silently after browser silence timeout
- **Button choices** — all options (employment type, experience, credit score, purpose) are clickable buttons, no dropdowns
- **Groq AI Assistant** — floating chat panel for loan questions, speaks through the mic too
- **Scoring backend** — Node.js server scores every application across 4 factors and returns Approved / Conditional / Rejected with a personalised interest rate
- **Offline fallback** — scores locally if the backend is unreachable

---

## Project Structure

```
triggerwords/
├── bank-loan-kiosk.html   # Complete frontend (single file)
├── backend/
│   ├── server.js          # Express scoring API
│   └── package.json
└── README.md
```

---

## Quick Start

### 1 — Frontend only (no backend needed)

Just open `bank-loan-kiosk.html` in **Chrome** or **Edge**.  
The app scores applications locally if the backend isn't running.

> ⚠️ Voice recognition requires Chrome or Edge. Allow microphone access when prompted — the browser only asks once.

### 2 — With the backend

```bash
cd backend
npm install
node server.js
```

Server starts on **http://localhost:3001**. The kiosk detects it automatically and shows **"Backend Online"** in the top bar.

---

## Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/apply` | Submit & score a loan application |
| `GET` | `/api/status/:ref` | Look up an application by reference number |
| `GET` | `/api/applications` | List all applications |
| `GET` | `/api/dashboard` | Aggregated stats |

### Scoring breakdown

| Factor | Max Points |
|--------|-----------|
| Credit Score | 35 |
| EMI-to-Income Ratio | 30 |
| Employment Type | 20 |
| Work Experience | 15 |
| **Total** | **100** |

| Score | Decision |
|-------|----------|
| 75 – 100 | ✅ Approved (best rate: base − 0.5%) |
| 60 – 74 | ✅ Approved (standard rate) |
| 45 – 59 | ⏳ Conditional (75% of requested amount, +2% rate) |
| < 45 | ❌ Rejected |

---

## Environment / Config

The Groq API key and backend URL are set at the top of `bank-loan-kiosk.html`:

```js
const GROQ_API_KEY = 'your-groq-api-key';
const GROQ_MODEL   = 'llama-3.1-8b-instant';
const BACKEND_URL  = 'http://localhost:3001';
```

Get a free Groq API key at [console.groq.com](https://console.groq.com).

---

## Voice Command Reference

| Where | Say | Action |
|-------|-----|--------|
| Anywhere | *"Personal loan"* / *"Home loan"* | Select loan type |
| Anywhere | *"Next"* / *"Back"* | Navigate steps |
| Anywhere | *"Help"* / *"Assistant"* | Open AI chat |
| Personal Info | *"My name is [first] [last]"* | Fill name |
| Personal Info | *"Phone [10 digits]"* | Fill mobile |
| Personal Info | *"[name] at the rate [provider] dot com"* | Fill email |
| Personal Info | *"Date of birth [day] [month] [year]"* | Fill DOB |
| Personal Info | *"PAN [ABCDE1234F]"* | Fill PAN |
| Loan Amount | *"[N] lakh"* / *"[N] crore"* | Set amount |
| Loan Amount | *"[N] years"* / *"[N] months"* | Set tenure |
| Loan Amount | *"Purpose is home renovation"* | Select purpose |
| Employment | *"I am salaried"* | Select employment type |
| Employment | *"I work at [company]"* | Fill employer |
| Employment | *"My income is [amount]"* / *"[N]k"* | Fill income |
| Employment | *"[N] years experience"* | Select experience |
| Employment | *"Credit score [number]"* / *"Excellent"* | Select credit score |

---

## Tech Stack

- **Frontend** — Vanilla HTML / CSS / JavaScript (single file, no build step)
- **Voice** — Web Speech API (`SpeechRecognition`, continuous mode)
- **AI Chat** — Groq API (`llama-3.1-8b-instant`)
- **Backend** — Node.js + Express
- **Storage** — `applications.json` (flat file, no database needed)

---

## License

MIT
