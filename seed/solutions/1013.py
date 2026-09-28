import sys
d = sys.stdin.buffer.read().split(); n, m = int(d[0]), int(d[1])
W = m + 2
wall = bytearray(b'#' * (W * (n + 2)))
s = e = 0
for i in range(n):
    row = d[2 + i]; base = (i + 1) * W + 1
    wall[base:base + m] = row
    k = row.find(b'S')
    if k >= 0: s = base + k
    k = row.find(b'E')
    if k >= 0: e = base + k
dist = [-1] * len(wall); dist[s] = 0; q = [s]; h = 0; steps = (1, -1, W, -W)
while h < len(q):
    c = q[h]; h += 1
    if c == e: break
    nd = dist[c] + 1
    for st in steps:
        k = c + st
        if wall[k] != 35 and dist[k] < 0:
            dist[k] = nd; q.append(k)
print(dist[e])
