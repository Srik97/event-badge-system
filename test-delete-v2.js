const db = require('./src/db');
const idToDelete = 23; 
console.log(`Attempting to delete participant with id ${idToDelete}...`);
try {
  // Check if scans exist for this participant
  const scans = db.prepare('SELECT COUNT(*) as count FROM scans WHERE participant_id = ?').get(idToDelete).count;
  console.log(`Participant has ${scans} scans.`);

  // Attempt delete
  const result = db.prepare('DELETE FROM participants WHERE id = ?').run(idToDelete);
  console.log('Success:', result);
} catch (e) {
  console.error('Error:', e.message);
}
