import { api, qs } from '../api.js';
import { $, emptyRow, fmtNum, html, pager, rankClass, setHTML, userLink } from '../ui.js';

export default async function rankings(ctx) {
  ctx.setTitle('Rankings');
  const q = ctx.query;
  const by = q.by === 'solved' ? 'solved' : 'rating';
  const data = await api.get('/users/rankings', { by, page: q.page, q: q.q });
  if (ctx.stale()) return;

  setHTML(ctx.main, html`
    <div class="page-head"><div><h1>Rankings</h1><div class="sub">${fmtNum(data.total)} ${by === 'rating' ? 'rated users' : 'users with accepted solutions'}</div></div>
      <form id="search" class="row"><input type="search" name="q" placeholder="Find a handle" value="${q.q || ''}" aria-label="Find a handle" style="width:220px"><button class="btn">Search</button></form>
    </div>
    <nav class="tabs">
      <a href="/rankings${qs({ q: q.q })}" class="${by === 'rating' ? 'active' : ''}">By rating</a>
      <a href="/rankings${qs({ by: 'solved', q: q.q })}" class="${by === 'solved' ? 'active' : ''}">By problems solved</a>
    </nav>
    <div class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th style="width:60px">#</th><th>Who</th><th>Title</th><th class="num">Rating</th><th class="num">Max</th><th class="num">Contests</th><th class="num">Solved</th><th>Country</th></tr></thead>
      <tbody>${data.items.length ? data.items.map((u) => html`<tr>
        <td>${u.rank}</td>
        <td>${userLink(u.handle, u.rating)}${u.organization ? html`<div class="small faint">${u.organization}</div>` : ''}</td>
        <td class="small ${rankClass(u.rating)}">${u.title}</td>
        <td class="num"><b class="${rankClass(u.rating)}">${u.rating ?? '—'}</b></td>
        <td class="num ${rankClass(u.maxRating)}">${u.maxRating ?? '—'}</td>
        <td class="num">${u.contests}</td>
        <td class="num">${u.solved}</td>
        <td class="small">${u.country || ''}</td>
      </tr>`) : emptyRow(8, by === 'rating' ? 'Nobody is rated yet — ratings appear after the first rated contest.' : 'No accepted solutions yet.')}</tbody>
    </table></div>${pager(data.page, data.pages, (n) => `/rankings${qs({ by: by === 'solved' ? 'solved' : undefined, q: q.q, page: n })}`)}</div>`);

  $('#search').onsubmit = (e) => {
    e.preventDefault();
    ctx.setQuery({ by: by === 'solved' ? 'solved' : undefined, q: new FormData(e.target).get('q') });
  };
}
