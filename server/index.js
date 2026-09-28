import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createApp } from './app.js';
import { config, ROOT } from './config.js';
import { db } from './db.js';
import { JudgePool } from './judge/worker.js';
import { purgeExpiredSessions } from './middleware/auth.js';
import { syncAll } from './services/archive/index.js';
import { hashPassword } from './util/security.js';

// Bootstrap an admin account from env on first boot (ADMIN_PASSWORD must be set).
if (config.admin.password && !db.get(`SELECT 1 FROM users WHERE role = 'admin'`)) {
  db.run(
    `INSERT INTO users (handle, email, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)
     ON CONFLICT(handle) DO UPDATE SET role = 'admin'`,
    config.admin.handle, config.admin.email, hashPassword(config.admin.password), Date.now(),
  );
  console.log(`[boot] created admin account '${config.admin.handle}'`);
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
