import { api } from '../api.js';
import { renderUserbox, store } from '../app.js';
import { $, busy, html, setHTML, toast } from '../ui.js';

export default async function auth(ctx) {
  const register = ctx.path.startsWith('/register');
  ctx.setTitle(register ? 'Register' : 'Log in');
  const next = ctx.query.next && ctx.query.next.startsWith('/') && !ctx.query.next.startsWith('//') ? ctx.query.next : '/';
  if (store.user) return ctx.navigate(next, { replace: true });

  setHTML(ctx.main, html`
    <div class="card auth-card">
      <div class="card-head"><h2>${register ? 'Create your account' : 'Welcome back'}</h2></div>
      <form class="card-body stack" id="authForm" novalidate>
        <div id="authErr"></div>
        ${register ? html`
          <div class="field"><label for="h">Handle</label><input id="h" name="handle" type="text" autocomplete="username" required minlength="3" maxlength="24">
            <span class="hint">3–24 characters: letters, digits, _ . -  (shown publicly)</span></div>
          <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="new-password" required minlength="8">
            <span class="hint">At least 8 characters</span></div>
          <div class="field"><label for="pw2">Confirm password</label><input id="pw2" name="password2" type="password" autocomplete="new-password" required></div>`
        : html`
          <div class="field"><label for="lg">Handle or email</label><input id="lg" name="login" type="text" autocomplete="username" required></div>
          <div class="field"><label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div>`}
        <button class="btn primary" id="authBtn">${register ? 'Register' : 'Log in'}</button>
        <p class="small muted center" style="margin:0">${register
          ? html`Already have an account? <a href="/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}">Log in</a>`
          : html`New here? <a href="/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}">Create an account</a>`}</p>
      </form>
    </div>`);

  $('#authForm').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    setHTML($('#authErr'), '');
    if (register && f.password !== f.password2) {
      setHTML($('#authErr'), html`<div class="alert bad">Passwords do not match.</div>`);
      return;
    }
    busy($('#authBtn'), async () => {
      try {
        const r = register
          ? await api.post('/auth/register', { handle: f.handle, email: f.email, password: f.password })
          : await api.post('/auth/login', { login: f.login, password: f.password });
        store.user = r.user;
        renderUserbox();
        toast(register ? `Welcome to CodeArena, ${r.user.handle}!` : `Welcome back, ${r.user.handle}`, 'ok');
        ctx.navigate(next, { replace: true });
      } catch (err) {
        setHTML($('#authErr'), html`<div class="alert bad">${err.message}</div>`);
      }
    });
  };
  $(register ? '#h' : '#lg').focus();
}
