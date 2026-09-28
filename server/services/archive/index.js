import { db, placeholders } from '../../db.js';
import { badRequest } from '../../util/http.js';
import { SOURCES, codeforcesSolved } from './sources.js';

const running = new Set();

/** Upsert a batch of archive rows for one source inside a single transaction. */
export function upsertArchive(source, items) {
  const now = Date.now();
  let n = 0;
  db.tx(() => {
    for (const it of items) {
      if (!it.external_id || !it.title || !/^https?:\/\//.test(it.url || '')) continue;
      const row = db.get(
        `INSERT INTO archive_problems (source, external_id, title, url, contest, category, difficulty, tags, solved_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source, external_id) DO UPDATE SET
           title = excluded.title, url = excluded.url, contest = excluded.contest, category = excluded.category,
           difficulty = excluded.difficulty, tags = excluded.tags, solved_count = excluded.solved_count,
           updated_at = excluded.updated_at
         RETURNING id`,
        source, String(it.external_id).slice(0, 64), String(it.title).slice(0, 300), it.url, it.contest ?? null,
        it.category ?? null, Number.isFinite(it.difficulty) ? Math.round(it.difficulty) : null,
        (it.tags || []).join(','), Number.isFinite(it.solved_count) ? it.solved_count : null, now,
      );
      db.run('DELETE FROM archive_tags WHERE archive_id = ?', row.id);
      for (const tag of new Set((it.tags || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean))) {
        db.run('INSERT OR IGNORE INTO archive_tags (archive_id, tag) VALUES (?, ?)', row.id, tag);
      }
      n++;
    }
  });
  return n;
}

/** Fetch + import one source. Returns the number of problems imported. */
export async function syncSource(source) {
  const src = SOURCES[source];
  if (!src) throw badRequest(`Unknown archive source '${source}'`);
  if (running.has(source)) throw badRequest(`${src.name} sync is already running`);
  running.add(source);
  const log = db.get(
    `INSERT INTO archive_sync_log (source, started_at, status) VALUES (?, ?, 'running') RETURNING id`, source, Date.now(),
  );
  try {
    const items = await src.fetch();
    let total = 0;
    for (let i = 0; i < items.length; i += 2000) {
      total += upsertArchive(source, items.slice(i, i + 2000));
      await new Promise((r) => setImmediate(r)); // keep the event loop responsive between batches
    }
    db.run(`UPDATE archive_sync_log SET status = 'ok', finished_at = ?, imported = ? WHERE id = ?`, Date.now(), total, log.id);
    return total;
  } catch (e) {
    db.run(`UPDATE archive_sync_log SET status = 'error', finished_at = ?, message = ? WHERE id = ?`, Date.now(), e.message, log.id);
    throw e;
  } finally {
    running.delete(source);
  }
}

export async function syncAll(onProgress = () => {}) {
  const results = {};
  for (const key of Object.keys(SOURCES)) {
    try {
      results[key] = { ok: true, count: await syncSource(key) };
    } catch (e) {
      results[key] = { ok: false, error: e.message };
    }
    onProgress(key, results[key]);
  }
  return results;
}

export const isSyncing = (source) => running.has(source);

export function sourceSummary() {
  const counts = new Map(db.all('SELECT source, COUNT(*) n FROM archive_problems GROUP BY source').map((r) => [r.source, r.n]));
  const last = new Map(
    db.all(`SELECT l.* FROM archive_sync_log l
             JOIN (SELECT source, MAX(id) id FROM archive_sync_log GROUP BY source) x ON x.id = l.id`).map((r) => [r.source, r]),
  );
  const keys = new Set([...Object.keys(SOURCES), ...counts.keys()]);
  return [...keys].map((key) => ({
    key,
    name: SOURCES[key]?.name || key,
    home: SOURCES[key]?.home || null,
    count: counts.get(key) || 0,
    syncing: running.has(key),
    lastSync: last.get(key) || null,
  }));
}

/** Search the archive. */
export function searchArchive(q, userId) {
  const where = [];
  const params = [];
  if (q.source) { where.push('a.source = ?'); params.push(q.source); }
  if (q.q) {
    where.push('(a.title LIKE ? OR a.external_id LIKE ? OR a.contest = ?)');
    params.push(`%${q.q}%`, `${q.q}%`, q.q);
  }
  if (q.tags?.length) {
    for (const t of q.tags) {
      where.push('EXISTS (SELECT 1 FROM archive_tags t WHERE t.archive_id = a.id AND t.tag = ?)');
      params.push(t);
    }
  }
  if (q.category) { where.push('a.category = ?'); params.push(q.category); }
  if (q.minDiff != null) { where.push('a.difficulty >= ?'); params.push(q.minDiff); }
  if (q.maxDiff != null) { where.push('a.difficulty <= ?'); params.push(q.maxDiff); }
  if (userId && q.status === 'solved') { where.push(`ua.status = 'solved'`); }
  if (userId && q.status === 'todo') { where.push(`ua.status = 'todo'`); }
  if (userId && q.status === 'unsolved') { where.push(`(ua.status IS NULL OR ua.status != 'solved')`); }

  const join = userId ? 'LEFT JOIN user_archive ua ON ua.archive_id = a.id AND ua.user_id = ?' : '';
  const joinParams = userId ? [userId] : [];
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = {
    popular: 'a.solved_count DESC NULLS LAST, a.id',
    easy: 'a.difficulty IS NULL, a.difficulty ASC, a.solved_count DESC',
    hard: 'a.difficulty DESC NULLS LAST, a.id',
    newest: 'a.source, CAST(a.contest AS INTEGER) DESC, a.contest DESC, a.external_id',
    title: 'a.title COLLATE NOCASE',
  }[q.sort] || 'a.solved_count DESC NULLS LAST, a.id';

  if (q.random) {
    return db.get(`SELECT a.* FROM archive_problems a ${join} ${whereSql} ORDER BY RANDOM() LIMIT 1`, ...joinParams, ...params);
  }
  const total = db.get(`SELECT COUNT(*) n FROM archive_problems a ${join} ${whereSql}`, ...joinParams, ...params).n;
  const items = db.all(
    `SELECT a.id, a.source, a.external_id, a.title, a.url, a.contest, a.category, a.difficulty, a.tags, a.solved_count
            ${userId ? ', ua.status AS my_status' : ''}
       FROM archive_problems a ${join} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ...joinParams, ...params, q.pageSize, q.offset,
  );
  return { total, items };
}

export function popularArchiveTags(limit = 60) {
  return db.all('SELECT tag, COUNT(*) n FROM archive_tags GROUP BY tag ORDER BY n DESC LIMIT ?', limit);
}

export function setUserArchiveStatus(userId, archiveId, status) {
  if (!status) {
    db.run('DELETE FROM user_archive WHERE user_id = ? AND archive_id = ?', userId, archiveId);
    return;
  }
  db.run(
    `INSERT INTO user_archive (user_id, archive_id, status, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, archive_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
    userId, archiveId, status, Date.now(),
  );
}

/** Mark every Codeforces problem the user's linked handle has solved. */
export async function syncCodeforcesProgress(userId, handle) {
  const ids = await codeforcesSolved(handle);
  let marked = 0;
  db.tx(() => {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const rows = db.all(
        `SELECT id FROM archive_problems WHERE source = 'codeforces' AND external_id IN (${placeholders(chunk.length)})`, ...chunk,
      );
      for (const r of rows) {
        setUserArchiveStatus(userId, r.id, 'solved');
        marked++;
      }
    }
  });
  return { solvedOnCodeforces: ids.length, marked };
}
