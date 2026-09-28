import { api, qs } from '../api.js';
import { isAdmin, store } from '../app.js';
import { $, $$, busy, diffBadge, emptyRow, fmtNum, html, pager, setHTML } from '../ui.js';

const srcClass = (s) => (['codeforces', 'atcoder', 'uva', 'cses'].includes(s) ? `src-${s}` : 'src-other');

export default async function archive(ctx) {
  ctx.setTitle('Problem archive');
  const q = ctx.query;
  const tags = q.tags ? q.tags.split(',') : [];
  const params = {
    source: q.source, q: q.q, tags: q.tags, category: q.category, minDiff: q.minDiff, maxDiff: q.maxDiff, status: q.status, sort: q.sort, page: q.page,
  };
  const [sources, list, popTags, categories] = await Promise.all([
    api.get('/archive/sources'),
    api.get('/archive', params),
    api.get('/archive/tags'),
    q.source ? api.get('/archive/categories', { source: q.source }) : Promise.resolve([]),
  ]);
  if (ctx.stale()) return;
  const total = sources.reduce((s, x) => s + x.count, 0);
  const href = (patch) => `/archive${qs({ ...q, page: undefined, ...patch })}`;
  const toggleTag = (t) => href({ tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] });
  const hasDiff = !q.source || ['codeforces', 'atcoder'].includes(q.source);

  setHTML(ctx.main, html`
    <div class="page-head">
      <div><h1>Problem archive</h1>
        <div class="sub">${fmtNum(total)} problems indexed from other online judges. Statements open on the original site — solve there, track progress here.</div></div>
      <div class="row">
        <button class="btn" id="randomBtn" title="Pick a random problem matching the filters">🎲 Random problem</button>
        ${isAdmin() ? html`<a class="btn" href="/admin/archive">Manage sources</a>` : ''}
      </div>
    </div>

    <nav class="tabs">
      <a href="${href({ source: undefined, category: undefined })}" class="${!q.source ? 'active' : ''}">All<span class="count">${fmtNum(total)}</span></a>
      ${sources.filter((s) => s.count > 0).map((s) => html`<a href="${href({ source: s.key, category: undefined })}" class="${q.source === s.key ? 'active' : ''}">${s.name}<span class="count">${fmtNum(s.count)}</span></a>`)}
    </nav>

    <div id="randomOut"></div>
    ${total === 0 ? html`<div class="alert info" style="margin-bottom:16px">The archive is empty. ${isAdmin() ? html`Import problems from <a href="/admin/archive">Admin → Archive</a>` : 'An administrator needs to import it'} (or run <code>npm run import</code>).</div>` : ''}

    <div class="card">
      <form class="card-body filters" id="filters">
        <div class="field wide"><label for="aq">Search</label><input id="aq" type="search" name="q" value="${q.q || ''}" placeholder="Title, problem ID or contest"></div>
        ${categories.length ? html`<div class="field"><label for="acat">Category</label><select id="acat" name="category"><option value="">All</option>
          ${categories.map((c) => html`<option value="${c.category}" ${q.category === c.category ? 'selected' : ''}>${c.category} (${c.count})</option>`)}</select></div>` : ''}
        ${hasDiff ? html`
          <div class="field"><label for="amin">Difficulty from</label><input id="amin" type="number" name="minDiff" step="100" min="0" max="5000" value="${q.minDiff || ''}" placeholder="800"></div>
          <div class="field"><label for="amax">to</label><input id="amax" type="number" name="maxDiff" step="100" min="0" max="5000" value="${q.maxDiff || ''}" placeholder="3500"></div>` : ''}
        ${store.user ? html`<div class="field"><label for="ast">My status</label><select id="ast" name="status">
          ${[['', 'Any'], ['unsolved', 'Not solved'], ['solved', 'Solved'], ['todo', 'To-do list']].map(([v, l]) => html`<option value="${v}" ${(q.status || '') === v ? 'selected' : ''}>${l}</option>`)}</select></div>` : ''}
        <div class="field"><label for="asort">Sort</label><select id="asort" name="sort">
          ${[['popular', 'Most solved'], ['easy', 'Easiest'], ['hard', 'Hardest'], ['newest', 'Newest contest'], ['title', 'Title']].map(([v, l]) => html`<option value="${v}" ${(q.sort || 'popular') === v ? 'selected' : ''}>${l}</option>`)}</select></div>
        <button class="btn primary">Apply</button>
        ${Object.keys(q).length ? html`<a class="btn ghost" href="/archive">Reset</a>` : ''}
      </form>
      <div class="card-body" style="padding-top:0">
        <div class="chips">${popTags.slice(0, 40).map((t) => html`<a class="tag ${tags.includes(t.tag) ? 'active' : ''}" href="${toggleTag(t.tag)}">${t.tag}</a>`)}</div>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Source</th><th>ID</th><th>Title</th><th class="num">Difficulty</th><th class="num">Solved by</th>${store.user ? html`<th class="center">Track</th>` : ''}</tr></thead>
        <tbody>${list.items.length ? list.items.map((p) => html`
          <tr class="${p.myStatus === 'solved' ? 'solved-row' : ''}">
            <td><span class="src ${srcClass(p.source)}">${sources.find((s) => s.key === p.source)?.name.split(' ')[0] || p.source}</span></td>
            <td class="mono small nowrap">${p.externalId}</td>
            <td class="title-cell">
              <a href="${p.url}" target="_blank" rel="noopener noreferrer">${p.title} ↗</a>
              <div class="chips">${p.category ? html`<span class="tag">${p.category}</span>` : ''}${p.tags.filter((t) => t !== p.category?.toLowerCase()).map((t) => html`<a class="tag" href="${toggleTag(t)}">${t}</a>`)}</div>
            </td>
            <td class="num">${diffBadge(p.difficulty)}</td>
            <td class="num small">${fmtNum(p.solvedCount)}</td>
            ${store.user ? html`<td class="center nowrap">
              <button class="mark-btn solved ${p.myStatus === 'solved' ? 'on' : ''}" data-id="${p.id}" data-mark="solved" title="Mark as solved">✓</button>
              <button class="mark-btn todo ${p.myStatus === 'todo' ? 'on' : ''}" data-id="${p.id}" data-mark="todo" title="Add to to-do list">★</button>
            </td>` : ''}
          </tr>`) : emptyRow(6, 'No problems match these filters.')}</tbody>
      </table></div>
      ${pager(list.page, list.pages, (n) => `/archive${qs({ ...q, page: n })}`)}
    </div>
    <p class="small faint">Problem names and links belong to their respective judges; CodeArena stores only metadata (title, tags, difficulty, solve counts) from their public APIs.</p>`);

  $('#filters').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    ctx.setQuery({ ...f, source: q.source, tags: q.tags });
  };
  $('#randomBtn').onclick = (e) => busy(e.currentTarget, async () => {
    const p = await api.get('/archive/random', params);
    setHTML($('#randomOut'), html`<div class="alert info row between" style="margin-bottom:16px">
      <span>🎲 <span class="src ${srcClass(p.source)}">${p.source}</span> <b>${p.externalId}</b> — ${p.title} ${p.difficulty ? html`(${p.difficulty})` : ''}</span>
      <a class="btn sm primary" href="${p.url}" target="_blank" rel="noopener noreferrer">Open problem ↗</a></div>`);
  });
  for (const b of $$('.mark-btn')) {
    b.onclick = () => busy(null, async () => {
      const on = b.classList.contains('on');
      const status = on ? null : b.dataset.mark;
      await api.put(`/archive/${b.dataset.id}/status`, { status });
      const row = b.closest('tr');
      for (const x of row.querySelectorAll('.mark-btn')) x.classList.toggle('on', x.dataset.mark === status);
      row.classList.toggle('solved-row', status === 'solved');
    });
  }
}
