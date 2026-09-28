import { lines, md, reader } from '../lib.js';

const gcdBig = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };

export default [
  {
    code: '1001', title: 'Sum of Two', difficulty: 800, tags: ['implementation', 'math'], timeLimitMs: 1000,
    legend: md`Warm-up time! You are given two integers $a$ and $b$. Print their sum.

Be careful: the numbers can be much larger than a 32-bit integer can hold.`,
    input: md`The only line contains two integers $a$ and $b$ ($-10^{18} \le a, b \le 10^{18}$).`,
    output: md`Print one integer — the value of $a + b$.`,
    samples: ['3 5\n', '-1000000000000000000 -1000000000000000000\n'],
    tests(R) {
      const t = ['0 0\n', '1000000000000000000 1000000000000000000\n', '-7 7\n', '999999999999999999 1\n'];
      for (let i = 0; i < 8; i++) t.push(`${R.big(-(10n ** 18n), 10n ** 18n)} ${R.big(-(10n ** 18n), 10n ** 18n)}\n`);
      return t;
    },
    solve(inp) { const r = reader(inp); return `${r.big() + r.big()}\n`; },
  },
  {
    code: '1002', title: 'Digit Sum', difficulty: 800, tags: ['implementation', 'strings'], timeLimitMs: 1000,
    legend: md`A cashier writes enormous numbers on a long paper tape. To check them quickly, she only compares the **sum of the digits**.

Given a positive integer $N$, compute the sum of its decimal digits.`,
    input: md`A single line with the integer $N$ ($1 \le N < 10^{100\,000}$), written without leading zeros.`,
    output: md`Print the sum of the digits of $N$.`,
    notes: md`In the first example $1 + 2 + 3 + 4 = 10$.`,
    samples: ['1234\n', '7\n'],
    tests(R) {
      const t = ['1\n', '9\n', `1${'0'.repeat(99999)}\n`, `${'9'.repeat(100000)}\n`];
      for (const len of [2, 10, 50, 1000, 30000, 99999, 100000]) t.push(`${R.int(1, 9)}${R.str(len - 1, '0123456789')}\n`);
      return t;
    },
    solve(inp) { let s = 0; for (const ch of inp.trim()) s += ch.charCodeAt(0) - 48; return `${s}\n`; },
  },
  {
    code: '1003', title: 'Temperature Swings', difficulty: 800, tags: ['implementation'], timeLimitMs: 1000,
    legend: md`A weather station recorded the temperature once per day for $n$ consecutive days: $t_1, t_2, \ldots, t_n$.

The *swing* between two consecutive days $i$ and $i+1$ is $|t_{i+1} - t_i|$. Find the largest swing. If there is only one day, the answer is $0$.`,
    input: md`The first line contains $n$ ($1 \le n \le 2 \cdot 10^5$). The second line contains $n$ integers $t_i$ ($-10^9 \le t_i \le 10^9$).`,
    output: md`Print the largest swing.`,
    notes: md`In the first example the swings are $3, 7, 2$; the largest is $7$.`,
    samples: ['4\n1 4 -3 -1\n', '1\n42\n'],
    tests(R) {
      const t = ['2\n-1000000000 1000000000\n', '3\n5 5 5\n'];
      for (const n of [5, 10, 100, 1000, 200000, 200000]) t.push(`${n}\n${R.array(n, () => R.int(-1e9, 1e9)).join(' ')}\n`);
      t.push(`200000\n${R.array(200000, () => R.int(-3, 3)).join(' ')}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const a = r.ints(n); let best = 0;
      for (let i = 1; i < n; i++) best = Math.max(best, Math.abs(a[i] - a[i - 1]));
      return `${best}\n`;
    },
  },
  {
    code: '1004', title: 'Divisible Count', difficulty: 1100, tags: ['math', 'number theory'], timeLimitMs: 1000,
    legend: md`How many integers from $1$ to $n$ (inclusive) are divisible by $a$ **or** by $b$ (or by both)?`,
    input: md`One line with three integers $n$, $a$, $b$ ($1 \le n \le 10^{18}$, $1 \le a, b \le 10^9$).`,
    output: md`Print the count.`,
    notes: md`For $n = 10, a = 2, b = 3$ the numbers are $2, 3, 4, 6, 8, 9, 10$ — seven of them.`,
    samples: ['10 2 3\n', '100 7 7\n'],
    tests(R) {
      const t = ['1 1 1\n', '1000000000000000000 1 1\n', '1000000000000000000 1000000000 999999999\n', '5 10 20\n',
        '1000000000000000000 999999937 999999929\n'];
      for (let i = 0; i < 8; i++) t.push(`${R.big(1n, 10n ** 18n)} ${R.int(1, i < 4 ? 100 : 1e9)} ${R.int(1, i < 4 ? 100 : 1e9)}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.big(); const a = r.big(); const b = r.big();
      const l = (a / gcdBig(a, b)) * b;
      return `${n / a + n / b - n / l}\n`;
    },
  },
  {
    code: '1005', title: 'Range Sum Queries', difficulty: 1100, tags: ['prefix sums', 'implementation'], timeLimitMs: 1500,
    legend: md`You are given an array $a_1, a_2, \ldots, a_n$ and $q$ queries. Each query gives two indices $l \le r$; answer with $a_l + a_{l+1} + \cdots + a_r$.`,
    input: md`The first line contains $n$ and $q$ ($1 \le n, q \le 2 \cdot 10^5$). The second line contains $a_1, \ldots, a_n$ ($-10^9 \le a_i \le 10^9$). Each of the next $q$ lines contains $l$ and $r$ ($1 \le l \le r \le n$).`,
    output: md`For each query print the sum on its own line.`,
    samples: ['5 3\n1 2 3 4 5\n1 5\n2 3\n4 4\n'],
    tests(R) {
      const t = [];
      for (const [n, q] of [[1, 1], [10, 10], [1000, 1000], [200000, 200000], [200000, 200000]]) {
        const a = R.array(n, () => R.int(-1e9, 1e9));
        const qs = R.array(q, () => { const l = R.int(1, n); return `${l} ${R.int(l, n)}`; });
        t.push(`${n} ${q}\n${a.join(' ')}\n${lines(qs)}`);
      }
      t.push(`200000 200000\n${Array(200000).fill(1e9).join(' ')}\n${lines(Array(200000).fill('1 200000'))}`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const q = r.int();
      const p = new Array(n + 1); p[0] = 0;
      for (let i = 1; i <= n; i++) p[i] = p[i - 1] + r.int();
      const out = [];
      for (let i = 0; i < q; i++) { const l = r.int(); const rr = r.int(); out.push(p[rr] - p[l - 1]); }
      return lines(out);
    },
  },
  {
    code: '1006', title: 'Counting Below', difficulty: 1200, tags: ['binary search', 'sortings'], timeLimitMs: 1500,
    legend: md`A shop has $n$ products with prices $a_1, \ldots, a_n$. For each of $q$ customers you know their budget $x$. Tell each customer how many products cost **at most** $x$.`,
    input: md`The first line contains $n$ and $q$ ($1 \le n, q \le 2 \cdot 10^5$). The second line contains the prices $a_i$ ($1 \le a_i \le 10^9$). The third line contains the $q$ budgets $x_j$ ($0 \le x_j \le 2 \cdot 10^9$).`,
    output: md`Print $q$ integers separated by spaces — the answers in the order of the customers.`,
    samples: ['5 4\n3 10 3 1 7\n0 3 8 100\n'],
    tests(R) {
      const t = [];
      for (const [n, q, mx] of [[1, 3, 10], [100, 100, 50], [1000, 1000, 1e9], [200000, 200000, 1e9], [200000, 200000, 1000]]) {
        t.push(`${n} ${q}\n${R.array(n, () => R.int(1, mx)).join(' ')}\n${R.array(q, () => R.int(0, Math.min(2e9, mx + 5))).join(' ')}\n`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const q = r.int();
      const a = Float64Array.from(r.ints(n)).sort();
      const out = new Array(q);
      for (let i = 0; i < q; i++) {
        const x = r.int(); let lo = 0; let hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] <= x) lo = m + 1; else hi = m; }
        out[i] = lo;
      }
      return `${out.join(' ')}\n`;
    },
  },
  {
    code: '1007', title: 'Union of Intervals', difficulty: 1300, tags: ['sortings', 'greedy'], timeLimitMs: 1500,
    legend: md`A road is painted by $n$ workers. Worker $i$ paints the half-open segment $[l_i, r_i)$. Segments may overlap. What is the total length of road that got painted at least once?`,
    input: md`The first line contains $n$ ($1 \le n \le 2 \cdot 10^5$). Each of the next $n$ lines contains $l_i$ and $r_i$ ($0 \le l_i < r_i \le 10^9$).`,
    output: md`Print the total painted length.`,
    notes: md`In the first example the painted parts are $[1, 6)$ and $[8, 10)$, total $5 + 2 = 7$.`,
    samples: ['3\n1 4\n2 6\n8 10\n'],
    tests(R) {
      const t = ['1\n0 1000000000\n', '2\n0 5\n5 10\n'];
      for (const [n, span, len] of [[10, 100, 20], [1000, 1e6, 1000], [200000, 1e9, 1e4], [200000, 1e9, 1e7], [200000, 1e5, 10]]) {
        t.push(`${n}\n${lines(R.array(n, () => { const l = R.int(0, span - 1); return `${l} ${Math.min(1e9, l + R.int(1, len))}`; }))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int();
      const seg = R0(n, () => [r.int(), r.int()]).sort((x, y) => x[0] - y[0]);
      let total = 0; let cs = -1; let ce = -1;
      for (const [l, rr] of seg) {
        if (l > ce) { if (ce > cs) total += ce - cs; cs = l; ce = rr; } else ce = Math.max(ce, rr);
      }
      total += ce - cs;
      return `${total}\n`;
    },
  },
  {
    code: '1008', title: 'Longest Increasing Subsequence', difficulty: 1500, tags: ['dp', 'binary search'], timeLimitMs: 1500,
    legend: md`Given a sequence $a_1, \ldots, a_n$, find the length of its longest **strictly** increasing subsequence. A subsequence keeps the original order but may skip elements.`,
    input: md`The first line contains $n$ ($1 \le n \le 2 \cdot 10^5$). The second line contains $a_1, \ldots, a_n$ ($1 \le a_i \le 10^9$).`,
    output: md`Print the length of the longest strictly increasing subsequence.`,
    notes: md`In the first example one optimal subsequence is $2, 3, 7, 18$.`,
    samples: ['8\n10 9 2 5 3 7 101 18\n', '5\n4 4 4 4 4\n'],
    tests(R) {
      const t = [`200000\n${R0(200000, (i) => i + 1).join(' ')}\n`, `200000\n${R0(200000, (i) => 200000 - i).join(' ')}\n`];
      for (const [n, mx] of [[10, 10], [100, 1e9], [5000, 100], [200000, 1e9], [200000, 1000]]) t.push(`${n}\n${R.array(n, () => R.int(1, mx)).join(' ')}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const tail = [];
      for (let i = 0; i < n; i++) {
        const x = r.int(); let lo = 0; let hi = tail.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (tail[m] < x) lo = m + 1; else hi = m; }
        tail[lo] = x;
      }
      return `${tail.length}\n`;
    },
  },
  {
    code: '1009', title: 'Backpack', difficulty: 1500, tags: ['dp', 'knapsack'], timeLimitMs: 2000,
    legend: md`You are packing for a hike. There are $n$ items; item $i$ weighs $w_i$ and is worth $v_i$. Your backpack holds at most $W$ total weight. Each item can be taken at most once. What is the maximum total worth you can carry?`,
    input: md`The first line contains $n$ and $W$ ($1 \le n \le 100$, $1 \le W \le 5 \cdot 10^4$). Each of the next $n$ lines contains $w_i$ and $v_i$ ($1 \le w_i \le W$, $1 \le v_i \le 10^9$).`,
    output: md`Print the maximum total worth.`,
    notes: md`In the first example take items $1$ and $3$ (weight $3 + 5 = 8$, worth $30 + 50 = 80$).`,
    samples: ['3 8\n3 30\n4 50\n5 50\n'],
    tests(R) {
      const t = ['1 1\n1 1000000000\n'];
      for (const [n, W, mw] of [[5, 10, 10], [20, 100, 50], [100, 50000, 50000], [100, 50000, 1000], [100, 50000, 25000]]) {
        t.push(`${n} ${W}\n${lines(R.array(n, () => `${R.int(1, mw)} ${R.int(1, 1e9)}`))}`);
      }
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const W = r.int();
      const dp = new Float64Array(W + 1);
      for (let i = 0; i < n; i++) {
        const w = r.int(); const v = r.int();
        for (let c = W; c >= w; c--) if (dp[c - w] + v > dp[c]) dp[c] = dp[c - w] + v;
      }
      return `${dp[W]}\n`;
    },
  },
  {
    code: '1010', title: 'Coin Combinations', difficulty: 1400, tags: ['dp', 'combinatorics'], timeLimitMs: 2000,
    legend: md`A country has $n$ kinds of coins with distinct values $c_1, \ldots, c_n$, and an unlimited supply of each. In how many different ways can you pay exactly $x$? Two ways are different if some coin value is used a different number of times (the order of coins does not matter).

Print the answer modulo $10^9 + 7$.`,
    input: md`The first line contains $n$ and $x$ ($1 \le n \le 50$, $1 \le x \le 5 \cdot 10^4$). The second line contains the distinct values $c_i$ ($1 \le c_i \le 5 \cdot 10^4$).`,
    output: md`Print the number of ways modulo $10^9 + 7$.`,
    notes: md`For $x = 9$ with coins $2, 3, 5$: $\{2,2,5\}$, $\{3,3,3\}$, $\{2,2,2,3\}$ — three ways.`,
    samples: ['3 9\n2 3 5\n', '1 7\n2\n'],
    tests(R) {
      const t = ['1 50000\n1\n'];
      for (const [n, x, mc] of [[5, 100, 30], [10, 1000, 100], [50, 50000, 1000], [50, 50000, 50], [30, 49999, 50000]]) {
        const s = new Set(); while (s.size < n) s.add(R.int(1, mc));
        t.push(`${n} ${x}\n${[...s].join(' ')}\n`);
      }
      t.push(`50 50000\n${R0(50, (i) => i + 1).join(' ')}\n`);
      return t;
    },
    solve(inp) {
      const r = reader(inp); const n = r.int(); const x = r.int(); const M = 1e9 + 7;
      const dp = new Array(x + 1).fill(0); dp[0] = 1;
      for (let i = 0; i < n; i++) { const c = r.int(); for (let s = c; s <= x; s++) dp[s] = (dp[s] + dp[s - c]) % M; }
      return `${dp[x]}\n`;
    },
  },
];

function R0(n, f) { return Array.from({ length: n }, (_, i) => f(i)); }
