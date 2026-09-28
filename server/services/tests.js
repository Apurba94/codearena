import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';

/** Test data lives on disk: <DATA_DIR>/tests/<problemId>/<idx>.in|.out ; metadata in `testcases`. */
export const problemTestDir = (problemId) => path.join(config.testsDir, String(problemId));
export const testPaths = (problemId, idx) => {
  const dir = problemTestDir(problemId);
  return { input: path.join(dir, `${idx}.in`), output: path.join(dir, `${idx}.out`) };
};

export const listTests = (problemId) =>
  db.all('SELECT id, idx, is_sample, input_size, output_size FROM testcases WHERE problem_id = ? ORDER BY idx', problemId);

const normalize = (s) => {
  let t = String(s ?? '').replace(/\r\n?/g, '\n');
  if (t.length && !t.endsWith('\n')) t += '\n';
  return t;
};

/**
 * Append (or replace all) tests. tests: [{ input, output, isSample }]
 * Output may be null when answers will be generated from a reference solution.
 */
export function writeTests(problemId, tests, { replace = false } = {}) {
  const dir = problemTestDir(problemId);
  fs.mkdirSync(dir, { recursive: true });
  return db.tx(() => {
    if (replace) {
      db.run('DELETE FROM testcases WHERE problem_id = ?', problemId);
      for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
    }
    let next = (db.get('SELECT MAX(idx) m FROM testcases WHERE problem_id = ?', problemId)?.m || 0) + 1;
    const now = Date.now();
    for (const t of tests) {
      const input = normalize(t.input);
      const output = normalize(t.output ?? '');
      const p = testPaths(problemId, next);
      fs.writeFileSync(p.input, input);
      fs.writeFileSync(p.output, output);
      db.run(
        `INSERT INTO testcases (problem_id, idx, is_sample, input_size, output_size, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        problemId, next, t.isSample ? 1 : 0, Buffer.byteLength(input), Buffer.byteLength(output), now,
      );
      next++;
    }
    return listTests(problemId);
  });
}

export function setTestOutput(problemId, idx, output) {
  const text = normalize(output);
  fs.writeFileSync(testPaths(problemId, idx).output, text);
  db.run('UPDATE testcases SET output_size = ? WHERE problem_id = ? AND idx = ?', Buffer.byteLength(text), problemId, idx);
}

/** Delete one test and renumber the rest so indexes stay contiguous. */
export function deleteTest(problemId, idx) {
  db.tx(() => {
    const tests = listTests(problemId);
    if (!tests.some((t) => t.idx === idx)) return;
    const p = testPaths(problemId, idx);
    fs.rmSync(p.input, { force: true });
    fs.rmSync(p.output, { force: true });
    db.run('DELETE FROM testcases WHERE problem_id = ? AND idx = ?', problemId, idx);
    for (const t of tests.filter((x) => x.idx > idx)) {
      const from = testPaths(problemId, t.idx);
      const to = testPaths(problemId, t.idx - 1);
      fs.renameSync(from.input, to.input);
      fs.renameSync(from.output, to.output);
      db.run('UPDATE testcases SET idx = ? WHERE id = ?', t.idx - 1, t.id);
    }
  });
}

export function setSample(problemId, idx, isSample) {
  db.run('UPDATE testcases SET is_sample = ? WHERE problem_id = ? AND idx = ?', isSample ? 1 : 0, problemId, idx);
}

export function readTest(problemId, idx, maxBytes = 1 << 20) {
  const p = testPaths(problemId, idx);
  const read = (f) => {
    if (!fs.existsSync(f)) return '';
    const fd = fs.openSync(f, 'r');
    try {
      const buf = Buffer.alloc(Math.min(maxBytes, fs.fstatSync(fd).size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  };
  return { input: read(p.input), output: read(p.output) };
}

export function samples(problemId) {
  return db
    .all('SELECT idx FROM testcases WHERE problem_id = ? AND is_sample = 1 ORDER BY idx', problemId)
    .map((t) => ({ idx: t.idx, ...readTest(problemId, t.idx, 64 * 1024) }));
}

export function removeAllTests(problemId) {
  fs.rmSync(problemTestDir(problemId), { recursive: true, force: true });
}
