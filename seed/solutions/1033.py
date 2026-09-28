import sys
d = sys.stdin.buffer.read().split(); n = int(d[0])
adj = [[] for _ in range(n + 1)]
for i in range(n - 1):
    u, v, w = int(d[1 + 3 * i]), int(d[2 + 3 * i]), int(d[3 + 3 * i]); adj[u].append((v, w)); adj[v].append((u, w))
def far(src):
    dist = [-1] * (n + 1); dist[src] = 0; st = [src]
    while st:
        u = st.pop()
        for v, w in adj[u]:
            if dist[v] < 0:
                dist[v] = dist[u] + w; st.append(v)
    b = max(range(1, n + 1), key=dist.__getitem__)
    return b, dist[b]
a, _ = far(1)
print(far(a)[1])
