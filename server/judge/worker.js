import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, ROOT } from '../config.js';
import { db } from '../db.js';
import { judgeSubmission } from './judge.js';
import { availableLanguages } from './languages.js';
import { Sandbox } from './sandbox.js';
import { TASKS } from './tasks.js';

const NODE_ID = `${os.hostname()}:${process.pid}`;

let isolation = null;
/** Which sandbox protections are active on this node (probed once). */
function probeIsolation() {
  if (isolation) return isolation;
  try {
    const r = spawnSync(config.judge.python, [path.join(ROOT, 'server', 'judge', 'sandbox.py'), '--probe'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    isolation = JSON.parse(r.stdout);
  } catch {
    isolation = {};
  }
  isolation.uidPerWorker = config.judge.uid != null;
  return isolation;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Pool of judge workers. Each worker owns a sandbox supervisor and claims queued submissions
 * with a single atomic UPDATE ... RETURNING, so any number of pools (processes) can share one DB.
 */
export class JudgePool {
  constructor(size = config.judge.workers) {
    this.size = size;
    this.running = false;
    this.idle = [];
    this.active = 0;
    this.sandboxes = [];
  }

  start() {
    if (this.running) return this;
    this.running = true;
    const langs = availableLanguages();
    const iso = probeIsolation();
    console.log(`[judge] ${NODE_ID}: ${this.size} worker(s); languages: ${langs.map((l) => l.id).join(', ') || 'NONE'}`);
    console.log(`[judge] isolation: per-worker uid ${iso.uidPerWorker ? 'on' : 'OFF'}, network namespace ${iso.uidPerWorker && iso.network ? 'on' : 'OFF'}`
      + (iso.uidPerWorker ? '' : ' (development mode: submissions run as the server user)'));
    this.requeueStale();
    this.heartbeat();
    this.timer = setInterval(() => {
      this.requeueStale();
      this.heartbeat();
    }, 30_000);
    this.timer.unref();
    for (let i = 0; i < this.size; i++) this.loop(i);
    return this;
  }

  async stop() {
    this.running = false;
    clearInterval(this.timer);
    this.notify();
    for (const s of this.sandboxes) s.stop();
    db.run('DELETE FROM meta WHERE key = ?', `judge_node:${NODE_ID}`);
  }

  /** Wake idle workers (called right after a new submission is queued in-process). */
  notify() {
    for (const wake of this.idle.splice(0)) wake();
  }

  waitForWork(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.idle = this.idle.filter((w) => w !== done);
        resolve();
      }, ms);
      const done = () => {
        clearTimeout(t);
        resolve();
      };
      this.idle.push(done);
    });
  }

  claim(worker) {
    return db.get(
      `UPDATE submissions SET status = 'compiling', worker = ?, locked_at = ?
        WHERE id = (SELECT id FROM submissions WHERE status = 'queued' ORDER BY id LIMIT 1) AND status = 'queued'
        RETURNING *`,
      worker, Date.now(),
    );
  }

  claimAdhoc(worker) {
    return db.get(
      `UPDATE adhoc_jobs SET status = 'running', worker = ?, locked_at = ?
        WHERE id = (SELECT id FROM adhoc_jobs WHERE status = 'queued' ORDER BY id LIMIT 1) AND status = 'queued'
        RETURNING *`,
      worker, Date.now(),
    );
  }

  /** Interactive jobs (custom runs) queued by a web process that has no judge of its own. */
  async runAdhoc(sandbox, job) {
    let result;
    try {
      result = await TASKS[job.kind](sandbox, JSON.parse(job.payload));
    } catch (e) {
      console.error(`[judge] adhoc job ${job.id} failed:`, e);
      result = { status: 500, body: { error: `Judge error: ${e.message}` } };
    }
    db.run(`UPDATE adhoc_jobs SET status = 'done', result = ?, locked_at = NULL WHERE id = ?`, JSON.stringify(result), job.id);
  }

  async loop(i) {
    const sandbox = new Sandbox(`worker-${i}`, i);
    this.sandboxes.push(sandbox);
    const name = `${NODE_ID}#${i}`;
    while (this.running) {
      let sub;
      try {
        const job = this.claimAdhoc(name);
        if (job) {
          this.active++;
          await this.runAdhoc(sandbox, job).finally(() => { this.active--; });
          continue;
        }
        sub = this.claim(name);
      } catch (e) {
        console.error('[judge] claim failed:', e.message);
        await sleep(1000);
        continue;
      }
      if (!sub) {
        await this.waitForWork(500);
        continue;
      }
      this.active++;
      const t0 = Date.now();
      try {
        const r = await judgeSubmission(sandbox, sub);
        console.log(`[judge] #${sub.id} ${sub.language} -> ${r.verdict}${r.failed_test ? ` on test ${r.failed_test}` : ''} (${Date.now() - t0} ms)`);
      } catch (e) {
        console.error(`[judge] #${sub.id} crashed:`, e);
        db.run(
          `UPDATE submissions SET status = 'done', verdict = 'SE', compile_log = ?, judged_at = ?, locked_at = NULL WHERE id = ?`,
          `Judge error: ${e.message}`, Date.now(), sub.id,
        );
      } finally {
        this.active--;
      }
    }
  }

  /**
   * Put back submissions whose worker died mid-judging: either the lock is older than the stale
   * timeout, or the worker lived on this host and its process no longer exists.
   */
  requeueStale() {
    const cutoff = Date.now() - config.judge.staleLockMs;
    const host = os.hostname();
    const alive = (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (e) {
        return e.code === 'EPERM';
      }
    };
    const stale = db
      .all(`SELECT id, worker, locked_at FROM submissions WHERE status IN ('compiling', 'running')`)
      .filter((s) => {
        if ((s.locked_at ?? 0) < cutoff) return true;
        const m = /^(.*):(\d+)#\d+$/.exec(s.worker || '');
        return m && m[1] === host && !alive(Number(m[2]));
      });
    for (const s of stale) {
      db.run(`UPDATE submissions SET status = 'queued', worker = NULL, locked_at = NULL WHERE id = ? AND status != 'done'`, s.id);
    }
    if (stale.length) console.log(`[judge] requeued ${stale.length} stale submission(s)`);
    db.run('DELETE FROM adhoc_jobs WHERE created_at < ?', Date.now() - 3600_000);
  }

  heartbeat() {
    const value = JSON.stringify({
      node: NODE_ID,
      workers: this.size,
      active: this.active,
      languages: availableLanguages().map((l) => ({ id: l.id, name: l.name, version: l.version, mode: l.mode, ext: l.ext })),
      platform: `${process.platform}-${process.arch}`,
      isolation: probeIsolation(),
      lastSeen: Date.now(),
    });
    db.run(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      `judge_node:${NODE_ID}`, value);
  }
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * Runs ad-hoc tasks (custom invocation, answer generation) and resolves with { status, body }.
 * With an embedded judge they run in-process on a dedicated sandbox; otherwise they are queued in
 * `adhoc_jobs` for the judge workers, so untrusted code never executes in the web process.
 */
class AdhocRunner {
  constructor() {
    this.sandbox = null;
    this.chain = Promise.resolve();
    this.waiting = 0;
  }

  run(kind, payload) {
    if (!TASKS[kind]) return Promise.reject(httpError(400, `Unknown task '${kind}'`));
    return config.judge.embedded ? this.local(kind, payload) : this.remote(kind, payload);
  }

  local(kind, payload) {
    if (this.waiting >= 20) return Promise.reject(httpError(503, 'Runner is busy, try again shortly'));
    this.sandbox ||= new Sandbox('adhoc', 100);
    this.waiting++;
    const p = this.chain.then(() => TASKS[kind](this.sandbox, payload));
    this.chain = p.catch(() => {}).finally(() => { this.waiting--; });
    return p;
  }

  async remote(kind, payload) {
    if (!judgeNodes().length) throw httpError(503, 'No judge node is online right now');
    if (db.get(`SELECT COUNT(*) n FROM adhoc_jobs WHERE status != 'done'`).n >= 50) throw httpError(503, 'Runner is busy, try again shortly');
    const { id } = db.get(
      `INSERT INTO adhoc_jobs (kind, payload, created_at) VALUES (?, ?, ?) RETURNING id`, kind, JSON.stringify(payload), Date.now(),
    );
    const deadline = Date.now() + (kind === 'generate' ? 600_000 : 60_000);
    while (Date.now() < deadline) {
      await sleep(200);
      const row = db.get('SELECT status, result FROM adhoc_jobs WHERE id = ?', id);
      if (row?.status === 'done') {
        db.run('DELETE FROM adhoc_jobs WHERE id = ?', id);
        return JSON.parse(row.result);
      }
    }
    db.run(`DELETE FROM adhoc_jobs WHERE id = ? AND status = 'queued'`, id);
    throw httpError(504, 'Timed out waiting for the judge');
  }
}
export const adhoc = new AdhocRunner();

/** Judge nodes that sent a heartbeat recently (any process sharing this DB). */
export function judgeNodes(maxAgeMs = 120_000) {
  const now = Date.now();
  return db
    .all(`SELECT value FROM meta WHERE key LIKE 'judge_node:%'`)
    .map((r) => JSON.parse(r.value))
    .filter((n) => now - n.lastSeen < maxAgeMs);
}

// Standalone mode: `npm run judge` starts a worker pool without the web server.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = new JudgePool().start();
  const shutdown = async () => {
    console.log('[judge] shutting down');
    await pool.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
