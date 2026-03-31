// src/routes/import.js — CSV/Excel import + QR code generation
const express = require('express');
const router  = express.Router();
const XLSX    = require('xlsx');
const QRCode  = require('qrcode');
const db      = require('../db');

const VALID_TYPES = ['delegate','faculty','sponsor','stall','av','event team'];

function normaliseType(val) {
  const t = (val || 'delegate').toLowerCase().trim();
  return VALID_TYPES.includes(t) ? t : 'delegate';
}

async function generateQR(text) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width: 200 });
}

// Read MAX badge number ONCE — callers increment in memory to avoid repeated DB hits
function getStartBadgeCounter() {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(badge_id,5) AS INTEGER)) as max FROM participants WHERE badge_id LIKE 'BDG-%'").get();
  return (row && row.max ? row.max : 0) + 1;
}
function makeBadgeId(n) {
  return `BDG-${String(n).padStart(4, '0')}`;
}

// POST /api/import — multipart upload of CSV or XLSX
router.post('/', async (req, res) => {
  if (!req.files || !req.files.file) {
    return res.status(400).json({ error: 'No file uploaded. Field name must be "file".' });
  }

  const file = req.files.file;

  let rows;
  try {
    const workbook = XLSX.read(file.data, { type: 'buffer' });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse file. Please use CSV or XLSX format.' });
  }

  if (!rows.length) {
    return res.status(400).json({ error: 'File is empty.' });
  }

  // Normalise column headers (case-insensitive)
  rows = rows.map(r => {
    const norm = {};
    for (const [k, v] of Object.entries(r)) {
      norm[k.toLowerCase().trim()] = v;
    }
    return norm;
  });

  if (!rows[0]['name']) {
    return res.status(400).json({ error: 'Required column "name" not found in file.' });
  }

  let imported = 0;
  let skipped  = 0;

  // ── Step 1: Read MAX badge counter ONCE, then increment in-memory ─────────
  let badgeCounter = getStartBadgeCounter();

  // ── Step 2: Generate all badge IDs + QR codes BEFORE touching the DB ──────
  const pendingRows = [];
  for (const row of rows) {
    const name = String(row['name'] || '').trim();
    if (!name) { skipped++; continue; }

    const badge_id  = makeBadgeId(badgeCounter++);
    const email     = String(row['email']   || '').trim();
    const phone     = String(row['phone']   || '').trim();
    const company   = String(row['company'] || '').trim();
    const typeRaw   = row['participant type'] || row['type'] || '';
    const type      = normaliseType(typeRaw);
    const qr_base64 = await generateQR(badge_id);

    pendingRows.push({ badge_id, name, email, phone, type, company, qr_base64 });
  }

  // ── Step 3: Insert ALL rows in ONE transaction (prevents disk I/O errors) ──
  const insert = db.prepare(`
    INSERT OR IGNORE INTO participants(badge_id, name, email, phone, type, company, qr_base64)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    db.exec('BEGIN');
    for (const p of pendingRows) {
      const info = insert.run(p.badge_id, p.name, p.email, p.phone, p.type, p.company, p.qr_base64);
      if (info.changes > 0) imported++;
      else skipped++;
    }
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('Import transaction failed:', e.message);
    return res.status(500).json({ error: 'Database error during import. Please try again.' });
  }

  // Broadcast update
  if (req.app.broadcast) {
    req.app.broadcast({ type: 'import_complete', imported });
  }

  res.json({
    success: true,
    imported,
    skipped,
    errors: [],
    message: `Imported ${imported} participants. ${skipped > 0 ? `${skipped} rows skipped (blank name or duplicate).` : ''}`
  });
});

// GET /api/import/template — download XLSX template with 100 sample rows
router.get('/template', (req, res) => {
  const firstNames = [
    'Aarav','Ananya','Arjun','Aisha','Bhavna','Chandan','Deepa','Dhruv','Esha','Farhan',
    'Gayatri','Harsh','Ishaan','Jaya','Kabir','Lakshmi','Manav','Nisha','Om','Priya',
    'Rahul','Sanya','Tarun','Uma','Vikram','Waqar','Yogesh','Zara','Aditya','Bharat',
    'Chitra','Dinesh','Ekta','Firoz','Geeta','Hemant','Ira','Jai','Kiran','Lata',
    'Mohan','Neha','Ojas','Puja','Rajan','Savita','Tejas','Urmila','Varun','Swati'
  ];
  const lastNames = [
    'Sharma','Verma','Patel','Singh','Kumar','Nair','Mehta','Das','Rao','Iyer',
    'Gupta','Joshi','Malhotra','Chauhan','Shah','Bose','Kapoor','Reddy','Pillai','Khanna',
    'Saxena','Mishra','Dubey','Srivastava','Thakur','Menon','Pandey','Chatterjee','Bhat','Agarwal'
  ];
  const companies = [
    'Techmen Solutions','InnovateTech','GlobalSoft','NextGen Systems','CloudBase India',
    'DataDriven Co','AlphaCorp','ByteWave','NeuralNet Ltd','PixelForge',
    'IIT Madras','NIT Trichy','Anna University','VIT Vellore','BITS Pilani',
    'Acme Enterprises','Synapse Labs','Quantum Works','Zenith Digital','FusionMind',
    'Freelancer','Startup Hub','EduTech India','MedTech Pvt Ltd','FinServ Group'
  ];
  const types   = ['delegate','faculty','sponsor','stall','av','event team'];
  const domains = ['gmail.com','yahoo.com','outlook.com','techmen.in','example.org','hotmail.com'];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function phone() { return '9' + String(Math.floor(Math.random() * 900000000) + 100000000); }

  const rows = [];
  for (let i = 1; i <= 100; i++) {
    const first  = pick(firstNames);
    const last   = pick(lastNames);
    const type   = pick(types);
    const prefix = (type === 'faculty' && Math.random() > 0.4) ? 'Dr. ' : '';
    rows.push({
      'name':             `${prefix}${first} ${last}`,
      'email':            `${first.toLowerCase()}.${last.toLowerCase()}${i}@${pick(domains)}`,
      'phone':            phone(),
      'participant type': type,
      'company':          pick(companies)
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 28 }, { wch: 36 }, { wch: 14 }, { wch: 18 }, { wch: 28 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Participants');

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="import_template.xlsx"');
  res.send(xlsxBuffer);
});

module.exports = router;
