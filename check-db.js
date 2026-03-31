const db = require('./src/db');
console.log('--- Participants ---');
const pTotal = db.prepare('SELECT COUNT(*) as count FROM participants').get().count;
console.log('Total:', pTotal);
console.log('--- Scans ---');
const sTotal = db.prepare('SELECT COUNT(*) as count FROM scans').get().count;
console.log('Total:', sTotal);
