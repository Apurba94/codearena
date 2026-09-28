import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, ROOT } from './config.js';

const SCHEMA_VERSION = '1';

class Database {
  constructor(file) {
    this.raw = new DatabaseSync(file);
    this.raw.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 10000;
    `);
    this.cache = new Map();
    this.depth = 0;
  }

  stmt(sql) {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  get(sql, ...params) { return this.stmt(sql).get(...params); }
  all(sql, ...params) { return this.stmt(sql).all(...params); }
  run(sql, ...params) { return this.stmt(sql).run(...params); }
  exec(sql) { return this.raw.exec(sql); }

  /** Run fn inside a transaction (nested calls become savepoints). */
  tx(fn) {
    const top = this.depth === 0;
    const sp = `sp${this.depth}`;
    this.raw.exec(top ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`);
    this.depth++;
    try {
      const out = fn();
      this.depth--;
      this.raw.exec(top ? 'COMMIT' : `RELEASE ${sp}`);
      return out;
    } catch (err) {
      this.depth--;
      this.raw.exec(top ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw err;
    }
  }

  migrate() {
    this.raw.exec(fs.readFileSync(path.join(ROOT, 'server', 'schema.sql'), 'utf8'));
    this.run(`INSERT INTO meta (key, value) VALUES ('schema_version', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`, SCHEMA_VERSION);
  }

  close() { this.raw.close(); }
}

export const db = new Database(config.dbFile);
db.migrate();

/** Build "?, ?, ?" for IN (...) lists. */
export const placeholders = (n) => Array.from({ length: n }, () => '?').join(', ');
