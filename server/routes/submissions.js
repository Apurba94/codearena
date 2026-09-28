import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { adhoc } from '../judge/worker.js';
import { requireAuth } from '../middleware/auth.js';
import { contestEnd, isStaff, phaseOf } from '../services/contests.js';
import { accessibleProblem, PUBLIC_PROBLEM_SQL } from '../services/problems.js';
import { badRequest, notFound, pageResult, paging, tooMany } from '../util/http.js';
import { rateLimit } from '../util/ratelimit.js';
import { validate } from '../util/validate.js';
import { enabledLanguages } from './meta.js';

const r = Router();
const VERDICTS = ['AC', 'WA', 'TLE', 'MLE', 'RE', 'CE', 'OLE', 'SE'];

/** During a contest freeze, hide other people's verdicts on frozen submissions. */
function frozenFor(sub, viewer) {
  if (!sub.contest_id || isStaff(viewer) || viewer?.id === sub.user_id) return false;
  const c = db.get('SELECT start_at, duration_min, freeze_min FROM contests WHERE id = ?', sub.contest_id);
  if (!c || !c.freeze_min) return false;
  const end = contestEnd(c);
  return Date.now() < end && sub.created_at >= end - c.freeze_min * 60_000;
}

/** Source is visible to its author, staff, and (outside live contests) anyone who solved the problem. */
function canSeeSource(sub, viewer) {
  if (!viewer) return false;
  if (viewer.id === sub.user_id || isStaff(viewer)) return true;
  if (sub.contest_id) {
    const c = db.get('SELECT * FROM contests WHERE id = ?', sub.contest_id);
    if (c && phaseOf(c) !== 'finished') return false;
  }
  return !!db.get('SELECT 1 FROM user_problem WHERE user_id = ? AND problem_id = ? AND solved = 1', viewer.id, sub.problem_id);
}

const summary = (s, viewer) => {
  const hide = frozenFor(s, viewer);
  return {
    id: s.id,
    createdAt: s.created_at,
    handle: s.handle,
    rating: s.rating,
    problem: { code: s.code, title: s.title },
    contestId: s.contest_id,
    label: s.label ?? null,
    language: s.language,
    status: hide ? 'frozen' : s.status,
    verdict: hide ? null : s.verdict,
    failedTest: hide ? null : s.failed_test,
    testsPassed: hide ? null : s.tests_passed,
    totalTests: s.total_tests,
    timeMs: hide ? null : s.time_ms,
    memoryKb: hide ? null : s.memory_kb,
    sourceLen: s.source_len,
  };
};

const submitLimiter = rateLimit({ windowMs: 60_000, max: 20, message: 'At most 20 submissions per minute' });

r.post('/', requireAuth, submitLimiter, (req, res) => {
  const body = validate(req.body, {
    problem: { type: 'string', required: true, max: 32 },
    language: { type: 'string', required: true, max: 32 },
    source: { type: 'string', required: true, trim: false },
    contest: { type: 'int', min: 1 },
  });
  if (Buffer.byteLength(body.source) > config.judge.maxSourceBytes) {
    throw badRequest(`Source code is larger than ${config.judge.maxSourceBytes / 1024} KB`);
  }
  if (!body.source.trim()) throw badRequest('Source code is empty');
  if (!enabledLanguages().some((l) => l.id === body.language)) throw badRequest('That language is not available');

  const last = db.get('SELECT created_at FROM submissions WHERE user_id = ? ORDER BY id DESC LIMIT 1', req.user.id);
  if (last && Date.now() - last.created_at < config.judge.submitCooldownMs) {
    throw tooMany(`Please wait ${Math.ceil((config.judge.submitCooldownMs - (Date.now() - last.created_at)) / 1000)}s between submissions`);
  }

  const { problem, contest } = accessibleProblem(body.problem, req.user, body.contest ?? null);
  let contestId = null;
  if (contest && phaseOf(contest) === 'running' && !isStaff(req.user)) {
    contestId = contest.id;
    db.run('INSERT OR IGNORE INTO contest_registrations (contest_id, user_id, registered_at) VALUES (?, ?, ?)', contest.id, req.user.id, Date.now());
  }
  const sub = db.get(
    `INSERT INTO submissions (user_id, problem_id, contest_id, language, source, source_len, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?) RETURNING id`,
    req.user.id, problem.id, contestId, body.language, body.source, Buffer.byteLength(body.source), Date.now(),
  );
  db.run('UPDATE problems SET submission_count = submission_count + 1 WHERE id = ?', problem.id);
  req.app.locals.pool?.notify();
  res.status(201).json({ id: sub.id });
});

r.get('/', (req, res) => {
  const pg = paging(req.query, 50, 100);
  const where = [];
  const params = [];
  const staff = isStaff(req.user);
  if (req.query.user) { where.push('u.handle = ?'); params.push(String(req.query.user)); }
  if (req.query.mine && req.user) { where.push('s.user_id = ?'); params.push(req.user.id); }
  if (req.query.problem) { where.push('p.code = ?'); params.push(String(req.query.problem)); }
  if (req.query.language) { where.push('s.language = ?'); params.push(String(req.query.language)); }
  if (VERDICTS.includes(req.query.verdict)) { where.push('s.verdict = ?'); params.push(req.query.verdict); }
  if (req.query.contest) { where.push('s.contest_id = ?'); params.push(parseInt(req.query.contest, 10) || 0); }
  if (!staff) {
    // never list submissions to problems the viewer cannot see
    where.push(`((${PUBLIC_PROBLEM_SQL}) OR s.contest_id IS NOT NULL${req.user ? ' OR s.user_id = ?' : ''})`);
    params.push(Date.now());
    if (req.user) params.push(req.user.id);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const from = `FROM submissions s JOIN users u ON u.id = s.user_id JOIN problems p ON p.id = s.problem_id
                LEFT JOIN contest_problems cp ON cp.contest_id = s.contest_id AND cp.problem_id = s.problem_id`;
  const total = db.get(`SELECT COUNT(*) n ${from} ${whereSql}`, ...params).n;
  const rows = db.all(
    `SELECT s.id, s.user_id, s.contest_id, s.language, s.status, s.verdict, s.failed_test, s.tests_passed, s.total_tests,
            s.time_ms, s.memory_kb, s.source_len, s.created_at, u.handle, u.rating, p.code, p.title, cp.label
       ${from} ${whereSql} ORDER BY s.id DESC LIMIT ? OFFSET ?`,
    ...params, pg.pageSize, pg.offset,
  );
  res.json(pageResult(rows.map((s) => summary(s, req.user)), total, pg));
});

r.get('/:id', (req, res) => {
  const s = db.get(
    `SELECT s.*, u.handle, u.rating, p.code, p.title, p.visibility, p.time_limit_ms, p.memory_limit_mb, cp.label
       FROM submissions s JOIN users u ON u.id = s.user_id JOIN problems p ON p.id = s.problem_id
       LEFT JOIN contest_problems cp ON cp.contest_id = s.contest_id AND cp.problem_id = s.problem_id
      WHERE s.id = ?`,
    parseInt(req.params.id, 10) || 0,
  );
  const staff = isStaff(req.user);
  if (!s || (!staff && s.visibility !== 'public' && !s.contest_id && s.user_id !== req.user?.id)) throw notFound('Submission');
  const out = summary(s, req.user);
  const hide = out.status === 'frozen';
  const owner = req.user?.id === s.user_id;
  out.limits = { timeMs: s.time_limit_ms, memoryMb: s.memory_limit_mb };
  out.canViewSource = canSeeSource(s, req.user);
  out.source = out.canViewSource ? s.source : null;
  out.compileLog = (owner || staff) && !hide ? s.compile_log : null;
  let details = [];
  try { details = s.details ? JSON.parse(s.details) : []; } catch { details = []; }
  out.tests = hide ? [] : details.map((d) => ({
    test: d.test,
    sample: d.sample,
    verdict: d.verdict,
    timeMs: d.time_ms,
    memoryKb: d.memory_kb,
    // checker comments on hidden tests would leak test data; show them to staff and on samples only
    message: staff || d.sample ? d.message : undefined,
    stderr: (owner || staff) && (staff || d.sample) ? d.stderr : undefined,
  }));
  out.judgedAt = s.judged_at;
  res.json(out);
});

/** Custom invocation: run code on a given input without submitting. */
const runLimiter = rateLimit({ windowMs: 60_000, max: 10, message: 'At most 10 test runs per minute' });
export const runRouter = Router();
runRouter.post('/', requireAuth, runLimiter, async (req, res) => {
  const body = validate(req.body, {
    language: { type: 'string', required: true, max: 32 },
    source: { type: 'string', required: true, trim: false },
    input: { type: 'string', default: '', trim: false, max: 1 << 20 },
  });
  if (Buffer.byteLength(body.source) > config.judge.maxSourceBytes) throw badRequest('Source code is too large');
  if (!enabledLanguages().some((l) => l.id === body.language)) throw badRequest('That language is not available');
  const out = await adhoc.run('run', { language: body.language, source: body.source, input: body.input });
  res.status(out.status).json(out.body);
});

export default r;
