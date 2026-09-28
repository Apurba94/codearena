import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';
import { config, ROOT } from '../config.js';

const SCRIPT = path.join(ROOT, 'server', 'judge', 'sandbox.py');

/**
 * Client for a long-lived `sandbox.py --serve` supervisor.
 * Requests are answered strictly in order, so a FIFO of pending promises is enough.
 * The supervisor is (re)started lazily if it ever dies.
 */
export class Sandbox {
  /**
   * @param {string} name
   * @param {number} slot  distinct per concurrent sandbox; with SANDBOX_UID set, runs use uid SANDBOX_UID + slot
   */
  constructor(name = 'sandbox', slot = 200 + Math.floor(Math.random() * 800)) {
    this.name = name;
    this.slot = slot;
    this.proc = null;
    this.pending = [];
    this.seq = 0;
  }

  start() {
    const proc = spawn(config.judge.python, ['-u', SCRIPT, '--serve'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      const waiter = this.pending.shift();
      if (!waiter) return;
      try {
        waiter.resolve(JSON.parse(line));
      } catch (e) {
        waiter.reject(new Error(`bad sandbox reply: ${line.slice(0, 200)}`));
      }
    });
    let errBuf = '';
    proc.stderr.on('data', (d) => {
      errBuf = (errBuf + d).slice(-4000);
    });
    const onDead = (why) => {
      if (this.proc !== proc) return;
      this.proc = null;
      const err = new Error(`sandbox supervisor exited (${why}) ${errBuf.trim()}`.trim());
      for (const w of this.pending.splice(0)) w.reject(err);
    };
    proc.on('exit', (code, sig) => onDead(sig || `code ${code}`));
    proc.on('error', (e) => onDead(e.message));
    proc.stdin.on('error', () => {});
    this.proc = proc;
  }

  /** Unprivileged uid for this sandbox's submissions (Linux, when SANDBOX_UID is configured). */
  get uid() {
    return config.judge.uid != null ? config.judge.uid + this.slot : null;
  }

  /** Run one program. Resolves with the supervisor's JSON verdict. */
  run(req) {
    if (!this.proc) this.start();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.proc.stdin.write(`${JSON.stringify({ ...req, id })}\n`);
    });
  }

  stop() {
    if (this.proc) {
      this.proc.stdin.end();
      this.proc.kill();
      this.proc = null;
    }
  }
}
