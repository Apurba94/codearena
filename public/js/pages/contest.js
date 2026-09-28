import { api, qs } from '../api.js';
import { isAdmin, isStaff, store } from '../app.js';
import { renderMarkdown } from '../markdown.js';
import {
  $, busy, emptyRow, fmtDate, fmtMinutes, html, isPending, pager, raw, setHTML, toast, userLink,
} from '../ui.js';
import { submissionHead, submissionRows } from './status.js';

export default async function contest(ctx) {
  const id = Number(ctx.params.id);
  const tab = ['standings', 'submissions', 'my'].includes(ctx.params.tab) ? ctx.params.tab : 'problems';
  let timer = null;
  ctx.onCleanup(() => clearTimeout(timer));

  const c = await api.get(`/contests/${id}`);
  if (ctx.stale()) return;
  ctx.setTitle(c.title);
  const now = c.serverTime;
  const pct = c.phase === 'running' ? Math.min(100, (100 * (now - c.startAt)) / (c.endAt - c.startAt)) : c.phase === 'finished' ? 100 : 0;

  setHTML(ctx.main, html`
    <div class="breadcrumb"><a href="/contests">Contests</a> › ${c.title}</div>
    <div class="card card-body stack">
      <div class="contest-banner">
        <div>
          <h1 style="margin:0">${c.title}</h1>
          <div class="small muted">${fmtDate(c.startAt)} · ${Math.floor(c.durationMin / 60)}h ${c.durationMin % 60}m · ${c.rated ? 'Rated' : 'Unrated'} · penalty ${c.penaltyMin} min${c.freezeMin ? ` · standings freeze ${c.freezeMin} min before end` : ''}</div>
        </div>
        <div class="right">
          <div class="phase ${c.phase}">${c.phase}</div>
          ${c.phase === 'running' ? html`<div>Ends in <span class="countdown" data-to="${c.endAt}"></span></div>` : ''}
          ${c.phase === 'upcoming' ? html`<div>Starts in <span class="countdown" data-to="${c.startAt}"></span></div>` : ''}
          ${c.phase === 'finished' ? html`<div class="small muted">${c.participants} participants</div>` : ''}
        </div>
      </div>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="row between">
        <div class="row">
          ${store.user && c.phase !== 'finished'
            ? (c.registered
              ? html`<span class="badge ok">You are registered</span>${c.phase === 'upcoming' ? html`<button class="btn sm ghost" id="unregBtn">Cancel registration</button>` : ''}`
              : html`<button class="btn primary sm" id="regBtn">Register${c.phase === 'running' ? ' and compete' : ''}</button>`)
            : ''}
          ${!store.user && c.phase !== 'finished' ? html`<a class="btn sm primary" href="/login?next=/contest/${c.id}">Log in to register</a>` : ''}
        </div>
        <div class="row">
          ${isStaff() ? html`<a class="btn sm" href="/admin/contest/${c.id}">Manage</a>` : ''}
          ${isAdmin() && c.phase === 'finished' && c.rated && !c.ratingsApplied ? html`<button class="btn sm primary" id="rateBtn">Apply rating changes</button>` : ''}
          ${c.ratingsApplied ? html`<span class="badge info">Ratings updated</span>` : ''}
        </div>
      </div>
    </div>

    <nav class="tabs" style="margin-top:16px">
      <a href="/contest/${c.id}" class="${tab === 'problems' ? 'active' : ''}">Problems</a>
      <a href="/contest/${c.id}/standings" class="${tab === 'standings' ? 'active' : ''}">Standings</a>
      ${store.user ? html`<a href="/contest/${c.id}/my" class="${tab === 'my' ? 'active' : ''}">My submissions</a>` : ''}
      <a href="/contest/${c.id}/submissions" class="${tab === 'submissions' ? 'active' : ''}">All submissions</a>
    </nav>
    <div id="tabBody"></div>`);

  $('#regBtn')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    await api.post(`/contests/${c.id}/register`);
    toast('Registered — good luck!', 'ok');
    ctx.reload();
  }));
  $('#unregBtn')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    await api.del(`/contests/${c.id}/register`);
    toast('Registration cancelled');
    ctx.reload();
  }));
  $('#rateBtn')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    if (!confirm('Apply rating changes for all participants? This updates everyone\'s rating.')) return;
    const r = await api.post(`/admin/contests/${c.id}/ratings`);
    toast(`Updated ratings of ${r.applied} participants`, 'ok');
    ctx.reload();
  }));
  const onDone = () => setTimeout(() => !ctx.stale() && ctx.reload(), 1500);
  ctx.main.addEventListener('countdown-done', onDone, { once: true });
  ctx.onCleanup(() => ctx.main.removeEventListener('countdown-done', onDone));

  const body = $('#tabBody');
  if (tab === 'problems') {
    if (c.phase === 'upcoming' && !isStaff()) {
      setHTML(body, html`<div class="card card-body empty">The problems will appear here when the contest starts.</div>
        ${c.description ? html`<div class="card card-body md" style="margin-top:16px">${raw(renderMarkdown(c.description))}</div>` : ''}`);
      return;
    }
    setHTML(body, html`
      <div class="layout-2">
        <div class="card"><div class="table-wrap"><table class="table">
          <thead><tr><th style="width:50px">#</th><th>Name</th><th>Limits</th><th class="num">Solved</th></tr></thead>
          <tbody>${c.problems.length ? c.problems.map((p) => html`
            <tr class="${p.myStatus === 'solved' ? 'solved-row' : p.myStatus === 'attempted' ? 'tried-row' : ''}">
              <td><b><a href="/contest/${c.id}/problem/${p.code}">${p.label}</a></b></td>
              <td class="title-cell"><a href="/contest/${c.id}/problem/${p.code}">${p.title}</a></td>
              <td class="small muted nowrap">${p.timeLimitMs / 1000} s, ${p.memoryLimitMb} MB</td>
              <td class="num">👤 ${p.solvedCount}</td>
            </tr>`) : emptyRow(4, 'No problems added yet.')}</tbody>
        </table></div></div>
        <aside class="card card-body md">${c.description ? raw(renderMarkdown(c.description)) : html`<p class="muted">No description.</p>`}
          <p class="small muted">Rules: problems are ordered by label; the score is the number of solved problems, ties are broken by penalty time
          (minutes from the start to each accepted solution plus ${c.penaltyMin} minutes per rejected attempt before it; compilation errors are free).</p>
        </aside>
      </div>`);
    return;
  }

  if (tab === 'standings') {
    async function loadStandings() {
      const s = await api.get(`/contests/${c.id}/standings`);
      if (ctx.stale()) return;
      const hasRating = s.rows.some((r) => r.ratingChange != null);
      setHTML(body, html`
        ${s.frozen ? html`<div class="alert info" style="margin-bottom:12px">Standings are frozen — results of submissions made after ${fmtDate(s.freezeAt)} are hidden until the contest ends.</div>` : ''}
        <div class="card"><div class="table-wrap"><table class="table standings">
          <thead><tr><th>#</th><th class="who">Who</th><th>=</th><th>Penalty</th>
            ${s.problems.map((p) => html`<th><a href="/contest/${c.id}/problem/${p.code}" title="${p.title}">${p.label}</a></th>`)}
            ${hasRating ? html`<th>Δ</th>` : ''}</tr></thead>
          <tbody>${s.rows.length ? s.rows.map((r) => html`<tr>
            <td>${r.rank}</td>
            <td class="who">${userLink(r.handle, r.rating)}${r.country ? html` <span class="small faint">${r.country}</span>` : ''}</td>
            <td><b>${r.solved}</b></td>
            <td>${r.penalty}</td>
            ${s.problems.map((p) => cell(r.cells[p.id]))}
            ${hasRating ? html`<td class="${r.ratingChange > 0 ? 'ok' : r.ratingChange < 0 ? 'bad' : 'muted'}"><b>${r.ratingChange > 0 ? '+' : ''}${r.ratingChange ?? ''}</b></td>` : ''}
          </tr>`) : emptyRow(4 + s.problems.length, 'No participants yet.')}</tbody>
          ${s.rows.length ? html`<tfoot><tr><td></td><td class="who">Accepted / tried</td><td></td><td></td>
            ${s.stats.map((x) => html`<td><span class="ok">${x.solved}</span>/${x.tried}</td>`)}${hasRating ? html`<td></td>` : ''}</tr></tfoot>` : ''}
        </table></div></div>`);
      clearTimeout(timer);
      if (c.phase === 'running') timer = setTimeout(loadStandings, 15000);
    }
    await loadStandings();
    return;
  }

  // submissions tabs
  const page = Number(ctx.query.page) || 1;
  async function loadSubs() {
    const data = await api.get('/submissions', { contest: c.id, mine: tab === 'my' ? 1 : undefined, page });
    if (ctx.stale()) return;
    setHTML(body, html`<div class="card"><div class="table-wrap"><table class="table">${submissionHead}<tbody>${submissionRows(data.items, { showContestLabel: true })}</tbody></table></div>
      ${pager(data.page, data.pages, (n) => `/contest/${c.id}/${tab}${qs({ page: n })}`)}</div>`);
    clearTimeout(timer);
    if (data.items.some(isPending) || c.phase === 'running') timer = setTimeout(loadSubs, data.items.some(isPending) ? 1500 : 10000);
  }
  await loadSubs();
}

function cell(x) {
  if (!x) return html`<td></td>`;
  if (x.solved) {
    return html`<td class="${x.first ? 'cell-first' : ''}" title="${x.first ? 'First to solve' : ''}"><span class="cell-ac">+${x.tries || ''}</span><span class="t">${fmtMinutes(x.timeMin)}</span></td>`;
  }
  if (x.pending) return html`<td><span class="cell-pend">?${x.tries ? ` -${x.tries}` : ''}</span><span class="t">${x.pending} pending</span></td>`;
  if (x.tries) return html`<td><span class="cell-wa">-${x.tries}</span></td>`;
  return html`<td></td>`;
}

