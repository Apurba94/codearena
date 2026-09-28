import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { syncCodeforcesProgress } from '../services/archive/index.js';
import { PUBLIC_PROBLEM_SQL } from '../services/problems.js';
import { rankOf } from '../services/rating.js';
import { badRequest, notFound, pageResult, paging } from '../util/http.js';
import { rateLimit } from '../util/ratelimit.js';
import { validate } from '../util/validate.js';

const r = Router();

r.get('/rankings', (req, res) => {
  const pg = paging(req.query, 50, 100);
  const by = req.query.by === 'solved' ? 'solved' : 'rating';
  const q = String(req.query.q || '').trim();
  const where = ['banned = 0'];
  const params = [];
  if (by === 'rating') where.push('rating IS NOT NULL');
  else where.push('solved_count > 0');
  if (q) { where.push('handle LIKE ?'); params.push(`%${q}%`); }
  if (req.query.country) { where.push('country = ?'); params.push(String(req.query.country)); }
  const whereSql = where.join(' AND ');
  const order = by === 'rating' ? 'rating DESC, solved_count DESC, id' : 'solved_count DESC, rating DESC, id';
  const total = db.get(`SELECT COUNT(*) n FROM users WHERE ${whereSql}`, ...params).n;
  const rows = db.all(
    `SELECT handle, rating, max_rating, country, organization, solved_count,
            (SELECT COUNT(*) FROM rating_changes rc WHERE rc.user_id = users.id) AS contests
       FROM users WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ...params, pg.pageSize, pg.offset,
  );
  const items = rows.map((u, i) => ({
    rank: pg.offset + i + 1,
    handle: u.handle,
    rating: u.rating,
    maxRating: u.max_rating,
    country: u.country,
    organization: u.organization,
    solved: u.solved_count,
    contests: u.contests,
    title: rankOf(u.rating).title,
  }));
  res.json(pageResult(items, total, pg));
});

r.get('/:handle', (req, res) => {
  const u = db.get('SELECT * FROM users WHERE handle = ?', req.params.handle);
  if (!u) throw notFound('User');
  const now = Date.now();
  const verdicts = db.all('SELECT verdict, COUNT(*) n FROM submissions WHERE user_id = ? AND status = ? GROUP BY verdict', u.id, 'done');
  const languages = db.all('SELECT language, COUNT(*) n FROM submissions WHERE user_id = ? GROUP BY language ORDER BY n DESC', u.id);
  const history = db.all(
    `SELECT rc.contest_id, rc.rank, rc.old_rating, rc.new_rating, c.title, c.start_at, c.duration_min
       FROM rating_changes rc JOIN contests c ON c.id = rc.contest_id WHERE rc.user_id = ? ORDER BY c.start_at`,
    u.id,
  );
  // submission activity for the last 365 days (UTC day buckets)
  const since = now - 365 * 86400_000;
  const activity = db.all(
    `SELECT CAST(created_at / 86400000 AS INTEGER) AS day, COUNT(*) n FROM submissions
      WHERE user_id = ? AND created_at >= ? GROUP BY day`,
    u.id, since,
  );
  const solved = db.all(
    `SELECT p.code, p.title, p.difficulty FROM user_problem up JOIN problems p ON p.id = up.problem_id
      WHERE up.user_id = ? AND up.solved = 1 AND ${PUBLIC_PROBLEM_SQL} ORDER BY up.first_ac_at DESC`,
    u.id, now,
  );
  const tagStats = db.all(
    `SELECT t.tag, COUNT(*) n FROM user_problem up JOIN problem_tags t ON t.problem_id = up.problem_id
       JOIN problems p ON p.id = up.problem_id
      WHERE up.user_id = ? AND up.solved = 1 AND ${PUBLIC_PROBLEM_SQL} GROUP BY t.tag ORDER BY n DESC LIMIT 15`,
    u.id, now,
  );
  const archiveSolved = db.get(`SELECT COUNT(*) n FROM user_archive WHERE user_id = ? AND status = 'solved'`, u.id).n;
  const me = req.user?.id === u.id;
  res.json({
    handle: u.handle,
    rating: u.rating,
    maxRating: u.max_rating,
    rank: rankOf(u.rating),
    maxRank: rankOf(u.max_rating),
    country: u.country,
    organization: u.organization,
    bio: u.bio,
    cfHandle: u.cf_handle,
    role: u.role,
    createdAt: u.created_at,
    lastSeenAt: u.last_seen_at,
    solvedCount: u.solved_count,
    archiveSolved,
    submissions: verdicts.reduce((s, v) => s + v.n, 0),
    verdicts: Object.fromEntries(verdicts.map((v) => [v.verdict, v.n])),
    languages: languages.map((l) => ({ language: l.language, count: l.n })),
    ratingHistory: history.map((h) => ({
      contestId: h.contest_id, title: h.title, rank: h.rank, oldRating: h.old_rating, newRating: h.new_rating,
      at: h.start_at + h.duration_min * 60_000,
    })),
    activity: activity.map((a) => ({ day: a.day, count: a.n })),
    solved,
    tagStats: tagStats.map((t) => ({ tag: t.tag, count: t.n })),
    email: me ? u.email : undefined,
  });
});

r.patch('/me', requireAuth, (req, res) => {
  const body = validate(req.body, {
    country: { type: 'string', max: 60, default: null },
    organization: { type: 'string', max: 100, default: null },
    bio: { type: 'string', max: 2000, default: null },
    cfHandle: { type: 'string', max: 40, pattern: /^[A-Za-z0-9_.-]+$/, default: null },
  });
  db.run(
    'UPDATE users SET country = ?, organization = ?, bio = ?, cf_handle = ? WHERE id = ?',
    body.country, body.organization, body.bio, body.cfHandle, req.user.id,
  );
  res.json({ ok: true });
});

const cfLimiter = rateLimit({ windowMs: 10 * 60_000, max: 3, message: 'You can sync at most 3 times per 10 minutes' });
r.post('/me/sync-codeforces', requireAuth, cfLimiter, async (req, res) => {
  const u = db.get('SELECT cf_handle FROM users WHERE id = ?', req.user.id);
  if (!u.cf_handle) throw badRequest('Set your Codeforces handle in Settings first');
  try {
    res.json(await syncCodeforcesProgress(req.user.id, u.cf_handle));
  } catch (e) {
    throw badRequest(`Codeforces sync failed: ${e.message}`);
  }
});

export default r;
