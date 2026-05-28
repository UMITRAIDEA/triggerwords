/**
 * SecureBank Loan Kiosk — Backend
 * Minimal Express server with loan scoring engine
 * Run: node server.js   (listens on port 3001)
 */

const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = 3001;
const DB   = path.join(__dirname, 'applications.json');

app.use(cors());
app.use(express.json());

// ── Initialise DB file ──────────────────────────────────────────────────────
if (!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify([], null, 2));

function readDB()       { return JSON.parse(fs.readFileSync(DB, 'utf8')); }
function writeDB(data)  { fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }

// ── SCORING ENGINE ──────────────────────────────────────────────────────────
function scoreApplication(app) {
  let score   = 0;
  const flags = [];   // reasons for deductions / notes

  /* 1. Credit Score  (max 35 pts) */
  const creditPts = {
    '750+ (Excellent)': 35,
    '700–749 (Good)':   25,
    '650–699 (Fair)':   14,
    'Below 650 (Poor)': 5,
    "Don't know":       12,
  };
  const cp = creditPts[app.creditScore] ?? 12;
  score += cp;
  if (cp < 14) flags.push('Low credit score');

  /* 2. EMI-to-Income Ratio  (max 30 pts) */
  const income = parseInt(app.income) || 0;
  const emi    = parseFloat(app.emi)  || 0;
  if (income > 0) {
    const ratio = emi / income;
    if      (ratio < 0.25) score += 30;
    else if (ratio < 0.35) score += 22;
    else if (ratio < 0.45) { score += 12; flags.push('Moderate EMI-to-income ratio'); }
    else if (ratio < 0.55) { score += 5;  flags.push('High EMI-to-income ratio'); }
    else                   {              flags.push('EMI exceeds 55% of income'); }
  } else {
    score += 10;  // no income provided — neutral
    flags.push('Income not verified');
  }

  /* 3. Employment Type  (max 20 pts) */
  const empPts = {
    'Salaried':       20,
    'Business Owner': 17,
    'Self-Employed':  14,
    'Freelancer':     10,
    'Retired':        8,
  };
  score += empPts[app.employment] ?? 8;

  /* 4. Work Experience  (max 15 pts) */
  const expPts = {
    '10+ years':       15,
    '5–10 years':      12,
    '2–5 years':       9,
    '1–2 years':       6,
    'Less than 1 year': 3,
  };
  const ep = expPts[app.experience] ?? 6;
  score += ep;
  if (ep < 6) flags.push('Limited work experience');

  /* ── Decision ─────────────────────────────────────────────────────────── */
  // Base interest rates by loan type
  const baseRates = {
    'Personal Loan':  10.5,
    'Home Loan':       8.4,
    'Car Loan':        9.0,
    'Business Loan':  11.0,
    'Education Loan':  7.5,
    'Gold Loan':       9.5,
  };
  const base = baseRates[app.loanType] ?? 10.5;

  let decision, interestRate, approvedAmount, message;

  if (score >= 75) {
    decision       = 'APPROVED';
    interestRate   = parseFloat((base - 0.5).toFixed(2));
    approvedAmount = parseFloat(app.amount);
    message        = 'Congratulations! Your application has been approved at our best available rate.';
  } else if (score >= 60) {
    decision       = 'APPROVED';
    interestRate   = base;
    approvedAmount = parseFloat(app.amount);
    message        = 'Your application is approved at our standard rate.';
  } else if (score >= 45) {
    decision       = 'CONDITIONAL';
    interestRate   = parseFloat((base + 2.0).toFixed(2));
    approvedAmount = parseFloat(app.amount) * 0.75;   // 75% of requested
    message        = 'Your application is conditionally approved pending document verification.';
  } else {
    decision       = 'REJECTED';
    interestRate   = null;
    approvedAmount = null;
    message        = 'We are unable to process your application at this time based on the provided information.';
  }

  // Recalculate EMI with final rate
  let finalEmi = null;
  if (interestRate !== null && approvedAmount) {
    const P = approvedAmount;
    const n = parseInt(app.tenure) || 60;
    const r = interestRate / 100 / 12;
    finalEmi = Math.round(P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
  }

  return { score, decision, interestRate, approvedAmount, finalEmi, flags, message };
}

// ── ROUTES ──────────────────────────────────────────────────────────────────

/**
 * POST /api/apply
 * Body: { loanType, firstName, lastName, phone, email, dob, pan,
 *         amount, tenure, purpose, employment, income, employer,
 *         experience, creditScore, emi }
 */
app.post('/api/apply', (req, res) => {
  const body = req.body;

  // Only loanType is required — everything else is optional for the kiosk demo
  if (!body.loanType) {
    return res.status(400).json({ error: 'Missing required field: loanType' });
  }
  // Fill defaults for any omitted fields so scoring always works
  body.firstName  = body.firstName  || 'Applicant';
  body.lastName   = body.lastName   || '';
  body.amount     = body.amount     || 500000;
  body.tenure     = body.tenure     || 60;
  body.employment = body.employment || "Don't know";
  body.experience = body.experience || "1–2 years";
  body.creditScore= body.creditScore|| "Don't know";
  body.income     = body.income     || 0;

  const result    = scoreApplication(body);
  const refNumber = 'SBK' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
  const timestamp = new Date().toISOString();

  const record = {
    refNumber,
    timestamp,
    applicant: {
      name:  `${body.firstName} ${body.lastName}`.trim(),
      phone: body.phone,
      email: body.email,
      dob:   body.dob,
      pan:   body.pan,
    },
    loan: {
      type:          body.loanType,
      requestedAmount: parseFloat(body.amount),
      tenure:        parseInt(body.tenure),
      purpose:       body.purpose,
      estimatedEmi:  parseFloat(body.emi),
    },
    employment: {
      type:       body.employment,
      income:     parseInt(body.income),
      employer:   body.employer,
      experience: body.experience,
    },
    creditScore: body.creditScore,
    scoring: result,
  };

  // Persist
  const db = readDB();
  db.push(record);
  writeDB(db);

  console.log(`[${timestamp}] ${record.applicant.name || 'Applicant'} → ${result.decision} (score: ${result.score}) ref: ${refNumber}`);

  return res.json({
    refNumber,
    timestamp,
    decision:      result.decision,
    score:         result.score,
    message:       result.message,
    interestRate:  result.interestRate,
    approvedAmount: result.approvedAmount,
    finalEmi:      result.finalEmi,
    flags:         result.flags,
  });
});

/**
 * GET /api/status/:ref
 * Look up a specific application by ref number
 */
app.get('/api/status/:ref', (req, res) => {
  const db  = readDB();
  const rec = db.find(r => r.refNumber === req.params.ref);
  if (!rec) return res.status(404).json({ error: 'Application not found' });
  return res.json(rec);
});

/**
 * GET /api/applications
 * Return all applications (admin view)
 */
app.get('/api/applications', (req, res) => {
  const db = readDB();
  const summary = db.map(r => ({
    refNumber:   r.refNumber,
    timestamp:   r.timestamp,
    name:        r.applicant.name,
    loanType:    r.loan.type,
    amount:      r.loan.requestedAmount,
    decision:    r.scoring.decision,
    score:       r.scoring.score,
    interestRate: r.scoring.interestRate,
  }));
  return res.json({ total: summary.length, applications: summary });
});

/**
 * GET /api/dashboard
 * Aggregated stats for a simple admin dashboard
 */
app.get('/api/dashboard', (req, res) => {
  const db    = readDB();
  const total = db.length;
  const byDecision = { APPROVED: 0, CONDITIONAL: 0, REJECTED: 0 };
  const byType     = {};
  let totalAmount  = 0;

  db.forEach(r => {
    byDecision[r.scoring.decision] = (byDecision[r.scoring.decision] || 0) + 1;
    byType[r.loan.type]            = (byType[r.loan.type] || 0) + 1;
    if (r.scoring.decision !== 'REJECTED') totalAmount += r.scoring.approvedAmount || 0;
  });

  return res.json({ total, byDecision, byType, totalApprovedAmount: totalAmount });
});

// ── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  SecureBank backend running → http://localhost:${PORT}`);
  console.log(`   POST /api/apply         — submit & score a loan application`);
  console.log(`   GET  /api/status/:ref   — check application status`);
  console.log(`   GET  /api/applications  — list all applications`);
  console.log(`   GET  /api/dashboard     — aggregated stats\n`);
});
