#!/usr/bin/env node
/**
 * Seed CodeArena with an admin account, the built-in problem set (statements + generated tests),
 * demo contests and a welcome announcement. Safe to re-run: problems are upserted by code and
 * their tests regenerated deterministically.
 *
 *   npm run seed                  # everything
 *   npm run seed -- 1001 1002     # only (re)build these problems
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.js';
import { db } from '../server/db.js';
import { setProblemTags } from '../server/services/problems.js';
import { writeTests } from '../server/services/tests.js';
import { hashPassword } from '../server/util/security.js';
import { rng } from './lib.js';
import set1 from './problems/set1.js';
import set2 from './problems/set2.js';
import set3 from './problems/set3.js';
import set4 from './problems/set4.js';

const PROBLEMS = [...set1, ...set2, ...set3, ...set4];
const only = process.argv.slice(2);
const now = Date.now();

// ------------------------------------------------------------------ admin
let admin = db.get(`SELECT id, handle FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`);
if (!admin) {
  const password = config.admin.password || crypto.randomBytes(9).toString('base64url');
  admin = db.get(
    `INSERT INTO users (handle, email, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?) RETURNING id, handle`,
    config.admin.handle, config.admin.email, hashPassword(password), now,
  );
  const file = path.join(config.dataDir, 'ADMIN_CREDENTIALS.txt');
  fs.writeFileSync(file, `handle: ${admin.handle}\npassword: ${password}\n\nChange this password after the first login (Settings page).\n`);
  console.log(`Created admin '${admin.handle}' — password saved to ${path.relative(process.cwd(), file)}`);
}

// ------------------------------------------------------------------ problems
let built = 0;
for (const [i, p] of PROBLEMS.entries()) {
  if (only.length && !only.includes(p.code)) continue;
  const t0 = Date.now();
  const R = rng(0xc0de + i * 7919);
  const inputs = [
    ...p.samples.map((input) => ({ input, isSample: true })),
    ...p.tests(R).map((input) => ({ input, isSample: false })),
  ];
  const tests = inputs.map((t) => ({ ...t, output: p.solve(t.input) }));

  const existing = db.get('SELECT id FROM problems WHERE code = ?', p.code);
  const fields = [p.title, p.legend, p.input, p.output, p.notes || '', p.timeLimitMs || 1000, p.memoryLimitMb || 256,
    p.checker || 'tokens', p.difficulty ?? null, 'CodeArena Originals'];
  const id = db.tx(() => {
    let pid;
    if (existing) {
      db.run(
        `UPDATE problems SET title = ?, legend = ?, input_spec = ?, output_spec = ?, notes = ?, time_limit_ms = ?, memory_limit_mb = ?,
                checker = ?, difficulty = ?, source = ?, updated_at = ? WHERE id = ?`,
        ...fields, now, existing.id,
      );
      pid = existing.id;
    } else {
      pid = db.get(
        `INSERT INTO problems (code, title, legend, input_spec, output_spec, notes, time_limit_ms, memory_limit_mb, checker,
                               difficulty, source, visibility, author_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?, ?) RETURNING id`,
        p.code, ...fields, admin.id, now, now,
      ).id;
    }
    setProblemTags(pid, p.tags);
    return pid;
  });
  writeTests(id, tests, { replace: true });
  const bytes = tests.reduce((s, t) => s + t.input.length + t.output.length, 0);
  built++;
  console.log(`  ${p.code} ${p.title.padEnd(28)} ${String(tests.length).padStart(2)} tests  ${(bytes / 1e6).toFixed(1).padStart(5)} MB  ${Date.now() - t0} ms`);
}
console.log(`Built ${built} problem(s).`);

// ------------------------------------------------------------------ contests & news (first run only)
if (!only.length && !db.get('SELECT 1 FROM contests LIMIT 1')) {
  const pid = (code) => db.get('SELECT id FROM problems WHERE code = ?', code).id;
  const mkContest = (title, description, startAt, durationMin, problems, rated = 1) => {
    const c = db.get(
      `INSERT INTO contests (title, description, start_at, duration_min, freeze_min, penalty_min, rated, created_by, created_at)
       VALUES (?, ?, ?, ?, 0, 20, ?, ?, ?) RETURNING id`,
      title, description, startAt, durationMin, rated, admin.id, now,
    );
    problems.forEach((code, k) => db.run('INSERT INTO contest_problems (contest_id, problem_id, label) VALUES (?, ?, ?)', c.id, pid(code), String.fromCharCode(65 + k)));
    return c.id;
  };
  const day = 86400_000;
  const hour = 3600_000;
  mkContest(
    'CodeArena Warm-up Round #1',
    'Five classic problems to get started. ICPC rules: every wrong attempt before acceptance costs 20 penalty minutes.',
    Math.floor((now - 7 * day) / hour) * hour, 120, ['1001', '1003', '1006', '1013', '1017'],
  );
  mkContest(
    'CodeArena Round #2 (Div. 2)',
    'Number theory, trees and meet-in-the-middle. The problems stay hidden until the round starts. Good luck!',
    Math.floor((now + 3 * day) / hour) * hour, 135, ['1037', '1036', '1034', '1038'],
  );
  db.run(
    'INSERT INTO announcements (title, body, pinned, author_id, created_at) VALUES (?, ?, 1, ?, ?)',
    'Welcome to CodeArena!',
    `CodeArena is an online judge: solve problems, get instant verdicts, compete in rated contests and climb the rankings.

* **Problemset** — ${PROBLEMS.length} original problems with full test data, judged right here.
* **Archive** — tens of thousands of problems indexed from Codeforces, AtCoder, UVa and CSES, with filters by tag and difficulty. Mark them solved or sync your Codeforces progress.
* **Contests** — ICPC-style rounds with live standings and Elo-style rating changes.

Supported languages depend on the compilers installed on the judge; see the language list when you submit.`,
    admin.id, now,
  );
  console.log('Created demo contests and a welcome announcement.');
}
