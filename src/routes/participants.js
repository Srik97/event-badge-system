// src/routes/participants.js
const express = require('express');
const router  = express.Router();
const db      = require('../db');

// GET /api/participants — list with search, filter, pagination (matches index.html)
router.get('/', (req, res) => {
  const { q = '', type = '', limit = 50, offset = 0 } = req.query;
  
  let sql = 'FROM participants WHERE (name LIKE ? OR email LIKE ? OR badge_id LIKE ?)';
  const params = [`%${q}%`, `%${q}%`, `%${q}%`];
  
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  const total = db.prepare(`SELECT COUNT(*) as count ${sql}`).get(...params).count;
  const rows  = db.prepare(`SELECT * ${sql} ORDER BY name LIMIT ? OFFSET ?`).all(...params, parseInt(limit), parseInt(offset));
  
  res.json({ rows, total });
});

// GET /api/participants/stats — counts for dashboard (matches index.html)
router.get('/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as count FROM participants').get().count;
  
  const byType = db.prepare(`
    SELECT type, COUNT(*) as count FROM participants GROUP BY type
  `).all();
  
  const checkedIn = db.prepare(`
    SELECT COUNT(DISTINCT participant_id) as count FROM scans WHERE station = 'checkin' AND result = 'ALLOW'
  `).get().count;

  const checkedOut = db.prepare(`
    SELECT COUNT(DISTINCT participant_id) as count FROM scans WHERE station = 'checkout' AND result IN ('ALLOW','CAUTION')
  `).get().count;

  const today = new Date().toISOString().slice(0, 10);
  const lunchDone = db.prepare(`
    SELECT COUNT(DISTINCT participant_id) as count FROM scans WHERE station = 'lunch' AND result = 'ALLOW' AND DATE(scanned_at) = ?
  `).get(today).count;

  const kitDone = db.prepare(`
    SELECT COUNT(DISTINCT participant_id) as count FROM scans WHERE station = 'kit' AND result = 'ALLOW'
  `).get().count;

  res.json({ total, byType, checkedIn, checkedOut, lunchDone, kitDone });
});

// GET /api/participants/:id
router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM participants WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Participant not found' });
  res.json(p);
});

// PUT /api/participants/:id — update participant
router.put('/:id', (req, res) => {
  const { name, email, phone, type, company } = req.body;
  db.prepare(`
    UPDATE participants SET name=?, email=?, phone=?, type=?, company=? WHERE id=?
  `).run(name, email, phone, type, company, req.params.id);
  res.json({ success: true });
});

// DELETE /api/participants/:id
router.delete('/:id', (req, res) => {
  console.log(`[participants] Deleting participant ID: ${req.params.id}`);
  try {
    const id = parseInt(req.params.id);
    db.exec('BEGIN');
    db.prepare('DELETE FROM scans WHERE participant_id = ?').run(id);
    db.prepare('DELETE FROM participants WHERE id = ?').run(id);
    db.exec('COMMIT');
    console.log(`[participants] Deleted ID ${id}`);
    res.json({ success: true });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error(`[participants] Delete error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/participants — delete all
router.delete('/', (req, res) => {
  console.log(`[participants] Wiping all data`);
  try {
    db.exec('BEGIN');
    db.prepare('DELETE FROM scans').run();
    db.prepare('DELETE FROM participants').run();
    db.exec('COMMIT');
    console.log(`[participants] Wipe all complete`);
    res.json({ success: true });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error(`[participants] Wipe all error:`, e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
