import sys
d = sys.stdin.buffer.read().split(); n = int(d[0])
best = -10**30; cur = 0
for x in map(int, d[1:1 + n]):
    cur = x if cur < 0 else cur + x
    if cur > best: best = cur
print(best)
