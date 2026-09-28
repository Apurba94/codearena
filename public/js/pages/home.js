import { api } from '../api.js';
import { store } from '../app.js';
import { renderMarkdown } from '../markdown.js';
import { fmtDate, fmtNum, html, raw, setHTML, timeAgo, userLink, verdictHtml } from '../ui.js';

export default async function home(ctx) {
  ctx.setTitle('');
  const [data, meta] = await Promise.all([api.get('/home'), api.get('/meta')]);
  if (ctx.stale()) return;
  const s = meta.stats;

  setHTML(ctx.main, html`
    <section class="hero">
      <div>
        <h1>Sharpen your algorithms.</h1>
        <p>Solve ${fmtNum(s.problems)} judged problems, browse ${fmtNum(s.archive)} more from other judges, and compete in rated contests.</p>
      </div>
      <div class="row">
        <a class="btn" href="/problems">Start solving</a>
        <a class="btn outline" href="/contests">View contests</a>
      </div>
    </section>

    <div class="stats-strip">
      <div class="stat"><div class="v">${fmtNum(s.problems)}</div><div class="l">Judged problems</div></div>
      <div class="stat"><div class="v">${fmtNum(s.archive)}</div><div class="l">Archive problems</div></div>
      <div class="stat"><div class="v">${fmtNum(s.users)}</div><div class="l">Registered users</div></div>
      <div class="stat"><div class="v">${fmtNum(s.submissions)}</div><div class="l">Submissions</div></div>
      <div class="stat"><div class="v">${store.meta.languages.length}</div><div class="l">Languages</div></div>
    </div>

    <div class="layout-2">
      <div class="stack">
        ${data.announcements.length ? data.announcements.map((a) => html`
          <article class="card">
            <div class="card-head"><h2>${a.pinned ? '📌 ' : ''}${a.title}</h2><span class="small muted">${fmtDate(a.createdAt)}</span></div>
            <div class="card-body md">${raw(renderMarkdown(a.body))}</div>
            <div class="card-body small muted" style="padding-top:0">By ${userLink(a.author, a.authorRating)}</div>
          </article>`) : html`<div class="card card-body empty">No announcements yet.</div>`}

        <div class="card">
          <div class="card-head"><h3>Recent submissions</h3><a class="small" href="/status">All →</a></div>
          <div class="table-wrap"><table class="table compact">
            <tbody>${data.recent.length ? data.recent.map((r) => html`<tr>
              <td class="small muted nowrap">${timeAgo(r.createdAt)}</td>
              <td>${userLink(r.handle, r.rating)}</td>
              <td><a href="/problem/${r.problem.code}">${r.problem.title}</a></td>
              <td><a href="/submission/${r.id}">${verdictHtml(r)}</a></td>
            </tr>`) : html`<tr><td class="empty">No submissions yet — be the first!</td></tr>`}</tbody>
          </table></div>
        </div>
      </div>

      <aside class="stack">
        <div class="card">
          <div class="card-head"><h3>Upcoming contests</h3><a class="small" href="/contests">All →</a></div>
          <div class="card-body">
            ${data.contests.length ? data.contests.map((c) => html`
              <div style="margin-bottom:12px">
                <a href="/contest/${c.id}"><b>${c.title}</b></a>
                <div class="small muted">${fmtDate(c.startAt)} · ${Math.floor(c.durationMin / 60)}h ${c.durationMin % 60}m ${c.rated ? '· rated' : ''}</div>
                <div class="small">${c.phase === 'running'
                  ? html`<span class="phase running">Running</span> — ends in <span class="countdown" data-to="${c.endAt}"></span>`
                  : html`Starts in <span class="countdown" data-to="${c.startAt}"></span>`}</div>
              </div>`) : html`<p class="muted small" style="margin:0">No contests scheduled.</p>`}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Top rated</h3><a class="small" href="/rankings">Rankings →</a></div>
          <table class="table compact"><tbody>
            ${data.topRated.length ? data.topRated.map((u, i) => html`<tr><td class="muted">${i + 1}</td><td>${userLink(u.handle, u.rating)}</td><td class="num">${u.rating}</td></tr>`)
              : html`<tr><td class="empty small">No rated users yet.</td></tr>`}
          </tbody></table>
        </div>

        <div class="card">
          <div class="card-head"><h3>Top solvers</h3><a class="small" href="/rankings?by=solved">More →</a></div>
          <table class="table compact"><tbody>
            ${data.topSolvers.length ? data.topSolvers.map((u, i) => html`<tr><td class="muted">${i + 1}</td><td>${userLink(u.handle, u.rating)}</td><td class="num">${u.solved_count}</td></tr>`)
              : html`<tr><td class="empty small">Nobody has solved anything yet.</td></tr>`}
          </tbody></table>
        </div>
      </aside>
    </div>`);
}
