import { api } from '../api.js';
import { isStaff, store } from '../app.js';
import { createEditor } from '../editor.js';
import { $, busy, copyText, fmtDate, fmtMem, html, isPending, setHTML, toast, userLink, verdictHtml, verdictName } from '../ui.js';

export default async function submission(ctx) {
  const id = Number(ctx.params.id);
  let timer = null;
  let editorMounted = false;
  ctx.onCleanup(() => clearTimeout(timer));
  ctx.setTitle(`Submission #${id}`);

  async function load() {
    const s = await api.get(`/submissions/${id}`);
    if (ctx.stale()) return;
    const lang = store.meta.languages.find((l) => l.id === s.language);
    const problemHref = s.contestId ? `/contest/${s.contestId}/problem/${s.problem.code}` : `/problem/${s.problem.code}`;

    const header = html`
      <div class="page-head">
        <div><h1>Submission #${s.id}</h1><div class="sub">${fmtDate(s.createdAt)}</div></div>
        <div class="row">
          ${isStaff() ? html`<button class="btn" id="rejudgeBtn">Rejudge</button>` : ''}
          <a class="btn" href="${problemHref}">Back to problem</a>
        </div>
      </div>
      <div class="card"><div class="table-wrap"><table class="table">
        <thead><tr><th>Author</th><th>Problem</th><th>Language</th><th>Verdict</th><th class="num">Time</th><th class="num">Memory</th><th class="num">Size</th></tr></thead>
        <tbody><tr>
          <td>${userLink(s.handle, s.rating)}</td>
          <td><a href="${problemHref}">${s.label ? `${s.label}. ` : `${s.problem.code}. `}${s.problem.title}</a></td>
          <td>${lang?.name || s.language}</td>
          <td>${verdictHtml(s)}</td>
          <td class="num">${s.timeMs != null ? `${s.timeMs} ms` : '—'}</td>
          <td class="num">${fmtMem(s.memoryKb)}</td>
          <td class="num">${s.sourceLen} B</td>
        </tr></tbody>
      </table></div></div>`;

    const tests = s.tests.length ? html`
      <div class="card"><div class="card-head"><h3>Tests</h3><span class="small muted">${s.testsPassed ?? 0} / ${s.totalTests} passed · limits ${s.limits.timeMs} ms, ${s.limits.memoryMb} MB</span></div>
        <div class="table-wrap"><table class="table compact">
          <thead><tr><th>Test</th><th>Verdict</th><th class="num">Time</th><th class="num">Memory</th><th>Checker comment</th></tr></thead>
          <tbody>${s.tests.map((t) => html`<tr>
            <td>${t.test}${t.sample ? html` <span class="badge info">sample</span>` : ''}</td>
            <td><span class="verdict ${t.verdict}">${verdictName(t.verdict)}</span></td>
            <td class="num">${t.timeMs} ms</td>
            <td class="num">${fmtMem(t.memoryKb)}</td>
            <td class="small mono">${t.message || ''}${t.stderr ? html`<pre class="output-box bad" style="margin-top:4px">${t.stderr}</pre>` : ''}</td>
          </tr>`)}</tbody>
        </table></div></div>` : '';

    const compile = s.compileLog ? html`
      <div class="card"><div class="card-head"><h3>${s.verdict === 'CE' ? 'Compilation error' : 'Compiler output'}</h3></div>
      <div class="card-body"><pre class="output-box">${s.compileLog}</pre></div></div>` : '';

    const source = s.canViewSource ? html`
      <div class="card"><div class="card-head"><h3>Source code</h3><button class="btn sm" id="copySrc">Copy</button></div>
      <div class="editor-wrap auto" id="srcView" style="border:0;border-radius:0"></div></div>`
      : html`<div class="card card-body muted small">The source code is visible to its author, and to users who have solved this problem (after the contest).</div>`;

    if (!editorMounted) {
      setHTML(ctx.main, html`<div id="subHeader"></div><div class="stack" style="margin-top:16px"><div id="subTests"></div><div id="subCompile"></div>${source}</div>`);
      if (s.canViewSource) {
        createEditor($('#srcView'), { value: s.source, mode: lang?.mode || 'text/plain', readOnly: true });
        $('#copySrc').onclick = () => copyText(s.source);
      }
      editorMounted = true;
    }
    setHTML($('#subHeader'), header);
    setHTML($('#subTests'), tests);
    setHTML($('#subCompile'), compile);
    const rj = $('#rejudgeBtn');
    if (rj) {
      rj.onclick = () => busy(rj, async () => {
        await api.post(`/admin/submissions/${s.id}/rejudge`);
        toast('Queued for rejudge', 'ok');
        load();
      });
    }
    clearTimeout(timer);
    if (isPending(s)) timer = setTimeout(load, 1200);
  }
  await load();
}
