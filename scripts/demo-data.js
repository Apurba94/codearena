#!/usr/bin/env node
/**
 * OPTIONAL demo data: creates display-only accounts named demo_* (they cannot log in), fills the
 * finished "Warm-up Round #1" with real submissions judged by the real judge, and applies ratings —
 * so standings, rankings and rating graphs have something to show. Do not run on a production site.
 *
 *   npm run demo
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/config.js';
import { db } from '../server/db.js';
import { JudgePool } from '../server/judge/worker.js';
import { applyRatings, contestProblems, phaseOf } from '../server/services/contests.js';
import { rng } from '../seed/lib.js';

const contest = db.get(`SELECT * FROM contests WHERE title = 'CodeArena Warm-up Round #1'`);
if (!contest) throw new Error('Run `npm run seed` first');
if (phaseOf(contest) !== 'finished') throw new Error('The warm-up contest has not finished yet');
if (db.get('SELECT 1 FROM submissions WHERE contest_id = ? LIMIT 1', contest.id)) {
  console.log('Demo data already present — nothing to do.');
  process.exit(0);
}

const R = rng(2026);
const NAMES = ['demo_ada', 'demo_bjarne', 'demo_grace', 'demo_linus', 'demo_edsger', 'demo_donald', 'demo_barbara', 'demo_ken', 'demo_margaret', 'demo_alan', 'demo_tim', 'demo_radia'];
const problems = contestProblems(contest.id);
const solutions = Object.fromEntries(problems.map((p) => [p.id, fs.readFileSync(path.join(ROOT, 'seed', 'solutions', `${p.code}.py`), 'utf8')]));
const WRONG = ['print(0)\n', 'import sys\nprint(sys.stdin.readline())\n', 'print(-1)\n'];

let queued = 0;
db.tx(() => {
  NAMES.forEach((handle, i) => {
    const user = db.get(
      `INSERT INTO users (handle, email, password_hash, created_at, country) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(handle) DO UPDATE SET handle = excluded.handle RETURNING id`,
      handle, `${handle}@demo.invalid`, `disabled$${crypto.randomBytes(8).toString('hex')}`, contest.start_at - 30 * 86400_000,
      R.pick(['Bangladesh', 'India', 'Japan', 'Poland', 'Brazil', 'Egypt', 'Canada', 'Vietnam']),
    );
    db.run('INSERT OR IGNORE INTO contest_registrations (contest_id, user_id, registered_at) VALUES (?, ?, ?)', contest.id, user.id, contest.start_at - 3600_000);
    const skill = 1 - i / NAMES.length; // earlier names are stronger
    let t = contest.start_at + R.int(3, 8) * 60_000;
    problems.forEach((p, k) => {
      const chance = skill - k * 0.14 + 0.25;
      if (R.next() > chance + 0.1) return; // never tried
      const solves = R.next() < chance;
      const wrongTries = solves ? (R.next() < 0.35 ? R.int(1, 2) : 0) : R.int(1, 3);
      for (let w = 0; w < wrongTries; w++) {
        t += R.int(2, 9) * 60_000;
        insert(user.id, p.id, R.pick(WRONG), t);
      }
      if (solves) {
        t += R.int(4, 18) * 60_000;
        insert(user.id, p.id, solutions[p.id], t);
      }
    });
  });
});

function insert(userId, problemId, source, at) {
  const end = contest.start_at + contest.duration_min * 60_000 - 60_000;
  db.run(
    `INSERT INTO submissions (user_id, problem_id, contest_id, language, source, source_len, status, created_at)
     VALUES (?, ?, ?, 'python3', ?, ?, 'queued', ?)`,
    userId, problemId, contest.id, source, Buffer.byteLength(source), Math.min(at, end),
  );
  queued++;
}

console.log(`Queued ${queued} demo submissions; judging...`);
const pool = new JudgePool(3).start();
for (;;) {
  const left = db.get(`SELECT COUNT(*) n FROM submissions WHERE status != 'done'`).n;
  if (!left) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await pool.stop();
const changes = applyRatings(db.get('SELECT * FROM contests WHERE id = ?', contest.id));
console.log(`Applied rating changes for ${changes.length} demo users.`);
process.exit(0);
