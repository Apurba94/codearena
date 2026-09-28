import { store } from '../app.js';
import { html, setHTML } from '../ui.js';

export default async function about(ctx) {
  ctx.setTitle('About');
  const api = [
    ['GET', '/api/problems', 'List problems (q, tags, minDiff, maxDiff, status, sort, page)'],
    ['GET', '/api/problems/:code', 'Problem statement, limits and samples'],
    ['POST', '/api/submissions', 'Submit { problem, language, source, contest? }'],
    ['GET', '/api/submissions', 'Status list (user, problem, verdict, language, contest, mine)'],
    ['GET', '/api/submissions/:id', 'Submission detail with per-test results'],
    ['POST', '/api/run', 'Custom invocation { language, source, input }'],
    ['GET', '/api/contests', 'Running / upcoming / past contests'],
    ['GET', '/api/contests/:id/standings', 'ICPC standings'],
    ['GET', '/api/users/:handle', 'Profile, rating history, activity'],
    ['GET', '/api/users/rankings', 'Rankings (by=rating|solved)'],
    ['GET', '/api/archive', 'Multi-judge archive search (source, q, tags, minDiff, maxDiff, sort)'],
    ['GET', '/api/meta', 'Site stats and judge languages'],
  ];
  setHTML(ctx.main, html`
    <div class="page-head"><h1>About CodeArena</h1></div>
    <div class="layout-2">
      <div class="stack">
        <div class="card card-body md">
          <p><b>CodeArena</b> is an online judge. Submissions are compiled and executed in a sandbox with CPU-time, memory,
          output-size and process limits, then compared with the expected answers by a checker.</p>
          <h3>Verdicts</h3>
          <ul>
            <li><b class="verdict AC">Accepted</b> — passed every test.</li>
            <li><b class="verdict WA">Wrong answer</b> — the output differs from the expected answer.</li>
            <li><b class="verdict TLE">Time limit exceeded</b> — used more CPU time than allowed.</li>
            <li><b class="verdict MLE">Memory limit exceeded</b> — used more memory than allowed.</li>
            <li><b class="verdict RE">Runtime error</b> — crashed or exited with a non-zero code.</li>
            <li><b class="verdict CE">Compilation error</b> — did not compile; it does not count as an attempt.</li>
            <li><b class="verdict OLE">Output limit exceeded</b> — printed too much.</li>
          </ul>
          <p>Judging stops at the first failed test. Read from standard input and write to standard output. In Java the class must be named <code>Main</code>.</p>
          <h3>Contests & rating</h3>
          <p>Contests use ICPC rules. After a rated contest the Elo-style rating system moves each participant towards the rating that
          would predict their actual place: beating stronger opponents gains more.</p>
        </div>
        <div class="card"><div class="card-head"><h3>JSON API</h3><span class="small muted">Mutating calls need the header <code>X-Requested-With: CodeArena</code> and a session cookie</span></div>
          <div class="table-wrap"><table class="table compact"><tbody>
            ${api.map(([m, p, d]) => html`<tr><td><span class="badge ${m === 'GET' ? 'info' : 'warn'}">${m}</span></td><td class="mono small">${p}</td><td class="small">${d}</td></tr>`)}
          </tbody></table></div></div>
      </div>
      <aside class="card"><div class="card-head"><h3>Judge languages</h3></div><div class="card-body">
        ${store.meta.languages.length ? store.meta.languages.map((l) => html`<div style="margin-bottom:8px"><b>${l.name}</b><div class="small muted mono">${l.version || ''}</div></div>`) : html`<span class="muted">None available.</span>`}
      </div></aside>
    </div>`);
}
