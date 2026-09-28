import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { computeStandings, contestEnd, contestProblems, isStaff, phaseOf } from '../services/contests.js';
import { badRequest, notFound } from '../util/http.js';

const r = Router();

function loadContest(req) {
  const c = db.get('SELECT * FROM contests WHERE id = ?', parseInt(req.params.id, 10) || 0);
  if (!c || (c.visibility !== 'public' && !isStaff(req.user))) throw notFound('Contest');
  return c;
}

const view = (c, now, extra = {}) => ({
  id: c.id,
  title: c.title,
  startAt: c.start_at,
  endAt: contestEnd(c),
  durationMin: c.duration_min,
  freezeMin: c.freeze_min,
  penaltyMin: c.penalty_min,
  rated: !!c.rated,
  ratingsApplied: !!c.ratings_applied,
  visibility: c.visibility,
  phase: phaseOf(c, now),
  ...extra,
});

r.get('/', (req, res) => {
  const now = Date.now();
  const staff = isStaff(req.user);
  const rows = db.all(
    `SELECT c.*, (SELECT COUNT(*) FROM contest_registrations r WHERE r.contest_id = c.id) AS participants,
            (SELECT COUNT(*) FROM contest_problems cp WHERE cp.contest_id = c.id) AS problem_count
            ${req.user ? ', EXISTS (SELECT 1 FROM contest_registrations r WHERE r.contest_id = c.id AND r.user_id = ?) AS registered' : ''}
       FROM contests c ${staff ? '' : `WHERE c.visibility = 'public'`} ORDER BY c.start_at DESC`,
    ...(req.user ? [req.user.id] : []),
  );
  const items = rows.map((c) => view(c, now, { participants: c.participants, problemCount: c.problem_count, registered: !!c.registered }));
  res.json({
    running: items.filter((c) => c.phase === 'running').reverse(),
    upcoming: items.filter((c) => c.phase === 'upcoming').reverse(),
    past: items.filter((c) => c.phase === 'finished'),
    serverTime: now,
  });
});

r.get('/:id', (req, res) => {
  const now = Date.now();
  const c = loadContest(req);
  const phase = phaseOf(c, now);
  const showProblems = phase !== 'upcoming' || isStaff(req.user);
  let problems = [];
  if (showProblems) {
    const mine = new Map();
    if (req.user) {
      for (const s of db.all(
        `SELECT problem_id, MAX(verdict = 'AC') solved, COUNT(*) n FROM submissions
          WHERE user_id = ? AND problem_id IN (SELECT problem_id FROM contest_problems WHERE contest_id = ?)
            AND (contest_id = ? OR ? = 'finished') GROUP BY problem_id`,
        req.user.id, c.id, c.id, phase,
      )) mine.set(s.problem_id, s.solved ? 'solved' : 'attempted');
    }
    const counts = new Map(
      db.all(
        `SELECT problem_id, COUNT(DISTINCT user_id) n FROM submissions WHERE contest_id = ? AND verdict = 'AC' GROUP BY problem_id`, c.id,
      ).map((x) => [x.problem_id, x.n]),
    );
    problems = contestProblems(c.id).map((p) => ({
      label: p.label,
      code: p.code,
      title: p.title,
      timeLimitMs: p.time_limit_ms,
      memoryLimitMb: p.memory_limit_mb,
      solvedCount: counts.get(p.id) || 0,
      myStatus: mine.get(p.id) || null,
    }));
  }
  const registered = req.user
    ? !!db.get('SELECT 1 FROM contest_registrations WHERE contest_id = ? AND user_id = ?', c.id, req.user.id)
    : false;
  res.json({
    ...view(c, now, {
      participants: db.get('SELECT COUNT(*) n FROM contest_registrations WHERE contest_id = ?', c.id).n,
      registered,
    }),
    description: c.description,
    problems,
    serverTime: now,
  });
});

r.post('/:id/register', requireAuth, (req, res) => {
  const c = loadContest(req);
  if (phaseOf(c) === 'finished') throw badRequest('The contest is over');
  db.run('INSERT OR IGNORE INTO contest_registrations (contest_id, user_id, registered_at) VALUES (?, ?, ?)', c.id, req.user.id, Date.now());
  res.json({ registered: true });
});

r.delete('/:id/register', requireAuth, (req, res) => {
  const c = loadContest(req);
  if (phaseOf(c) !== 'upcoming') throw badRequest('You can only cancel registration before the start');
  db.run('DELETE FROM contest_registrations WHERE contest_id = ? AND user_id = ?', c.id, req.user.id);
  res.json({ registered: false });
});

r.get('/:id/standings', (req, res) => {
  const c = loadContest(req);
  if (phaseOf(c) === 'upcoming' && !isStaff(req.user)) {
    return res.json({ problems: [], rows: [], stats: [], frozen: false });
  }
  const s = computeStandings(c, { viewer: req.user });
  const changes = new Map(
    db.all('SELECT user_id, old_rating, new_rating FROM rating_changes WHERE contest_id = ?', c.id).map((x) => [x.user_id, x]),
  );
  res.json({
    problems: s.problems.map((p) => ({ id: p.id, label: p.label, code: p.code, title: p.title })),
    stats: s.stats,
    frozen: s.frozen,
    freezeAt: s.freezeAt,
    rows: s.rows.map((r0) => ({
      rank: r0.rank,
      handle: r0.handle,
      rating: r0.rating,
      country: r0.country,
      solved: r0.solved,
      penalty: r0.penalty,
      cells: r0.cells,
      ratingChange: changes.has(r0.userId) ? changes.get(r0.userId).new_rating - changes.get(r0.userId).old_rating : null,
    })),
  });
});

export default r;
