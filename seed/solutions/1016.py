import sys
d = sys.stdin.buffer.read().split(); n, m = int(d[0]), int(d[1])
es = sorted((int(d[4 + 3 * i]), int(d[2 + 3 * i]), int(d[3 + 3 * i])) for i in range(m))
p = list(range(n + 1))
def find(x):
    while p[x] != x:
        p[x] = p[p[x]]; x = p[x]
    return x
cost = used = 0
for c, a, b in es:
    a, b = find(a), find(b)
    if a != b:
        p[a] = b; cost += c; used += 1
print(cost if used == n - 1 else 'IMPOSSIBLE')
