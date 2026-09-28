import sys
d = sys.stdin.buffer.read().split(); n = int(d[0]); v = list(map(int, d[1:1 + 2 * n]))
seg = sorted(zip(v[::2], v[1::2]))
total = 0; cs, ce = seg[0]
for l, r in seg[1:]:
    if l > ce:
        total += ce - cs; cs, ce = l, r
    elif r > ce:
        ce = r
print(total + ce - cs)
