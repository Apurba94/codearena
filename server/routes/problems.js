import { Router } from 'express';
import { db } from '../db.js';
import { phaseOf } from '../services/contests.js';
import { accessibleProblem, problemView, PUBLIC_PROBLEM_SQL } from '../services/problems.js';
import { pageResult, paging } from '../util/http.js';
import { parseTags } from '../util/validate.js';

const r = Router();

r.get('/', (req, res) => {
  const pg = paging(req.query, 50, 100);
  const now = Date.now();
  const where = [PUBLIC_PROBLEM_SQL];
  const params = [now];
  const q = String(req.query.q || '').trim();
  if (q) {
    where.push('(p.title LIKE ? OR p.code = ?)');
    params.push(`%${q}%`, q);
  }
  for (const tag of parseTags(req.query.tags)) {
    where.push('EXISTS (SELECT 1 FROM problem_tags t WHERE t.problem_id = p.id AND t.tag = ?)');
    params.push(tag);
  }
  const minD = parseInt(req.query.minDiff, 10);
  const maxD = parseInt(req.query.maxDiff, 10);
  if (Number.isFinite(minD)) { where.push('p.difficulty >= ?'); params.push(minD); }
  if (Number.isFinite(maxD)) { where.push('p.difficulty <= ?'); params.push(maxD); }

  const uid = req.user?.id ?? -1;
  if (req.user && req.query.status === 'solved') where.push('up.solved = 1');
  if (req.user && req.query.status === 'unsolved') where.push('(up.solved IS NULL OR up.solved = 0)');
  if (req.user && req.query.status === 'attempted') where.push('up.solved = 0 AND up.attempts > 0');

  const order = {
    id: 'p.code DESC', 'id-asc': 'p.code ASC', easy: 'p.difficulty ASC, p.code', hard: 'p.difficulty DESC, p.code',
    popular: 'p.solved_count DESC, p.code', title: 'p.title COLLATE NOCASE',
  }[req.query.sort] || 'p.code ASC';

  const whereSql = where.join(' AND ');
  const join = 'LEFT JOIN user_problem up ON up.problem_id = p.id AND up.user_id = ?';
  const total = db.get(`SELECT COUNT(*) n FROM problems p ${join} WHERE ${whereSql}`, uid, ...params).n;
  const rows = db.all(
    `SELECT p.id, p.code, p.title, p.difficulty, p.solved_count, p.submission_count, p.accepted_count,
            p.time_limit_ms, p.memory_limit_mb, up.solved, up.attempts,
            (SELECT group_concat(tag, ',') FROM problem_tags t WHERE t.problem_id = p.id) AS tags
       FROM problems p ${join} WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    uid, ...params, pg.pageSize, pg.offset,
  );
  const items = rows.map((p) => ({
    code: p.code,
    title: p.title,
    difficulty: p.difficulty,
    tags: p.tags ? p.tags.split(',').sort() : [],
    solvedCount: p.solved_count,
    submissionCount: p.submission_count,
    acceptedCount: p.accepted_count,
    status: p.solved ? 'solved' : p.attempts ? 'attempted' : null,
  }));
  res.json(pageResult(items, total, pg));
});

r.get('/tags', (req, res) => {
  const rows = db.all(
    `SELECT t.tag, COUNT(*) n FROM problem_tags t JOIN problems p ON p.id = t.problem_id
      WHERE ${PUBLIC_PROBLEM_SQL} GROUP BY t.tag ORDER BY n DESC, t.tag`,
    Date.now(),
  );
  res.json(rows.map((x) => ({ tag: x.tag, count: x.n })));
});

r.get('/:code', (req, res) => {
  const contestId = req.query.contest ? parseInt(req.query.contest, 10) : null;
  const { problem, contest, label } = accessibleProblem(req.params.code, req.user, contestId);
  const inRunning = contest && phaseOf(contest) === 'running';
  const view = problemView(problem, { withStats: !inRunning });
  let myStatus = null;
  if (req.user) {
    const up = db.get('SELECT solved, attempts FROM user_problem WHERE user_id = ? AND problem_id = ?', req.user.id, problem.id);
    myStatus = up?.solved ? 'solved' : up?.attempts ? 'attempted' : null;
  }
  res.json({
    ...view,
    // tags would spoil the approach during a live contest
    tags: inRunning ? [] : view.tags,
    myStatus,
    contest: contest ? { id: contest.id, title: contest.title, label, phase: phaseOf(contest) } : null,
  });
});

export default r;
