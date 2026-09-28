/**
 * Problem-archive importers. Each source fetches *metadata only* (title, tags, difficulty, solve
 * counts, link) from the judge's public API / listing and links to the original statement.
 * Statements and test data belong to the original judges and are never copied.
 *
 * Every fetcher returns: [{ external_id, title, url, contest, category, difficulty, tags[], solved_count }]
 */
import { config } from '../../config.js';

async function fetchOnce(url, gzip) {
  const headers = { 'User-Agent': config.archive.userAgent, Accept: '*/*' };
  if (gzip) headers['Accept-Encoding'] = 'gzip';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error(`${url} -> HTTP ${res.status}`), { status: res.status });
    return await res.text();
  } catch (e) {
    // surface the socket-level reason ("fetch failed" alone is useless)
    if (e.cause?.code) e.message = `${new URL(url).host}: ${e.cause.code}`;
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/** GET with retries (exponential backoff) for transient network errors, 429 and 5xx. */
async function fetchText(url, { gzip = false, attempts = 4 } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fetchOnce(url, gzip);
    } catch (e) {
      const retryable = !e.status || e.status === 429 || e.status >= 500;
      if (!retryable || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** (i - 1)));
    }
  }
}
const fetchJson = async (url, opts) => JSON.parse(await fetchText(url, opts));

const decodeEntities = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

export const SOURCES = {
  codeforces: {
    name: 'Codeforces',
    home: 'https://codeforces.com',
    async fetch() {
      const data = await fetchJson('https://codeforces.com/api/problemset.problems');
      if (data.status !== 'OK') throw new Error(`Codeforces API: ${data.comment || data.status}`);
      const solved = new Map(data.result.problemStatistics.map((s) => [`${s.contestId}${s.index}`, s.solvedCount]));
      return data.result.problems.map((p) => {
        const id = `${p.contestId}${p.index}`;
        return {
          external_id: id,
          title: p.name,
          url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
          contest: String(p.contestId),
          category: p.type === 'QUESTION' ? 'Question' : null,
          difficulty: p.rating ?? null,
          tags: (p.tags || []).filter((t) => !t.startsWith('*')),
          solved_count: solved.get(id) ?? null,
        };
      });
    },
  },

  atcoder: {
    name: 'AtCoder',
    home: 'https://atcoder.jp',
    async fetch() {
      // Community-maintained index by kenkoooo (AtCoder Problems); difficulty is its IRT estimate.
      const [problems, models] = await Promise.all([
        fetchJson('https://kenkoooo.com/atcoder/resources/merged-problems.json', { gzip: true }),
        fetchJson('https://kenkoooo.com/atcoder/resources/problem-models.json', { gzip: true }),
      ]);
      const clip = (d) => (d == null ? null : Math.round(d >= 400 ? d : 400 / Math.exp((400 - d) / 400)));
      return problems.map((p) => {
        const series = (/^(abc|arc|agc|ahc)/.exec(p.contest_id)?.[1] || 'other').toUpperCase();
        return {
          external_id: p.id,
          title: p.name,
          url: `https://atcoder.jp/contests/${p.contest_id}/tasks/${p.id}`,
          contest: p.contest_id,
          category: series === 'OTHER' ? 'Other' : series,
          difficulty: clip(models[p.id]?.difficulty),
          tags: [],
          solved_count: p.solver_count ?? null,
        };
      });
    },
  },

  uva: {
    name: 'UVa Online Judge',
    home: 'https://onlinejudge.org',
    async fetch() {
      // uHunt API: [pid, num, title, dacu, mrun, mmem, nover, sube, noj, inq, ce, rf, re, ole, tle, mle, wa, pe, ac, rtl, status, rej]
      const rows = await fetchJson('https://uhunt.onlinejudge.org/api/p');
      return rows.map((r) => ({
        external_id: String(r[1]),
        title: r[2],
        url: `https://onlinejudge.org/index.php?option=com_onlinejudge&Itemid=8&page=show_problem&problem=${r[0]}`,
        contest: null,
        category: `Volume ${Math.floor(r[1] / 100)}`,
        difficulty: null,
        tags: [],
        solved_count: r[3] ?? null,
      }));
    },
  },

  cses: {
    name: 'CSES Problem Set',
    home: 'https://cses.fi/problemset/',
    async fetch() {
      const html = await fetchText('https://cses.fi/problemset/');
      const out = [];
      // The list page is a sequence of <h2>Section</h2><ul class="task-list">…<li class="task">…</li>…</ul>
      const sections = html.split('<h2>').slice(1);
      for (const sec of sections) {
        const name = decodeEntities(sec.slice(0, sec.indexOf('</h2>')).trim());
        const re = /<a href="\/problemset\/task\/(\d+)\/?">([^<]+)<\/a>(?:\s*<span class="detail">\s*(\d+)\s*\/\s*(\d+)\s*<\/span>)?/g;
        let m;
        while ((m = re.exec(sec))) {
          out.push({
            external_id: m[1],
            title: decodeEntities(m[2].trim()),
            url: `https://cses.fi/problemset/task/${m[1]}`,
            contest: null,
            category: name,
            difficulty: null,
            tags: [name.toLowerCase()],
            solved_count: m[3] ? Number(m[3]) : null,
          });
        }
      }
      if (!out.length) throw new Error('CSES page layout changed; no tasks found');
      return out;
    },
  },
};

/** Codeforces problems a handle has solved (for archive progress sync). */
export async function codeforcesSolved(handle) {
  const data = await fetchJson(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}`);
  if (data.status !== 'OK') throw new Error(data.comment || 'Codeforces API error');
  const ids = new Set();
  for (const s of data.result) if (s.verdict === 'OK' && s.problem?.contestId) ids.add(`${s.problem.contestId}${s.problem.index}`);
  return [...ids];
}
