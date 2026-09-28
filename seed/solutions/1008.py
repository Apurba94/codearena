import sys
from bisect import bisect_left
d = sys.stdin.buffer.read().split(); n = int(d[0])
tail = []
for x in map(int, d[1:1 + n]):
    i = bisect_left(tail, x)
    if i == len(tail): tail.append(x)
    else: tail[i] = x
print(len(tail))
