import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import { listTests, setTestOutput, testPaths } from '../services/tests.js';
import { runOnInputs } from './judge.js';

/**
 * Ad-hoc jobs that execute untrusted code outside the submission queue. They always run on a
 * judge worker (never in the web process when the judge is split out), and each returns
 * { status, body } so HTTP routes can forward the result unchanged.
 */

/** Custom invocation: run code on one input. */
async function customRun(sandbox, { language, source, input }) {
  const file = path.join(config.workDir, `stdin-${crypto.randomBytes(6).toString('hex')}.txt`);
  fs.writeFileSync(file, input ?? '');
  try {
    const out = await runOnInputs(sandbox, { language, source, inputs: [file], timeLimitMs: 5000, memoryLimitMb: 256 });
    const run = out.runs[0];
    return {
      status: 200,
      body: {
        compile: out.compile,
        run: run && {
          status: run.status,
          timeMs: run.time_ms,
          memoryKb: run.memory_kb,
          exitCode: run.exit_code,
          output: run.output.slice(0, 64 * 1024),
          truncated: run.output.length > 64 * 1024,
          stderr: run.stderr.slice(0, 4096),
        },
      },
    };
  } finally {
    fs.rm(file, { force: true }, () => {});
  }
}

/** Polygon-style: write every expected output by running a trusted reference solution. */
async function generateAnswers(sandbox, { problemId, language, source }) {
  const p = db.get('SELECT id, time_limit_ms, memory_limit_mb FROM problems WHERE id = ?', problemId);
  if (!p) return { status: 404, body: { error: 'Problem not found' } };
  const tests = listTests(p.id);
  if (!tests.length) return { status: 400, body: { error: 'Add test inputs first' } };
  const out = await runOnInputs(sandbox, {
    language, source, inputs: tests.map((t) => testPaths(p.id, t.idx).input),
    timeLimitMs: Math.max(p.time_limit_ms * 3, 5000), memoryLimitMb: Math.max(p.memory_limit_mb, 512), keepOutputs: true,
  });
  if (out.compile.verdict !== 'OK') return { status: 400, body: { error: 'Reference solution failed to compile', compile: out.compile } };
  const report = out.runs.map((run, i) => ({ idx: tests[i].idx, status: run.status, timeMs: run.time_ms, memoryKb: run.memory_kb, stderr: run.stderr.slice(0, 500) }));
  const failed = report.filter((x) => x.status !== 'OK');
  if (failed.length) return { status: 400, body: { error: `Reference solution failed on ${failed.length} test(s); nothing was written`, report } };
  out.runs.forEach((run, i) => setTestOutput(p.id, tests[i].idx, run.output));
  return { status: 200, body: { ok: true, report, tests: listTests(p.id) } };
}

export const TASKS = { run: customRun, generate: generateAnswers };
