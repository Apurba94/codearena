import sys
from collections import deque
d = sys.stdin.buffer.read().split(); n, k = int(d[0]), int(d[1]); a = list(map(int, d[2:2 + n]))
dq = deque(); out = []
for i, x in enumerate(a):
    while dq and a[dq[-1]] <= x: dq.pop()
    dq.append(i)
    if dq[0] <= i - k: dq.popleft()
    if i >= k - 1: out.append(a[dq[0]])
print(' '.join(map(str, out)))
