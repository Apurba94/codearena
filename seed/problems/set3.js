import { lines, md, mulmod, powmod, reader } from '../lib.js';

const MOD = 1e9 + 7;

function updateQueries(R, n, q, lo, hi) {
  return R.array(q, () => {
    if (R.next() < 0.5) return `1 ${R.int(1, n)} ${R.int(lo, hi)}`;
    const l = R.int(1, n);
    return `2 ${l} ${R.next() < 0.3 ? l : R.int(l, n)}`;
  });
}

export default [
  {
    code: '1021', title: 'Binomial Queries', difficulty: 1500, tags: ['combinatorics', 'math', 'number theory'], timeLimitMs: 2000,
    legend: md`Answer $q$ queries: for given $n$ and $k$, compute the binomial coefficient $\binom{n}{k}$ — the number of ways to choose $k$ items out of $n$ — modulo $10^9 + 7$.`,
    input: md`The first line contains $q$ ($1 \le q \le 10^5$). Each of the next $q$ lines contains $n$ and $k$ ($0 \le k \le n \le 10^6$).`,
    output: md`For each query print $\binom{n}{k} \bmod (10^9 + 7)$.`,
    samples: ['3\n5 2\n10 0\n1000000 500000\n'],
    tests(R) {
      const t = ['2\n0 0\n1 1\n'];
      for (const [q, N] of [[10, 20], [1000, 1000], [100000, 1e6], [100000, 1e6]]) {
        t.push(`${q}\n${lines(R.array(q, () => { const n = R.int(0, N); return `${n} ${R.int(0, n)}`; }))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const q = r.int(); const qs = R0(q, () => [r.int(), r.int()]);
      const N = Math.max(1, ...qs.map((x) => x[0]));
      const f = new Array(N + 1); f[0] = 1; for (let i = 1; i <= N; i++) f[i] = mulmod(f[i - 1], i, MOD);
      const inv = new Array(N + 1); inv[N] = powmod(f[N], MOD - 2, MOD);
      for (let i = N; i > 0; i--) inv[i - 1] = mulmod(inv[i], i, MOD);
      return lines(qs.map(([n, k]) => mulmod(mulmod(f[n], inv[k], MOD), inv[n - k], MOD)));
    },
  },
  {
    code: '1022', title: 'Pattern Count', difficulty: 1500, tags: ['strings', 'kmp', 'hashing'], timeLimitMs: 2000,
    legend: md`Count how many times the pattern $p$ occurs in the text $s$. Occurrences may **overlap**: the pattern aa occurs $3$ times in aaaa.`,
    input: md`The first line contains the text $s$, the second line the pattern $p$ ($1 \le |p| \le |s| \le 10^6$). Both consist of lowercase English letters.`,
    output: md`Print the number of occurrences.`,
    samples: ['aaaa\naa\n', 'abracadabra\nabra\n'],
    tests(R) {
      const t = ['a\na\n', 'ab\nb\n', `${'a'.repeat(1e6)}\n${'a'.repeat(1000)}\n`, `${'a'.repeat(1e6)}\n${'a'.repeat(1e6)}\n`,
        `${'ab'.repeat(5e5)}\n${'ab'.repeat(20)}a\n`, `${'a'.repeat(999999)}b\n${'a'.repeat(500)}b\n`];
      for (const [n, m, al] of [[20, 2, 'ab'], [1000, 3, 'ab'], [1e6, 5, 'ab'], [1e6, 1, 'abc'], [1e6, 8, 'abcdefghijklmnopqrstuvwxyz']]) {
        t.push(`${R.str(n, al)}\n${R.str(m, al)}\n`);
      }
      return t;
    },
    solve(inp) {
      const [s, p] = inp.split(/\s+/).filter(Boolean);
      const pi = new Int32Array(p.length);
      for (let i = 1, k = 0; i < p.length; i++) { while (k && p[i] !== p[k]) k = pi[k - 1]; if (p[i] === p[k]) k++; pi[i] = k; }
      let cnt = 0;
      for (let i = 0, k = 0; i < s.length; i++) {
        while (k && s[i] !== p[k]) k = pi[k - 1];
        if (s[i] === p[k]) k++;
        if (k === p.length) { cnt++; k = pi[k - 1]; }
      }
      return `${cnt}\n`;
    },
  },
  {
    code: '1023', title: 'Longest Palindrome', difficulty: 1800, tags: ['strings', 'manacher', 'hashing'], timeLimitMs: 2000,
    legend: md`A palindrome reads the same forwards and backwards. Find the length of the longest substring (a contiguous part) of $s$ that is a palindrome.`,
    input: md`A single line with the string $s$ ($1 \le |s| \le 10^5$) of lowercase English letters.`,
    output: md`Print the length of the longest palindromic substring.`,
    samples: ['babad\n', 'cbbd\n'],
    tests(R) {
      const t = ['a\n', `${'a'.repeat(100000)}\n`, `${'ab'.repeat(50000)}\n`];
      for (const [n, al] of [[10, 'ab'], [1000, 'abc'], [100000, 'ab'], [100000, 'abcdefghijklmnopqrstuvwxyz']]) t.push(`${R.str(n, al)}\n`);
      const half = R.str(30000, 'abc');
      t.push(`${R.str(20000, 'xyz')}${half}${[...half].reverse().join('')}${R.str(19999, 'xyz')}\n`);
      return t;
    },
    solve(inp) {
      const s = inp.trim(); const t = `^#${s.split('').join('#')}#$`; const p = new Int32Array(t.length);
      let c = 0; let rr = 0; let best = 0;
      for (let i = 1; i < t.length - 1; i++) {
        if (i < rr) p[i] = Math.min(rr - i, p[2 * c - i]);
        while (t[i + p[i] + 1] === t[i - p[i] - 1]) p[i]++;
        if (i + p[i] > rr) { c = i; rr = i + p[i]; }
        best = Math.max(best, p[i]);
      }
      return `${best}\n`;
    },
  },
  {
    code: '1024', title: 'Bracket Check', difficulty: 1000, tags: ['stacks', 'strings'], timeLimitMs: 1500, checker: 'tokens-ci',
    legend: md`A bracket sequence built from ( ), [ ] and { } is **balanced** if every opening bracket is closed by a bracket of the same type, in the correct order. For example, ([]{}) is balanced while ([)] and (( are not.

Check several sequences.`,
    input: md`The first line contains $t$ ($1 \le t \le 10^5$). Each of the next $t$ lines contains a non-empty bracket sequence. The total length of all sequences is at most $10^6$.`,
    output: md`For each sequence print YES if it is balanced and NO otherwise. You may print the letters in any case (yes, Yes and YES are all accepted).`,
    samples: ['4\n([]{})\n([)]\n((\n{}\n'],
    tests(R) {
      const gen = (n) => {
        const pairs = ['()', '[]', '{}']; const st = []; let s = '';
        while (s.length + st.length < n) {
          if (st.length && (R.next() < 0.5 || s.length + st.length + 2 > n)) s += st.pop();
          else { const p = R.pick(pairs); s += p[0]; st.push(p[1]); }
        }
        while (st.length) s += st.pop();
        return s;
      };
      const mutate = (s) => { const i = R.int(0, s.length - 1); return s.slice(0, i) + R.pick('()[]{}'.split('')) + s.slice(i + 1); };
      const t = [];
      for (const [cnt, len] of [[10, 10], [1000, 50], [100000, 10], [10, 100000]]) {
        t.push(`${cnt}\n${lines(R.array(cnt, () => { const s = gen(len); return R.next() < 0.5 ? s : mutate(s); }))}`);
      }
      t.push(`1\n${'('.repeat(500000)}${')'.repeat(500000)}\n`);
      t.push(`2\n${'('.repeat(499999)}\n${')'.repeat(499999)}\n`);
      return t;
    },
    solve(inp) {
      const ls = inp.split('\n').map((x) => x.trim()); const t = Number(ls[0]); const out = [];
      const match = { ')': '(', ']': '[', '}': '{' };
      for (let i = 1; i <= t; i++) {
        const st = []; let ok = true;
        for (const ch of ls[i]) {
          if (ch in match) { if (st.pop() !== match[ch]) { ok = false; break; } } else st.push(ch);
        }
        out.push(ok && !st.length ? 'YES' : 'NO');
      }
      return lines(out);
    },
  },
  {
    code: '1025', title: 'Next Taller', difficulty: 1300, tags: ['stacks', 'data structures'], timeLimitMs: 1500,
    legend: md`$n$ people stand in a row; the $i$-th has height $h_i$. For every person, find the nearest person **to the right** who is strictly taller.`,
    input: md`The first line contains $n$ ($1 \le n \le 2 \cdot 10^5$). The second line contains $h_1, \ldots, h_n$ ($1 \le h_i \le 10^9$).`,
    output: md`Print $n$ integers: for each person the 1-based index of the nearest strictly taller person to the right, or $0$ if there is none.`,
    samples: ['6\n3 1 4 1 5 2\n'],
    tests(R) {
      const t = ['1\n5\n', `200000\n${R0(200000, (i) => 200000 - i).join(' ')}\n`, `200000\n${R0(200000, (i) => i + 1).join(' ')}\n`,
        `200000\n${Array(200000).fill(7).join(' ')}\n`];
      for (const [n, mx] of [[10, 5], [1000, 1e9], [200000, 1e9], [200000, 10]]) t.push(`${n}\n${R.array(n, () => R.int(1, mx)).join(' ')}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const h = r.ints(n); const ans = new Array(n).fill(0); const st = [];
      for (let i = n - 1; i >= 0; i--) {
        while (st.length && h[st[st.length - 1]] <= h[i]) st.pop();
        ans[i] = st.length ? st[st.length - 1] + 1 : 0;
        st.push(i);
      }
      return `${ans.join(' ')}\n`;
    },
  },
  {
    code: '1026', title: 'Window Maximum', difficulty: 1500, tags: ['data structures', 'two pointers', 'deque'], timeLimitMs: 1500,
    legend: md`Given an array $a_1, \ldots, a_n$ and a window size $k$, print the maximum of every window of $k$ consecutive elements, from left to right.`,
    input: md`The first line contains $n$ and $k$ ($1 \le k \le n \le 2 \cdot 10^5$). The second line contains $a_1, \ldots, a_n$ ($-10^9 \le a_i \le 10^9$).`,
    output: md`Print $n - k + 1$ integers — the window maxima.`,
    samples: ['8 3\n1 3 -1 -3 5 3 6 7\n'],
    tests(R) {
      const t = ['1 1\n-5\n'];
      for (const [n, k] of [[10, 1], [10, 10], [1000, 17], [200000, 1], [200000, 1000], [200000, 199999], [200000, 50000]]) {
        t.push(`${n} ${k}\n${R.array(n, () => R.int(-1e9, 1e9)).join(' ')}\n`);
      }
      t.push(`200000 500\n${R0(200000, (i) => 200000 - i).join(' ')}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const k = r.int(); const a = r.ints(n);
      const dq = new Int32Array(n); let h = 0; let tl = 0; const out = [];
      for (let i = 0; i < n; i++) {
        while (tl > h && a[dq[tl - 1]] <= a[i]) tl--;
        dq[tl++] = i;
        if (dq[h] <= i - k) h++;
        if (i >= k - 1) out.push(a[dq[h]]);
      }
      return `${out.join(' ')}\n`;
    },
  },
  {
    code: '1027', title: 'Dynamic Range Sum', difficulty: 1600, tags: ['data structures', 'fenwick tree', 'segment tree'], timeLimitMs: 2000,
    legend: md`Maintain an array $a_1, \ldots, a_n$ under two kinds of operations:

- 1 i x — set $a_i := x$;
- 2 l r — report $a_l + a_{l+1} + \cdots + a_r$.`,
    input: md`The first line contains $n$ and $q$ ($1 \le n, q \le 10^5$). The second line contains the initial array ($-10^9 \le a_i \le 10^9$). Each of the next $q$ lines contains an operation ($1 \le i \le n$, $-10^9 \le x \le 10^9$, $1 \le l \le r \le n$).`,
    output: md`For every operation of type 2 print the requested sum.`,
    samples: ['5 4\n1 2 3 4 5\n2 1 5\n1 3 10\n2 2 4\n2 3 3\n'],
    tests(R) {
      const t = ['1 2\n7\n1 1 -7\n2 1 1\n'];
      for (const [n, q] of [[10, 10], [1000, 1000], [100000, 100000], [100000, 100000]]) {
        t.push(`${n} ${q}\n${R.array(n, () => R.int(-1e9, 1e9)).join(' ')}\n${lines(updateQueries(R, n, q, -1e9, 1e9))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const q = r.int(); const a = [0, ...r.ints(n)];
      const bit = new Float64Array(n + 1);
      const add = (i, v) => { for (; i <= n; i += i & -i) bit[i] += v; };
      const sum = (i) => { let s = 0; for (; i > 0; i -= i & -i) s += bit[i]; return s; };
      for (let i = 1; i <= n; i++) add(i, a[i]);
      const out = [];
      for (let k = 0; k < q; k++) {
        const ty = r.int(); const x = r.int(); const y = r.int();
        if (ty === 1) { add(x, y - a[x]); a[x] = y; } else out.push(sum(y) - sum(x - 1));
      }
      return lines(out);
    },
  },
  {
    code: '1028', title: 'Range Minimum', difficulty: 1700, tags: ['data structures', 'segment tree'], timeLimitMs: 2000,
    legend: md`Maintain an array $a_1, \ldots, a_n$ under two kinds of operations:

- 1 i x — set $a_i := x$;
- 2 l r — report $\min(a_l, a_{l+1}, \ldots, a_r)$.`,
    input: md`The first line contains $n$ and $q$ ($1 \le n, q \le 10^5$). The second line contains the initial array ($1 \le a_i \le 10^9$). Each of the next $q$ lines contains an operation ($1 \le i \le n$, $1 \le x \le 10^9$, $1 \le l \le r \le n$).`,
    output: md`For every operation of type 2 print the minimum.`,
    samples: ['5 5\n4 2 7 1 9\n2 1 3\n2 1 5\n1 4 8\n2 3 5\n2 4 4\n'],
    tests(R) {
      const t = [];
      for (const [n, q] of [[1, 3], [10, 10], [1000, 1000], [100000, 100000], [100000, 100000]]) {
        t.push(`${n} ${q}\n${R.array(n, () => R.int(1, 1e9)).join(' ')}\n${lines(updateQueries(R, n, q, 1, 1e9))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const q = r.int();
      let size = 1; while (size < n) size <<= 1;
      const tr = new Float64Array(2 * size).fill(Infinity);
      for (let i = 0; i < n; i++) tr[size + i] = r.int();
      for (let i = size - 1; i > 0; i--) tr[i] = Math.min(tr[2 * i], tr[2 * i + 1]);
      const out = [];
      for (let k = 0; k < q; k++) {
        const ty = r.int(); const x = r.int(); const y = r.int();
        if (ty === 1) { let i = size + x - 1; tr[i] = y; for (i >>= 1; i; i >>= 1) tr[i] = Math.min(tr[2 * i], tr[2 * i + 1]); } else {
          let lo = size + x - 1; let hi = size + y; let m = Infinity;
          while (lo < hi) { if (lo & 1) m = Math.min(m, tr[lo++]); if (hi & 1) m = Math.min(m, tr[--hi]); lo >>= 1; hi >>= 1; }
          out.push(m);
        }
      }
      return lines(out);
    },
  },
  {
    code: '1029', title: 'Counting Inversions', difficulty: 1700, tags: ['data structures', 'divide and conquer', 'sortings'], timeLimitMs: 2000,
    legend: md`An *inversion* in an array $a$ is a pair of indices $i < j$ with $a_i > a_j$. Count the inversions.`,
    input: md`The first line contains $n$ ($1 \le n \le 2 \cdot 10^5$). The second line contains $a_1, \ldots, a_n$ ($1 \le a_i \le 10^9$).`,
    output: md`Print the number of inversions.`,
    samples: ['5\n2 4 1 3 5\n', '3\n5 5 5\n'],
    tests(R) {
      const t = ['1\n1\n', `200000\n${R0(200000, (i) => 200000 - i).join(' ')}\n`, `200000\n${R0(200000, (i) => i + 1).join(' ')}\n`];
      for (const [n, mx] of [[10, 10], [1000, 1e9], [200000, 1e9], [200000, 3]]) t.push(`${n}\n${R.array(n, () => R.int(1, mx)).join(' ')}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const a = r.ints(n);
      const sorted = [...new Set(a)].sort((x, y) => x - y); const rank = new Map(sorted.map((v, i) => [v, i + 1]));
      const m = sorted.length; const bit = new Int32Array(m + 1); let inv = 0;
      for (let i = n - 1; i >= 0; i--) {
        const k = rank.get(a[i]);
        for (let j = k - 1; j > 0; j -= j & -j) inv += bit[j];
        for (let j = k; j <= m; j += j & -j) bit[j]++;
      }
      return `${inv}\n`;
    },
  },
  {
    code: '1030', title: 'Counting Islands', difficulty: 1200, tags: ['graphs', 'dfs and similar', 'bfs'], timeLimitMs: 2000,
    legend: md`A satellite photo is an $n \times m$ grid: # is land and . is water. An *island* is a maximal group of land cells connected through shared sides. Count the islands.`,
    input: md`The first line contains $n$ and $m$ ($1 \le n, m \le 800$). Each of the next $n$ lines contains $m$ characters.`,
    output: md`Print the number of islands.`,
    samples: ['4 5\n##..#\n#...#\n..#..\n.....\n'],
    tests(R) {
      const t = ['1 1\n.\n', '1 1\n#\n', `800 800\n${lines(Array(800).fill('#'.repeat(800)))}`,
        `800 800\n${lines(R0(800, (i) => R0(800, (j) => ((i + j) % 2 ? '.' : '#')).join('')))}`];
      for (const [n, m, d] of [[10, 10, 0.5], [100, 200, 0.45], [800, 800, 0.4], [800, 800, 0.6], [800, 1, 0.5]]) {
        t.push(`${n} ${m}\n${lines(R.array(n, () => R.array(m, () => (R.next() < d ? '#' : '.')).join('')))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const m = r.int(); const g = R0(n, () => r.str());
      const seen = new Uint8Array(n * m); const st = new Int32Array(n * m); let cnt = 0;
      for (let s = 0; s < n * m; s++) {
        if (seen[s] || g[Math.floor(s / m)][s % m] !== '#') continue;
        cnt++; let top = 0; st[top++] = s; seen[s] = 1;
        while (top) {
          const c = st[--top]; const i = Math.floor(c / m); const j = c % m;
          for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
            if (a < 0 || b < 0 || a >= n || b >= m || g[a][b] !== '#') continue;
            const k = a * m + b; if (!seen[k]) { seen[k] = 1; st[top++] = k; }
          }
        }
      }
      return `${cnt}\n`;
    },
  },
];

function R0(n, f) { return Array.from({ length: n }, (_, i) => f(i)); }
