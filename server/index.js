import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createApp } from './app.js';
import { config, ROOT } from './config.js';
import { db } from './db.js';
import { JudgePool } from './judge/worker.js';
import { purgeExpiredSessions } from './middleware/auth.js';
import { syncAll } from './services/archive/index.js';
import { hashPassword, verifyPassword } from './util/security.js';

// Admin account from env (ADMIN_HANDLE / ADMIN_PASSWORD). The account is created if missing; when the
// ADMIN_PASSWORD value *changes*, the password is reset once — a salted hash of the applied value is
// remembered — so the Settings page keeps working afterwards and a lost password can be recovered
// from the hosting dashboard without shell access.
if (config.admin.password) {
  const applied = db.get(`SELECT value FROM meta WHERE key = 'admin_password_env'`)?.value;
  const user = db.get('SELECT id FROM users WHERE handle = ?', config.admin.handle);
  if (!user) {
    db.run(
      `INSERT INTO users (handle, email, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)`,
      config.admin.handle, config.admin.email, hashPassword(config.admin.password), Date.now(),
    );
    console.log(`[boot] created admin account '${config.admin.handle}'`);
  } else if (!applied || !verifyPassword(config.admin.password, applied)) {
    db.run(`UPDATE users SET password_hash = ?, role = 'admin', banned = 0 WHERE id = ?`, hashPassword(config.admin.password), user.id);
    db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
    console.log(`[boot] ADMIN_PASSWORD changed: reset the password of '${config.admin.handle}'`);
  }
  if (!applied || !verifyPassword(config.admin.password, applied)) {
    db.run(`INSERT INTO meta (key, value) VALUES ('admin_password_env', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      hashPassword(config.admin.password));
  }
}

if (!db.get(`SELECT 1 FROM users WHERE role = 'admin'`)) {
  console.warn('[boot] no admin account: set ADMIN_PASSWORD (or run `npm run seed`, which writes one to DATA_DIR/ADMIN_CREDENTIALS.txt)');
}

// First boot on a hosted platform: build the problem set (statements + generated tests, ~10-30 s).
if (config.autoSeed && !db.get('SELECT 1 FROM problems LIMIT 1')) {
  console.log('[boot] empty database: seeding the built-in problem set...');
  const r = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'seed', 'seed.js')], { stdio: 'inherit', env: process.env });
  if (r.status !== 0) console.error('[boot] seeding failed; run `npm run seed` manually');
}

const pool = config.judge.embedded ? new JudgePool(config.judge.workers).start() : null;
const app = createApp({ pool });

const server = app.listen(config.port, config.host, () => {
  console.log(`[http] ${config.siteName} listening on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
  if (!pool) console.log('[judge] embedded judge disabled; run `npm run judge` to start workers');
});

setInterval(purgeExpiredSessions, 60 * 60_000).unref();

if (config.archive.autoImport && !db.get('SELECT 1 FROM archive_problems LIMIT 1')) {
  console.log('[archive] empty archive: importing Codeforces, AtCoder, UVa and CSES in the background...');
  syncAll((src, r) => console.log(`[archive] ${src}: ${r.ok ? `${r.count} problems` : r.error}`));
}

if (config.archive.autoSyncHours > 0) {
  const tick = () => syncAll((src, r) => console.log(`[archive] ${src}: ${r.ok ? `${r.count} problems` : r.error}`));
  setInterval(tick, config.archive.autoSyncHours * 3600_000).unref();
}

async function shutdown(sig) {
  console.log(`[boot] ${sig} received, shutting down`);
  server.close();
  if (pool) await pool.stop();
  db.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
