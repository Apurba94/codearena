import { api } from '../api.js';
import { isStaff, store } from '../app.js';
import { $$, busy, emptyRow, fmtDate, html, setHTML, toast } from '../ui.js';

const dur = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

export default async function contests(ctx) {
  ctx.setTitle('Contests');
  const data = await api.get('/contests');
  if (ctx.stale()) return;

  const row = (c) => html`<tr>
    <td class="title-cell"><a href="/contest/${c.id}"><b>${c.title}</b></a>
      <div class="small muted">${c.rated ? 'Rated' : 'Unrated'} · ICPC rules · ${c.problemCount} problem${c.problemCount === 1 ? '' : 's'}${c.visibility === 'hidden' ? ' · hidden' : ''}</div></td>
    <td class="nowrap small">${fmtDate(c.startAt)}</td>
    <td class="nowrap">${dur(c.durationMin)}</td>
    <td class="nowrap">
      ${c.phase === 'running' ? html`<span class="phase running">Running</span><div class="small">ends in <span class="countdown" data-to="${c.endAt}"></span></div>` : ''}
      ${c.phase === 'upcoming' ? html`<span class="phase upcoming">Upcoming</span><div class="small">starts in <span class="countdown" data-to="${c.startAt}"></span></div>` : ''}
      ${c.phase === 'finished' ? html`<a href="/contest/${c.id}/standings">Final standings</a>` : ''}
    </td>
    <td class="num">👤 ${c.participants}</td>
    <td class="right nowrap">
      ${c.phase !== 'finished' && store.user
        ? (c.registered
          ? html`<span class="badge ok">Registered</span>`
          : html`<button class="btn sm primary" data-register="${c.id}">Register</button>`)
        : ''}
      ${c.phase === 'running' ? html` <a class="btn sm" href="/contest/${c.id}">Enter</a>` : ''}
    </td>
  </tr>`;

  const table = (items, empty) => html`<div class="table-wrap"><table class="table">
    <thead><tr><th>Contest</th><th>Start</th><th>Length</th><th>Status</th><th class="num">Participants</th><th></th></tr></thead>
    <tbody>${items.length ? items.map(row) : emptyRow(6, empty)}</tbody></table></div>`;

  setHTML(ctx.main, html`
    <div class="page-head"><div><h1>Contests</h1><div class="sub">ICPC-style rounds with live standings and rating changes</div></div>
      ${isStaff() ? html`<a class="btn primary" href="/admin/contest/new">New contest</a>` : ''}</div>
    ${data.running.length ? html`<div class="card"><div class="card-head"><h2>🔴 Running now</h2></div>${table(data.running, '')}</div>` : ''}
    <div class="card"><div class="card-head"><h2>Upcoming</h2></div>${table(data.upcoming, 'No upcoming contests scheduled.')}</div>
    <div class="card"><div class="card-head"><h2>Past contests</h2></div>${table(data.past, 'No past contests.')}</div>`);

  for (const b of $$('[data-register]')) {
    b.onclick = () => busy(b, async () => {
      await api.post(`/contests/${b.dataset.register}/register`);
      toast('Registered — good luck!', 'ok');
      ctx.reload();
    });
  }
  const onDone = () => setTimeout(() => !ctx.stale() && ctx.reload(), 1500);
  ctx.main.addEventListener('countdown-done', onDone, { once: true });
  ctx.onCleanup(() => ctx.main.removeEventListener('countdown-done', onDone));
}
