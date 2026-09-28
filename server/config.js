import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (KEY=VALUE lines) so the app has zero config dependencies.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(val)) val = val.slice(1, -1);
    else val = val.replace(/\s+#.*$/, ''); // inline comment after an unquoted value
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvFile(path.join(ROOT, '.env'));

const env = (k, d) => process.env[k] ?? d;
const int = (k, d) => {
  const v = parseInt(process.env[k] ?? '', 10);
  return Number.isFinite(v) ? v : d;
};
const bool = (k, d) => {
  const v = process.env[k];
  return v === undefined ? d : /^(1|true|yes|on)$/i.test(v);
};

const dataDir = path.resolve(ROOT, env('DATA_DIR', 'data'));

export const config = {
  env: env('NODE_ENV', 'development'),
  isProd: env('NODE_ENV', 'development') === 'production',
  host: env('HOST', '0.0.0.0'),
  port: int('PORT', 3000),
  siteName: env('SITE_NAME', 'CodeArena'),
  trustProxy: bool('TRUST_PROXY', false),

  dataDir,
  dbFile: path.resolve(dataDir, env('DB_FILE', 'codearena.db')),
  testsDir: path.join(dataDir, 'tests'),
  workDir: path.resolve(env('JUDGE_WORK_DIR', path.join(os.tmpdir(), 'codearena-judge'))),

  session: {
    cookie: 'ca_session',
    ttlDays: int('SESSION_TTL_DAYS', 30),
    secureCookie: bool('SECURE_COOKIE', env('NODE_ENV') === 'production'),
  },

  judge: {
    // Run judge workers inside the web process. Set to false and start `npm run judge` separately to scale out.
    embedded: bool('JUDGE_EMBEDDED', true),
    workers: int('JUDGE_WORKERS', Math.max(1, Math.min(4, os.cpus().length - 1))),
    python: env('SANDBOX_PYTHON', process.platform === 'win32' ? 'python' : 'python3'),
    // Optional unprivileged uid/gid for submissions (Linux, supervisor must run as root).
    uid: process.env.SANDBOX_UID ? int('SANDBOX_UID') : null,
    gid: process.env.SANDBOX_GID ? int('SANDBOX_GID') : null,
    compileTimeoutMs: int('COMPILE_TIMEOUT_MS', 30000),
    outputLimitMb: int('OUTPUT_LIMIT_MB', 64),
    stopOnFirstFailure: bool('JUDGE_STOP_ON_FIRST_FAILURE', true),
    maxSourceBytes: int('MAX_SOURCE_BYTES', 65536),
    submitCooldownMs: int('SUBMIT_COOLDOWN_MS', 5000),
    staleLockMs: int('JUDGE_STALE_LOCK_MS', 5 * 60 * 1000),
  },

  admin: {
    handle: env('ADMIN_HANDLE', 'admin'),
    email: env('ADMIN_EMAIL', 'admin@codearena.local'),
    password: env('ADMIN_PASSWORD', ''),
  },

  // First boot on an empty database (hosted platforms have no shell for `npm run seed`).
  autoSeed: bool('AUTO_SEED', false),

  archive: {
    autoImport: bool('AUTO_IMPORT_ARCHIVE', false),
    userAgent: env('ARCHIVE_USER_AGENT', 'CodeArena-OJ-Importer/1.0 (+https://github.com/)'),
    autoSyncHours: int('ARCHIVE_AUTO_SYNC_HOURS', 0),
  },
};

// Data (DB + expected outputs) must never be readable by submissions: owner-only.
fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(config.testsDir, { recursive: true, mode: 0o700 });
if (process.platform !== 'win32') {
  // mounted volumes often arrive as 0755 — enforce owner-only even when the dir already existed
  for (const dir of [config.dataDir, config.testsDir]) {
    try { fs.chmodSync(dir, 0o700); } catch { /* not the owner (e.g. read-only helper process) */ }
  }
}
// Work dir: traversable but not listable, so a submission cannot discover sibling runs.
fs.mkdirSync(config.workDir, { recursive: true, mode: 0o711 });
if (config.judge.uid != null) fs.chmodSync(config.workDir, 0o711);
