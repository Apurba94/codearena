import sys, heapq
d = sys.stdin.buffer.read().split(); n, m = int(d[0]), int(d[1])
adj = [[] for _ in range(n + 1)]
for i in range(m):
    a, b, c = int(d[2 + 3 * i]), int(d[3 + 3 * i]), int(d[4 + 3 * i])
    adj[a].append((b, c))
INF = float('inf'); dist = [INF] * (n + 1); dist[1] = 0; pq = [(0, 1)]
while pq:
    du, u = heapq.heappop(pq)
    if du > dist[u]: continue
    for v, c in adj[u]:
        nd = du + c
        if nd < dist[v]:
            dist[v] = nd; heapq.heappush(pq, (nd, v))
print(' '.join(str(x) if x != INF else '-1' for x in dist[1:]))
