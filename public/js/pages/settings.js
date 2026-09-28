import { api } from '../api.js';
import { store } from '../app.js';
import { $, busy, html, setHTML, toast } from '../ui.js';

export default async function settings(ctx) {
  ctx.setTitle('Settings');
  if (!store.user) return ctx.navigate('/login?next=/settings', { replace: true });
  const u = await api.get(`/users/${encodeURIComponent(store.user.handle)}`);
  if (ctx.stale()) return;

  setHTML(ctx.main, html`
    <div class="page-head"><h1>Settings</h1><a class="btn" href="/profile/${encodeURIComponent(u.handle)}">View profile</a></div>
    <div class="layout-2">
      <div class="stack">
        <form class="card" id="profileForm">
          <div class="card-head"><h3>Profile</h3></div>
          <div class="card-body stack">
            <div class="form-grid">
              <div class="field"><label for="c">Country</label><input id="c" name="country" type="text" maxlength="60" value="${u.country || ''}"></div>
              <div class="field"><label for="o">Organization</label><input id="o" name="organization" type="text" maxlength="100" value="${u.organization || ''}"></div>
            </div>
            <div class="field"><label for="b">About you</label><textarea id="b" name="bio" rows="3" maxlength="2000" style="font-family:var(--font)">${u.bio || ''}</textarea></div>
            <div class="field"><label for="cf">Codeforces handle</label><input id="cf" name="cfHandle" type="text" maxlength="40" value="${u.cfHandle || ''}">
              <span class="hint">Used to import your solved Codeforces problems into the archive tracker.</span></div>
            <div><button class="btn primary" id="saveProfile">Save profile</button></div>
          </div>
        </form>

        <form class="card" id="pwForm">
          <div class="card-head"><h3>Change password</h3></div>
          <div class="card-body stack">
            <div class="field"><label for="cur">Current password</label><input id="cur" name="current" type="password" autocomplete="current-password" required></div>
            <div class="form-grid">
              <div class="field"><label for="nw">New password</label><input id="nw" name="next" type="password" autocomplete="new-password" minlength="8" required></div>
              <div class="field"><label for="nw2">Repeat new password</label><input id="nw2" name="next2" type="password" autocomplete="new-password" required></div>
            </div>
            <div><button class="btn" id="savePw">Update password</button></div>
          </div>
        </form>
      </div>
      <aside class="card">
        <div class="card-head"><h3>Archive progress</h3></div>
        <div class="card-body stack">
          <p class="small muted" style="margin:0">You have marked <b>${u.archiveSolved}</b> archive problems as solved.</p>
          <p class="small muted" style="margin:0">Sync pulls every problem you have solved on Codeforces (via the public API) and marks it solved here.</p>
          <button class="btn" id="syncCf" ${u.cfHandle ? '' : 'disabled'}>Sync from Codeforces</button>
          <div id="syncOut" class="small"></div>
        </div>
      </aside>
    </div>`);

  $('#profileForm').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    busy($('#saveProfile'), async () => {
      await api.patch('/users/me', f);
      toast('Profile saved', 'ok');
      ctx.reload();
    });
  };
  $('#pwForm').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.next !== f.next2) return toast('New passwords do not match', 'bad');
    busy($('#savePw'), async () => {
      await api.post('/auth/password', { current: f.current, next: f.next });
      e.target.reset();
      toast('Password updated; other sessions were signed out', 'ok');
    });
  };
  $('#syncCf').onclick = (e) => busy(e.currentTarget, async () => {
    const r = await api.post('/users/me/sync-codeforces');
    setHTML($('#syncOut'), html`<div class="alert ok">Found ${r.solvedOnCodeforces} solved problems on Codeforces; marked ${r.marked} in the archive.</div>`);
  });
}
