const db = require('./src/db');
const participants = db.prepare('SELECT id, name FROM participants').all();
console.log(JSON.stringify(participants, null, 2));
