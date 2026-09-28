import { lines, md, mulmod, reader } from '../lib.js';

const MOD = 1e9 + 7;

function adjacency(n, edges, weighted) {
  const head = new Int32Array(n + 1).fill(-1);
  const nxt = new Int32Array(2 * edges.length);
  const to = new Int32Array(2 * edges.length);
  const w = new Float64Array(2 * edges.length);
  let k = 0;
  for (const e of edges) {
    for (const [a, b] of [[e[0], e[1]], [e[1], e[0]]]) { to[k] = b; w[k] = weighted ? e[2] : 1; nxt[k] = head[a]; head[a] = k++; }
  }
  return { head, nxt, to, w };
}

/** Iterative BFS/DFS from `root`: returns dist, parent, order. */
function walk(n, g, root) {
  const dist = new Float64Array(n + 1).fill(-1); const par = new Int32Array(n + 1); const order = [root];
  dist[root] = 0; par[root] = 0;
  for (let i = 0; i < order.length; i++) {
    const u = order[i];
    for (let e = g.head[u]; e !== -1; e = g.nxt[e]) { const v = g.to[e]; if (dist[v] < 0) { dist[v] = dist[u] + g.w[e]; par[v] = u; order.push(v); } }
  }
  return { dist, par, order };
}

export default [
  {
    code: '1031', title: 'Best Streak', difficulty: 1100, tags: ['dp', 'greedy'], timeLimitMs: 1000,
    legend: md`A trader's daily profits are $a_1, \ldots, a_n$ (negative values are losses). Find the maximum total profit over a **non-empty** block of consecutive days.`,
    input: md`The first line contains $n$ ($1 \le n \le 2 \cdot 10^5$). The second line contains $a_1, \ldots, a_n$ ($-10^9 \le a_i \le 10^9$).`,
    output: md`Print the maximum sum of a non-empty contiguous subarray.`,
    samples: ['8\n-2 1 -3 4 -1 2 1 -5\n', '3\n-5 -2 -9\n'],
    tests(R) {
      const t = ['1\n-1000000000\n', `200000\n${Array(200000).fill(1e9).join(' ')}\n`, `200000\n${Array(200000).fill(-1e9).join(' ')}\n`];
      for (const [n, lo, hi] of [[10, -10, 10], [1000, -1e9, 1e9], [200000, -1e9, 1e9], [200000, -1e9, 5e8]]) t.push(`${n}\n${R.array(n, () => R.int(lo, hi)).join(' ')}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); let best = -Infinity; let cur = 0;
      for (let i = 0; i < n; i++) { const x = r.int(); cur = Math.max(x, cur + x); best = Math.max(best, cur); }
      return `${best}\n`;
    },
  },
  {
    code: '1032', title: 'Pair Sum Count', difficulty: 1300, tags: ['hashing', 'sortings', 'two pointers'], timeLimitMs: 1500,
    legend: md`Count the pairs of indices $i < j$ such that $a_i + a_j = x$.`,
    input: md`The first line contains $n$ and $x$ ($1 \le n \le 2 \cdot 10^5$, $1 \le x \le 2 \cdot 10^9$). The second line contains $a_1, \ldots, a_n$ ($1 \le a_i \le 10^9$).`,
    output: md`Print the number of pairs.`,
    samples: ['5 6\n1 5 3 3 2\n'],
    tests(R) {
      const t = ['1 2\n1\n', `200000 2\n${Array(200000).fill(1).join(' ')}\n`];
      for (const [n, mx] of [[10, 10], [1000, 100], [200000, 1e9], [200000, 1000], [200000, 50]]) {
        const a = R.array(n, () => R.int(1, mx));
        t.push(`${n} ${a[0] + a[n - 1]}\n${a.join(' ')}\n`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const x = r.int(); const seen = new Map(); let cnt = 0;
      for (let i = 0; i < n; i++) { const v = r.int(); cnt += seen.get(x - v) || 0; seen.set(v, (seen.get(v) || 0) + 1); }
      return `${cnt}\n`;
    },
  },
  {
    code: '1033', title: 'Tree Diameter', difficulty: 1600, tags: ['trees', 'dfs and similar'], timeLimitMs: 2000,
    legend: md`A country has $n$ towns connected by $n - 1$ roads so that every town is reachable from every other (the road network is a tree). Road $i$ has length $w_i$.

What is the largest distance between two towns?`,
    input: md`The first line contains $n$ ($1 \le n \le 2 \cdot 10^5$). Each of the next $n - 1$ lines contains $u$, $v$, $w$ ($1 \le u, v \le n$, $1 \le w \le 10^9$).`,
    output: md`Print the maximum distance between two towns.`,
    notes: md`Watch out: the tree can be very deep, so recursive traversals may overflow the stack.`,
    samples: ['5\n1 2 3\n2 3 4\n2 4 5\n4 5 1\n', '1\n'],
    tests(R) {
      const t = ['2\n1 2 1000000000\n'];
      for (const [n, deep, mw] of [[10, false, 10], [1000, false, 1e9], [200000, false, 1e9], [200000, true, 1e9], [200000, true, 1]]) {
        t.push(`${n}\n${lines(R.tree(n, { deep }).map(([u, v]) => `${u} ${v} ${R.int(1, mw)}`))}`);
      }
      t.push(`200000\n${lines(R.shuffle(R0(199999, (i) => `${i + 1} ${i + 2} 1000000000`)))}`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); if (n === 1) return '0\n';
      const g = adjacency(n, R0(n - 1, () => [r.int(), r.int(), r.int()]), true);
      const a = walk(n, g, 1); let far = 1; for (let i = 1; i <= n; i++) if (a.dist[i] > a.dist[far]) far = i;
      const b = walk(n, g, far); let best = 0; for (let i = 1; i <= n; i++) best = Math.max(best, b.dist[i]);
      return `${best}\n`;
    },
  },
  {
    code: '1034', title: 'Tree Distance Queries', difficulty: 1900, tags: ['trees', 'lca', 'binary lifting'], timeLimitMs: 3000,
    legend: md`You are given a tree with $n$ vertices. Answer $q$ queries: how many edges are on the path between vertices $u$ and $v$?`,
    input: md`The first line contains $n$ and $q$ ($1 \le n, q \le 10^5$). Each of the next $n - 1$ lines contains an edge $a\ b$. Each of the next $q$ lines contains a query $u\ v$ ($1 \le u, v \le n$).`,
    output: md`For each query print the distance.`,
    samples: ['5 3\n1 2\n1 3\n3 4\n3 5\n2 4\n4 5\n1 1\n'],
    tests(R) {
      const t = ['1 1\n1 1\n'];
      for (const [n, q, deep] of [[10, 10, false], [1000, 1000, false], [100000, 100000, false], [100000, 100000, true]]) {
        t.push(`${n} ${q}\n${lines(R.tree(n, { deep }).map((e) => e.join(' ')))}${lines(R.array(q, () => `${R.int(1, n)} ${R.int(1, n)}`))}`);
      }
      t.push(`100000 100000\n${lines(R0(99999, (i) => `${i + 1} ${i + 2}`))}${lines(R.array(100000, () => `${R.int(1, 10)} ${R.int(99990, 100000)}`))}`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const q = r.int();
      const g = adjacency(n, R0(n - 1, () => [r.int(), r.int()]), false);
      const { dist, par, order } = walk(n, g, 1);
      let LOG = 1; while ((1 << LOG) <= n) LOG++;
      const up = R0(LOG, () => new Int32Array(n + 1));
      for (const v of order) { up[0][v] = par[v] || v; }
      up[0][1] = 1;
      for (let k = 1; k < LOG; k++) for (let v = 1; v <= n; v++) up[k][v] = up[k - 1][up[k - 1][v]];
      const lca = (a, b) => {
        if (dist[a] < dist[b]) [a, b] = [b, a];
        let diff = dist[a] - dist[b];
        for (let k = 0; diff; k++, diff >>= 1) if (diff & 1) a = up[k][a];
        if (a === b) return a;
        for (let k = LOG - 1; k >= 0; k--) if (up[k][a] !== up[k][b]) { a = up[k][a]; b = up[k][b]; }
        return up[0][a];
      };
      const out = [];
      for (let i = 0; i < q; i++) { const u = r.int(); const v = r.int(); out.push(dist[u] + dist[v] - 2 * dist[lca(u, v)]); }
      return lines(out);
    },
  },
  {
    code: '1035', title: 'Fence Area', difficulty: 1300, tags: ['geometry', 'math'], timeLimitMs: 1500,
    legend: md`A farmer's field is fenced by a simple polygon (its sides do not cross each other) with $n$ vertices at integer coordinates. Compute the area of the field.`,
    input: md`The first line contains $n$ ($3 \le n \le 10^5$). Each of the next $n$ lines contains $x_i$ and $y_i$ ($|x_i|, |y_i| \le 10^6$) — the vertices in order along the fence (clockwise or counter-clockwise).`,
    output: md`Print the area with **exactly one digit** after the decimal point.`,
    notes: md`Since the coordinates are integers, twice the area is an integer, so the answer always ends in .0 or .5.`,
    samples: ['4\n0 0\n4 0\n4 3\n0 3\n', '3\n0 0\n3 0\n0 3\n'],
    tests(R) {
      const star = (n, rmin, rmax) => {
        const pts = [];
        for (let i = 0; i < n; i++) {
          const ang = (2 * Math.PI * (i + 0.1 + 0.8 * R.next())) / n; const rad = R.int(rmin, rmax);
          pts.push(`${Math.round(rad * Math.cos(ang))} ${Math.round(rad * Math.sin(ang))}`);
        }
        return R.next() < 0.5 ? pts : pts.reverse();
      };
      const t = ['3\n-1000000 -1000000\n1000000 -1000000\n-1000000 1000000\n', '4\n-1000000 -1000000\n1000000 -1000000\n1000000 1000000\n-1000000 1000000\n'];
      for (const [n, rmin, rmax] of [[5, 5, 10], [50, 100, 1000], [1000, 400000, 1000000], [100000, 500000, 1000000], [100000, 999000, 1000000]]) {
        t.push(`${n}\n${lines(star(n, rmin, rmax))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const p = R0(n, () => [r.big(), r.big()]);
      let s = 0n;
      for (let i = 0; i < n; i++) { const [x1, y1] = p[i]; const [x2, y2] = p[(i + 1) % n]; s += x1 * y2 - x2 * y1; }
      if (s < 0n) s = -s;
      return `${s / 2n}.${s % 2n ? 5 : 0}\n`;
    },
  },
  {
    code: '1036', title: 'Huge Fibonacci', difficulty: 1700, tags: ['math', 'matrices', 'divide and conquer'], timeLimitMs: 1500,
    legend: md`The Fibonacci numbers are $F_0 = 0$, $F_1 = 1$, $F_k = F_{k-1} + F_{k-2}$. Answer $t$ queries: given $n$, print $F_n \bmod (10^9 + 7)$.`,
    input: md`The first line contains $t$ ($1 \le t \le 10^4$). Each of the next $t$ lines contains $n$ ($0 \le n \le 10^{18}$).`,
    output: md`For each query print $F_n \bmod (10^9 + 7)$.`,
    samples: ['4\n0\n1\n10\n1000000000000000000\n'],
    tests(R) {
      const t = ['3\n2\n3\n90\n'];
      for (const [q, hi] of [[10, 100n], [1000, 10n ** 9n], [10000, 10n ** 18n]]) t.push(`${q}\n${lines(R.array(q, () => R.big(0n, hi)))}`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const q = r.int(); const out = [];
      for (let i = 0; i < q; i++) {
        const n = r.big(); let a = 0; let b = 1; // (F(k), F(k+1)), k = 0
        for (const bit of n.toString(2)) {
          const c = mulmod(a, (2 * b - a + MOD) % MOD, MOD);
          const d = (mulmod(a, a, MOD) + mulmod(b, b, MOD)) % MOD;
          if (bit === '1') { a = d; b = (c + d) % MOD; } else { a = c; b = d; }
        }
        out.push(a);
      }
      return lines(out);
    },
  },
  {
    code: '1037', title: 'Circle Elimination', difficulty: 1300, tags: ['math', 'dp'], timeLimitMs: 1500,
    legend: md`$n$ children numbered $1$ to $n$ stand in a circle. Starting from child $1$, they count $1, 2, \ldots, k$ around the circle; the child who says $k$ leaves, and counting restarts at $1$ from the next child. This repeats until one child remains.

Which child remains?`,
    input: md`One line with $n$ and $k$ ($1 \le n, k \le 10^6$).`,
    output: md`Print the number of the last remaining child.`,
    notes: md`For $n = 5, k = 2$ the children leave in the order $2, 4, 1, 5$; child $3$ remains.`,
    samples: ['5 2\n', '7 1\n'],
    tests(R) {
      const t = ['1 1\n', '1 1000000\n', '1000000 1\n', '1000000 1000000\n', '1000000 2\n'];
      for (let i = 0; i < 6; i++) t.push(`${R.int(1, 1e6)} ${R.int(1, i < 3 ? 10 : 1e6)}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const k = r.int(); let j = 0;
      for (let i = 2; i <= n; i++) j = (j + k) % i;
      return `${j + 1}\n`;
    },
  },
  {
    code: '1038', title: 'Subset Sums', difficulty: 1900, tags: ['meet-in-the-middle', 'bitmasks', 'hashing'], timeLimitMs: 3000,
    legend: md`Given $n$ positive integers $a_1, \ldots, a_n$ and a target $S$, count the subsets of indices whose elements sum to exactly $S$.`,
    input: md`The first line contains $n$ and $S$ ($1 \le n \le 36$, $1 \le S \le 4 \cdot 10^{10}$). The second line contains $a_1, \ldots, a_n$ ($1 \le a_i \le 10^9$).`,
    output: md`Print the number of subsets with sum $S$.`,
    notes: md`With $n$ up to $36$ there are almost $7 \cdot 10^{10}$ subsets — too many to try one by one.`,
    samples: ['4 5\n1 2 3 4\n', '3 100\n1 2 3\n'],
    tests(R) {
      const t = [];
      for (const [n, mx] of [[1, 5], [10, 10], [20, 1e9], [36, 1e9], [36, 5], [36, 1], [35, 1000], [36, 1e6]]) {
        const a = R.array(n, () => R.int(1, mx));
        const S = Math.max(1, a.filter(() => R.next() < 0.5).reduce((s, x) => s + x, 0));
        t.push(`${n} ${S}\n${a.join(' ')}\n`);
      }
      t.push(`36 18\n${Array(36).fill(1).join(' ')}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const S = r.int(); const a = r.ints(n);
      const sums = (arr) => { let s = [0]; for (const x of arr) s = s.concat(s.map((v) => v + x)); return s; };
      const h = n >> 1; const left = new Map();
      for (const v of sums(a.slice(0, h))) left.set(v, (left.get(v) || 0) + 1);
      let cnt = 0; for (const v of sums(a.slice(h))) cnt += left.get(S - v) || 0;
      return `${cnt}\n`;
    },
  },
  {
    code: '1039', title: 'Cube Roots', difficulty: 1100, tags: ['binary search', 'math'], timeLimitMs: 1500, checker: 'float:1e-6',
    legend: md`For each given non-negative real number $x$, print $\sqrt[3]{x}$.`,
    input: md`The first line contains $t$ ($1 \le t \le 10^5$). Each of the next $t$ lines contains a real number $x$ ($0 \le x \le 10^{12}$) with at most $6$ digits after the decimal point.`,
    output: md`For each $x$ print its cube root. Your answer is accepted if its absolute or relative error does not exceed $10^{-6}$.`,
    samples: ['3\n27\n2\n0.001\n'],
    tests(R) {
      const t = ['2\n0\n1000000000000\n'];
      for (const [q, hi] of [[10, 100], [1000, 1e6], [100000, 1e12]]) {
        t.push(`${q}\n${lines(R.array(q, () => (R.next() < 0.5 ? String(R.int(0, hi)) : (R.next() * hi).toFixed(R.int(1, 6)))))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const q = r.int(); const out = [];
      for (let i = 0; i < q; i++) out.push(Math.cbrt(Number(r.str())).toFixed(9));
      return lines(out);
    },
  },
  {
    code: '1040', title: 'Most Frequent Word', difficulty: 1000, tags: ['strings', 'hashing', 'implementation'], timeLimitMs: 1500,
    legend: md`Given a list of $n$ words, find the word that occurs most often. If several words share the highest count, choose the lexicographically smallest one.`,
    input: md`The first line contains $n$ ($1 \le n \le 2 \cdot 10^5$). The next line(s) contain $n$ words separated by spaces or line breaks; each word has $1$ to $10$ lowercase English letters.`,
    output: md`Print the word and the number of its occurrences.`,
    samples: ['6\nthe cat saw the dog the\n', '4\nb a b a\n'],
    tests(R) {
      const t = ['1\nzzzzzzzzzz\n'];
      for (const [n, len, al] of [[10, 1, 'abc'], [1000, 2, 'abcde'], [200000, 3, 'abcd'], [200000, 10, 'ab'], [200000, 1, 'abcdefghijklmnopqrstuvwxyz']]) {
        const ws = R.array(n, () => R.str(R.int(1, len), al));
        t.push(`${n}\n${lines(R0(Math.ceil(n / 20), (i) => ws.slice(i * 20, i * 20 + 20).join(' ')))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const c = new Map();
      for (let i = 0; i < n; i++) { const w = r.str(); c.set(w, (c.get(w) || 0) + 1); }
      let best = null; let bc = 0;
      for (const [w, k] of c) if (k > bc || (k === bc && w < best)) { best = w; bc = k; }
      return `${best} ${bc}\n`;
    },
  },
];

function R0(n, f) { return Array.from({ length: n }, (_, i) => f(i)); }
