import sys
from itertools import accumulate
d = sys.stdin.buffer.read().split(); n, q = int(d[0]), int(d[1])
p = [0] + list(accumulate(map(int, d[2:2 + n])))
it = iter(map(int, d[2 + n:]))
print('\n'.join(str(p[r] - p[l - 1]) for l, r in zip(it, it)))
