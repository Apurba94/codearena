import { api, qs } from '../api.js';
import { store } from '../app.js';
import { $, diffBadge, emptyRow, fmtNum, html, pager, setHTML } from '../ui.js';

export default async function problems(ctx) {
  ctx.setTitle('Problems');
  const q = ctx.query;
  const tags = q.tags ? q.tags.split(',') : [];
  const [list, allTags] = await Promise.all([
    api.get('/problems', { page: q.page, q: q.q, tags: q.tags, minDiff: q.minDiff, maxDiff: q.maxDiff, status: q.status, sort: q.sort }),
    api.get('/problems/tags'),
  ]);
  if (ctx.stale()) return;

  const toggleTag = (t) => {
    const next = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t];
    return `/problems${qs({ ...q, tags: next, page: undefined })}`;
  };

  setHTML(ctx.main, html`
    <div class="page-head">
      <div><h1>Problemset</h1><div class="sub">${fmtNum(list.total)} problem${list.total === 1 ? '' : 's'} judged on CodeArena</div></div>
      <a class="btn" href="/archive">Browse the multi-judge archive →</a>
    </div>

    <div class="layout-2">
      <div class="card">
        <form class="card-body filters" id="filters">
          <div class="field wide"><label for="fq">Search</label><input id="fq" type="search" name="q" placeholder="Title or problem ID" value="${q.q || ''}"></div>
          <div class="field"><label for="fmin">Difficulty from</label><input id="fmin" type="number" name="minDiff" min="0" max="5000" step="100" value="${q.minDiff || ''}" placeholder="800"></div>
          <div class="field"><label for="fmax">to</label><input id="fmax" type="number" name="maxDiff" min="0" max="5000" step="100" value="${q.maxDiff || ''}" placeholder="3500"></div>
          ${store.user ? html`<div class="field"><label for="fst">Status</label><select id="fst" name="status">
            ${[['', 'Any'], ['unsolved', 'Unsolved'], ['attempted', 'Attempted'], ['solved', 'Solved']].map(([v, l]) => html`<option value="${v}" ${q.status === v ? 'selected' : ''}>${l}</option>`)}
          </select></div>` : ''}
          <div class="field"><label for="fsort">Sort</label><select id="fsort" name="sort">
            ${[['', 'ID'], ['id', 'Newest'], ['easy', 'Easiest'], ['hard', 'Hardest'], ['popular', 'Most solved'], ['title', 'Title']].map(([v, l]) => html`<option value="${v}" ${(q.sort || '') === v ? 'selected' : ''}>${l}</option>`)}
          </select></div>
          <button class="btn primary">Apply</button>
          ${Object.keys(q).length ? html`<a class="btn ghost" href="/problems">Reset</a>` : ''}
        </form>
        <div class="table-wrap"><table class="table">
          <thead><tr><th style="width:70px">#</th><th>Title</th><th class="num">Difficulty</th><th class="num">Solved</th><th class="num">Acceptance</th></tr></thead>
          <tbody>
            ${list.items.length ? list.items.map((p) => html`
              <tr class="${p.status === 'solved' ? 'solved-row' : p.status === 'attempted' ? 'tried-row' : ''}">
                <td class="mono"><a href="/problem/${p.code}">${p.code}</a></td>
                <td class="title-cell">
                  <a href="/problem/${p.code}">${p.title}</a> ${p.status === 'solved' ? html`<span class="ok" title="Solved">✓</span>` : ''}
                  <div class="chips">${p.tags.map((t) => html`<a class="tag" href="${toggleTag(t)}">${t}</a>`)}</div>
                </td>
                <td class="num">${diffBadge(p.difficulty)}</td>
                <td class="num"><a href="/status?problem=${p.code}&verdict=AC" title="Users who solved it">👤 ${fmtNum(p.solvedCount)}</a></td>
                <td class="num muted">${p.submissionCount ? `${Math.round((100 * p.acceptedCount) / p.submissionCount)}%` : '—'}</td>
              </tr>`) : emptyRow(5, 'No problems match these filters.')}
          </tbody>
        </table></div>
        ${pager(list.page, list.pages, (n) => `/problems${qs({ ...q, page: n })}`)}
      </div>

      <aside class="card sticky">
        <div class="card-head"><h3>Tags</h3>${tags.length ? html`<a class="small" href="/problems${qs({ ...q, tags: undefined, page: undefined })}">clear</a>` : ''}</div>
        <div class="card-body chips">
          ${allTags.map((t) => html`<a class="tag ${tags.includes(t.tag) ? 'active' : ''}" href="${toggleTag(t.tag)}">${t.tag} <span class="faint">${t.count}</span></a>`)}
        </div>
      </aside>
    </div>`);

  $('#filters').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    ctx.setQuery({ ...Object.fromEntries(f), tags: q.tags });
  };
}
