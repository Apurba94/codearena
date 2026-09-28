import { api } from '../api.js';
import { store } from '../app.js';
import { diffBadge, esc, fmtDay, fmtNum, html, raw, rankClass, setHTML, timeAgo, verdictName } from '../ui.js';

const TIERS = [[0, 1200, '#cccccc'], [1200, 1400, '#77ff77'], [1400, 1600, '#77ddbb'], [1600, 1900, '#aaaaff'], [1900, 2100, '#ff88ff'],
  [2100, 2400, '#ffcc88'], [2400, 3000, '#ff7777'], [3000, 5000, '#aa0000']];

/** Rating history as an SVG line chart over coloured rank bands. */
function ratingChart(hist) {
  if (!hist.length) return html`<div class="empty small">No rated contests yet.</div>`;
  const W = 760; const H = 240; const L = 44; const R = 12; const T = 12; const B = 26;
  const vals = hist.flatMap((h) => [h.oldRating, h.newRating]);
  const lo = Math.max(0, Math.floor((Math.min(...vals) - 150) / 100) * 100);
  const hi = Math.ceil((Math.max(...vals) + 150) / 100) * 100;
  const t0 = hist[0].at - 86400_000 * 3;
  const t1 = hist[hist.length - 1].at + 86400_000 * 3;
  const x = (t) => L + ((W - L - R) * (t - t0)) / Math.max(1, t1 - t0);
  const y = (v) => T + ((H - T - B) * (hi - v)) / Math.max(1, hi - lo);
  let svg = '';
  for (const [a, b, col] of TIERS) {
    const ya = y(Math.min(hi, b));
    const yb = y(Math.max(lo, a));
    if (yb > ya) svg += `<rect x="${L}" y="${ya}" width="${W - L - R}" height="${yb - ya}" fill="${col}" opacity=".28"/>`;
  }
  const step = hi - lo > 1200 ? 400 : hi - lo > 600 ? 200 : 100;
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke-dasharray="2 3"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }
  const pts = hist.map((h) => [x(h.at), y(h.newRating), h]);
  svg += `<polyline class="line" points="${pts.map(([a, b]) => `${a},${b}`).join(' ')}"/>`;
  for (const [a, b, h] of pts) {
    svg += `<a href="/contest/${h.contestId}/standings"><circle class="pt" cx="${a}" cy="${b}" r="4"><title>${esc(h.title)}\nRank ${h.rank} · ${h.oldRating} → ${h.newRating} (${h.newRating - h.oldRating >= 0 ? '+' : ''}${h.newRating - h.oldRating})</title></circle></a>`;
  }
  const first = new Date(hist[0].at);
  const last = new Date(hist[hist.length - 1].at);
  svg += `<text x="${L}" y="${H - 6}">${first.toLocaleDateString()}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${last.toLocaleDateString()}</text>`;
  return raw(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rating history">${svg}</svg>`);
}

/** Last-year submission activity heatmap (53 weeks x 7 days). */
function heatmap(activity) {
  const byDay = new Map(activity.map((a) => [a.day, a.count]));
  const today = Math.floor(Date.now() / 86400_000);
  const start = today - 364 - new Date(today * 86400_000).getUTCDay();
  const cell = 11; const gap = 2;
  let svg = '';
  let total = 0;
  for (let d = start; d <= today; d++) {
    const i = d - start;
    const c = byDay.get(d) || 0;
    total += c;
    const lvl = c === 0 ? 0 : c < 2 ? 1 : c < 5 ? 2 : c < 10 ? 3 : 4;
    const date = new Date(d * 86400_000).toISOString().slice(0, 10);
    svg += `<rect x="${Math.floor(i / 7) * (cell + gap)}" y="${(i % 7) * (cell + gap)}" width="${cell}" height="${cell}" fill="var(--heat-${lvl})"><title>${c} submission${c === 1 ? '' : 's'} on ${date}</title></rect>`;
  }
  const w = 53 * (cell + gap);
  return { total, svg: raw(`<svg class="chart heatmap" viewBox="0 0 ${w} ${7 * (cell + gap)}" role="img" aria-label="Submission activity">${svg}</svg>`) };
}

export default async function profile(ctx) {
  const u = await api.get(`/users/${encodeURIComponent(ctx.params.handle)}`);
  if (ctx.stale()) return;
  ctx.setTitle(u.handle);
  const me = store.user?.handle?.toLowerCase() === u.handle.toLowerCase();
  const heat = heatmap(u.activity);
  const vTotal = Object.values(u.verdicts).reduce((a, b) => a + b, 0) || 1;
  const vColor = { AC: 'var(--ok)', WA: 'var(--bad)', TLE: 'var(--warn)', MLE: 'var(--warn)', RE: '#b04fd6', CE: 'var(--faint)', OLE: 'var(--warn)', SE: 'var(--faint)' };
  const lastChange = u.ratingHistory.at(-1);

  setHTML(ctx.main, html`
    <div class="card card-body profile-head">
      <div class="avatar" style="background:var(--${{ 'r-unrated': 'r-gray', 'r-legend': 'r-red' }[rankClass(u.rating)] || rankClass(u.rating)})">${u.handle[0].toUpperCase()}</div>
      <div class="grow">
        <div class="rank-title ${rankClass(u.rating)}">${u.rank.title}</div>
        <div class="handle-big ${rankClass(u.rating)}">${u.handle}</div>
        <div class="small muted">${[u.organization, u.country].filter(Boolean).join(' · ') || ''}</div>
        ${u.bio ? html`<div class="small" style="margin-top:4px">${u.bio}</div>` : ''}
      </div>
      <dl class="kv">
        <dt>Rating</dt><dd><b class="${rankClass(u.rating)}">${u.rating ?? 'unrated'}</b>${lastChange ? html` <span class="small ${lastChange.newRating >= lastChange.oldRating ? 'ok' : 'bad'}">(${lastChange.newRating >= lastChange.oldRating ? '+' : ''}${lastChange.newRating - lastChange.oldRating})</span>` : ''}</dd>
        <dt>Max rating</dt><dd>${u.maxRating != null ? html`<span class="${rankClass(u.maxRating)}">${u.maxRating}</span> <span class="small ${rankClass(u.maxRating)}">(${u.maxRank.title})</span>` : '—'}</dd>
        <dt>Registered</dt><dd>${fmtDay(u.createdAt)}</dd>
        <dt>Last visit</dt><dd>${u.lastSeenAt ? timeAgo(u.lastSeenAt) : '—'}</dd>
        ${u.cfHandle ? html`<dt>Codeforces</dt><dd><a href="https://codeforces.com/profile/${encodeURIComponent(u.cfHandle)}" target="_blank" rel="noopener noreferrer">${u.cfHandle} ↗</a></dd>` : ''}
      </dl>
      ${me ? html`<a class="btn sm" href="/settings">Edit profile</a>` : ''}
    </div>

    <div class="stats-strip" style="margin-top:16px">
      <div class="stat"><div class="v">${fmtNum(u.solvedCount)}</div><div class="l">Problems solved</div></div>
      <div class="stat"><div class="v">${fmtNum(u.submissions)}</div><div class="l">Submissions</div></div>
      <div class="stat"><div class="v">${u.submissions ? `${Math.round((100 * (u.verdicts.AC || 0)) / u.submissions)}%` : '—'}</div><div class="l">Acceptance</div></div>
      <div class="stat"><div class="v">${u.ratingHistory.length}</div><div class="l">Rated contests</div></div>
      <div class="stat"><div class="v">${fmtNum(u.archiveSolved)}</div><div class="l">Archive problems solved</div></div>
    </div>

    <div class="layout-2">
      <div class="stack">
        <div class="card"><div class="card-head"><h3>Rating history</h3></div><div class="card-body">${ratingChart(u.ratingHistory)}</div></div>
        <div class="card"><div class="card-head"><h3>Activity</h3><span class="small muted">${heat.total} submission${heat.total === 1 ? '' : 's'} in the last year</span></div>
          <div class="card-body" style="overflow-x:auto">${heat.svg}</div></div>
        <div class="card"><div class="card-head"><h3>Solved problems</h3><a class="small" href="/status?user=${encodeURIComponent(u.handle)}&verdict=AC">Accepted submissions →</a></div>
          <div class="card-body">${u.solved.length ? html`<div class="chips">${u.solved.map((p) => html`<a class="tag" href="/problem/${p.code}" title="${p.title}">${p.code} ${diffBadge(p.difficulty)}</a>`)}</div>` : html`<span class="muted small">Nothing solved yet.</span>`}</div></div>
        ${u.ratingHistory.length ? html`<div class="card"><div class="card-head"><h3>Contests</h3></div><div class="table-wrap"><table class="table compact">
          <thead><tr><th>Contest</th><th class="num">Rank</th><th class="num">Change</th><th class="num">New rating</th></tr></thead>
          <tbody>${[...u.ratingHistory].reverse().map((h) => html`<tr><td><a href="/contest/${h.contestId}/standings">${h.title}</a></td><td class="num">${h.rank}</td>
            <td class="num ${h.newRating >= h.oldRating ? 'ok' : 'bad'}">${h.newRating >= h.oldRating ? '+' : ''}${h.newRating - h.oldRating}</td>
            <td class="num ${rankClass(h.newRating)}">${h.newRating}</td></tr>`)}</tbody></table></div></div>` : ''}
      </div>
      <aside class="stack">
        <div class="card"><div class="card-head"><h3>Verdicts</h3></div><div class="card-body bars">
          ${Object.keys(u.verdicts).length ? Object.entries(u.verdicts).sort((a, b) => b[1] - a[1]).map(([v, n]) => html`
            <div class="bar-row"><span class="small">${verdictName(v)}</span><div class="track"><div class="fill" style="width:${(100 * n) / vTotal}%;background:${vColor[v] || 'var(--primary)'}"></div></div><span class="small num">${n}</span></div>`)
            : html`<span class="muted small">No judged submissions.</span>`}
        </div></div>
        <div class="card"><div class="card-head"><h3>Languages</h3></div><div class="card-body">
          ${u.languages.length ? u.languages.map((l) => html`<div class="row between small"><span>${store.meta.languages.find((x) => x.id === l.language)?.name || l.language}</span><b>${l.count}</b></div>`) : html`<span class="muted small">—</span>`}
        </div></div>
        <div class="card"><div class="card-head"><h3>Top tags</h3></div><div class="card-body chips">
          ${u.tagStats.length ? u.tagStats.map((t) => html`<span class="tag">${t.tag} <b>${t.count}</b></span>`) : html`<span class="muted small">—</span>`}
        </div></div>
      </aside>
    </div>`);
}
