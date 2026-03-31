const db = require('./src/db');

console.log('--- Verification Test ---');

// 1. Add a participant
const pId = db.prepare(`
  INSERT INTO participants (badge_id, name, email, type)
  VALUES (?, ?, ?, ?)
`).run('VERIFY-001', 'Test User', 'test@example.com', 'delegate').lastInsertRowid;

console.log('Added participant ID:', pId);

// 2. Add some scans
db.prepare(`
  INSERT INTO scans (participant_id, badge_id, station, result)
  VALUES (?, ?, ?, ?)
`).run(pId, 'VERIFY-001', 'checkin', 'ALLOW');

db.prepare(`
  INSERT INTO scans (participant_id, badge_id, station, result)
  VALUES (?, ?, ?, ?)
`).run(pId, 'VERIFY-001', 'lunch', 'ALLOW');

const scanCount = db.prepare('SELECT COUNT(*) as count FROM scans WHERE participant_id = ?').get(pId).count;
console.log('Added scans:', scanCount);

// 3. Delete participant
console.log('Deleting participant...');
// In the route we use db.transaction() and delete scans first.
// Let's simulate the route logic:
db.transaction(() => {
  db.prepare('DELETE FROM scans WHERE participant_id = ?').run(pId);
  db.prepare('DELETE FROM participants WHERE id = ?').run(pId);
})();

// 4. Verify
const pCheck = db.prepare('SELECT * FROM participants WHERE id = ?').get(pId);
const sCheck = db.prepare('SELECT * FROM scans WHERE participant_id = ?').get(pId);

if (!pCheck && !sCheck) {
  console.log('✅ SUCCESS: Participant and scans deleted correctly.');
} else {
  console.error('❌ FAILURE: Data remains.', { pCheck, sCheck });
}
