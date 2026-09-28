import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../db.js';
import { availableLanguages, LANGUAGES, publicLanguage } from '../judge/languages.js';
import { judgeNodes } from '../judge/worker.js';
import { contestEnd, phaseOf } from '../services/contests.js';
import { PUBLIC_PROBLEM_SQL } from '../services/problems.js';

const r = Router();

/** Languages judgeable by at least one live judge node (falls back to local toolchains). */
export function enabledLanguages() {
  const nodes = judgeNodes();
  if (!nodes.length) return availableLanguages().map(publicLanguage);
  const ids = new Set(nodes.flatMap((n) => n.languages.map((l) => l.id)));
  const versions = new Map(nodes.flatMap((n) => n.languages.map((l) => [l.id, l.version])));
  return LANGUAGES.filter((l) => ids.has(l.id)).map((l) => publicLanguage({ ...l, version: versions.get(l.id) }));
}

r.get('/meta', (req, res) => {
  const now = Date.now();
  res.json({
    siteName: config.siteName,
    languages: enabledLanguages(),
    stats: {
      problems: db.get(`SELECT COUNT(*) n FROM problems p WHERE ${PUBLIC_PROBLEM_SQL}`, now).n,
      archive: db.get('SELECT COUNT(*) n FROM archive_problems').n,
      users: db.get('SELECT COUNT(*) n FROM users').n,
      submissions: db.get('SELECT COUNT(*) n FROM submissions').n,
      contests: db.get(`SELECT COUNT(*) n FROM contests WHERE visibility = 'public'`).n,
      queue: db.get(`SELECT COUNT(*) n FROM submissions WHERE status != 'done'`).n,
    },
    serverTime: now,
  });
});

r.get('/home', (req, res) => {
  const now = Date.now();
  const contests = db
    .all(`SELECT id, title, start_at, duration_min, rated FROM contests
           WHERE visibility = 'public' AND start_at + duration_min * 60000 > ? ORDER BY start_at LIMIT 5`, now)
    .map((c) => ({ id: c.id, title: c.title, startAt: c.start_at, endAt: contestEnd(c), durationMin: c.duration_min, rated: !!c.rated, phase: phaseOf(c, now) }));
  const announcements = db
    .all(`SELECT a.id, a.title, a.body, a.pinned, a.created_at, u.handle, u.rating
            FROM announcements a LEFT JOIN users u ON u.id = a.author_id
           ORDER BY a.pinned DESC, a.created_at DESC LIMIT 10`)
    .map((a) => ({ id: a.id, title: a.title, body: a.body, pinned: !!a.pinned, createdAt: a.created_at, author: a.handle, authorRating: a.rating }));
  const topRated = db.all(
    `SELECT handle, rating FROM users WHERE rating IS NOT NULL AND banned = 0 ORDER BY rating DESC, id LIMIT 10`,
  );
  const topSolvers = db.all(
    `SELECT handle, rating, solved_count FROM users WHERE banned = 0 AND solved_count > 0 ORDER BY solved_count DESC, id LIMIT 10`,
  );
  const recent = db
    .all(
      `SELECT s.id, s.verdict, s.status, s.created_at, s.language, u.handle, u.rating, p.code, p.title
         FROM submissions s JOIN users u ON u.id = s.user_id JOIN problems p ON p.id = s.problem_id
        WHERE s.contest_id IS NULL AND ${PUBLIC_PROBLEM_SQL}
        ORDER BY s.id DESC LIMIT 10`,
      now,
    )
    .map((s) => ({ id: s.id, verdict: s.verdict, status: s.status, createdAt: s.created_at, language: s.language, handle: s.handle, rating: s.rating, problem: { code: s.code, title: s.title } }));
  res.json({ contests, announcements, topRated, topSolvers, recent });
});

export default r;
