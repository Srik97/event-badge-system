const db = require('./src/db');
console.log('Attempting to delete participant with id 1...');
try {
  const result = db.prepare('DELETE FROM participants WHERE id = ?').run(1);
  console.log('Success:', result);
} catch (e) {
  console.error('Error:', e.message);
}
