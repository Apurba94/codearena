import { api, qs } from '../api.js';
import { isAdmin, isStaff, store } from '../app.js';
import { createEditor, TEMPLATES } from '../editor.js';
import { renderMarkdown } from '../markdown.js';
import {
  $, $$, busy, emptyRow, fmtDate, fmtNum, formData, html, pager, raw, setHTML, timeAgo, toast, userLink, verdictName,
} from '../ui.js';

const SECTIONS = [['', 'Dashboard'], ['problems', 'Problems'], ['contests', 'Contests'], ['users', 'Users', true], ['archive', 'Archive', true], ['news', 'Announcements', true]];

export default async function admin(ctx) {
  if (!isStaff()) {
    setHTML(ctx.main, html`<div class="card card-body empty">You need setter or admin rights to open the admin panel.</div>`);
    return;
  }
  const section = ctx.params.section || '';
  ctx.setTitle('Admin');
  const nav = html`<div class="admin-nav">${SECTIONS.filter(([, , adminOnly]) => !adminOnly || isAdmin()).map(([k, l]) => html`
    <a class="btn sm ${section === k || (section === 'problem' && k === 'problems') || (section === 'contest' && k === 'contests') ? 'primary' : ''}" href="/admin${k ? `/${k}` : ''}">${l}</a>`)}</div>`;
  setHTML(ctx.main, html`<div class="page-head"><h1>Admin panel</h1></div>${nav}<div id="adminBody"><div class="loading-page"><span class="spinner"></span></div></div>`);
  const body = $('#adminBody');
  const views = { '': dashboard, problems, problem: problemEditor, contests, contest: contestEditor, users, archive, news };
  await (views[section] || (() => setHTML(body, html`<div class="card card-body empty">Unknown section.</div>`)))(ctx, body);
}

/* ================================================================ dashboard */
async function dashboard(ctx, body) {
  const s = await api.get('/admin/system');
  if (ctx.stale()) return;
  const queued = s.queue.reduce((a, x) => a + x.n, 0);
  setHTML(body, html`
    <div class="stats-strip">
      <div class="stat"><div class="v">${queued}</div><div class="l">In judge queue</div></div>
      <div class="stat"><div class="v">${fmtNum(s.submissions24h)}</div><div class="l">Submissions (24 h)</div></div>
      <div class="stat"><div class="v">${fmtNum(s.problems)}</div><div class="l">Problems</div></div>
      <div class="stat"><div class="v">${fmtNum(s.users)}</div><div class="l">Users</div></div>
    </div>
    <div class="layout-2">
      <div class="card"><div class="card-head"><h3>Judge nodes</h3><span class="small muted">heartbeat every 30 s</span></div>
        <div class="table-wrap"><table class="table compact">
          <thead><tr><th>Node</th><th>Platform</th><th class="num">Workers</th><th class="num">Busy</th><th>Languages</th><th>Isolation</th><th>Last seen</th></tr></thead>
          <tbody>${s.nodes.length ? s.nodes.map((n) => html`<tr><td class="mono small">${n.node}</td><td class="small">${n.platform}</td>
            <td class="num">${n.workers}</td><td class="num">${n.active}</td><td class="small">${n.languages.map((l) => l.name).join(', ')}</td>
            <td class="small">${isolationBadges(n.isolation)}</td><td class="small">${timeAgo(n.lastSeen)}</td></tr>`)
            : emptyRow(7, 'No judge node is online. Start the server with JUDGE_EMBEDDED=true or run `npm run judge`.')}</tbody>
        </table></div></div>
      <div class="card"><div class="card-head"><h3>Verdicts (24 h)</h3></div><div class="card-body">
        ${s.verdicts24h.length ? s.verdicts24h.map((v) => html`<div class="row between small"><span class="verdict ${v.verdict}">${verdictName(v.verdict)}</span><b>${v.n}</b></div>`) : html`<span class="muted small">No judged submissions in the last day.</span>`}
      </div></div>
    </div>`);
}

function isolationBadges(iso = {}) {
  if (!iso.uidPerWorker) return html`<span class="badge warn" title="Submissions run as the server's own user. Fine for development only.">dev mode</span>`;
  return html`<span class="badge ok">own uid</span> ${iso.network ? html`<span class="badge ok">no network</span>` : html`<span class="badge warn" title="The host does not allow network namespaces; submissions can open sockets.">network open</span>`}`;
}

/* ================================================================ problems */
async function problems(ctx, body) {
  const q = ctx.query;
  const data = await api.get('/admin/problems', { q: q.q, page: q.page });
  if (ctx.stale()) return;
  setHTML(body, html`
    <div class="card">
      <div class="card-head">
        <form id="pSearch" class="row"><input type="search" name="q" value="${q.q || ''}" placeholder="Search problems" aria-label="Search problems" style="width:240px"><button class="btn sm">Search</button></form>
        <a class="btn primary sm" href="/admin/problem/new">+ New problem</a>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Code</th><th>Title</th><th>Visibility</th><th class="num">Difficulty</th><th class="num">Tests</th><th class="num">Solved</th><th>Author</th><th></th></tr></thead>
        <tbody>${data.items.length ? data.items.map((p) => html`<tr>
          <td class="mono">${p.code}</td><td><a href="/admin/problem/${p.id}">${p.title}</a></td>
          <td>${p.visibility === 'public' ? html`<span class="badge ok">public</span>` : html`<span class="badge warn">hidden</span>`}</td>
          <td class="num">${p.difficulty ?? '—'}</td><td class="num ${p.tests ? '' : 'bad'}">${p.tests}</td><td class="num">${p.solved_count}</td>
          <td class="small">${p.author || '—'}</td>
          <td class="right nowrap"><a class="btn sm" href="/problem/${p.code}">View</a> <a class="btn sm" href="/admin/problem/${p.id}">Edit</a></td>
        </tr>`) : emptyRow(8, 'No problems yet.')}</tbody>
      </table></div>
      ${pager(data.page, data.pages, (n) => `/admin/problems${qs({ ...q, page: n })}`)}
    </div>`);
  $('#pSearch').onsubmit = (e) => { e.preventDefault(); ctx.setQuery({ q: new FormData(e.target).get('q') }); };
}

async function problemEditor(ctx, body) {
  const isNew = ctx.params.id === 'new';
  const p = isNew
    ? { code: '', title: '', legend: '', inputSpec: '', outputSpec: '', notes: '', timeLimitMs: 1000, memoryLimitMb: 256, checker: 'tokens', difficulty: null, source: '', visibility: 'hidden', tags: [], tests: [] }
    : await api.get(`/admin/problems/${ctx.params.id}`);
  if (ctx.stale()) return;
  const mdField = (name, label, rows, hint = '') => html`<div class="field"><label for="f-${name}">${label}</label>
    <textarea id="f-${name}" name="${name}" rows="${rows}" style="font-family:var(--mono)">${p[name]}</textarea>${hint ? html`<span class="hint">${hint}</span>` : ''}</div>`;

  setHTML(body, html`
    <div class="breadcrumb"><a href="/admin/problems">Problems</a> › ${isNew ? 'New problem' : `${p.code}. ${p.title}`}</div>
    <form class="card" id="pForm">
      <div class="card-head"><h2>${isNew ? 'New problem' : 'Statement & limits'}</h2>
        <div class="row">${!isNew ? html`<a class="btn sm" href="/problem/${p.code}">View</a>` : ''}<button type="button" class="btn sm" id="previewBtn">Preview</button><button class="btn sm primary" id="saveBtn">Save</button></div></div>
      <div class="card-body stack">
        <div class="form-grid">
          <div class="field"><label for="f-code">Code</label><input id="f-code" name="code" type="text" required value="${p.code}" placeholder="1041"></div>
          <div class="field" style="grid-column: span 2"><label for="f-title">Title</label><input id="f-title" name="title" type="text" required value="${p.title}"></div>
          <div class="field"><label for="f-vis">Visibility</label><select id="f-vis" name="visibility">
            <option value="hidden" ${p.visibility === 'hidden' ? 'selected' : ''}>Hidden</option><option value="public" ${p.visibility === 'public' ? 'selected' : ''}>Public</option></select></div>
        </div>
        <div class="form-grid">
          <div class="field"><label for="f-tl">Time limit (ms)</label><input id="f-tl" name="timeLimitMs" type="number" min="100" max="20000" value="${p.timeLimitMs}"></div>
          <div class="field"><label for="f-ml">Memory limit (MB)</label><input id="f-ml" name="memoryLimitMb" type="number" min="16" max="2048" value="${p.memoryLimitMb}"></div>
          <div class="field"><label for="f-chk">Checker</label><input id="f-chk" name="checker" type="text" value="${p.checker}" list="checkers">
            <datalist id="checkers"><option value="tokens"><option value="tokens-ci"><option value="lines"><option value="exact"><option value="float:1e-6"><option value="float:1e-9"></datalist></div>
          <div class="field"><label for="f-diff">Difficulty</label><input id="f-diff" name="difficulty" type="number" min="0" max="5000" step="100" value="${p.difficulty ?? ''}"></div>
        </div>
        <div class="form-grid">
          <div class="field"><label for="f-tags">Tags</label><input id="f-tags" name="tags" type="text" value="${p.tags.join(', ')}" placeholder="dp, graphs"></div>
          <div class="field"><label for="f-src">Source</label><input id="f-src" name="source" type="text" value="${p.source || ''}"></div>
        </div>
        ${mdField('legend', 'Legend', 8, 'Markdown with $inline$ and $$display$$ TeX math')}
        ${mdField('inputSpec', 'Input format', 4)}
        ${mdField('outputSpec', 'Output format', 3)}
        ${mdField('notes', 'Notes', 3)}
        <div id="preview" class="md card card-body" hidden></div>
      </div>
    </form>
    ${isNew ? '' : html`<div id="testsCard" class="stack" style="margin-top:16px"></div>`}`);

  $('#previewBtn').onclick = () => {
    const f = formData($('#pForm'));
    const pv = $('#preview');
    pv.hidden = !pv.hidden;
    setHTML(pv, raw(renderMarkdown(`## ${f.title}\n\n${f.legend}\n\n### Input\n\n${f.inputSpec}\n\n### Output\n\n${f.outputSpec}${f.notes ? `\n\n### Note\n\n${f.notes}` : ''}`)));
  };
  $('#pForm').onsubmit = (e) => {
    e.preventDefault();
    const f = formData(e.target);
    f.tags = f.tags.split(',').map((t) => t.trim()).filter(Boolean);
    busy($('#saveBtn'), async () => {
      const r = isNew ? await api.post('/admin/problems', f) : await api.put(`/admin/problems/${p.id}`, f);
      toast('Problem saved', 'ok');
      if (isNew) ctx.navigate(`/admin/problem/${r.id}`, { replace: true });
    });
  };
  if (!isNew) renderTests(ctx, p);
}

function renderTests(ctx, p) {
  const box = $('#testsCard');
  const langs = store.meta.languages;
  setHTML(box, html`
    <div class="card">
      <div class="card-head"><h2>Tests (${p.tests.length})</h2>
        <div class="row"><button class="btn sm" id="rejudgeBtn">Rejudge all submissions</button>${isAdmin() ? html`<button class="btn sm danger" id="delProblem">Delete problem</button>` : ''}</div></div>
      <div class="table-wrap"><table class="table compact">
        <thead><tr><th>#</th><th>Sample</th><th class="num">Input</th><th class="num">Output</th><th></th></tr></thead>
        <tbody>${p.tests.length ? p.tests.map((t) => html`<tr>
          <td>${t.idx}</td>
          <td><input type="checkbox" data-sample="${t.idx}" ${t.is_sample ? 'checked' : ''} aria-label="Sample test ${t.idx}"></td>
          <td class="num small">${fmtNum(t.input_size)} B</td><td class="num small ${t.output_size ? '' : 'bad'}">${fmtNum(t.output_size)} B</td>
          <td class="right nowrap"><button class="btn sm" data-view="${t.idx}">View</button> <button class="btn sm danger" data-del="${t.idx}">Delete</button></td>
        </tr>`) : emptyRow(5, 'No tests yet — add some below.')}</tbody>
      </table></div>
      <div id="testView"></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Add tests</h3></div>
      <div class="card-body stack">
        <div class="test-io">
          <div class="field"><label for="tin">Input</label><textarea id="tin" rows="6"></textarea></div>
          <div class="field"><label for="tout">Expected output <span class="hint">(leave empty to generate from a reference solution)</span></label><textarea id="tout" rows="6"></textarea></div>
        </div>
        <div class="row"><label class="check"><input type="checkbox" id="tsample"> Sample (shown in the statement)</label><button class="btn primary sm" id="addTest">Add test</button></div>
        <hr style="margin:4px 0">
        <div class="dropzone" id="drop">Drop test files here, or <label class="btn sm">choose files<input type="file" id="tfiles" multiple hidden></label>
          <div class="small">Pairs are matched by name: <code>1.in</code> + <code>1.out</code> (or <code>.ans</code>). Files without an answer become input-only tests.</div></div>
        <label class="check"><input type="checkbox" id="treplace"> Replace all existing tests</label>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Generate expected outputs from a reference solution</h3><button class="btn primary sm" id="genBtn">Run & write answers</button></div>
      <div class="card-body stack">
        <select id="genLang" aria-label="Reference solution language" style="max-width:320px">${langs.map((l) => html`<option value="${l.id}">${l.name}</option>`)}</select>
        <div class="editor-wrap" id="genEditor"></div>
        <div id="genOut"></div>
      </div>
    </div>`);

  const refresh = async () => {
    const fresh = await api.get(`/admin/problems/${p.id}`);
    if (!ctx.stale()) renderTests(ctx, fresh);
  };
  for (const cb of $$('[data-sample]', box)) {
    cb.onchange = () => busy(null, async () => { await api.patch(`/admin/problems/${p.id}/tests/${cb.dataset.sample}`, { isSample: cb.checked }); toast('Updated', 'ok'); });
  }
  for (const b of $$('[data-del]', box)) {
    b.onclick = () => busy(b, async () => {
      if (!confirm(`Delete test ${b.dataset.del}? Later tests are renumbered.`)) return;
      await api.del(`/admin/problems/${p.id}/tests/${b.dataset.del}`);
      await refresh();
    });
  }
  for (const b of $$('[data-view]', box)) {
    b.onclick = () => busy(b, async () => {
      const t = await api.get(`/admin/problems/${p.id}/tests/${b.dataset.view}`);
      setHTML($('#testView'), html`<div class="card-body test-io">
        <div><div class="small muted">Input #${t.idx}</div><pre class="output-box">${t.input}</pre></div>
        <div><div class="small muted">Output #${t.idx}</div><pre class="output-box">${t.output}</pre></div></div>`);
    });
  }
  $('#addTest').onclick = (e) => busy(e.currentTarget, async () => {
    if (!$('#tin').value) return toast('Input is empty', 'bad');
    await api.post(`/admin/problems/${p.id}/tests`, { tests: [{ input: $('#tin').value, output: $('#tout').value, isSample: $('#tsample').checked }] });
    toast('Test added', 'ok');
    await refresh();
  });

  const upload = (files) => busy(null, async () => {
    const byName = new Map();
    for (const f of files) {
      const m = /^(.*?)\.(in|out|ans|a)$/i.exec(f.name) || [null, f.name, 'in'];
      const key = m[1];
      const kind = m[2].toLowerCase() === 'in' ? 'input' : 'output';
      if (!byName.has(key)) byName.set(key, {});
      byName.get(key)[kind] = await f.text();
    }
    const tests = [...byName.entries()]
      .filter(([, v]) => v.input != null)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([, v]) => ({ input: v.input, output: v.output ?? '' }));
    if (!tests.length) return toast('No input files found (.in)', 'bad');
    await api.post(`/admin/problems/${p.id}/tests`, { tests, replace: $('#treplace').checked });
    toast(`Uploaded ${tests.length} test(s)`, 'ok');
    await refresh();
  });
  $('#tfiles').onchange = (e) => upload([...e.target.files]);
  const drop = $('#drop');
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); upload([...e.dataTransfer.files]); };

  const genLang = $('#genLang');
  const genEd = langs.length ? createEditor($('#genEditor'), { value: TEMPLATES[genLang.value] || '', mode: langs[0].mode }) : null;
  genLang.onchange = () => { genEd.setMode(langs.find((l) => l.id === genLang.value).mode); genEd.set(TEMPLATES[genLang.value] || ''); };
  $('#genBtn').onclick = (e) => busy(e.currentTarget, async () => {
    try {
      const r = await api.post(`/admin/problems/${p.id}/generate-answers`, { language: genLang.value, source: genEd.get() });
      toast(`Wrote ${r.report.length} answers`, 'ok');
      setHTML($('#genOut'), html`<div class="alert ok">All ${r.report.length} tests ran successfully (max ${Math.max(...r.report.map((x) => x.timeMs))} ms).</div>`);
      setTimeout(refresh, 800);
    } catch (err) {
      setHTML($('#genOut'), html`<div class="alert bad">${err.message}</div>`);
    }
  });
  $('#rejudgeBtn').onclick = (e) => busy(e.currentTarget, async () => {
    if (!confirm('Re-queue every submission to this problem?')) return;
    const r = await api.post(`/admin/problems/${p.id}/rejudge`);
    toast(`Requeued ${r.requeued} submission(s)`, 'ok');
  });
  $('#delProblem')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    if (!confirm(`Permanently delete problem ${p.code} with all its tests and submissions?`)) return;
    await api.del(`/admin/problems/${p.id}`);
    toast('Problem deleted', 'ok');
    ctx.navigate('/admin/problems');
  }));
}

/* ================================================================ contests */
async function contests(ctx, body) {
  const data = await api.get('/contests');
  if (ctx.stale()) return;
  const all = [...data.running, ...data.upcoming, ...data.past];
  setHTML(body, html`<div class="card">
    <div class="card-head"><h2>Contests</h2><a class="btn primary sm" href="/admin/contest/new">+ New contest</a></div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Title</th><th>Start</th><th>Status</th><th class="num">Participants</th><th>Rating</th><th></th></tr></thead>
      <tbody>${all.length ? all.map((c) => html`<tr>
        <td><a href="/contest/${c.id}">${c.title}</a> ${c.visibility === 'hidden' ? html`<span class="badge warn">hidden</span>` : ''}</td>
        <td class="small">${fmtDate(c.startAt)}</td><td><span class="phase ${c.phase}">${c.phase}</span></td><td class="num">${c.participants}</td>
        <td>${c.rated ? (c.ratingsApplied ? html`<span class="badge info">applied</span>` : html`<span class="badge">rated</span>`) : html`<span class="faint small">unrated</span>`}</td>
        <td class="right"><a class="btn sm" href="/admin/contest/${c.id}">Edit</a></td></tr>`) : emptyRow(6, 'No contests yet.')}</tbody>
    </table></div></div>`);
}

const toLocalInput = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

async function contestEditor(ctx, body) {
  const isNew = ctx.params.id === 'new';
  const c = isNew
    ? { title: '', description: '', startAt: Math.ceil((Date.now() + 86400_000) / 3600_000) * 3600_000, durationMin: 120, freezeMin: 0, penaltyMin: 20, rated: true, visibility: 'public', problems: [] }
    : await api.get(`/admin/contests/${ctx.params.id}`);
  if (ctx.stale()) return;
  setHTML(body, html`
    <div class="breadcrumb"><a href="/admin/contests">Contests</a> › ${isNew ? 'New contest' : c.title}</div>
    <form class="card" id="cForm">
      <div class="card-head"><h2>${isNew ? 'New contest' : 'Edit contest'}</h2>
        <div class="row">${!isNew ? html`<a class="btn sm" href="/contest/${c.id}">Open</a>` : ''}<button class="btn primary sm" id="cSave">Save</button></div></div>
      <div class="card-body stack">
        <div class="field"><label for="c-title">Title</label><input id="c-title" name="title" type="text" required value="${c.title}"></div>
        <div class="form-grid">
          <div class="field"><label for="c-start">Start (your local time)</label><input id="c-start" name="start" type="datetime-local" required value="${toLocalInput(c.startAt)}"></div>
          <div class="field"><label for="c-dur">Duration (minutes)</label><input id="c-dur" name="durationMin" type="number" min="5" value="${c.durationMin}"></div>
          <div class="field"><label for="c-frz">Freeze before end (min)</label><input id="c-frz" name="freezeMin" type="number" min="0" value="${c.freezeMin}"></div>
          <div class="field"><label for="c-pen">Penalty per wrong try (min)</label><input id="c-pen" name="penaltyMin" type="number" min="0" value="${c.penaltyMin}"></div>
          <div class="field"><label for="c-vis">Visibility</label><select id="c-vis" name="visibility"><option value="public" ${c.visibility === 'public' ? 'selected' : ''}>Public</option><option value="hidden" ${c.visibility === 'hidden' ? 'selected' : ''}>Hidden</option></select></div>
        </div>
        <label class="check"><input type="checkbox" name="rated" ${c.rated ? 'checked' : ''}> Rated</label>
        <div class="field"><label for="c-desc">Description (markdown)</label><textarea id="c-desc" name="description" rows="4">${c.description}</textarea></div>
        <div class="field"><label for="c-probs">Problems — one per line: <code>LABEL CODE</code></label>
          <textarea id="c-probs" name="problems" rows="6" placeholder="A 1001&#10;B 1005&#10;C 1014">${c.problems.map((p) => `${p.label} ${p.code}`).join('\n')}</textarea>
          <span class="hint">Problems in an unfinished contest are hidden from the public problemset until the contest ends.</span></div>
      </div>
    </form>
    ${!isNew && isAdmin() ? html`<div class="card card-body row" style="margin-top:16px">
      ${c.phase === 'finished' && c.rated && !c.ratingsApplied ? html`<button class="btn primary" id="applyR">Apply rating changes</button>` : ''}
      ${c.ratingsApplied ? html`<button class="btn" id="rollR">Roll back rating changes</button>` : ''}
      <span class="grow"></span><button class="btn danger" id="delC">Delete contest</button></div>` : ''}`);

  $('#cForm').onsubmit = (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const payload = {
      title: f.title, description: f.description, startAt: new Date(f.start).getTime(), durationMin: f.durationMin,
      freezeMin: f.freezeMin ?? 0, penaltyMin: f.penaltyMin ?? 20, rated: f.rated, visibility: f.visibility,
    };
    const probs = f.problems.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [label, code] = l.split(/\s+/);
      return code ? { label, code } : { code: label };
    });
    busy($('#cSave'), async () => {
      const id = isNew ? (await api.post('/admin/contests', payload)).id : c.id;
      if (!isNew) await api.put(`/admin/contests/${id}`, payload);
      await api.put(`/admin/contests/${id}/problems`, { problems: probs });
      toast('Contest saved', 'ok');
      if (isNew) ctx.navigate(`/admin/contest/${id}`, { replace: true });
    });
  };
  $('#applyR')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    const r = await api.post(`/admin/contests/${c.id}/ratings`);
    toast(`Updated ${r.applied} ratings`, 'ok');
    ctx.reload();
  }));
  $('#rollR')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    if (!confirm('Revert every rating change from this contest?')) return;
    await api.del(`/admin/contests/${c.id}/ratings`);
    toast('Ratings rolled back', 'ok');
    ctx.reload();
  }));
  $('#delC')?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
    if (!confirm('Delete this contest? Its submissions stay but lose the contest link.')) return;
    await api.del(`/admin/contests/${c.id}`);
    ctx.navigate('/admin/contests');
  }));
}

/* ================================================================ users */
async function users(ctx, body) {
  const q = ctx.query;
  const data = await api.get('/admin/users', { q: q.q, page: q.page });
  if (ctx.stale()) return;
  setHTML(body, html`<div class="card">
    <div class="card-head"><form id="uSearch" class="row"><input type="search" name="q" value="${q.q || ''}" placeholder="Handle or email" aria-label="Search users" style="width:240px"><button class="btn sm">Search</button></form>
      <span class="small muted">${fmtNum(data.total)} users</span></div>
    <div class="table-wrap"><table class="table compact">
      <thead><tr><th>ID</th><th>Handle</th><th>Email</th><th>Role</th><th class="num">Rating</th><th class="num">Solved</th><th>Joined</th><th>Last seen</th><th></th></tr></thead>
      <tbody>${data.items.map((u) => html`<tr>
        <td>${u.id}</td><td>${userLink(u.handle, u.rating)}</td><td class="small">${u.email}</td>
        <td><select data-role="${u.id}" aria-label="Role of ${u.handle}">${['user', 'setter', 'admin'].map((r) => html`<option ${u.role === r ? 'selected' : ''}>${r}</option>`)}</select></td>
        <td class="num">${u.rating ?? '—'}</td><td class="num">${u.solved_count}</td><td class="small">${fmtDate(u.created_at)}</td><td class="small">${u.last_seen_at ? timeAgo(u.last_seen_at) : '—'}</td>
        <td><button class="btn sm ${u.banned ? '' : 'danger'}" data-ban="${u.id}" data-banned="${u.banned ? 1 : 0}">${u.banned ? 'Unban' : 'Ban'}</button></td>
      </tr>`)}</tbody></table></div>
    ${pager(data.page, data.pages, (n) => `/admin/users${qs({ ...q, page: n })}`)}</div>`);
  $('#uSearch').onsubmit = (e) => { e.preventDefault(); ctx.setQuery({ q: new FormData(e.target).get('q') }); };
  for (const s of $$('[data-role]', body)) {
    s.onchange = () => busy(null, async () => { await api.patch(`/admin/users/${s.dataset.role}`, { role: s.value }); toast('Role updated', 'ok'); });
  }
  for (const b of $$('[data-ban]', body)) {
    b.onclick = () => busy(b, async () => {
      const ban = b.dataset.banned !== '1';
      if (ban && !confirm('Ban this user? They will be logged out.')) return;
      await api.patch(`/admin/users/${b.dataset.ban}`, { banned: ban });
      ctx.reload();
    });
  }
}

/* ================================================================ archive */
async function archive(ctx, body) {
  const sources = await api.get('/admin/archive');
  if (ctx.stale()) return;
  let timer = null;
  ctx.onCleanup(() => clearTimeout(timer));
  setHTML(body, html`
    <div class="card"><div class="card-head"><h2>Archive sources</h2><span class="small muted">Metadata only — statements stay on the original judges</span></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Source</th><th class="num">Problems</th><th>Last sync</th><th>Result</th><th></th></tr></thead>
        <tbody>${sources.map((s) => html`<tr>
          <td><b>${s.name}</b>${s.home ? html` <a class="small" href="${s.home}" target="_blank" rel="noopener noreferrer">↗</a>` : ''}</td>
          <td class="num">${fmtNum(s.count)}</td>
          <td class="small">${s.lastSync ? fmtDate(s.lastSync.started_at) : 'never'}</td>
          <td class="small">${s.syncing || s.lastSync?.status === 'running' ? html`<span class="spinner"></span> syncing…`
            : s.lastSync ? (s.lastSync.status === 'ok' ? html`<span class="ok">✓ ${fmtNum(s.lastSync.imported)} imported</span>` : html`<span class="bad" title="${s.lastSync.message}">✗ ${s.lastSync.message}</span>`) : ''}</td>
          <td class="right">${s.home ? html`<button class="btn sm" data-sync="${s.key}" ${s.syncing ? 'disabled' : ''}>Sync now</button>` : ''}</td>
        </tr>`)}</tbody></table></div></div>

    <div class="card"><div class="card-head"><h3>Import a custom list</h3></div>
      <div class="card-body stack">
        <p class="small muted" style="margin:0">Paste a JSON array to add problems from any judge (e.g. SPOJ or LightOJ lists you maintain):
        <code>[{"external_id":"TEST","title":"Life, the Universe, and Everything","url":"https://…","difficulty":800,"tags":["implementation"]}]</code></p>
        <div class="form-grid"><div class="field"><label for="impSrc">Source key</label><input id="impSrc" type="text" placeholder="spoj" pattern="[a-z0-9_-]{2,32}"></div></div>
        <textarea id="impJson" rows="6" placeholder="[ … ]"></textarea>
        <div><button class="btn primary sm" id="impBtn">Import</button></div>
      </div></div>`);

  for (const b of $$('[data-sync]', body)) {
    b.onclick = () => busy(b, async () => {
      await api.post('/admin/archive/sync', { source: b.dataset.sync });
      toast('Sync started', 'ok');
      timer = setTimeout(() => !ctx.stale() && ctx.reload(), 2500);
    });
  }
  if (sources.some((s) => s.syncing)) timer = setTimeout(() => !ctx.stale() && ctx.reload(), 3000);
  $('#impBtn').onclick = (e) => busy(e.currentTarget, async () => {
    let items;
    try { items = JSON.parse($('#impJson').value); } catch { throw new Error('Invalid JSON'); }
    const r = await api.post('/admin/archive/import', { source: $('#impSrc').value.trim(), items });
    toast(`Imported ${r.imported} problems`, 'ok');
    ctx.reload();
  });
}

/* ================================================================ announcements */
async function news(ctx, body) {
  const home = await api.get('/home');
  if (ctx.stale()) return;
  setHTML(body, html`
    <form class="card" id="nForm"><div class="card-head"><h2>New announcement</h2><button class="btn primary sm" id="nBtn">Publish</button></div>
      <div class="card-body stack">
        <div class="field"><label for="n-title">Title</label><input id="n-title" name="title" type="text" required></div>
        <div class="field"><label for="n-body">Body (markdown)</label><textarea id="n-body" name="body" rows="6" required></textarea></div>
        <label class="check"><input type="checkbox" name="pinned"> Pin to the top</label>
      </div></form>
    <div class="card"><div class="card-head"><h3>Published</h3></div>
      <table class="table"><tbody>${home.announcements.length ? home.announcements.map((a) => html`<tr>
        <td>${a.pinned ? '📌 ' : ''}<b>${a.title}</b><div class="small muted">${fmtDate(a.createdAt)}</div></td>
        <td class="right"><button class="btn sm danger" data-delnews="${a.id}">Delete</button></td></tr>`) : emptyRow(2, 'None.')}</tbody></table></div>`);
  $('#nForm').onsubmit = (e) => {
    e.preventDefault();
    const f = formData(e.target);
    busy($('#nBtn'), async () => { await api.post('/admin/announcements', f); toast('Published', 'ok'); ctx.reload(); });
  };
  for (const b of $$('[data-delnews]', body)) {
    b.onclick = () => busy(b, async () => {
      if (!confirm('Delete this announcement?')) return;
      await api.del(`/admin/announcements/${b.dataset.delnews}`);
      ctx.reload();
    });
  }
}
