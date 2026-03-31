// src/db.js — SQLite singleton
// Uses node-sqlite3-wasm (pure WASM, no native build) wrapped in a
// better-sqlite3-compatible shim so all route files work unchanged.
const { Database: WasmDB } = require('node-sqlite3-wasm');
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.join(__dirname, '../data/event.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const wasmDb = new WasmDB(DB_PATH);

// ── Shim: make node-sqlite3-wasm look like better-sqlite3 ──────────────────

/**
 * Statement shim: wraps a SQL string and provides .all() / .get() / .run()
 * with spread-params style, matching better-sqlite3's API.
 */
function makeStmt(sql) {
  return {
    all(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return wasmDb.all(sql, params.length > 0 ? params : undefined);
    },
    get(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return wasmDb.get(sql, params.length > 0 ? params : undefined);
    },
    run(...args) {
      const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return wasmDb.run(sql, params.length > 0 ? params : undefined);
    },
  };
}

const db = {
  prepare(sql) {
    return makeStmt(sql);
  },
  exec(sql) {
    wasmDb.exec(sql);
  },
  run(sql, params) {
    return wasmDb.run(sql, params);
  },
  // Transaction shim: runs a function synchronously (node-sqlite3-wasm is sync)
  transaction(fn) {
    return function(...args) {
      wasmDb.run('BEGIN');
      try {
        const result = fn(...args);
        wasmDb.run('COMMIT');
        return result;
      } catch (e) {
        wasmDb.run('ROLLBACK');
        throw e;
      }
    };
  },
};

module.exports = db;
