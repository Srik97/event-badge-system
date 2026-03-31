// src/routes/scan.js — Scan API with atomic business rules
const express = require('express');
const router  = express.Router();
const db      = require('../db');

/**
 * POST /api/scan
 * Body: { badge_id: "BDG-0001", station: "checkin" | "checkout" | "lunch" | "kit" }
 *
 * Returns:
 *   result: "ALLOW" | "CAUTION" | "DENY"
 *   message: human-readable explanation
 *   participant: { name, type, company, badge_id }
 */
router.post('/', (req, res) => {
  // Frontend sends 'uuid' instead of 'badge_id' and 'station_type' instead of 'station'
  const badge_id = req.body.uuid || req.body.badge_id;
  const station  = req.body.station_type || req.body.station;

  if (!badge_id || !station) {
    return res.status(400).json({ error: 'badge_id (uuid) and station (station_type) are required' });
  }

  const operator_id = req.body.operator_id || 'System';

  const participant = db.prepare(
    'SELECT * FROM participants WHERE badge_id = ?'
  ).get(badge_id);

  if (!participant) {
    db.prepare(
      `INSERT INTO scans(badge_id, station, result, operator_id) VALUES(?,?,?,?)`
    ).run(badge_id, station, 'DENY', operator_id);
    return res.json({ result: 'DENY', message: 'Unknown QR code — not registered.' });
  }

  let result  = 'ALLOW';
  let message = '';

  if (station === 'lunch') {
    const today = new Date().toISOString().slice(0, 10);
    const existing = db.prepare(`
      SELECT id FROM scans
      WHERE participant_id = ? AND station = 'lunch' AND result = 'ALLOW'
        AND DATE(scanned_at) = ?
    `).get(participant.id, today);
    if (existing) {
      result  = 'DENY';
      message = 'Lunch already collected today.';
    } else {
      message = 'Lunch — enjoy your meal!';
    }
  } else if (station === 'kit') {
    const existing = db.prepare(`
      SELECT id FROM scans
      WHERE participant_id = ? AND station = 'kit' AND result = 'ALLOW'
    `).get(participant.id);
    if (existing) {
      result  = 'DENY';
      message = 'Kit already collected.';
    } else {
      message = 'Kit collected.';
    }
  } else if (station === 'checkin') {
    const lastCheckin  = db.prepare(
      `SELECT id FROM scans WHERE participant_id=? AND station='checkin' ORDER BY scanned_at DESC LIMIT 1`
    ).get(participant.id);
    const lastCheckout = db.prepare(
      `SELECT id FROM scans WHERE participant_id=? AND station='checkout' ORDER BY scanned_at DESC LIMIT 1`
    ).get(participant.id);
    if (lastCheckin && (!lastCheckout || lastCheckout.id < lastCheckin.id)) {
      result  = 'CAUTION';
      message = 'Already checked in (re-entry).';
    } else {
      message = `Welcome, ${participant.name}!`;
    }
  } else if (station === 'checkout') {
    const lastCheckin  = db.prepare(
      `SELECT id FROM scans WHERE participant_id=? AND station='checkin' ORDER BY scanned_at DESC LIMIT 1`
    ).get(participant.id);
    const lastCheckout = db.prepare(
      `SELECT id FROM scans WHERE participant_id=? AND station='checkout' ORDER BY scanned_at DESC LIMIT 1`
    ).get(participant.id);
    if (!lastCheckin) {
      result  = 'CAUTION';
      message = 'No check-in recorded — checking out anyway.';
    } else if (lastCheckout && lastCheckout.id > lastCheckin.id) {
      result  = 'CAUTION';
      message = 'Already checked out.';
    } else {
      message = `Goodbye, ${participant.name}!`;
    }
  } else {
    message = 'Scanned at unknown station.';
  }

  db.prepare(
    `INSERT INTO scans(participant_id, badge_id, station, result, operator_id) VALUES(?,?,?,?,?)`
  ).run(participant.id, badge_id, station, result, operator_id);

  if (req.app.broadcast) {
    req.app.broadcast({ 
      type: 'scan', 
      badge_id, 
      station_type: station, // Frontend expects station_type
      result: result.toLowerCase(), // Frontend expects lower case
      message,
      operator_id,
      participant: {
        name:     participant.name,
        type:     participant.type,
        company:  participant.company,
        badge_id: participant.badge_id
      }
    });
  }

  res.json({
    result: result.toLowerCase(),
    message: message || `${station} scanned.`,
    participant: {
      name:     participant.name,
      type:     participant.type,
      company:  participant.company,
      badge_id: participant.badge_id
    }
  });
});

// GET /api/scan/log — plural mismatch fix (frontend uses /api/scan/log)
router.get('/log', (req, res) => {
  const { limit = 1000, station_type = '' } = req.query;
  let sql = 'SELECT s.id, s.badge_id, s.station as station_type, s.result, s.scanned_at, s.operator_id, p.name, p.type FROM scans s LEFT JOIN participants p ON s.participant_id = p.id';
  const params = [];
  
  if (station_type) {
    sql += ' WHERE s.station = ?';
    params.push(station_type);
  }
  
  sql += ' ORDER BY s.scanned_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const logs = db.prepare(sql).all(...params);
  res.json(logs);
});

module.exports = router;
