import { api } from './api.js';
import { $, errorBox, html, rankClass, setHTML, tickCountdowns, toast } from './ui.js';

/* ---------------------------------------------------------------- global state */
export const store = { user: null, meta: { languages: [], siteName: 'CodeArena' } };
export const isStaff = () => store.user && (store.user.role === 'admin' || store.user.role === 'setter');
export const isAdmin = () => store.user?.role === 'admin';

const ROUTES = [
  ['/', 'home', 'home'],
  ['/problems', 'problems', 'problems'],
  ['/problem/:code', 'problem', 'problems'],
  ['/contest/:contest/problem/:code', 'problem', 'contests'],
  ['/status', 'status', 'status'],
  ['/submission/:id', 'submission', 'status'],
  ['/contests', 'contests', 'contests'],
  ['/contest/:id', 'contest', 'contests'],
  ['/contest/:id/:tab', 'contest', 'contests'],
  ['/rankings', 'rankings', 'rankings'],
  ['/profile/:handle', 'profile', ''],
  ['/settings', 'settings', ''],
  ['/archive', 'archive', 'archive'],
  ['/run', 'run', 'run'],
  ['/login', 'auth', ''],
  ['/register', 'auth', ''],
  ['/about', 'about', ''],
  ['/admin', 'admin', 'admin'],
  ['/admin/:section', 'admin', 'admin'],
  ['/admin/:section/:id', 'admin', 'admin'],
].map(([pattern, page, nav]) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
  return { re, keys, page, nav };
});

let cleanups = [];
let navSeq = 0;
const main = () => document.getElementById('main');

export function navigate(url, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  route();
}

async function route() {
  const seq = ++navSeq;
  for (const fn of cleanups.splice(0)) try { fn(); } catch { /* ignore */ }
  const path = location.pathname;
  const query = Object.fromEntries(new URLSearchParams(location.search));
  let match = null;
  for (const r of ROUTES) {
    const m = r.re.exec(path);
    if (m) {
      match = { ...r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
      break;
    }
  }
  for (const a of document.querySelectorAll('.mainnav a')) a.classList.toggle('active', !!match && a.dataset.nav === match.nav);
  document.getElementById('mainnav').classList.remove('open');

  const el = main();
  if (!match) {
    setHTML(el, html`<div class="card card-body empty"><h1>404</h1><p>This page does not exist.</p><a class="btn" href="/">Go home</a></div>`);
    document.title = `Not found · ${store.meta.siteName}`;
    return;
  }
  const ctx = {
    main: el,
    params: match.params,
    query,
    path,
    navigate,
    reload: () => navigate(location.pathname + location.search, { replace: true }),
    stale: () => seq !== navSeq,
    onCleanup: (fn) => cleanups.push(fn),
    setTitle: (t) => { document.title = t ? `${t} · ${store.meta.siteName}` : `${store.meta.siteName} Online Judge`; },
    /** Replace the query string without a full re-render history entry. */
    setQuery: (q, { push = true } = {}) => {
      const s = new URLSearchParams();
      for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '' && v !== false) s.set(k, Array.isArray(v) ? v.join(',') : v);
      const url = `${path}${s.toString() ? `?${s}` : ''}`;
      navigate(url, { replace: !push });
    },
  };
  if (!el.firstElementChild || !el.dataset.keep) setHTML(el, html`<div class="loading-page"><span class="spinner"></span></div>`);
  try {
    const mod = await import(`./pages/${match.page}.js`);
    if (seq !== navSeq) return;
    await mod.default(ctx);
  } catch (e) {
    if (seq !== navSeq) return;
    console.error(e);
    if (e.status === 401) {
      setHTML(el, html`<div class="card card-body auth-card"><h2>Please log in</h2><p class="muted">${e.message}</p><a class="btn primary" href="/login?next=${encodeURIComponent(location.pathname + location.search)}">Log in</a></div>`);
    } else {
      setHTML(el, html`<div class="card card-body">${errorBox(e)}</div>`);
    }
  }
}

/* ---------------------------------------------------------------- chrome */
export function renderUserbox() {
  const box = document.getElementById('userbox');
  document.getElementById('navAdmin').hidden = !isStaff();
  const u = store.user;
  if (!u) {
    setHTML(box, html`<a class="btn sm ghost" href="/login">Log in</a><a class="btn sm primary" href="/register">Register</a>`);
    return;
  }
  setHTML(box, html`
    <button class="usermenu-btn" id="umBtn" aria-haspopup="true" aria-expanded="false">
      <span class="handle ${rankClass(u.rating)}">${u.handle}</span><span class="faint">▾</span>
    </button>
    <div class="usermenu" id="um" hidden>
      <a href="/profile/${encodeURIComponent(u.handle)}">Profile</a>
      <a href="/status?mine=1">My submissions</a>
      <a href="/settings">Settings</a>
      ${isStaff() ? html`<a href="/admin">Admin panel</a>` : ''}
      <hr style="margin:4px 0">
      <button id="logoutBtn">Log out</button>
    </div>`);
  const btn = $('#umBtn');
  const menu = $('#um');
  btn.onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  };
  $('#logoutBtn').onclick = async () => {
    await api.post('/auth/logout');
    store.user = null;
    renderUserbox();
    toast('Logged out');
    navigate('/');
  };
}

export async function refreshUser() {
  const { user } = await api.get('/auth/me');
  store.user = user;
  renderUserbox();
}

function setupTheme() {
  const btn = document.getElementById('themeBtn');
  btn.onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme')
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('ca-theme', next); } catch { /* ignore */ }
  };
}

function interceptLinks() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/') || href.startsWith('/vendor/')) return;
    e.preventDefault();
    if (href === location.pathname + location.search) return;
    navigate(href);
    window.scrollTo(0, 0);
  });
  window.addEventListener('popstate', route);
  document.addEventListener('click', () => { const m = document.getElementById('um'); if (m) m.hidden = true; });
  document.getElementById('navToggle').onclick = () => document.getElementById('mainnav').classList.toggle('open');
}

async function boot() {
  document.getElementById('year').textContent = new Date().getFullYear();
  setupTheme();
  interceptLinks();
  setInterval(() => tickCountdowns(), 1000);
  try {
    const [me, meta] = await Promise.all([api.get('/auth/me'), api.get('/meta')]);
    store.user = me.user;
    store.meta = meta;
    const langs = meta.languages.map((l) => l.name).join(', ');
    document.getElementById('serverInfo').textContent = langs ? `Judge languages: ${langs}` : 'No judge languages available';
  } catch (e) {
    toast(e.message, 'bad');
  }
  renderUserbox();
  route();
}

boot();
