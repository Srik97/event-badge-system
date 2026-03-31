const db = require('./src/db');

console.log('--- Wipe All Verification ---');

// 1. Add some data
db.transaction(() => {
  const p1 = db.prepare('INSERT INTO participants (badge_id, name) VALUES (?, ?)').run('WIPE-001', 'User 1').lastInsertRowid;
  const p2 = db.prepare('INSERT INTO participants (badge_id, name) VALUES (?, ?)').run('WIPE-002', 'User 2').lastInsertRowid;
  db.prepare('INSERT INTO scans (participant_id, badge_id, station, result) VALUES (?, ?, ?, ?)').run(p1, 'WIPE-001', 'checkin', 'ALLOW');
  db.prepare('INSERT INTO scans (participant_id, badge_id, station, result) VALUES (?, ?, ?, ?)').run(p2, 'WIPE-002', 'checkin', 'ALLOW');
})();

console.log('Added test data.');

// 2. Perform wipe (simulate the router.delete('/') logic)
console.log('Performing wipe...');
db.transaction(() => {
  db.prepare('DELETE FROM scans').run();
  db.prepare('DELETE FROM participants').run();
})();

// 3. Verify
const pCount = db.prepare('SELECT COUNT(*) as count FROM participants').get().count;
const sCount = db.prepare('SELECT COUNT(*) as count FROM scans').get().count;

if (pCount === 0 && sCount === 0) {
  console.log('✅ SUCCESS: All data wiped correctly.');
} else {
  console.error('❌ FAILURE: Data remains.', { pCount, sCount });
}
