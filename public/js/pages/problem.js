import { api } from '../api.js';
import { isStaff, store } from '../app.js';
import { createEditor, prefs, TEMPLATES } from '../editor.js';
import { renderMarkdown } from '../markdown.js';
import {
  $, $$, busy, copyText, diffBadge, fmtMem, fmtNum, html, isPending, raw, setHTML, timeAgo, toast, verdictHtml,
} from '../ui.js';

export default async function problem(ctx) {
  const contestId = ctx.params.contest ? Number(ctx.params.contest) : null;
  const p = await api.get(`/problems/${encodeURIComponent(ctx.params.code)}`, { contest: contestId });
  if (ctx.stale()) return;
  const inContest = p.contest && p.contest.phase === 'running';
  ctx.setTitle(p.contest ? `${p.contest.label}. ${p.title}` : `${p.code}. ${p.title}`);
  const langs = store.meta.languages;
  const md = (s) => raw(renderMarkdown(s));

  setHTML(ctx.main, html`
    <div class="breadcrumb">
      ${p.contest
        ? html`<a href="/contest/${p.contest.id}">${p.contest.title}</a> › Problem ${p.contest.label}`
        : html`<a href="/problems">Problemset</a> › ${p.code}`}
    </div>
    <div class="layout-problem">
      <article class="card statement">
        <h1>${p.contest ? `${p.contest.label}. ` : ''}${p.title} ${p.myStatus === 'solved' ? html`<span class="badge ok">Solved</span>` : p.myStatus === 'attempted' ? html`<span class="badge bad">Attempted</span>` : ''}</h1>
        <div class="limits">
          <span>⏱ Time limit: <b>${p.timeLimitMs / 1000} s</b></span>
          <span>💾 Memory limit: <b>${p.memoryLimitMb} MB</b></span>
          <span>📥 Input: standard input</span>
          <span>📤 Output: standard output</span>
          ${p.visibility === 'hidden' ? html`<span class="badge warn">Hidden</span>` : ''}
        </div>
        <div class="md">${md(p.legend)}</div>
        ${p.inputSpec ? html`<h3>Input</h3><div class="md">${md(p.inputSpec)}</div>` : ''}
        ${p.outputSpec ? html`<h3>Output</h3><div class="md">${md(p.outputSpec)}</div>` : ''}
        ${p.samples.length ? html`<h3>Example${p.samples.length > 1 ? 's' : ''}</h3>
          <div class="samples">${p.samples.map((s, i) => html`
            <div class="sample">
              <div><div class="sh">Input <button class="copy-btn" data-copy="in" data-i="${i}">Copy</button></div><pre>${s.input}</pre></div>
              <div><div class="sh">Output <button class="copy-btn" data-copy="out" data-i="${i}">Copy</button></div><pre>${s.output}</pre></div>
            </div>`)}</div>` : ''}
        ${p.notes ? html`<h3>Note</h3><div class="md">${md(p.notes)}</div>` : ''}
      </article>

      <aside class="stack sticky">
        <div class="card">
          <div class="card-head"><h3>Submit solution</h3>
            ${store.user ? '' : html`<a class="small" href="/login?next=${encodeURIComponent(location.pathname)}">Log in to submit</a>`}</div>
          <div class="card-body stack">
            ${langs.length ? html`
              <div class="row">
                <select id="lang" class="grow" aria-label="Language">${langs.map((l) => html`<option value="${l.id}">${l.name}${l.version ? ` — ${l.version}` : ''}</option>`)}</select>
                <label class="btn sm" title="Load source from a file">📂<input type="file" id="file" hidden></label>
              </div>
              <div class="editor-wrap" id="editor"></div>
              <div class="row between">
                <button class="btn ghost sm" id="toggleRun">▸ Custom test</button>
                <button class="btn primary" id="submitBtn" ${store.user ? '' : 'disabled'}>Submit</button>
              </div>
              <div id="runBox" hidden class="stack">
                <div class="field"><label for="runIn">Input</label><textarea id="runIn" rows="4">${p.samples[0]?.input || ''}</textarea></div>
                <div class="row"><button class="btn sm" id="runBtn" ${store.user ? '' : 'disabled'}>Run</button><span id="runMeta" class="small muted"></span></div>
                <div id="runOut"></div>
              </div>` : html`<div class="alert bad">No judge languages are available right now.</div>`}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>My submissions</h3>${store.user ? html`<a class="small" href="/status?mine=1&problem=${p.code}">All →</a>` : ''}</div>
          <div id="mySubs">${store.user ? html`<div class="empty small"><span class="spinner"></span></div>` : html`<div class="empty small">Log in to see your submissions.</div>`}</div>
        </div>

        <div class="card card-body">
          <dl class="kv">
            <dt>Problem</dt><dd class="mono">${p.code}</dd>
            ${!inContest ? html`
              <dt>Difficulty</dt><dd>${diffBadge(p.difficulty)}</dd>
              <dt>Solved by</dt><dd><a href="/status?problem=${p.code}&verdict=AC">${fmtNum(p.solvedCount)} user${p.solvedCount === 1 ? '' : 's'}</a></dd>
              <dt>Acceptance</dt><dd>${p.submissionCount ? `${Math.round((100 * p.acceptedCount) / p.submissionCount)}% of ${fmtNum(p.submissionCount)}` : '—'}</dd>` : ''}
            ${p.source ? html`<dt>Source</dt><dd>${p.source}</dd>` : ''}
            ${p.checker !== 'tokens' ? html`<dt>Checker</dt><dd class="mono small">${p.checker}</dd>` : ''}
          </dl>
          ${p.tags.length ? html`<div class="chips" style="margin-top:10px">${p.tags.map((t) => html`<a class="tag" href="/problems?tags=${encodeURIComponent(t)}">${t}</a>`)}</div>` : ''}
          ${isStaff() ? html`<div style="margin-top:12px"><a class="btn sm" href="/admin/problem/${p.id}">Edit problem</a></div>` : ''}
        </div>
      </aside>
    </div>`);

  // sample copy buttons
  for (const b of $$('.copy-btn')) {
    b.onclick = () => copyText(p.samples[Number(b.dataset.i)][b.dataset.copy === 'in' ? 'input' : 'output']);
  }
  if (!langs.length) return;

  // ------------------------------------------------------------ editor
  const langSel = $('#lang');
  const saved = prefs.get('lang');
  if (saved && langs.some((l) => l.id === saved)) langSel.value = saved;
  const draftKey = () => `draft-${p.code}-${langSel.value}`;
  const langMode = () => langs.find((l) => l.id === langSel.value)?.mode;
  const editor = createEditor($('#editor'), { value: prefs.get(draftKey()) ?? TEMPLATES[langSel.value] ?? '', mode: langMode() });
  let saveTimer;
  editor.onChange((v) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => prefs.set(draftKey(), v), 400);
  });
  langSel.onchange = () => {
    prefs.set('lang', langSel.value);
    editor.setMode(langMode());
    editor.set(prefs.get(draftKey()) ?? TEMPLATES[langSel.value] ?? '');
  };
  $('#file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 65536) return toast('File is larger than 64 KB', 'bad');
    editor.set(await f.text());
    const ext = f.name.split('.').pop().toLowerCase();
    const match = langs.find((l) => l.ext === ext);
    if (match && match.id !== langSel.value) {
      langSel.value = match.id;
      editor.setMode(match.mode);
    }
  };

  // ------------------------------------------------------------ my submissions (live)
  let poll = null;
  async function loadMine() {
    if (!store.user) return;
    const data = await api.get('/submissions', { mine: 1, problem: p.code, pageSize: 8 });
    if (ctx.stale()) return;
    setHTML($('#mySubs'), data.items.length ? html`<table class="table compact"><tbody>
      ${data.items.map((s) => html`<tr>
        <td><a href="/submission/${s.id}" class="mono small">#${s.id}</a><div class="small faint">${timeAgo(s.createdAt)}</div></td>
        <td><a href="/submission/${s.id}">${verdictHtml(s)}</a><div class="small faint">${s.language}${s.timeMs != null ? ` · ${s.timeMs} ms · ${fmtMem(s.memoryKb)}` : ''}</div></td>
      </tr>`)}</tbody></table>` : html`<div class="empty small">No submissions yet.</div>`);
    clearTimeout(poll);
    if (data.items.some(isPending)) poll = setTimeout(loadMine, 1500);
  }
  ctx.onCleanup(() => clearTimeout(poll));
  loadMine();

  $('#submitBtn').onclick = (e) => busy(e.currentTarget, async () => {
    const source = editor.get();
    if (!source.trim()) return toast('Write some code first', 'bad');
    const r = await api.post('/submissions', { problem: p.code, language: langSel.value, source, contest: contestId || undefined });
    toast(`Submitted #${r.id}`, 'ok');
    await loadMine();
  });

  // ------------------------------------------------------------ custom test
  $('#toggleRun').onclick = (e) => {
    const box = $('#runBox');
    box.hidden = !box.hidden;
    e.currentTarget.textContent = `${box.hidden ? '▸' : '▾'} Custom test`;
  };
  $('#runBtn').onclick = (e) => busy(e.currentTarget, async () => {
    setHTML($('#runOut'), '');
    const r = await api.post('/run', { language: langSel.value, source: editor.get(), input: $('#runIn').value });
    if (r.compile.verdict !== 'OK') {
      $('#runMeta').textContent = r.compile.verdict === 'CE' ? 'Compilation error' : 'Judge error';
      setHTML($('#runOut'), html`<pre class="output-box">${r.compile.log}</pre>`);
      return;
    }
    const run = r.run;
    const statusText = { OK: 'OK', TLE: 'Time limit exceeded', MLE: 'Memory limit exceeded', RE: `Runtime error (exit ${run.exitCode})`, OLE: 'Output limit exceeded', SE: 'Judge error' }[run.status];
    $('#runMeta').textContent = `${statusText} · ${run.timeMs} ms · ${fmtMem(run.memoryKb)}`;
    setHTML($('#runOut'), html`
      <div class="small muted">Output${run.truncated ? ' (truncated)' : ''}</div><pre class="output-box">${run.output || ' '}</pre>
      ${run.stderr ? html`<div class="small muted" style="margin-top:6px">stderr</div><pre class="output-box bad">${run.stderr}</pre>` : ''}`);
  });
}
