#!/usr/bin/env node
/**
 * Validate problem data: run every reference solution in seed/solutions/<code>.<ext> through the
 * real sandbox + checker on every test and report verdicts and the slowest test vs. the time limit.
 *
 *   node scripts/verify-solutions.js            # all problems that have a reference solution
 *   node scripts/verify-solutions.js 1013 1034  # selected problems
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/config.js';
import { db } from '../server/db.js';
import { check } from '../server/judge/checker.js';
import { runOnInputs } from '../server/judge/judge.js';
import { availableLanguages } from '../server/judge/languages.js';
import { Sandbox } from '../server/judge/sandbox.js';
import { listTests, testPaths } from '../server/services/tests.js';

const dir = path.join(ROOT, 'seed', 'solutions');
const byExt = new Map(availableLanguages().map((l) => [l.ext, l.id]));
const wanted = process.argv.slice(2);
const sandbox = new Sandbox('verify');
let bad = 0;

for (const file of fs.readdirSync(dir).sort()) {
  const [code, ext] = file.split('.');
  if (wanted.length && !wanted.includes(code)) continue;
  const language = byExt.get(ext);
  const p = db.get('SELECT * FROM problems WHERE code = ?', code);
  if (!p || !language) {
    console.log(`${code}: skipped (${!p ? 'no such problem' : `no toolchain for .${ext}`})`);
    continue;
  }
  const tests = listTests(p.id);
  const out = await runOnInputs(sandbox, {
    language,
    source: fs.readFileSync(path.join(dir, file), 'utf8'),
    inputs: tests.map((t) => testPaths(p.id, t.idx).input),
    timeLimitMs: 20_000,
    memoryLimitMb: p.memory_limit_mb,
    keepOutputs: true,
  });
  if (out.compile.verdict !== 'OK') {
    bad++;
    console.log(`${code}: COMPILE ${out.compile.verdict}\n${out.compile.log}`);
    continue;
  }
  const fails = [];
  let slow = 0;
  let slowIdx = 0;
  out.runs.forEach((run, i) => {
    if (run.time_ms > slow) { slow = run.time_ms; slowIdx = tests[i].idx; }
    if (run.status !== 'OK') return fails.push(`#${tests[i].idx} ${run.status} ${run.stderr.trim().split('\n').pop() || ''}`);
    const expected = fs.readFileSync(testPaths(p.id, tests[i].idx).output, 'utf8');
    const r = check(p.checker, expected, run.output);
    if (!r.ok) fails.push(`#${tests[i].idx} WA ${r.message}`);
  });
  const flag = fails.length ? 'FAIL' : slow > p.time_limit_ms ? 'SLOW' : 'ok';
  if (fails.length) bad++;
  console.log(`${code} ${p.title.padEnd(30)} ${flag.padEnd(4)} tests=${String(tests.length).padStart(2)} slowest=${String(slow).padStart(5)}ms (#${slowIdx}) TL=${p.time_limit_ms}ms ${fails.slice(0, 3).join(' | ')}`);
}
sandbox.stop();
process.exit(bad ? 1 : 0);
