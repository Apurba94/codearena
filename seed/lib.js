/** Deterministic RNG + helpers used by problem generators (same seed => identical tests). */
export function rng(seed) {
  let a = seed >>> 0;
  const u32 = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const next = () => ((u32() >>> 5) * 67108864 + (u32() >>> 6)) / 9007199254740992; // 53-bit float in [0,1)
  const R = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    big: (lo, hi) => {
      const L = BigInt(lo);
      const span = BigInt(hi) - L + 1n;
      const r = (BigInt(u32()) << 64n) | (BigInt(u32()) << 32n) | BigInt(u32());
      return L + (r % span);
    },
    pick: (arr) => arr[R.int(0, arr.length - 1)],
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = R.int(0, i);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    array: (n, f) => Array.from({ length: n }, (_, i) => f(i)),
    str: (n, alpha = 'abcdefghijklmnopqrstuvwxyz') => {
      let s = '';
      for (let i = 0; i < n; i++) s += alpha[R.int(0, alpha.length - 1)];
      return s;
    },
    /** Random tree on vertices 1..n as [u, v] edges (random-parent with shuffled labels). */
    tree: (n, { deep = false } = {}) => {
      const label = R.shuffle(Array.from({ length: n }, (_, i) => i + 1));
      const edges = [];
      for (let i = 1; i < n; i++) {
        const p = deep ? Math.max(0, i - R.int(1, 3)) : R.int(0, i - 1);
        edges.push([label[i], label[p]]);
      }
      return R.shuffle(edges);
    },
  };
  return R;
}

/** Whitespace tokenizer for reference solvers. */
export function reader(input) {
  const t = input.split(/\s+/).filter(Boolean);
  let i = 0;
  return {
    int: () => Number(t[i++]),
    big: () => BigInt(t[i++]),
    str: () => t[i++],
    ints: (n) => {
      const a = new Array(n);
      for (let k = 0; k < n; k++) a[k] = Number(t[i++]);
      return a;
    },
    left: () => t.length - i,
  };
}

/** Exact (a * b) % m for 0 <= a, b < m < 2^31 using float-safe halves. */
export function mulmod(a, b, m) {
  return (((a * (b >>> 16)) % m) * 65536 + a * (b & 65535)) % m;
}

export function powmod(a, e, m) {
  let r = 1 % m;
  a %= m;
  while (e > 0) {
    if (e & 1) r = mulmod(r, a, m);
    a = mulmod(a, a, m);
    e = Math.floor(e / 2);
  }
  return r;
}

/** Binary min-heap of numbers. */
export class MinHeap {
  constructor(cmp = (x, y) => x - y) {
    this.a = [];
    this.cmp = cmp;
  }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

export const md = String.raw;
export const lines = (arr) => `${arr.join('\n')}\n`;
