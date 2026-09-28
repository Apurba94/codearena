import { api, qs } from '../api.js';
import { store } from '../app.js';
import { $, emptyRow, fmtDate, fmtMem, fmtNum, html, isPending, pager, setHTML, timeAgo, userLink, verdictHtml, verdictName, VERDICTS } from '../ui.js';

/** Submission table, reused by the contest page. */
export function submissionRows(items, { showContestLabel = false } = {}) {
  return items.length ? items.map((s) => html`<tr>
    <td class="mono"><a href="/submission/${s.id}">${s.id}</a></td>
    <td class="small nowrap" title="${fmtDate(s.createdAt)}">${timeAgo(s.createdAt)}</td>
    <td>${userLink(s.handle, s.rating)}</td>
    <td class="title-cell"><a href="${showContestLabel && s.contestId ? `/contest/${s.contestId}/problem/${s.problem.code}` : `/problem/${s.problem.code}`}">${showContestLabel && s.label ? `${s.label}. ` : ''}${s.problem.title}</a></td>
    <td class="small">${s.language}</td>
    <td><a href="/submission/${s.id}">${verdictHtml(s)}</a></td>
    <td class="num small">${s.timeMs != null ? `${s.timeMs} ms` : ''}</td>
    <td class="num small">${s.memoryKb != null ? fmtMem(s.memoryKb) : ''}</td>
  </tr>`) : emptyRow(8, 'No submissions found.');
}
export const submissionHead = html`<thead><tr><th>#</th><th>When</th><th>Who</th><th>Problem</th><th>Lang</th><th>Verdict</th><th class="num">Time</th><th class="num">Memory</th></tr></thead>`;

export default async function status(ctx) {
  ctx.setTitle('Status');
  const q = ctx.query;
  let timer = null;
  ctx.onCleanup(() => clearTimeout(timer));

  async function load() {
    const data = await api.get('/submissions', {
      page: q.page, user: q.user, problem: q.problem, verdict: q.verdict, language: q.language, mine: q.mine,
    });
    if (ctx.stale()) return;
    setHTML($('#statusBody'), submissionRows(data.items));
    setHTML($('#statusPager'), pager(data.page, data.pages, (n) => `/status${qs({ ...q, page: n })}`));
    $('#statusCount').textContent = `${fmtNum(data.total)} submission${data.total === 1 ? '' : 's'}`;
    clearTimeout(timer);
    // live refresh: fast while something is being judged, slow otherwise (first page only)
    if (!q.page || q.page === '1') timer = setTimeout(load, data.items.some(isPending) ? 1500 : 10000);
  }

  setHTML(ctx.main, html`
    <div class="page-head"><div><h1>${q.mine ? 'My submissions' : 'Status'}</h1><div class="sub" id="statusCount"></div></div></div>
    <div class="card">
      <form class="card-body filters" id="filters">
        <div class="field"><label for="fu">User</label><input id="fu" type="text" name="user" value="${q.user || ''}" placeholder="handle"></div>
        <div class="field"><label for="fp">Problem</label><input id="fp" type="text" name="problem" value="${q.problem || ''}" placeholder="e.g. 1001"></div>
        <div class="field"><label for="fv">Verdict</label><select id="fv" name="verdict"><option value="">Any</option>
          ${VERDICTS.map((v) => html`<option value="${v}" ${q.verdict === v ? 'selected' : ''}>${verdictName(v)}</option>`)}</select></div>
        <div class="field"><label for="fl">Language</label><select id="fl" name="language"><option value="">Any</option>
          ${store.meta.languages.map((l) => html`<option value="${l.id}" ${q.language === l.id ? 'selected' : ''}>${l.name}</option>`)}</select></div>
        ${store.user ? html`<label class="check"><input type="checkbox" name="mine" value="1" ${q.mine ? 'checked' : ''}> Only mine</label>` : ''}
        <button class="btn primary">Filter</button>
        ${Object.keys(q).length ? html`<a class="btn ghost" href="/status">Reset</a>` : ''}
      </form>
      <div class="table-wrap"><table class="table">${submissionHead}<tbody id="statusBody"><tr><td colspan="8" class="empty"><span class="spinner"></span></td></tr></tbody></table></div>
      <div id="statusPager"></div>
    </div>`);

  $('#filters').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    ctx.setQuery(f);
  };
  await load();
}
