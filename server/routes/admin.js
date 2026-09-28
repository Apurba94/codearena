import { Router } from 'express';
import { db } from '../db.js';
import { adhoc, judgeNodes } from '../judge/worker.js';
import { requireAdmin, requireStaff } from '../middleware/auth.js';
import { isSyncing, sourceSummary, syncSource, upsertArchive } from '../services/archive/index.js';
import { SOURCES } from '../services/archive/sources.js';
import { applyRatings, contestProblems, phaseOf, rollbackRatings } from '../services/contests.js';
import { problemTags, setProblemTags } from '../services/problems.js';
import { refreshProblemCounters } from '../services/stats.js';
import {
  deleteTest, listTests, readTest, removeAllTests, setSample, setTestOutput, writeTests,
} from '../services/tests.js';
import { badRequest, conflict, forbidden, notFound, pageResult, paging } from '../util/http.js';
import { CHECKER_RE, parseTags, validate } from '../util/validate.js';
import { enabledLanguages } from './meta.js';

const r = Router();
r.use(requireStaff);

// ---------------------------------------------------------------- problems
const problemSchema = {
  code: { type: 'string', required: true, pattern: /^[A-Za-z0-9_-]{1,16}$/, patternMsg: 'must be 1-16 letters, digits, _ or -' },
  title: { type: 'string', required: true, max: 120 },
  legend: { type: 'string', default: '', max: 100_000, trim: false },
  inputSpec: { type: 'string', default: '', max: 50_000, trim: false },
  outputSpec: { type: 'string', default: '', max: 50_000, trim: false },
  notes: { type: 'string', default: '', max: 50_000, trim: false },
  timeLimitMs: { type: 'int', default: 1000, min: 100, max: 20_000 },
  memoryLimitMb: { type: 'int', default: 256, min: 16, max: 2048 },
  checker: { type: 'string', default: 'tokens', pattern: CHECKER_RE, patternMsg: 'must be tokens, tokens-ci, lines, exact or float:<eps>' },
  difficulty: { type: 'int', min: 0, max: 5000, default: null },
  source: { type: 'string', max: 200, default: null },
  visibility: { type: 'string', enum: ['public', 'hidden'], default: 'hidden' },
  tags: { type: 'array', default: [], max: 20 },
};

function loadProblem(req) {
  const p = db.get('SELECT * FROM problems WHERE id = ?', parseInt(req.params.id, 10) || 0);
  if (!p) throw notFound('Problem');
  if (req.user.role === 'setter' && p.author_id !== req.user.id) throw forbidden('Setters can only edit their own problems');
  return p;
}

const adminProblemView = (p) => ({
  id: p.id, code: p.code, title: p.title, legend: p.legend, inputSpec: p.input_spec, outputSpec: p.output_spec,
  notes: p.notes, timeLimitMs: p.time_limit_ms, memoryLimitMb: p.memory_limit_mb, checker: p.checker,
  difficulty: p.difficulty, source: p.source, visibility: p.visibility, authorId: p.author_id,
  tags: problemTags(p.id), tests: listTests(p.id),
  solvedCount: p.solved_count, submissionCount: p.submission_count,
});

r.get('/problems', (req, res) => {
  const pg = paging(req.query, 50, 200);
  const q = String(req.query.q || '').trim();
  const where = [];
  const params = [];
  if (q) { where.push('(p.title LIKE ? OR p.code LIKE ?)'); params.push(`%${q}%`, `${q}%`); }
  if (req.user.role === 'setter') { where.push('p.author_id = ?'); params.push(req.user.id); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.get(`SELECT COUNT(*) n FROM problems p ${whereSql}`, ...params).n;
  const items = db.all(
    `SELECT p.id, p.code, p.title, p.visibility, p.difficulty, p.solved_count, p.submission_count, u.handle AS author,
            (SELECT COUNT(*) FROM testcases t WHERE t.problem_id = p.id) AS tests
       FROM problems p LEFT JOIN users u ON u.id = p.author_id ${whereSql} ORDER BY p.code LIMIT ? OFFSET ?`,
    ...params, pg.pageSize, pg.offset,
  );
  res.json(pageResult(items, total, pg));
});

r.post('/problems', (req, res) => {
  const b = validate(req.body, problemSchema);
  if (db.get('SELECT 1 FROM problems WHERE code = ?', b.code)) throw conflict('A problem with that code already exists');
  const now = Date.now();
  const p = db.tx(() => {
    const row = db.get(
      `INSERT INTO problems (code, title, legend, input_spec, output_spec, notes, time_limit_ms, memory_limit_mb, checker,
                             difficulty, source, visibility, author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      b.code, b.title, b.legend, b.inputSpec, b.outputSpec, b.notes, b.timeLimitMs, b.memoryLimitMb, b.checker,
      b.difficulty, b.source, b.visibility, req.user.id, now, now,
    );
    setProblemTags(row.id, parseTags(b.tags));
    return row;
  });
  res.status(201).json(adminProblemView(p));
});

r.get('/problems/:id', (req, res) => res.json(adminProblemView(loadProblem(req))));

r.put('/problems/:id', (req, res) => {
  const p = loadProblem(req);
  const b = validate(req.body, problemSchema);
  const clash = db.get('SELECT id FROM problems WHERE code = ? AND id != ?', b.code, p.id);
  if (clash) throw conflict('Another problem already uses that code');
  db.tx(() => {
    db.run(
      `UPDATE problems SET code = ?, title = ?, legend = ?, input_spec = ?, output_spec = ?, notes = ?, time_limit_ms = ?,
              memory_limit_mb = ?, checker = ?, difficulty = ?, source = ?, visibility = ?, updated_at = ? WHERE id = ?`,
      b.code, b.title, b.legend, b.inputSpec, b.outputSpec, b.notes, b.timeLimitMs, b.memoryLimitMb, b.checker,
      b.difficulty, b.source, b.visibility, Date.now(), p.id,
    );
    setProblemTags(p.id, parseTags(b.tags));
  });
  res.json(adminProblemView(db.get('SELECT * FROM problems WHERE id = ?', p.id)));
});

r.delete('/problems/:id', requireAdmin, (req, res) => {
  const p = loadProblem(req);
  db.run('DELETE FROM problems WHERE id = ?', p.id);
  removeAllTests(p.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- tests
r.get('/problems/:id/tests/:idx', (req, res) => {
  const p = loadProblem(req);
  const idx = parseInt(req.params.idx, 10);
  if (!listTests(p.id).some((t) => t.idx === idx)) throw notFound('Test');
  res.json({ idx, ...readTest(p.id, idx, 256 * 1024) });
});

r.post('/problems/:id/tests', (req, res) => {
  const p = loadProblem(req);
  const b = validate(req.body, { tests: { type: 'array', required: true, max: 500 }, replace: { type: 'bool', default: false } });
  const tests = b.tests.map((t, i) => {
    if (typeof t?.input !== 'string') throw badRequest(`tests[${i}].input must be text`);
    if (t.output != null && typeof t.output !== 'string') throw badRequest(`tests[${i}].output must be text`);
    return { input: t.input, output: t.output ?? '', isSample: !!t.isSample };
  });
  res.json(writeTests(p.id, tests, { replace: b.replace }));
});

r.patch('/problems/:id/tests/:idx', (req, res) => {
  const p = loadProblem(req);
  const idx = parseInt(req.params.idx, 10);
  if (!listTests(p.id).some((t) => t.idx === idx)) throw notFound('Test');
  const b = validate(req.body, { isSample: { type: 'bool' }, output: { type: 'string', trim: false } });
  if (b.isSample !== undefined) setSample(p.id, idx, b.isSample);
  if (b.output !== undefined) setTestOutput(p.id, idx, b.output);
  res.json(listTests(p.id));
});

r.delete('/problems/:id/tests/:idx', (req, res) => {
  const p = loadProblem(req);
  deleteTest(p.id, parseInt(req.params.idx, 10));
  res.json(listTests(p.id));
});

/** Polygon-style: produce every expected output by running a trusted reference solution. */
r.post('/problems/:id/generate-answers', async (req, res) => {
  const p = loadProblem(req);
  const b = validate(req.body, {
    language: { type: 'string', required: true },
    source: { type: 'string', required: true, trim: false },
  });
  if (!enabledLanguages().some((l) => l.id === b.language)) throw badRequest('That language is not available');
  const out = await adhoc.run('generate', { problemId: p.id, language: b.language, source: b.source });
  res.status(out.status).json(out.body);
});

// ---------------------------------------------------------------- rejudge
function requeue(where, ...params) {
  const r0 = db.run(
    `UPDATE submissions SET status = 'queued', verdict = NULL, failed_test = NULL, tests_passed = 0, time_ms = NULL,
            memory_kb = NULL, details = NULL, compile_log = NULL, worker = NULL, locked_at = NULL, judged_at = NULL
      WHERE ${where}`,
    ...params,
  );
  return r0.changes;
}

r.post('/problems/:id/rejudge', (req, res) => {
  const p = loadProblem(req);
  const n = requeue(`problem_id = ? AND status = 'done'`, p.id);
  req.app.locals.pool?.notify();
  res.json({ requeued: n });
});

r.post('/submissions/:id/rejudge', (req, res) => {
  const n = requeue(`id = ? AND status = 'done'`, parseInt(req.params.id, 10) || 0);
  req.app.locals.pool?.notify();
  res.json({ requeued: n });
});

// ---------------------------------------------------------------- contests
const contestSchema = {
  title: { type: 'string', required: true, max: 150 },
  description: { type: 'string', default: '', max: 50_000, trim: false },
  startAt: { type: 'int', required: true, min: 0 },
  durationMin: { type: 'int', required: true, min: 5, max: 60 * 24 * 14 },
  freezeMin: { type: 'int', default: 0, min: 0, max: 60 * 24 },
  penaltyMin: { type: 'int', default: 20, min: 0, max: 120 },
  rated: { type: 'bool', default: true },
  visibility: { type: 'string', enum: ['public', 'hidden'], default: 'public' },
};

const loadContest = (req) => {
  const c = db.get('SELECT * FROM contests WHERE id = ?', parseInt(req.params.id, 10) || 0);
  if (!c) throw notFound('Contest');
  return c;
};

r.get('/contests/:id', (req, res) => {
  const c = loadContest(req);
  res.json({
    id: c.id, title: c.title, description: c.description, startAt: c.start_at, durationMin: c.duration_min,
    freezeMin: c.freeze_min, penaltyMin: c.penalty_min, rated: !!c.rated, visibility: c.visibility,
    ratingsApplied: !!c.ratings_applied, phase: phaseOf(c),
    problems: contestProblems(c.id).map((p) => ({ label: p.label, code: p.code, title: p.title })),
  });
});

r.post('/contests', (req, res) => {
  const b = validate(req.body, contestSchema);
  const c = db.get(
    `INSERT INTO contests (title, description, start_at, duration_min, freeze_min, penalty_min, rated, visibility, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    b.title, b.description, b.startAt, b.durationMin, b.freezeMin, b.penaltyMin, b.rated ? 1 : 0, b.visibility, req.user.id, Date.now(),
  );
  res.status(201).json({ id: c.id });
});

r.put('/contests/:id', (req, res) => {
  const c = loadContest(req);
  const b = validate(req.body, contestSchema);
  db.run(
    `UPDATE contests SET title = ?, description = ?, start_at = ?, duration_min = ?, freeze_min = ?, penalty_min = ?, rated = ?, visibility = ?
      WHERE id = ?`,
    b.title, b.description, b.startAt, b.durationMin, b.freezeMin, b.penaltyMin, b.rated ? 1 : 0, b.visibility, c.id,
  );
  res.json({ ok: true });
});

r.delete('/contests/:id', requireAdmin, (req, res) => {
  const c = loadContest(req);
  if (c.ratings_applied) throw badRequest('Roll back the rating changes first');
  db.run('DELETE FROM contests WHERE id = ?', c.id);
  res.json({ ok: true });
});

r.put('/contests/:id/problems', (req, res) => {
  const c = loadContest(req);
  const b = validate(req.body, { problems: { type: 'array', required: true, max: 26 } });
  const rows = b.problems.map((x, i) => {
    const code = String(x?.code || '').trim();
    const label = String(x?.label || String.fromCharCode(65 + i)).trim().toUpperCase();
    if (!/^[A-Z][0-9]?$/.test(label)) throw badRequest(`Invalid label '${label}'`);
    const p = db.get('SELECT id FROM problems WHERE code = ?', code);
    if (!p) throw badRequest(`Problem '${code}' does not exist`);
    return { id: p.id, label };
  });
  if (new Set(rows.map((x) => x.label)).size !== rows.length) throw badRequest('Labels must be unique');
  if (new Set(rows.map((x) => x.id)).size !== rows.length) throw badRequest('A problem is listed twice');
  db.tx(() => {
    db.run('DELETE FROM contest_problems WHERE contest_id = ?', c.id);
    for (const x of rows) db.run('INSERT INTO contest_problems (contest_id, problem_id, label) VALUES (?, ?, ?)', c.id, x.id, x.label);
  });
  res.json({ ok: true });
});

r.post('/contests/:id/ratings', requireAdmin, (req, res) => {
  const changes = applyRatings(loadContest(req));
  res.json({ applied: changes.length, changes });
});

r.delete('/contests/:id/ratings', requireAdmin, (req, res) => {
  res.json({ rolledBack: rollbackRatings(loadContest(req)) });
});

// ---------------------------------------------------------------- users
r.get('/users', requireAdmin, (req, res) => {
  const pg = paging(req.query, 50, 200);
  const q = String(req.query.q || '').trim();
  const where = q ? 'WHERE handle LIKE ? OR email LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`] : [];
  const total = db.get(`SELECT COUNT(*) n FROM users ${where}`, ...params).n;
  const items = db.all(
    `SELECT id, handle, email, role, rating, banned, solved_count, created_at, last_seen_at FROM users ${where}
      ORDER BY id DESC LIMIT ? OFFSET ?`,
    ...params, pg.pageSize, pg.offset,
  );
  res.json(pageResult(items, total, pg));
});

r.patch('/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const u = db.get('SELECT id FROM users WHERE id = ?', id);
  if (!u) throw notFound('User');
  const b = validate(req.body, { role: { type: 'string', enum: ['user', 'setter', 'admin'] }, banned: { type: 'bool' } });
  if (id === req.user.id && (b.role && b.role !== 'admin' || b.banned)) throw badRequest('You cannot demote or ban yourself');
  if (b.role) db.run('UPDATE users SET role = ? WHERE id = ?', b.role, id);
  if (b.banned !== undefined) {
    db.run('UPDATE users SET banned = ? WHERE id = ?', b.banned ? 1 : 0, id);
    if (b.banned) db.run('DELETE FROM sessions WHERE user_id = ?', id);
  }
  res.json({ ok: true });
});

// ---------------------------------------------------------------- archive
r.get('/archive', requireAdmin, (req, res) => res.json(sourceSummary()));

r.post('/archive/sync', requireAdmin, (req, res) => {
  const b = validate(req.body, { source: { type: 'string', required: true, enum: Object.keys(SOURCES) } });
  if (isSyncing(b.source)) throw conflict('That source is already syncing');
  // long-running: fire and forget; progress is visible through the sync log
  syncSource(b.source).catch((e) => console.error(`[archive] ${b.source} sync failed:`, e.message));
  res.status(202).json({ started: true });
});

r.post('/archive/import', requireAdmin, (req, res) => {
  const b = validate(req.body, {
    source: { type: 'string', required: true, pattern: /^[a-z0-9_-]{2,32}$/, patternMsg: 'must be a short lower-case key' },
    items: { type: 'array', required: true, max: 50_000 },
  });
  res.json({ imported: upsertArchive(b.source, b.items) });
});

// ---------------------------------------------------------------- announcements
r.post('/announcements', requireAdmin, (req, res) => {
  const b = validate(req.body, {
    title: { type: 'string', required: true, max: 200 },
    body: { type: 'string', required: true, max: 50_000, trim: false },
    pinned: { type: 'bool', default: false },
  });
  const a = db.get(
    'INSERT INTO announcements (title, body, pinned, author_id, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
    b.title, b.body, b.pinned ? 1 : 0, req.user.id, Date.now(),
  );
  res.status(201).json({ id: a.id });
});

r.delete('/announcements/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM announcements WHERE id = ?', parseInt(req.params.id, 10) || 0);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- system
r.get('/system', (req, res) => {
  const since = Date.now() - 86400_000;
  res.json({
    nodes: judgeNodes(),
    queue: db.all(`SELECT status, COUNT(*) n FROM submissions WHERE status != 'done' GROUP BY status`),
    verdicts24h: db.all('SELECT verdict, COUNT(*) n FROM submissions WHERE created_at >= ? AND status = ? GROUP BY verdict', since, 'done'),
    submissions24h: db.get('SELECT COUNT(*) n FROM submissions WHERE created_at >= ?', since).n,
    users: db.get('SELECT COUNT(*) n FROM users').n,
    problems: db.get('SELECT COUNT(*) n FROM problems').n,
  });
});

r.post('/recount', requireAdmin, (req, res) => {
  for (const p of db.all('SELECT id FROM problems')) refreshProblemCounters(p.id);
  res.json({ ok: true });
});

export default r;
