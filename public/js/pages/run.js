import { api } from '../api.js';
import { store } from '../app.js';
import { createEditor, prefs, TEMPLATES } from '../editor.js';
import { $, busy, fmtMem, html, setHTML } from '../ui.js';

/** Online IDE ("custom invocation"): run code against any input without submitting. */
export default async function run(ctx) {
  ctx.setTitle('Online IDE');
  const langs = store.meta.languages;
  setHTML(ctx.main, html`
    <div class="page-head"><div><h1>Online IDE</h1><div class="sub">Run code on your own input using the judge's sandbox (5 s, 256 MB).</div></div></div>
    ${!store.user ? html`<div class="alert info" style="margin-bottom:16px">Log in to run code. <a href="/login?next=/run">Log in</a></div>` : ''}
    <div class="layout-problem">
      <div class="card">
        <div class="card-head">
          <select id="lang" aria-label="Language" style="max-width:320px">${langs.map((l) => html`<option value="${l.id}">${l.name}${l.version ? ` — ${l.version}` : ''}</option>`)}</select>
          <button class="btn primary" id="runBtn" ${store.user ? '' : 'disabled'}>▶ Run</button>
        </div>
        <div class="editor-wrap tall" id="editor" style="border:0;border-radius:0"></div>
      </div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3>Input</h3></div><div class="card-body"><textarea id="stdin" rows="8" placeholder="stdin"></textarea></div></div>
        <div class="card"><div class="card-head"><h3>Output</h3><span id="meta" class="small muted"></span></div><div class="card-body" id="out"><span class="muted small">Run your code to see the output.</span></div></div>
      </div>
    </div>`);

  if (!langs.length) return;
  const sel = $('#lang');
  const saved = prefs.get('lang');
  if (saved && langs.some((l) => l.id === saved)) sel.value = saved;
  const key = () => `ide-${sel.value}`;
  const mode = () => langs.find((l) => l.id === sel.value)?.mode;
  const ed = createEditor($('#editor'), { value: prefs.get(key()) ?? TEMPLATES[sel.value] ?? '', mode: mode() });
  $('#stdin').value = prefs.get('ide-stdin') ?? '';
  let t;
  ed.onChange((v) => { clearTimeout(t); t = setTimeout(() => prefs.set(key(), v), 400); });
  $('#stdin').oninput = (e) => prefs.set('ide-stdin', e.target.value);
  sel.onchange = () => {
    prefs.set('lang', sel.value);
    ed.setMode(mode());
    ed.set(prefs.get(key()) ?? TEMPLATES[sel.value] ?? '');
  };

  $('#runBtn').onclick = (e) => busy(e.currentTarget, async () => {
    setHTML($('#out'), html`<span class="spinner"></span>`);
    $('#meta').textContent = '';
    const r = await api.post('/run', { language: sel.value, source: ed.get(), input: $('#stdin').value });
    if (r.compile.verdict !== 'OK') {
      $('#meta').textContent = r.compile.verdict === 'CE' ? 'Compilation error' : 'Judge error';
      setHTML($('#out'), html`<pre class="output-box bad">${r.compile.log}</pre>`);
      return;
    }
    const x = r.run;
    const label = { OK: 'Finished', TLE: 'Time limit exceeded', MLE: 'Memory limit exceeded', RE: `Runtime error (exit code ${x.exitCode})`, OLE: 'Output limit exceeded', SE: 'Judge error' }[x.status];
    $('#meta').textContent = `${label} · ${x.timeMs} ms · ${fmtMem(x.memoryKb)}`;
    setHTML($('#out'), html`<pre class="output-box">${x.output || ' '}</pre>${x.truncated ? html`<div class="small muted">Output truncated to 64 KB.</div>` : ''}
      ${x.stderr ? html`<div class="small muted" style="margin-top:8px">stderr</div><pre class="output-box bad">${x.stderr}</pre>` : ''}`);
  });
}
