import sys
d = sys.stdin.buffer.read().split(); n, q = int(d[0]), int(d[1])
size = 1
while size < n: size *= 2
INF = 1 << 62; tr = [INF] * (2 * size); tr[size:size + n] = map(int, d[2:2 + n])
for i in range(size - 1, 0, -1): tr[i] = min(tr[2 * i], tr[2 * i + 1])
out = []; pos = 2 + n
for _ in range(q):
    t, x, y = int(d[pos]), int(d[pos + 1]), int(d[pos + 2]); pos += 3
    if t == 1:
        i = size + x - 1; tr[i] = y; i >>= 1
        while i:
            l, r = tr[2 * i], tr[2 * i + 1]; tr[i] = l if l < r else r; i >>= 1
    else:
        lo, hi, m = size + x - 1, size + y, INF
        while lo < hi:
            if lo & 1:
                if tr[lo] < m: m = tr[lo]
                lo += 1
            if hi & 1:
                hi -= 1
                if tr[hi] < m: m = tr[hi]
            lo >>= 1; hi >>= 1
        out.append(m)
print('\n'.join(map(str, out)))
