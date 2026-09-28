import { lines, md, MinHeap, mulmod, reader } from '../lib.js';

const MOD = 1e9 + 7;

function grid(R, n, m, density, fixed = {}) {
  const g = R.array(n, () => R.array(m, () => (R.next() < density ? '#' : '.')));
  for (const [ch, [i, j]] of Object.entries(fixed)) g[i][j] = ch;
  return g.map((row) => row.join(''));
}

function dsu(n) {
  const p = Int32Array.from({ length: n + 1 }, (_, i) => i);
  const find = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
  return { find, union: (a, b) => { a = find(a); b = find(b); if (a === b) return false; p[a] = b; return true; } };
}

function randomGraph(R, n, m, maxW, { connected = false } = {}) {
  const edges = [];
  if (connected) for (const [u, v] of R.tree(n)) edges.push([u, v, R.int(1, maxW)]);
  while (edges.length < m) edges.push([R.int(1, n), R.int(1, n), R.int(1, maxW)]);
  return R.shuffle(edges);
}

export default [
  {
    code: '1011', title: 'Grid Paths', difficulty: 1300, tags: ['dp'], timeLimitMs: 2000,
    legend: md`A robot stands in the top-left cell of an $n \times m$ grid and wants to reach the bottom-right cell. It can only move **right** or **down**, and it cannot enter cells with obstacles (#).

Count the number of distinct paths, modulo $10^9 + 7$.`,
    input: md`The first line contains $n$ and $m$ ($1 \le n, m \le 1000$). Each of the next $n$ lines contains a string of $m$ characters: '.' for a free cell and '#' for an obstacle.`,
    output: md`Print the number of paths modulo $10^9 + 7$ (print $0$ if the start or the end cell is blocked).`,
    samples: ['3 3\n...\n.#.\n...\n', '2 2\n.#\n#.\n'],
    tests(R) {
      const t = ['1 1\n.\n', '1 1\n#\n', `1000 1000\n${lines(Array(1000).fill('.'.repeat(1000)))}`];
      for (const [n, m, d] of [[5, 5, 0.2], [50, 70, 0.1], [300, 300, 0.05], [1000, 1000, 0.02], [1000, 1000, 0.1], [1000, 1, 0], [1, 1000, 0.001]]) {
        t.push(`${n} ${m}\n${lines(grid(R, n, m, d, { '.': [0, 0] }))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const m = r.int(); const g = R0(n, () => r.str());
      const dp = new Array(m).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          if (g[i][j] === '#') { dp[j] = 0; continue; }
          if (i === 0 && j === 0) { dp[j] = 1; continue; }
          dp[j] = ((i > 0 ? dp[j] : 0) + (j > 0 ? dp[j - 1] : 0)) % MOD;
        }
      }
      return `${dp[m - 1]}\n`;
    },
  },
  {
    code: '1012', title: 'Edit Distance', difficulty: 1500, tags: ['dp', 'strings'], timeLimitMs: 2000,
    legend: md`You may apply three operations to a string: **insert** a character, **delete** a character, or **replace** a character with another one. What is the minimum number of operations to turn string $s$ into string $t$?`,
    input: md`Two lines, containing $s$ and $t$ ($1 \le |s|, |t| \le 1000$), consisting of lowercase English letters.`,
    output: md`Print the minimum number of operations.`,
    notes: md`kitten → sitten → sittin → sitting: three operations.`,
    samples: ['kitten\nsitting\n', 'abc\nabc\n'],
    tests(R) {
      const t = ['a\nb\n', 'a\naaaaaaaaaa\n'];
      for (const [a, b, al] of [[10, 12, 'ab'], [100, 100, 'abc'], [1000, 1000, 'ab'], [1000, 1000, 'abcdefghijklmnopqrstuvwxyz'], [1000, 1, 'xyz'], [500, 1000, 'ac']]) {
        t.push(`${R.str(a, al)}\n${R.str(b, al)}\n`);
      }
      const base = R.str(1000, 'abcde');
      t.push(`${base}\n${base.slice(0, 400)}x${base.slice(401)}\n`);
      return t;
    },
    solve(inp) {
      const [s, u] = inp.split(/\s+/).filter(Boolean);
      let prev = R0(u.length + 1, (j) => j);
      for (let i = 1; i <= s.length; i++) {
        const cur = [i];
        for (let j = 1; j <= u.length; j++) {
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === u[j - 1] ? 0 : 1));
        }
        prev = cur;
      }
      return `${prev[u.length]}\n`;
    },
  },
  {
    code: '1013', title: 'Maze Runner', difficulty: 1400, tags: ['graphs', 'bfs', 'shortest paths'], timeLimitMs: 2000,
    legend: md`A maze is an $n \times m$ grid. S marks the start, E marks the exit, # marks walls and . marks floor. In one step you move to a side-adjacent non-wall cell.

What is the minimum number of steps from S to E?`,
    input: md`The first line contains $n$ and $m$ ($1 \le n, m \le 1000$). The next $n$ lines describe the maze. There is exactly one S and exactly one E.`,
    output: md`Print the minimum number of steps, or $-1$ if the exit cannot be reached.`,
    samples: ['3 4\nS.#.\n.##E\n....\n', '1 3\nS#E\n'],
    tests(R) {
      const t = ['1 2\nSE\n'];
      for (const [n, m, d] of [[5, 5, 0.3], [50, 50, 0.3], [500, 700, 0.25], [1000, 1000, 0.3], [1000, 1000, 0.1], [1000, 1000, 0.45]]) {
        t.push(`${n} ${m}\n${lines(grid(R, n, m, d, { S: [0, 0], E: [n - 1, m - 1] }))}`);
      }
      // a snake corridor forcing a very long path
      const n = 999; const m = 1000; const g = [];
      for (let i = 0; i < n; i++) {
        if (i % 2 === 0) g.push('.'.repeat(m));
        else g.push(((i >> 1) % 2 === 0) ? `${'#'.repeat(m - 1)}.` : `.${'#'.repeat(m - 1)}`);
      }
      g[0] = `S${g[0].slice(1)}`; g[n - 1] = `${g[n - 1].slice(0, m - 1)}E`;
      t.push(`${n} ${m}\n${lines(g)}`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const m = r.int(); const g = R0(n, () => r.str());
      const dist = new Int32Array(n * m).fill(-1); const q = new Int32Array(n * m);
      let s = 0; let e = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { if (g[i][j] === 'S') s = i * m + j; if (g[i][j] === 'E') e = i * m + j; }
      let h = 0; let tl = 0; q[tl++] = s; dist[s] = 0;
      while (h < tl) {
        const c = q[h++]; const i = Math.floor(c / m); const j = c % m;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di; const b = j + dj;
          if (a < 0 || b < 0 || a >= n || b >= m || g[a][b] === '#') continue;
          const k = a * m + b; if (dist[k] !== -1) continue;
          dist[k] = dist[c] + 1; q[tl++] = k;
        }
      }
      return `${dist[e]}\n`;
    },
  },
  {
    code: '1014', title: 'Shortest Routes', difficulty: 1600, tags: ['graphs', 'shortest paths', 'dijkstra'], timeLimitMs: 2000,
    legend: md`There are $n$ cities and $m$ one-way flights. Flight $i$ goes from city $a_i$ to city $b_i$ and costs $c_i$. For every city, find the cheapest total cost to reach it from city $1$.`,
    input: md`The first line contains $n$ and $m$ ($1 \le n \le 10^5$, $1 \le m \le 2 \cdot 10^5$). Each of the next $m$ lines contains $a_i$, $b_i$, $c_i$ ($1 \le a_i, b_i \le n$, $1 \le c_i \le 10^9$). Multiple flights between the same cities and loops are possible.`,
    output: md`Print $n$ integers: the cheapest cost to reach cities $1, 2, \ldots, n$ from city $1$, or $-1$ if a city is unreachable.`,
    samples: ['4 5\n1 2 5\n1 3 1\n3 2 2\n2 4 1\n4 1 7\n', '3 1\n2 3 4\n'],
    tests(R) {
      const t = ['1 1\n1 1 5\n'];
      for (const [n, m, w, conn] of [[10, 20, 10, true], [1000, 3000, 1e9, false], [100000, 200000, 1e9, true], [100000, 200000, 10, true], [100000, 150000, 1e9, false]]) {
        t.push(`${n} ${m}\n${lines(randomGraph(R, n, m, w, { connected: conn }).slice(0, m).map((e) => e.join(' ')))}`);
      }
      // long chain: large distances
      const n = 100000; const es = [];
      for (let i = 1; i < n; i++) es.push(`${i} ${i + 1} 1000000000`);
      es.push('1 100000 1000000000');
      t.push(`${n} ${es.length}\n${lines(R.shuffle(es))}`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const m = r.int();
      const adj = R0(n + 1, () => []);
      for (let i = 0; i < m; i++) { const a = r.int(); const b = r.int(); const c = r.int(); adj[a].push(b, c); }
      const dist = new Array(n + 1).fill(Infinity); dist[1] = 0;
      const pq = new MinHeap((x, y) => x[0] - y[0]); pq.push([0, 1]);
      while (pq.size) {
        const [d, u] = pq.pop(); if (d > dist[u]) continue;
        const e = adj[u];
        for (let k = 0; k < e.length; k += 2) { const nd = d + e[k + 1]; if (nd < dist[e[k]]) { dist[e[k]] = nd; pq.push([nd, e[k]]); } }
      }
      return `${dist.slice(1).map((d) => (d === Infinity ? -1 : d)).join(' ')}\n`;
    },
  },
  {
    code: '1015', title: 'Road Building', difficulty: 1400, tags: ['dsu', 'graphs'], timeLimitMs: 1500,
    legend: md`A kingdom has $n$ cities and no roads. Roads are built one at a time; road $i$ connects cities $a_i$ and $b_i$ in both directions. After each new road, report how many **connected groups** of cities there are.`,
    input: md`The first line contains $n$ and $m$ ($1 \le n \le 10^5$, $1 \le m \le 2 \cdot 10^5$). Each of the next $m$ lines contains $a_i$ and $b_i$ ($1 \le a_i, b_i \le n$).`,
    output: md`Print $m$ lines: the number of connected groups after each road is built.`,
    samples: ['5 4\n1 2\n3 4\n2 1\n2 3\n'],
    tests(R) {
      const t = ['1 1\n1 1\n'];
      for (const [n, m] of [[10, 10], [1000, 500], [100000, 200000], [100000, 99999], [3, 200000]]) {
        t.push(`${n} ${m}\n${lines(R.array(m, () => `${R.int(1, n)} ${R.int(1, n)}`))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const m = r.int(); const d = dsu(n); let comps = n; const out = [];
      for (let i = 0; i < m; i++) { if (d.union(r.int(), r.int())) comps--; out.push(comps); }
      return lines(out);
    },
  },
  {
    code: '1016', title: 'Cheapest Network', difficulty: 1600, tags: ['graphs', 'dsu', 'greedy', 'mst'], timeLimitMs: 2000,
    legend: md`An internet provider wants to connect $n$ offices. There are $m$ possible cables; cable $i$ joins offices $a_i$ and $b_i$ and costs $c_i$. Choose cables so that every pair of offices is connected (directly or through others) and the total cost is minimal.`,
    input: md`The first line contains $n$ and $m$ ($1 \le n \le 10^5$, $0 \le m \le 2 \cdot 10^5$). Each of the next $m$ lines contains $a_i$, $b_i$, $c_i$ ($1 \le a_i, b_i \le n$, $1 \le c_i \le 10^9$). Loops and multiple cables between the same offices are possible.`,
    output: md`Print the minimum total cost, or IMPOSSIBLE if the offices cannot all be connected.`,
    samples: ['4 5\n1 2 3\n2 3 5\n2 4 2\n3 4 8\n1 3 7\n', '3 1\n1 2 1\n'],
    tests(R) {
      const t = ['1 0\n', '2 1\n1 1 5\n'];
      for (const [n, m, w, conn] of [[10, 20, 100, true], [1000, 5000, 1e9, true], [100000, 200000, 1e9, true], [100000, 200000, 5, true], [100000, 120000, 1e9, false]]) {
        t.push(`${n} ${m}\n${lines(randomGraph(R, n, m, w, { connected: conn }).slice(0, m).map((e) => e.join(' ')))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const m = r.int();
      const es = R0(m, () => [r.int(), r.int(), r.int()]).sort((a, b) => a[2] - b[2]);
      const d = dsu(n); let cost = 0; let used = 0;
      for (const [a, b, c] of es) if (d.union(a, b)) { cost += c; used++; }
      return used === n - 1 ? `${cost}\n` : 'IMPOSSIBLE\n';
    },
  },
  {
    code: '1017', title: 'Course Schedule', difficulty: 1700, tags: ['graphs', 'topological sort', 'data structures'], timeLimitMs: 2000,
    legend: md`A student must take $n$ courses numbered $1$ to $n$. There are $m$ requirements; requirement $i$ says course $a_i$ must be taken before course $b_i$.

Find an order in which to take all courses. If several orders are valid, print the **lexicographically smallest** one.`,
    input: md`The first line contains $n$ and $m$ ($1 \le n \le 10^5$, $0 \le m \le 2 \cdot 10^5$). Each of the next $m$ lines contains $a_i$ and $b_i$ ($1 \le a_i, b_i \le n$, $a_i \ne b_i$).`,
    output: md`Print $n$ integers — the order of courses, or IMPOSSIBLE if no valid order exists.`,
    samples: ['5 3\n1 2\n3 1\n4 5\n', '2 2\n1 2\n2 1\n'],
    tests(R) {
      const t = ['1 0\n'];
      for (const [n, m, cyc] of [[10, 10, false], [1000, 3000, false], [100000, 200000, false], [100000, 200000, true], [100000, 0, false], [100000, 50000, false]]) {
        const perm = R.shuffle(R0(n, (i) => i + 1));
        const es = R.array(m, () => { let a = R.int(0, n - 2); let b = R.int(a + 1, n - 1); return `${perm[a]} ${perm[b]}`; });
        if (cyc && m) { es.pop(); es.push(`${perm[n - 1]} ${perm[0]}`, `${perm[0]} ${perm[n - 1]}`); }
        t.push(`${n} ${es.length}\n${lines(R.shuffle(es))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const m = r.int();
      const adj = R0(n + 1, () => []); const indeg = new Int32Array(n + 1);
      for (let i = 0; i < m; i++) { const a = r.int(); const b = r.int(); adj[a].push(b); indeg[b]++; }
      const pq = new MinHeap(); for (let i = 1; i <= n; i++) if (!indeg[i]) pq.push(i);
      const out = [];
      while (pq.size) { const u = pq.pop(); out.push(u); for (const v of adj[u]) if (--indeg[v] === 0) pq.push(v); }
      return out.length === n ? `${out.join(' ')}\n` : 'IMPOSSIBLE\n';
    },
  },
  {
    code: '1018', title: 'Prime Count', difficulty: 1300, tags: ['math', 'number theory', 'sieve'], timeLimitMs: 2000,
    legend: md`How many prime numbers are there that do not exceed $n$?`,
    input: md`A single integer $n$ ($1 \le n \le 10^7$).`,
    output: md`Print the number of primes $p \le n$.`,
    notes: md`The primes not exceeding $10$ are $2, 3, 5, 7$.`,
    samples: ['10\n', '1\n'],
    tests(R) {
      const t = ['2\n', '3\n', '100\n', '10000000\n', '9999991\n', '9999990\n'];
      for (let i = 0; i < 4; i++) t.push(`${R.int(1, 1e7)}\n`);
      return t;
    },
    solve(inp) {
      const n = Number(inp.trim()); if (n < 2) return '0\n';
      const sieve = new Uint8Array(n + 1); let cnt = 0;
      for (let i = 2; i <= n; i++) { if (sieve[i]) continue; cnt++; for (let j = i * i; j <= n; j += i) sieve[j] = 1; }
      return `${cnt}\n`;
    },
  },
  {
    code: '1019', title: 'Power Modulo', difficulty: 1200, tags: ['math', 'number theory', 'binary exponentiation'], timeLimitMs: 2000,
    legend: md`Answer $q$ queries. Each query gives $a$, $b$ and $m$; compute $a^b \bmod m$. Assume $0^0 = 1$.`,
    input: md`The first line contains $q$ ($1 \le q \le 10^5$). Each of the next $q$ lines contains $a$, $b$, $m$ ($0 \le a, b \le 10^{18}$, $1 \le m \le 10^9$).`,
    output: md`For each query print $a^b \bmod m$ on its own line.`,
    samples: ['4\n2 10 1000\n3 0 7\n0 0 5\n123456789 987654321 1000000007\n'],
    tests(R) {
      const t = ['3\n0 5 7\n5 5 1\n1000000000000000000 1000000000000000000 999999937\n'];
      for (const q of [10, 1000, 100000, 100000]) {
        t.push(`${q}\n${lines(R.array(q, () => `${R.big(0n, 10n ** 18n)} ${R.big(0n, 10n ** 18n)} ${R.int(1, 1e9)}`))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const q = r.int(); const out = [];
      for (let i = 0; i < q; i++) {
        const A = r.big(); const B = r.big(); const m = r.int();
        let a = Number(A % BigInt(m)); let res = 1 % m;
        for (const bit of B.toString(2)) { res = mulmod(res, res, m); if (bit === '1') res = mulmod(res, a, m); }
        if (B === 0n) res = 1 % m;
        out.push(res);
      }
      return lines(out);
    },
  },
  {
    code: '1020', title: 'Common Divisor', difficulty: 1000, tags: ['math', 'number theory'], timeLimitMs: 1000,
    legend: md`Find the greatest common divisor $g$ of the numbers $a_1, a_2, \ldots, a_n$, and count how many of the numbers are equal to $g$.`,
    input: md`The first line contains $n$ ($1 \le n \le 2 \cdot 10^5$). The second line contains $a_1, \ldots, a_n$ ($1 \le a_i \le 10^9$).`,
    output: md`Print two integers: $g$ and the number of indices $i$ with $a_i = g$.`,
    samples: ['4\n12 18 6 30\n', '3\n4 8 10\n'],
    tests(R) {
      const t = ['1\n1000000000\n', '2\n999999937 999999929\n'];
      for (const [n, k] of [[10, 6], [1000, 7], [200000, 1], [200000, 12], [200000, 1024]]) {
        t.push(`${n}\n${R.array(n, () => k * R.int(1, Math.floor(1e9 / k))).join(' ')}\n`);
      }
      t.push(`200000\n${R.array(200000, (i) => (i % 3 ? 510510 * R.int(1, 1000) : 510510)).join(' ')}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const a = r.ints(n);
      const gcd = (x, y) => { while (y) [x, y] = [y, x % y]; return x; };
      const g = a.reduce(gcd);
      return `${g} ${a.filter((x) => x === g).length}\n`;
    },
  },
];

function R0(n, f) { return Array.from({ length: n }, (_, i) => f(i)); }
