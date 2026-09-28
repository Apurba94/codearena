import sys
from collections import Counter
d = sys.stdin.read().split(); n = int(d[0])
c = Counter(d[1:1 + n]); w, k = min(c.items(), key=lambda it: (-it[1], it[0]))
print(w, k)
