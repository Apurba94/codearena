import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { popularArchiveTags, searchArchive, setUserArchiveStatus, sourceSummary } from '../services/archive/index.js';
import { notFound, pageResult, paging } from '../util/http.js';
import { parseTags, validate } from '../util/validate.js';

const r = Router();

function parseQuery(req) {
  const int = (v) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : null);
  return {
    source: req.query.source ? String(req.query.source) : null,
    q: String(req.query.q || '').trim().slice(0, 100) || null,
    tags: parseTags(req.query.tags),
    category: req.query.category ? String(req.query.category) : null,
    minDiff: int(req.query.minDiff),
    maxDiff: int(req.query.maxDiff),
    status: req.query.status ? String(req.query.status) : null,
    sort: String(req.query.sort || 'popular'),
  };
}

const view = (a) => ({
  id: a.id,
  source: a.source,
  externalId: a.external_id,
  title: a.title,
  url: a.url,
  contest: a.contest,
  category: a.category,
  difficulty: a.difficulty,
  tags: a.tags ? a.tags.split(',') : [],
  solvedCount: a.solved_count,
  myStatus: a.my_status ?? null,
});

r.get('/', (req, res) => {
  const pg = paging(req.query, 50, 100);
  const { total, items } = searchArchive({ ...parseQuery(req), ...pg }, req.user?.id);
  res.json(pageResult(items.map(view), total, pg));
});

r.get('/random', (req, res) => {
  const row = searchArchive({ ...parseQuery(req), random: true }, req.user?.id);
  if (!row) throw notFound('Matching problem');
  res.json(view(row));
});

r.get('/sources', (req, res) => res.json(sourceSummary()));

r.get('/tags', (req, res) => res.json(popularArchiveTags(80).map((t) => ({ tag: t.tag, count: t.n }))));

r.get('/categories', (req, res) => {
  const source = String(req.query.source || '');
  res.json(db.all('SELECT category, COUNT(*) n FROM archive_problems WHERE source = ? AND category IS NOT NULL GROUP BY category ORDER BY MIN(id)', source)
    .map((c) => ({ category: c.category, count: c.n })));
});

r.put('/:id/status', requireAuth, (req, res) => {
  const body = validate(req.body, { status: { type: 'string', enum: ['solved', 'todo'], default: null } });
  const id = parseInt(req.params.id, 10) || 0;
  if (!db.get('SELECT 1 FROM archive_problems WHERE id = ?', id)) throw notFound('Archive problem');
  setUserArchiveStatus(req.user.id, id, body.status);
  res.json({ status: body.status });
});

export default r;
