import sys
from math import gcd
from functools import reduce
d = sys.stdin.buffer.read().split(); n = int(d[0]); a = list(map(int, d[1:1 + n]))
g = reduce(gcd, a)
print(g, a.count(g))
