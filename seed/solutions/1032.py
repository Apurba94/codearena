import sys
from collections import Counter
d = sys.stdin.buffer.read().split(); n, x = int(d[0]), int(d[1])
c = Counter(map(int, d[2:2 + n])); total = 0
for v, k in c.items():
    w = x - v
    if w == v: total += k * (k - 1)
    elif w in c: total += k * c[w]
print(total // 2)
