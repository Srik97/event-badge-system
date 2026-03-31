// src/routes/settings.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/settings — return all settings as key:value object
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json(settings);
});

// POST /api/settings — update one or more settings
// Body: { event_name: "...", event_date: "..." }
router.post('/', (req, res) => {
  const upsert = db.prepare(`INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)`);
  const updateMany = db.transaction((obj) => {
    for (const [key, value] of Object.entries(obj)) {
      upsert.run(key, value);
    }
  });
  updateMany(req.body);
  res.json({ success: true });
});

module.exports = router;
