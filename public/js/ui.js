/* Rendering helpers. Everything interpolated through html`` is escaped unless wrapped in raw(). */

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s ?? ''));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderVal(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += renderVal(vals[i]) + strings[i + 1];
  return new Raw(out);
}
export const setHTML = (el, content) => { el.innerHTML = String(content); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------------------------------------------------------------- formatting */
export function rankClass(r) {
  if (r == null) return 'r-unrated';
  if (r >= 3000) return 'r-legend';
  if (r >= 2400) return 'r-red';
  if (r >= 2100) return 'r-orange';
  if (r >= 1900) return 'r-violet';
  if (r >= 1600) return 'r-blue';
  if (r >= 1400) return 'r-cyan';
  if (r >= 1200) return 'r-green';
  return 'r-gray';
}
export function rankTitle(r) {
  if (r == null) return 'Unrated';
  const t = [[3000, 'Legendary Grandmaster'], [2600, 'International Grandmaster'], [2400, 'Grandmaster'], [2300, 'International Master'],
    [2100, 'Master'], [1900, 'Candidate Master'], [1600, 'Expert'], [1400, 'Specialist'], [1200, 'Pupil'], [-Infinity, 'Newbie']];
  return t.find(([m]) => r >= m)[1];
}
export const userLink = (handle, rating) =>
  handle ? html`<a class="handle ${rankClass(rating)}" href="/profile/${encodeURIComponent(handle)}" title="${rankTitle(rating)}">${handle}</a>` : html`<span class="muted">—</span>`;

export function diffColor(d) {
  if (d == null) return 'muted';
  return rankClass(d);
}
export const diffBadge = (d) => (d == null ? html`<span class="faint">—</span>` : html`<span class="diff ${diffColor(d)}">${d}</span>`);

export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 0) return 'in the future';
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}
export const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const fmtDay = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');
export function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return d > 0 ? `${d}d ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
export const fmtMinutes = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
export const fmtMem = (kb) => (kb == null ? '—' : kb >= 10240 ? `${Math.round(kb / 1024)} MB` : `${kb} KB`);
export const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString());

const VERDICT_TEXT = {
  AC: 'Accepted', WA: 'Wrong answer', TLE: 'Time limit exceeded', MLE: 'Memory limit exceeded', RE: 'Runtime error',
  CE: 'Compilation error', OLE: 'Output limit exceeded', SE: 'Judgement failed',
};
export const VERDICTS = Object.keys(VERDICT_TEXT);
export const verdictName = (v) => VERDICT_TEXT[v] || v;

/** Verdict cell for a submission summary. */
export function verdictHtml(s) {
  if (s.status === 'frozen') return html`<span class="verdict pending">Pending (frozen)</span>`;
  if (s.status === 'queued') return html`<span class="verdict pending"><span class="spinner"></span> In queue</span>`;
  if (s.status === 'compiling') return html`<span class="verdict pending"><span class="spinner"></span> Compiling</span>`;
  if (s.status === 'running') return html`<span class="verdict pending"><span class="spinner"></span> Running on test ${(s.testsPassed ?? 0) + 1}</span>`;
  const onTest = s.failedTest && !['AC', 'CE', 'SE'].includes(s.verdict) ? ` on test ${s.failedTest}` : '';
  return html`<span class="verdict ${s.verdict}">${verdictName(s.verdict)}${onTest}</span>`;
}
export const isPending = (s) => ['queued', 'compiling', 'running'].includes(s.status);

/* ---------------------------------------------------------------- widgets */
export function pager(page, pages, hrefFor) {
  if (pages <= 1) return '';
  const nums = new Set([1, pages, page, page - 1, page + 1, page - 2, page + 2]);
  const list = [...nums].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const parts = [];
  if (page > 1) parts.push(html`<a href="${hrefFor(page - 1)}" aria-label="Previous page">‹</a>`);
  let prev = 0;
  for (const n of list) {
    if (n - prev > 1) parts.push(html`<span class="gap">…</span>`);
    parts.push(n === page ? html`<span class="cur">${n}</span>` : html`<a href="${hrefFor(n)}">${n}</a>`);
    prev = n;
  }
  if (page < pages) parts.push(html`<a href="${hrefFor(page + 1)}" aria-label="Next page">›</a>`);
  return html`<nav class="pager">${parts}</nav>`;
}

export function toast(message, kind = '') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 6000 : 3500);
}

export const errorBox = (e) => html`<div class="alert bad">${e?.message || e}</div>`;
export const emptyRow = (cols, text = 'Nothing here yet.') => html`<tr><td colspan="${cols}" class="empty">${text}</td></tr>`;

/** Serialize a form into a plain object (checkboxes -> booleans). */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

/** Disable a button while an async action runs; surfaces errors as toasts. */
export async function busy(btn, fn) {
  const label = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  try {
    return await fn();
  } catch (e) {
    toast(e.message || String(e), 'bad');
    return undefined;
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = label; }
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard', 'ok');
  } catch {
    toast('Copy failed', 'bad');
  }
}

/** Live countdowns: <span class="countdown" data-to="epochMs"></span> */
export function tickCountdowns(root = document) {
  for (const el of root.querySelectorAll('.countdown[data-to]')) {
    const left = Number(el.dataset.to) - Date.now();
    el.textContent = fmtDuration(left);
    if (left <= 0 && !el.dataset.fired) {
      el.dataset.fired = '1';
      el.dispatchEvent(new CustomEvent('countdown-done', { bubbles: true }));
    }
  }
}
