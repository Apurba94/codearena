import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { db } from '../db.js';
import { refreshUserProblem } from '../services/stats.js';
import { listTests, testPaths } from '../services/tests.js';
import { check } from './checker.js';
import { availableLanguages } from './languages.js';

const WIN = process.platform === 'win32';
const readCapped = (file, max = 256 * 1024 * 1024) => {
  const size = fs.statSync(file).size;
  if (size > max) throw new Error('output too large to check');
  return fs.readFileSync(file, 'utf8');
};

/** Compile (if needed) a source file in a fresh work dir. Returns a "prepared program". */
export async function prepare(sandbox, languageId, source) {
  const lang = availableLanguages().find((l) => l.id === languageId);
  if (!lang) return { error: 'SE', log: `Language '${languageId}' is not available on this judge node.` };
  const dir = path.join(config.workDir, `run-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, lang.source), source);
  // With a sandbox uid (Linux, supervisor as root) the untrusted build and run happen as that user,
  // so the work dir must belong to it; nothing else on the box is readable to it.
  const uid = sandbox.uid;
  const gid = uid == null ? null : (config.judge.gid ?? uid);
  if (uid != null) {
    fs.chownSync(dir, uid, gid);
    fs.chownSync(path.join(dir, lang.source), uid, gid);
    fs.chmodSync(dir, 0o700);
  }
  const prog = { lang, dir, exe: path.join(dir, WIN ? 'main.exe' : 'main') };

  if (lang.compile) {
    const res = await sandbox.run({
      cmd: lang.compile,
      cwd: dir,
      stdin: null,
      stdout: path.join(dir, '.compile.out'),
      time_limit_ms: config.judge.compileTimeoutMs,
      memory_limit_mb: 2048,
      output_limit_mb: 4,
      address_space_limit: false,
      max_processes: WIN ? 64 : 0,
      stderr_limit: 32768,
      uid,
      gid,
      isolate_network: uid != null,
      // minimal environment: never leak server secrets into the toolchain
      env: { HOME: dir, TMPDIR: dir, TEMP: dir, TMP: dir, ...(lang.compileEnv ? { GOCACHE: path.join(dir, '.gocache'), GOPATH: path.join(dir, '.gopath') } : {}) },
    });
    let out = '';
    try { out = fs.readFileSync(path.join(dir, '.compile.out'), 'utf8'); } catch { /* none */ }
    const log = `${out}${res.stderr || ''}${res.error ? `\n${res.error}` : ''}`.replaceAll(dir + path.sep, '').trim();
    if (res.status === 'SE') return { ...prog, error: 'SE', log };
    if (res.status !== 'OK') {
      return { ...prog, error: 'CE', log: log || (res.status === 'TLE' ? 'Compilation timed out' : `Compiler exited with ${res.status}`) };
    }
    prog.compileLog = log;
  }
  return prog;
}

/** Run a prepared program on one input file. */
export function execute(sandbox, prog, { stdin, stdout, timeLimitMs, memoryLimitMb }) {
  const { lang } = prog;
  const mem = memoryLimitMb + (lang.memExtraMb || 0);
  const cmd = lang.run.map((a) => a.replace('{exe}', prog.exe).replace('{mem}', String(memoryLimitMb)));
  return sandbox.run({
    cmd,
    cwd: prog.dir,
    stdin,
    stdout,
    time_limit_ms: Math.round(timeLimitMs * (lang.timeFactor || 1)),
    memory_limit_mb: mem,
    output_limit_mb: config.judge.outputLimitMb,
    address_space_limit: lang.addressSpaceLimit !== false,
    max_processes: WIN ? (lang.processes || 1) : (sandbox.uid != null ? 64 : 0),
    uid: sandbox.uid,
    gid: sandbox.uid == null ? null : (config.judge.gid ?? sandbox.uid),
    isolate_network: sandbox.uid != null,
    env: { HOME: prog.dir },
  });
}

export const cleanup = (prog) => {
  if (prog?.dir) fs.rm(prog.dir, { recursive: true, force: true }, () => {});
};

const SANDBOX_TO_VERDICT = { TLE: 'TLE', MLE: 'MLE', RE: 'RE', OLE: 'OLE', SE: 'SE' };

/** Judge one claimed submission end-to-end and persist the result. */
export async function judgeSubmission(sandbox, sub) {
  const problem = db.get('SELECT id, time_limit_ms, memory_limit_mb, checker FROM problems WHERE id = ?', sub.problem_id);
  const tests = problem ? listTests(problem.id) : [];
  const setProgress = (fields) => {
    const keys = Object.keys(fields);
    db.run(`UPDATE submissions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => fields[k]), sub.id);
  };

  if (!problem || tests.length === 0) {
    return finish(sub, { verdict: 'SE', compile_log: 'Problem has no test data.', total_tests: 0 });
  }

  const prog = await prepare(sandbox, sub.language, sub.source);
  try {
    if (prog.error) {
      return finish(sub, { verdict: prog.error, compile_log: prog.log?.slice(0, 32768) ?? '', total_tests: tests.length });
    }
    setProgress({ status: 'running', total_tests: tests.length, compile_log: prog.compileLog || null, locked_at: Date.now() });

    const details = [];
    let verdict = 'AC';
    let failed = null;
    let maxTime = 0;
    let maxMem = 0;
    const outFile = path.join(prog.dir, '.out');

    for (const t of tests) {
      const p = testPaths(problem.id, t.idx);
      const res = await execute(sandbox, prog, {
        stdin: p.input,
        stdout: outFile,
        timeLimitMs: problem.time_limit_ms,
        memoryLimitMb: problem.memory_limit_mb,
      });
      maxTime = Math.max(maxTime, res.time_ms || 0);
      maxMem = Math.max(maxMem, res.memory_kb || 0);
      let v = SANDBOX_TO_VERDICT[res.status];
      let message = '';
      if (res.status === 'OK') {
        try {
          const r = check(problem.checker, readCapped(p.output), readCapped(outFile));
          v = r.ok ? 'AC' : 'WA';
          message = r.message;
        } catch (e) {
          v = 'SE';
          message = e.message;
        }
      } else if (res.status === 'RE') {
        message = `exit code ${res.exit_code}${res.signal ? `, signal ${res.signal}` : ''}`;
      } else if (res.status === 'SE') {
        message = res.error || 'sandbox failure';
      }
      details.push({
        test: t.idx,
        sample: !!t.is_sample,
        verdict: v,
        time_ms: res.time_ms || 0,
        memory_kb: res.memory_kb || 0,
        message,
        stderr: v === 'RE' ? (res.stderr || '').slice(-1000) : undefined,
      });
      if (v !== 'AC') {
        if (verdict === 'AC') {
          verdict = v;
          failed = t.idx;
        }
        if (config.judge.stopOnFirstFailure || v === 'SE') break;
      }
      setProgress({ tests_passed: details.filter((d) => d.verdict === 'AC').length, locked_at: Date.now() });
    }

    return finish(sub, {
      verdict,
      failed_test: failed,
      tests_passed: details.filter((d) => d.verdict === 'AC').length,
      total_tests: tests.length,
      time_ms: maxTime,
      memory_kb: maxMem,
      details: JSON.stringify(details),
      compile_log: prog.compileLog || null,
    });
  } finally {
    cleanup(prog);
  }
}

function finish(sub, r) {
  db.run(
    `UPDATE submissions SET status = 'done', verdict = ?, failed_test = ?, tests_passed = ?, total_tests = ?,
            time_ms = ?, memory_kb = ?, details = ?, compile_log = ?, judged_at = ?, locked_at = NULL
      WHERE id = ?`,
    r.verdict, r.failed_test ?? null, r.tests_passed ?? 0, r.total_tests ?? 0, r.time_ms ?? null, r.memory_kb ?? null,
    r.details ?? null, r.compile_log ?? null, Date.now(), sub.id,
  );
  refreshUserProblem(sub.user_id, sub.problem_id);
  return r;
}

/**
 * Run arbitrary code on arbitrary inputs (custom invocation / answer generation).
 * inputs: array of file paths. Returns { compile, runs: [{ status, time_ms, memory_kb, output, stderr }] }.
 */
export async function runOnInputs(sandbox, { language, source, inputs, timeLimitMs, memoryLimitMb, keepOutputs = false }) {
  const prog = await prepare(sandbox, language, source);
  try {
    if (prog.error) return { compile: { verdict: prog.error, log: prog.log }, runs: [] };
    const runs = [];
    for (let i = 0; i < inputs.length; i++) {
      const outFile = path.join(prog.dir, `.out${i}`);
      const res = await execute(sandbox, prog, { stdin: inputs[i], stdout: outFile, timeLimitMs, memoryLimitMb });
      let output = '';
      try { output = readCapped(outFile, keepOutputs ? 256 << 20 : 1 << 20); } catch { output = ''; }
      runs.push({ status: res.status, time_ms: res.time_ms, memory_kb: res.memory_kb, exit_code: res.exit_code, output, stderr: res.stderr || res.error || '' });
    }
    return { compile: { verdict: 'OK', log: prog.compileLog || '' }, runs };
  } finally {
    cleanup(prog);
  }
}
