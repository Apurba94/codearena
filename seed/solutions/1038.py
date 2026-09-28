import sys
from collections import Counter
d = sys.stdin.buffer.read().split(); n, S = int(d[0]), int(d[1]); a = list(map(int, d[2:2 + n]))
def sums(arr):
    s = [0]
    for x in arr: s += [v + x for v in s]
    return s
h = n // 2; left = Counter(sums(a[:h]))
print(sum(left.get(S - v, 0) for v in sums(a[h:])))
