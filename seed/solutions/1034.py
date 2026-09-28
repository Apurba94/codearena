import sys
d = sys.stdin.buffer.read().split(); n, q = int(d[0]), int(d[1])
adj = [[] for _ in range(n + 1)]; pos = 2
for _ in range(n - 1):
    a, b = int(d[pos]), int(d[pos + 1]); pos += 2; adj[a].append(b); adj[b].append(a)
depth = [-1] * (n + 1); par = [0] * (n + 1); depth[1] = 0; par[1] = 1; order = [1]
for u in order:
    for v in adj[u]:
        if depth[v] < 0:
            depth[v] = depth[u] + 1; par[v] = u; order.append(v)
LOG = max(1, n.bit_length()); up = [par]
for k in range(1, LOG):
    prev = up[-1]; up.append([prev[prev[v]] for v in range(n + 1)])
out = []
for _ in range(q):
    u, v = int(d[pos]), int(d[pos + 1]); pos += 2
    du, dv = depth[u], depth[v]
    if du < dv: u, v, du, dv = v, u, dv, du
    diff = du - dv; k = 0
    while diff:
        if diff & 1: u = up[k][u]
        diff >>= 1; k += 1
    if u != v:
        for k in range(LOG - 1, -1, -1):
            uk = up[k]
            if uk[u] != uk[v]:
                u = uk[u]; v = uk[v]
        u = par[u]
    out.append(du + dv - 2 * depth[u])
print('\n'.join(map(str, out)))
