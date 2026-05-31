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

// ── NEW KIOSK INTEGRATION ENDPOINTS ──────────────────────────────────────────

/**
 * POST /api/nlu/parse
 * Body: { transcript, contextFlow }
 */
app.post('/api/nlu/parse', (req, res) => {
  const { transcript, contextFlow } = req.body;
  if (!transcript) {
    return res.status(400).json({ error: 'Missing transcript' });
  }

  const text = transcript.toLowerCase().trim();
  let intent = 'unknown';
  let confidence = 0.5;
  let extractedSlots = {};
  let suggestedAction = '';

  // 1. Home Navigation & Voice Trigger Triggers
  if (text.includes('reset') || text.includes('pin') || text.includes('पिन') || text.includes('रीसेट') || text.includes('change')) {
    intent = 'card.reset_pin';
    confidence = 0.95;
    suggestedAction = 'prompt_pin_reset';
    if (text.includes('credit')) extractedSlots.cardType = 'credit';
    else if (text.includes('debit')) extractedSlots.cardType = 'debit';
  } else if (text.includes('block') || text.includes('card') || text.includes('कार्ड ब्लॉक') || text.includes('डेबिट')) {
    intent = 'card.block';
    confidence = 0.95;
    suggestedAction = 'prompt_card_selection';
    if (text.includes('credit')) extractedSlots.cardType = 'credit';
    else if (text.includes('debit')) extractedSlots.cardType = 'debit';
  } else if (text.includes('send') || text.includes('money') || text.includes('transfer') || text.includes('pay') || text.includes('पैसे') || text.includes('भेजें')) {
    intent = 'payment.send_money';
    confidence = 0.95;
    suggestedAction = 'prompt_amount_recipient';
    
    // Attempt slot extraction for send money (e.g. "Send 5000 to Raj")
    const amountMatch = text.match(/(?:send|transfer|pay|₹|\bRs\.?\s*)(\d[\d,]*)/i) || text.match(/(\d+)\s*(?:thousand|k)/i);
    if (amountMatch) {
      extractedSlots.amount = amountMatch[1].replace(/,/g, '');
    }
    const payeeMatch = text.match(/(?:to)\s+([a-z]+)/i);
    if (payeeMatch) {
      extractedSlots.payee = payeeMatch[1];
    }
  } else if (text.includes('loan') || text.includes('certificate') || text.includes('statement') || text.includes('ऋण')) {
    intent = 'loan.certificate';
    confidence = 0.95;
    suggestedAction = 'prompt_loan_selection';
  } else if (text.includes('invest') || text.includes('sip') || text.includes('mutual') || text.includes('fund') || text.includes('निवेश') || text.includes('lumpsum') || text.includes('lumsum') || text.includes('एकमुश्त')) {
    intent = 'invest.mutual_fund';
    confidence = 0.98;
    suggestedAction = text.includes('5000') ? 'prompt_lumpsum_5000' : 'prompt_sip_amount';
    if (text.includes('lumpsum') || text.includes('lumsum') || text.includes('एकमुश्त')) {
      extractedSlots.investType = 'lumpsum';
    } else {
      extractedSlots.investType = 'sip';
    }
    if (text.includes('50000')) {
      extractedSlots.amount = '50000';
    } else if (text.includes('5000')) {
      extractedSlots.amount = '5000';
    } else if (text.includes('2000')) {
      extractedSlots.amount = '2000';
    }
  } else if (text.includes('home') || text.includes('back') || text.includes('exit') || text.includes('cancel') || text.includes('मुख्य') || text.includes('वापस')) {
    intent = 'home';
    confidence = 0.98;
    suggestedAction = 'navigate_home';
  }

  return res.json({ intent, confidence, extractedSlots, suggestedAction });
});

/**
 * POST /api/card/block
 */
app.post('/api/card/block', (req, res) => {
  const { cardId, reason } = req.body;
  const refId = 'BLK-' + Math.floor(100000 + Math.random() * 900000) + '-UB';
  return res.json({ success: true, refId });
});

/**
 * POST /api/payment/send
 */
app.post('/api/payment/send', (req, res) => {
  const { amount, payeeId, method } = req.body;
  const txnId = 'TXN-' + Math.floor(100000 + Math.random() * 900000);
  return res.json({ success: true, txnId });
});

/**
 * POST /api/otp/send
 */
app.post('/api/otp/send', (req, res) => {
  const { mobileNumber, context } = req.body;
  const refId = 'OTP-' + Date.now();
  console.log(`[OTP] Generated verification OTP 1234 for mobile ${mobileNumber} (context: ${context})`);
  return res.json({ success: true, refId });
});

/**
 * POST /api/otp/verify
 */
app.post('/api/otp/verify', (req, res) => {
  const { otp, referenceId } = req.body;
  const valid = otp === '1234' || otp === '4092';
  return res.json({ valid });
});

/**
 * POST /api/loan/certificate
 */
app.post('/api/loan/certificate', (req, res) => {
  const { loanId, year } = req.body;
  return res.json({ documentUrl: `https://umitra.bank/docs/${loanId || '8892'}_${year || '2023-24'}.pdf` });
});

/**
 * POST /api/chat
 * Body: { message, contextFlow, language }
 */
app.post('/api/chat', (req, res) => {
  const { message, contextFlow, language } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });

  const text = message.toLowerCase().trim();
  const isHi = language === 'Hindi' || text.includes('सहायता') || text.includes('ऋण') || text.includes('कार्ड');
  let reply = "";

  if (isHi) {
    if (text.includes('personal loan') || text.includes('व्यक्तिगत ऋण') || text.includes('personal interest')) {
      reply = "यूनियन बैंक पर्सनल लोन लचीली अवधि के साथ 10.5% ब्याज दर से शुरू होते हैं। आप सीधे हमारे कियोस्क के माध्यम से आवेदन कर सकते हैं।";
    } else if (text.includes('home loan') || text.includes('गृह ऋण') || text.includes('home interest')) {
      reply = "हमारे होम लोन की ब्याज दरें 8.4% प्रति वर्ष से शुरू होती हैं। आप यहाँ ऋण प्रमाण पत्र फ़्लो में अपना ब्याज प्रमाणपत्र डाउनलोड कर सकते हैं।";
    } else if (text.includes('limit') || text.includes('सीमा')) {
      reply = "सुरक्षा के लिए, दैनिक कियोस्क कार्ड लेनदेन की सीमा ₹2,0,000 है। पैसे भेजें (मनी ट्रांसफर) के लिए, आपकी दैनिक सीमा ₹1,50,000 है।";
    } else if (text.includes('document') || text.includes('दस्तावेज') || text.includes('kyc')) {
      reply = "यू-मित्रा पर अधिकांश सेवाओं के लिए, आपको केवल पंजीकृत मोबाइल ओटीपी या फिंगरप्रिंट के माध्यम से प्रमाणित करना होगा। पूर्ण ऋण आवेदन के लिए, आपको पैन कार्ड और वेतन पर्ची की आवश्यकता होगी।";
    } else if (text.includes('card') || text.includes('block') || text.includes('कार्ड')) {
      reply = "यदि आपका कार्ड खो गया है, तो 'कार्ड ब्लॉक करें' कहें या कार्ड सेवाएं पर क्लिक करें। हम इसे तुरंत ब्लॉक कर देंगे और 3 से 5 दिनों में आपके पंजीकृत पते पर एक नया कार्ड भेज देंगे।";
    } else if (text.includes('sip') || text.includes('mutual') || text.includes('invest') || text.includes('निवेश')) {
      reply = "आप ₹1,000 जैसी छोटी राशि से म्यूचुअल फंड एसआईपी शुरू कर सकते हैं। तुरंत शुरू करने के लिए हमारे निवेश टैब के तहत UBI बैलेंस्ड एडवांटेज या UBI हाइब्रिड इक्विटी चुनें!";
    } else if (text.includes('help') || text.includes('hello') || text.includes('hi') || text.includes('सहायता') || text.includes('नमस्ते')) {
      reply = "नमस्ते! मैं यू-मित्रा हूँ, आपका यूनियन बैंक वॉयस असिस्टेंट। मैं कार्ड ब्लॉक कर सकता हूँ, फंड ट्रांसफर कर सकता हूँ, एसआईपी शुरू कर सकता हूँ या लोन सर्टिफिकेट प्रिंट कर सकता हूँ। बस कहें कि आपको क्या चाहिए!";
    } else {
      reply = "मैं समझता हूँ कि सेवाओं के बारे में आपका कोई प्रश्न है। आपकी बेहतर सहायता के लिए, आप अपना डेबिट कार्ड ब्लॉक कर सकते हैं, तुरंत पैसे भेज सकते हैं, म्यूचुअल फंड एसआईपी शुरू कर सकते हैं या ऋण ब्याज प्रमाण पत्र डाउनलोड कर सकते हैं। आप क्या करना चाहेंगे?";
    }
  } else {
    if (text.includes('personal loan') || text.includes('व्यक्तिगत ऋण') || text.includes('personal interest')) {
      reply = "Union Bank Personal Loans start at 10.5% interest rate with flexible tenures up to 60 months. You can apply directly through our kiosk.";
    } else if (text.includes('home loan') || text.includes('गृह ऋण') || text.includes('home interest')) {
      reply = "Our Home Loan interest rates start at a highly competitive 8.4% per annum. You can download your interest certificate here in the Loan Certificates flow.";
    } else if (text.includes('limit') || text.includes('सीमा')) {
      reply = "For security, daily kiosk card transactions are limited to ₹2,0,000. For Send Money transfers, your daily transfer limit is ₹1,50,000.";
    } else if (text.includes('document') || text.includes('दस्तावेज') || text.includes('kyc')) {
      reply = "For most services on U-MITRA, you only need to authorize via registered mobile OTP or fingerprint. For full loan applications, you will need a PAN card and salary slips.";
    } else if (text.includes('card') || text.includes('block') || text.includes('कार्ड')) {
      reply = "If you lost your card, say 'block card' or click Card Services. We will block it instantly and dispatch a new card to your registered address in 3 to 5 days.";
    } else if (text.includes('sip') || text.includes('mutual') || text.includes('invest') || text.includes('निवेश')) {
      reply = "You can start a Mutual Fund SIP with as little as ₹1,000. Choose UBI Balanced Advantage or UBI Hybrid Equity under our Investments tab to start immediately!";
    } else if (text.includes('help') || text.includes('hello') || text.includes('hi') || text.includes('सहायता')) {
      reply = "Hello! I am U-MITRA, your Union Bank voice assistant. I can block cards, transfer funds, set up SIP mutual funds, or print loan statements. Just say what you need!";
    } else {
      reply = `I understand you have a question about our services. To assist you better, you can block your debit card, send money instantly, start a mutual fund SIP, or download loan interest certificates. What would you like to do?`;
    }
  }

  return res.json({ reply });
});

// ── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  SecureBank backend running → http://localhost:${PORT}`);
  console.log(`   POST /api/apply         — submit & score a loan application`);
  console.log(`   GET  /api/status/:ref   — check application status`);
  console.log(`   GET  /api/applications  — list all applications`);
  console.log(`   GET  /api/dashboard     — aggregated stats\n`);
});
