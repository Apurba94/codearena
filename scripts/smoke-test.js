#!/usr/bin/env node
/**
 * End-to-end smoke test against an isolated temporary instance:
 * seeds a few problems into a throw-away DATA_DIR, boots the server with an embedded judge,
 * then drives the public HTTP API through a full contest lifecycle.
 *
 *   npm run smoke                 # web server with an embedded judge
 *   SMOKE_SPLIT=1 npm run smoke   # web without a judge + a separate `worker.js` process (queue path)
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'codearena-smoke-'));
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const SPLIT = /^(1|true)$/i.test(process.env.SMOKE_SPLIT || '');
const env = { ...process.env, JUDGE_EMBEDDED: SPLIT ? 'false' : 'true', AUTO_SEED: 'false', AUTO_IMPORT_ARCHIVE: 'false', DATA_DIR: DATA, PORT: String(PORT), HOST: '127.0.0.1', SUBMIT_COOLDOWN_MS: '0', JUDGE_WORKERS: '2', ADMIN_PASSWORD: 'smoke-admin-pass', ADMIN_HANDLE: 'root' };

let passed = 0;
let failed = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { passed++; console.log(`  ✔ ${name}`); } else { failed++; console.log(`  ✘ ${name} ${extra}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, body, { csrf = true } = {}) {
    const headers = { ...(this.cookie ? { Cookie: this.cookie } : {}) };
    if (csrf) headers['X-Requested-With'] = 'CodeArena';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
    return { status: res.status, data };
  }
  get(u) { return this.req('GET', u); }
  post(u, b = {}, o) { return this.req('POST', u, b, o); }
  put(u, b = {}) { return this.req('PUT', u, b); }
}

async function waitJudged(c, id, ms = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await c.get(`/api/submissions/${id}`);
    if (r.data?.status === 'done') return r.data;
    await sleep(300);
  }
  throw new Error(`submission ${id} not judged in time`);
}

const SOL = {
  '1001': 'a, b = map(int, input().split())\nprint(a + b)\n',
  '1003': fs.readFileSync(path.join(ROOT, 'seed/solutions/1003.py'), 'utf8'),
  '1037': fs.readFileSync(path.join(ROOT, 'seed/solutions/1037.py'), 'utf8'),
};

let server;
let worker;
try {
  console.log(`Seeding a temporary instance in ${DATA} ...`);
  const seed = spawnSync(process.execPath, ['seed/seed.js', '1001', '1003', '1037'], { cwd: ROOT, env, encoding: 'utf8' });
  if (seed.status !== 0) throw new Error(`seed failed: ${seed.stderr}`);

  server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 50 && !log.includes('listening'); i++) await sleep(200);
  if (!log.includes('listening')) throw new Error(`server did not start:\n${log}`);
  if (SPLIT) {
    console.log('Split mode: starting a separate judge worker process');
    worker = spawn(process.execPath, ['server/judge/worker.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let wlog = '';
    worker.stdout.on('data', (d) => { wlog += d; });
    worker.stderr.on('data', (d) => { wlog += d; });
    for (let i = 0; i < 50 && !wlog.includes('worker(s)'); i++) await sleep(200);
    if (!wlog.includes('worker(s)')) throw new Error(`worker did not start:\n${wlog}`);
  }

  console.log('\nAuth & security');
  const admin = new Client();
  ok((await admin.post('/api/auth/login', { login: 'root', password: 'smoke-admin-pass' })).status === 200, 'admin bootstrap login');
  const users = {};
  for (const h of ['alice', 'bob', 'carol', 'dave']) {
    users[h] = new Client();
    const r = await users[h].post('/api/auth/register', { handle: h, email: `${h}@smoke.test`, password: `pw-${h}-123456` });
    ok(r.status === 201, `register ${h}`);
  }
  ok((await new Client().post('/api/auth/register', { handle: 'x!', email: 'bad', password: '1' })).status === 400, 'registration validation rejects bad input');
  ok((await users.alice.post('/api/submissions', { problem: '1001', language: 'python3', source: 'print(1)' }, { csrf: false })).status === 403, 'CSRF header required for mutations');
  ok((await new Client().post('/api/submissions', { problem: '1001', language: 'python3', source: 'print(1)' })).status === 401, 'anonymous submit rejected');
  ok((await users.alice.get('/api/admin/system')).status === 403, 'non-staff blocked from admin API');

  console.log('\nContest setup');
  const now = Date.now();
  const cr = await admin.post('/api/admin/contests', { title: 'Smoke Round', description: 'test', startAt: now - 60_000, durationMin: 60, rated: true });
  ok(cr.status === 201, 'create contest');
  const cid = cr.data.id;
  ok((await admin.put(`/api/admin/contests/${cid}/problems`, { problems: [{ label: 'A', code: '1001' }, { label: 'B', code: '1003' }, { label: 'C', code: '1037' }] })).status === 200, 'assign problems A-C');
  ok((await users.alice.get('/api/problems/1001')).status === 404, 'contest problem hidden from problemset while running');
  ok((await users.alice.get(`/api/problems/1001?contest=${cid}`)).status === 200, 'contest problem visible through the contest');

  console.log('\nContest submissions & verdicts');
  const submit = async (u, problem, source, language = 'python3') => {
    const r = await users[u].post('/api/submissions', { problem, language, source, contest: cid });
    if (r.status !== 201) throw new Error(`submit failed: ${JSON.stringify(r.data)}`);
    return waitJudged(users[u], r.data.id);
  };
  const v = {};
  v.aliceA = await submit('alice', '1001', SOL['1001']);
  v.aliceB = await submit('alice', '1003', SOL['1003']);
  v.aliceC = await submit('alice', '1037', SOL['1037']);
  v.bobA1 = await submit('bob', '1001', 'a, b = map(int, input().split())\nprint(a - b)\n');
  v.bobA2 = await submit('bob', '1001', SOL['1001']);
  v.bobB = await submit('bob', '1003', SOL['1003']);
  v.carolCE = await submit('carol', '1001', 'def broken(:\n');
  v.carolA = await submit('carol', '1001', "const [a,b]=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(BigInt);console.log(String(a+b));", 'javascript');
  v.daveTLE = await submit('dave', '1003', 'while True:\n    pass\n');
  v.daveRE = await submit('dave', '1037', 'import sys\nsys.exit(3)\n');
  v.daveMLE = await submit('dave', '1001', 'x = [0] * (10**9)\n');
  ok(v.aliceA.verdict === 'AC' && v.aliceB.verdict === 'AC' && v.aliceC.verdict === 'AC', 'reference solutions accepted');
  ok(v.bobA1.verdict === 'WA' && v.bobA1.failedTest === 1, 'wrong answer detected on test 1', JSON.stringify([v.bobA1.verdict, v.bobA1.failedTest]));
  ok(v.carolCE.verdict === 'CE' && !!v.carolCE.compileLog, 'compilation error with compiler log');
  ok(v.carolA.verdict === 'AC', 'JavaScript solution accepted');
  ok(v.daveTLE.verdict === 'TLE', 'infinite loop -> TLE', v.daveTLE.verdict);
  ok(v.daveRE.verdict === 'RE', 'non-zero exit -> RE', v.daveRE.verdict);
  ok(v.daveMLE.verdict === 'MLE', 'huge allocation -> MLE', v.daveMLE.verdict);
  ok(v.bobA1.tests.length > 0 && v.bobA1.tests[0].message, 'checker comment shown on sample test');

  const peek = await users.bob.get(`/api/submissions/${v.aliceA.id}`);
  ok(peek.status === 200 && peek.data.source === null, "others' source hidden during the contest");

  console.log('\nStandings');
  const st = (await users.dave.get(`/api/contests/${cid}/standings`)).data;
  const order = st.rows.map((r) => r.handle);
  ok(order.join(',') === 'alice,bob,carol,dave', 'ranking order alice > bob > carol > dave', order.join(','));
  const bob = st.rows.find((r) => r.handle === 'bob');
  const bobA = bob.cells[st.problems.find((p) => p.label === 'A').id];
  ok(bobA.solved && bobA.tries === 1, 'wrong try counted for bob on A');
  const carol = st.rows.find((r) => r.handle === 'carol');
  ok(carol.cells[st.problems.find((p) => p.label === 'A').id].tries === 0, 'compilation error not penalised');
  ok(bob.penalty >= 20, 'penalty includes 20 min per wrong try', String(bob.penalty));

  console.log('\nCustom invocation');
  const run = await users.alice.post('/api/run', { language: 'python3', source: 'print(input()[::-1])', input: 'arena\n' });
  ok(run.status === 200 && run.data.run.output.trim() === 'anera', 'custom run returns program output');

  console.log('\nFinish contest & ratings');
  ok((await admin.put(`/api/admin/contests/${cid}`, { title: 'Smoke Round', description: 'test', startAt: now - 3 * 3600_000, durationMin: 60, rated: true })).status === 200, 'move contest into the past');
  ok((await users.alice.get('/api/problems/1001')).status === 200, 'problems return to the problemset after the contest');
  const rt = await admin.post(`/api/admin/contests/${cid}/ratings`);
  ok(rt.status === 200 && rt.data.applied === 4, 'rating changes applied to 4 participants', JSON.stringify(rt.data));
  const delta = Object.fromEntries(rt.data.changes.map((c) => [c.userId, c.delta]));
  const ids = {};
  for (const h of Object.keys(users)) ids[h] = (await users[h].get('/api/auth/me')).data.user.id;
  ok(delta[ids.alice] > delta[ids.bob] && delta[ids.bob] > delta[ids.carol] && delta[ids.carol] > delta[ids.dave], 'deltas ordered by rank',
    JSON.stringify(delta));
  ok(delta[ids.alice] > 0 && delta[ids.dave] < 0, 'winner gains, last place loses');
  ok((await admin.post(`/api/admin/contests/${cid}/ratings`)).status === 409, 'ratings cannot be applied twice');
  const prof = (await users.bob.get('/api/users/alice')).data;
  ok(prof.rating === 1500 + delta[ids.alice] && prof.ratingHistory.length === 1, 'profile shows new rating & history');
  const peek2 = await users.bob.get(`/api/submissions/${v.aliceA.id}`);
  ok(peek2.data.source !== null, 'source visible after contest to users who solved the problem');
  const peek3 = await users.dave.get(`/api/submissions/${v.aliceA.id}`);
  ok(peek3.data.source === null, 'source still hidden from users who did not solve it');

  console.log('\nAdmin tools');
  const rj = await admin.post(`/api/admin/submissions/${v.bobA1.id}/rejudge`);
  ok(rj.data.requeued === 1, 'rejudge requeues submission');
  ok((await waitJudged(admin, v.bobA1.id)).verdict === 'WA', 'rejudged submission gets the same verdict');
  const imp = await admin.post('/api/admin/archive/import', { source: 'spoj', items: [{ external_id: 'TEST', title: 'Life, the Universe, and Everything', url: 'https://www.spoj.com/problems/TEST/', difficulty: 800, tags: ['implementation'] }] });
  ok(imp.data?.imported === 1, 'custom archive import');
  const found = await users.alice.get('/api/archive?q=Universe');
  ok(found.data.total === 1 && found.data.items[0].source === 'spoj', 'archive search finds imported problem');
  const rk = (await new Client().get('/api/users/rankings')).data;
  ok(rk.items[0].handle === 'alice', 'rankings led by the contest winner');
} catch (e) {
  failed++;
  console.error('\nFATAL:', e.message);
} finally {
  server?.kill();
  worker?.kill();
  await sleep(800);
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
