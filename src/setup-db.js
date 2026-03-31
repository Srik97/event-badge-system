// src/setup-db.js — Run once to initialise the database schema
const db = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS participants (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    badge_id    TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    email       TEXT,
    phone       TEXT,
    type        TEXT DEFAULT 'delegate',
    company     TEXT,
    qr_base64   TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS scans (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
    badge_id       TEXT NOT NULL,
    station        TEXT NOT NULL,
    result         TEXT NOT NULL,
    operator_id    TEXT,
    scanned_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// Seed default settings if not present
const upsert = db.prepare(`INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)`);
upsert.run('event_name', 'My Event');
upsert.run('event_date', '');

console.log('✅  Database initialised at data/event.db');
