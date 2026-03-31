// src/routes/exportData.js — CSV export endpoints
const express = require('express');
const router  = express.Router();
const db      = require('../db');

function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = rows.map(row =>
    headers.map(h => {
      const v = row[h] == null ? '' : String(row[h]);
      return `"${v.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [headers.join(','), ...lines].join('\r\n');
}

function sendCSV(res, filename, rows) {
  const csv = toCSV(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// GET /api/export/full — every scan with participant info
router.get('/full', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.badge_id, p.name, p.type, p.company, s.station, s.result, s.scanned_at
    FROM scans s LEFT JOIN participants p ON s.participant_id = p.id
    ORDER BY s.scanned_at
  `).all();
  sendCSV(res, 'full_log.csv', rows);
});

// GET /api/export/checkins
router.get('/checkins', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.badge_id, p.name, p.type, p.company, s.result, s.scanned_at
    FROM scans s LEFT JOIN participants p ON s.participant_id = p.id
    WHERE s.station = 'checkin' ORDER BY s.scanned_at
  `).all();
  sendCSV(res, 'checkins.csv', rows);
});

// GET /api/export/checkouts
router.get('/checkouts', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.badge_id, p.name, p.type, p.company, s.result, s.scanned_at
    FROM scans s LEFT JOIN participants p ON s.participant_id = p.id
    WHERE s.station = 'checkout' ORDER BY s.scanned_at
  `).all();
  sendCSV(res, 'checkouts.csv', rows);
});

// GET /api/export/lunch
router.get('/lunch', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.badge_id, p.name, p.type, p.company, s.result, s.scanned_at
    FROM scans s LEFT JOIN participants p ON s.participant_id = p.id
    WHERE s.station = 'lunch' ORDER BY s.scanned_at
  `).all();
  sendCSV(res, 'lunch_log.csv', rows);
});

// GET /api/export/kit
router.get('/kit', (req, res) => {
  const rows = db.prepare(`
    SELECT s.id, s.badge_id, p.name, p.type, p.company, s.result, s.scanned_at
    FROM scans s LEFT JOIN participants p ON s.participant_id = p.id
    WHERE s.station = 'kit' ORDER BY s.scanned_at
  `).all();
  sendCSV(res, 'kit_log.csv', rows);
});

// GET /api/export/participants
router.get('/participants', (req, res) => {
  const rows = db.prepare(`
    SELECT badge_id, name, email, phone, type, company, created_at
    FROM participants ORDER BY name
  `).all();
  sendCSV(res, 'participants.csv', rows);
});

module.exports = router;
