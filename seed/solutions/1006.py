import sys
from bisect import bisect_right
d = sys.stdin.buffer.read().split(); n, q = int(d[0]), int(d[1])
a = sorted(map(int, d[2:2 + n]))
print(' '.join(str(bisect_right(a, int(x))) for x in d[2 + n:2 + n + q]))
