import { db } from '../db.js';
import { computeRatingChanges } from './rating.js';
import { badRequest, conflict } from '../util/http.js';

export const contestEnd = (c) => c.start_at + c.duration_min * 60_000;

export function phaseOf(c, now = Date.now()) {
  if (now < c.start_at) return 'upcoming';
  if (now < contestEnd(c)) return 'running';
  return 'finished';
}

export const isStaff = (user) => user && (user.role === 'admin' || user.role === 'setter');

export function contestProblems(contestId) {
  return db.all(
    `SELECT cp.label, p.id, p.code, p.title, p.time_limit_ms, p.memory_limit_mb, p.difficulty
       FROM contest_problems cp JOIN problems p ON p.id = cp.problem_id
      WHERE cp.contest_id = ? ORDER BY length(cp.label), cp.label`,
    contestId,
  );
}

/** Running contests (public or not) that contain the problem. */
export function runningContestsWithProblem(problemId, now = Date.now()) {
  return db.all(
    `SELECT c.* FROM contests c JOIN contest_problems cp ON cp.contest_id = c.id
      WHERE cp.problem_id = ? AND c.start_at <= ? AND c.start_at + c.duration_min * 60000 > ?`,
    problemId, now, now,
  );
}

/** True if the problem belongs to a contest that has not finished yet (keeps it out of the problemset). */
export function lockedByContest(problemId, now = Date.now()) {
  return !!db.get(
    `SELECT 1 FROM contests c JOIN contest_problems cp ON cp.contest_id = c.id
      WHERE cp.problem_id = ? AND c.start_at + c.duration_min * 60000 > ? LIMIT 1`,
    problemId, now,
  );
}

/**
 * ICPC standings. Wrong attempts before the first AC cost `penalty_min` each; CE/SE are free.
 * During the freeze window non-staff viewers see later submissions as pending.
 */
export function computeStandings(contest, { viewer = null, now = Date.now() } = {}) {
  const problems = contestProblems(contest.id);
  const end = contestEnd(contest);
  const freezeAt = contest.freeze_min > 0 ? end - contest.freeze_min * 60_000 : Infinity;
  const frozen = now < end && now >= freezeAt && !isStaff(viewer);

  const subs = db.all(
    `SELECT id, user_id, problem_id, verdict, status, created_at FROM submissions
      WHERE contest_id = ? ORDER BY created_at, id`,
    contest.id,
  );
  const users = new Map();
  const ensure = (userId) => {
    if (!users.has(userId)) users.set(userId, { userId, solved: 0, penalty: 0, lastAc: 0, cells: {} });
    return users.get(userId);
  };
  for (const r of db.all('SELECT user_id FROM contest_registrations WHERE contest_id = ?', contest.id)) ensure(r.user_id);

  const firstSolve = {};
  for (const s of subs) {
    const row = ensure(s.user_id);
    const cell = (row.cells[s.problem_id] ||= { solved: false, tries: 0, pending: 0, timeMin: null });
    if (cell.solved) continue;
    const hidden = frozen && s.created_at >= freezeAt;
    if (s.status !== 'done' || hidden) {
      cell.pending++;
      continue;
    }
    if (s.verdict === 'CE' || s.verdict === 'SE') continue;
    if (s.verdict === 'AC') {
      cell.solved = true;
      cell.timeMin = Math.floor((s.created_at - contest.start_at) / 60_000);
      row.solved++;
      row.penalty += cell.timeMin + cell.tries * contest.penalty_min;
      row.lastAc = Math.max(row.lastAc, s.created_at);
      if (!firstSolve[s.problem_id] || s.created_at < firstSolve[s.problem_id].at) {
        firstSolve[s.problem_id] = { userId: s.user_id, at: s.created_at };
      }
    } else {
      cell.tries++;
    }
  }

  const ids = [...users.keys()];
  const info = new Map();
  if (ids.length) {
    for (const u of db.all(`SELECT id, handle, rating, country, organization FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)) {
      info.set(u.id, u);
    }
  }
  const rows = [...users.values()]
    .filter((r) => info.has(r.userId))
    .sort((a, b) => b.solved - a.solved || a.penalty - b.penalty || a.lastAc - b.lastAc || a.userId - b.userId);

  let rank = 0;
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    if (!prev || prev.solved !== r.solved || prev.penalty !== r.penalty) rank = i + 1;
    r.rank = rank;
    for (const [pid, cell] of Object.entries(r.cells)) cell.first = cell.solved && firstSolve[pid]?.userId === r.userId;
    const u = info.get(r.userId);
    r.handle = u.handle;
    r.rating = u.rating;
    r.country = u.country;
    r.organization = u.organization;
    r.attempted = Object.values(r.cells).some((c) => c.solved || c.tries > 0 || c.pending > 0);
  });

  const stats = problems.map((p) => {
    let solved = 0;
    let tried = 0;
    for (const r of rows) {
      const c = r.cells[p.id];
      if (!c) continue;
      if (c.solved) solved++;
      if (c.solved || c.tries) tried++;
    }
    return { problemId: p.id, label: p.label, solved, tried };
  });

  return { problems, rows, stats, frozen, freezeAt: Number.isFinite(freezeAt) ? freezeAt : null };
}

/** Apply rating changes for a finished rated contest (idempotent guard via ratings_applied). */
export function applyRatings(contest) {
  if (!contest.rated) throw badRequest('This contest is unrated');
  if (phaseOf(contest) !== 'finished') throw badRequest('Contest has not finished yet');
  if (contest.ratings_applied) throw conflict('Ratings were already applied for this contest');

  const { rows } = computeStandings(contest, { viewer: { role: 'admin' } });
  const participants = rows.filter((r) => r.attempted);
  if (participants.length < 2) throw badRequest('Need at least 2 participants with submissions to rate a contest');

  // ties share the worse rank for rating purposes
  const withRank = [];
  for (let i = 0; i < participants.length;) {
    let j = i;
    while (j + 1 < participants.length && participants[j + 1].solved === participants[i].solved
      && participants[j + 1].penalty === participants[i].penalty) j++;
    for (let k = i; k <= j; k++) withRank.push({ userId: participants[k].userId, rank: j + 1, rating: participants[k].rating });
    i = j + 1;
  }
  const changes = computeRatingChanges(withRank);
  const now = Date.now();
  db.tx(() => {
    for (const c of changes) {
      db.run(
        `INSERT INTO rating_changes (contest_id, user_id, rank, old_rating, new_rating, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        contest.id, c.userId, c.rank, c.oldRating, c.newRating, now,
      );
      db.run(
        'UPDATE users SET rating = ?, max_rating = MAX(COALESCE(max_rating, 0), ?) WHERE id = ?',
        c.newRating, c.newRating, c.userId,
      );
    }
    db.run('UPDATE contests SET ratings_applied = 1 WHERE id = ?', contest.id);
  });
  return changes;
}

/** Undo a contest's rating changes (only allowed if it's the latest rated contest for all affected users). */
export function rollbackRatings(contest) {
  const changes = db.all('SELECT * FROM rating_changes WHERE contest_id = ?', contest.id);
  db.tx(() => {
    for (const c of changes) {
      const later = db.get('SELECT 1 FROM rating_changes WHERE user_id = ? AND created_at > ? LIMIT 1', c.user_id, c.created_at);
      if (later) throw conflict('A later contest already changed these ratings; roll that back first');
      const unrated = !db.get('SELECT 1 FROM rating_changes WHERE user_id = ? AND contest_id != ? LIMIT 1', c.user_id, contest.id);
      const max = db.get('SELECT MAX(new_rating) m FROM rating_changes WHERE user_id = ? AND contest_id != ?', c.user_id, contest.id).m;
      db.run('UPDATE users SET rating = ?, max_rating = ? WHERE id = ?', unrated ? null : c.old_rating, max ?? null, c.user_id);
    }
    db.run('DELETE FROM rating_changes WHERE contest_id = ?', contest.id);
    db.run('UPDATE contests SET ratings_applied = 0 WHERE id = ?', contest.id);
  });
  return changes.length;
}
