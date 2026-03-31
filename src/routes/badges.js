// src/routes/badges.js
const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const archiver = require('archiver');
const db       = require('../db');
const { generateBadges } = require('../services/badgeService');

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// POST /api/badges/generate
// Body: { ids: [1,2,3] }  — omit ids to generate all
router.post('/generate', async (req, res) => {
  try {
    const settings = getSettings();
    let participants;

    if (req.body.ids && req.body.ids.length) {
      const placeholders = req.body.ids.map(() => '?').join(',');
      participants = db.prepare(
        `SELECT id,badge_id,name,type,company,qr_base64 FROM participants WHERE id IN (${placeholders})`
      ).all(...req.body.ids);
    } else {
      participants = db.prepare(
        'SELECT id,badge_id,name,type,company,qr_base64 FROM participants ORDER BY name'
      ).all();
    }

    if (!participants.length) {
      return res.status(400).json({ error: 'No participants found to generate badges for.' });
    }

    // Stream progress via WebSocket while generating
    const onProgress = (done, total, name) => {
      req.app.broadcast({ type: 'badge_progress', done, total, name });
    };

    const result = await generateBadges(participants, settings, onProgress);

    req.app.broadcast({ type: 'badge_complete', count: result.count });

    res.json({
      success: true,
      count:        result.count,
      bulkFile:     `/exports/bulk/${result.bulkFilename}`,
      individualDir: `/exports/individual/`
    });
  } catch (err) {
    console.error('Badge generation error:', err);
    res.status(500).json({ error: 'Badge generation failed: ' + err.message });
  }
});

// GET /api/badges/download/bulk — latest bulk PDF
router.get('/download/bulk', (req, res) => {
  const bulkDir = path.join(__dirname, '../../exports/bulk');
  const files   = fs.readdirSync(bulkDir).filter(f => f.endsWith('.pdf')).sort().reverse();
  if (!files.length) return res.status(404).json({ error: 'No bulk PDF found. Generate badges first.' });
  res.download(path.join(bulkDir, files[0]), files[0]);
});

// GET /api/badges/download/zip — zip of all individual PDFs
router.get('/download/zip', (req, res) => {
  const indDir = path.join(__dirname, '../../exports/individual');
  const files  = fs.readdirSync(indDir).filter(f => f.endsWith('.pdf'));
  if (!files.length) return res.status(404).json({ error: 'No individual badges found. Generate first.' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="individual_badges.zip"');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.pipe(res);
  files.forEach(f => archive.file(path.join(indDir, f), { name: f }));
  archive.finalize();
});

// GET /api/badges/download/individual/:filename
router.get('/download/individual/:filename', (req, res) => {
  const filePath = path.join(__dirname, '../../exports/individual', req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(filePath);
});

// POST /api/badges/upload-logo — upload event logo
router.post('/upload-logo', (req, res) => {
  if (!req.files || !req.files.logo) return res.status(400).json({ error: 'No logo file uploaded' });

  const logo   = req.files.logo;
  const ext    = logo.name.split('.').pop().toLowerCase();
  if (!['png','jpg','jpeg','svg'].includes(ext)) {
    return res.status(400).json({ error: 'Logo must be PNG, JPG, or SVG' });
  }

  const logoDir  = path.join(__dirname, '../../data');
  const logoPath = path.join(logoDir, `logo.${ext}`);
  fs.mkdirSync(logoDir, { recursive: true });
  logo.mv(logoPath, (err) => {
    if (err) return res.status(500).json({ error: 'Logo save failed' });
    // Update settings
    db.prepare(`INSERT OR REPLACE INTO settings(key,value) VALUES('logo_path',?)`).run(logoPath);
    res.json({ success: true, message: 'Logo uploaded', path: logoPath });
  });
});

// POST /api/badges/upload-bg — upload custom badge background PNG
router.post('/upload-bg', (req, res) => {
  if (!req.files || !req.files.file) return res.status(400).json({ error: 'No background file uploaded' });

  const bg = req.files.file;
  const ext = bg.name.split('.').pop().toLowerCase();
  if (ext !== 'png') return res.status(400).json({ error: 'Background must be a PNG file' });

  const dataDir = path.join(__dirname, '../../data');
  const bgPath = path.join(dataDir, 'badge_bg.png');
  fs.mkdirSync(dataDir, { recursive: true });

  bg.mv(bgPath, (err) => {
    if (err) return res.status(500).json({ error: 'Background save failed' });
    db.prepare(`INSERT OR REPLACE INTO settings(key,value) VALUES('badge_bg_path',?)`).run(bgPath);
    res.json({ success: true, message: 'Background uploaded', path: bgPath });
  });
});

// POST /api/badges/clear-bg — revert to default background
router.post('/clear-bg', (req, res) => {
  db.prepare(`DELETE FROM settings WHERE key = 'badge_bg_path'`).run();
  res.json({ success: true, message: 'Reverted to default' });
});

module.exports = router;
