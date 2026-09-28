import sys
d = sys.stdin.buffer.read().split(); n, q = int(d[0]), int(d[1])
a = [0] + list(map(int, d[2:2 + n])); bit = [0] * (n + 1)
for i in range(1, n + 1):
    bit[i] += a[i]; j = i + (i & -i)
    if j <= n: bit[j] += bit[i]
out = []; pos = 2 + n
for _ in range(q):
    t, x, y = int(d[pos]), int(d[pos + 1]), int(d[pos + 2]); pos += 3
    if t == 1:
        delta = y - a[x]; a[x] = y
        while x <= n: bit[x] += delta; x += x & -x
    else:
        s = 0; r = y
        while r > 0: s += bit[r]; r -= r & -r
        r = x - 1
        while r > 0: s -= bit[r]; r -= r & -r
        out.append(s)
print('\n'.join(map(str, out)))
