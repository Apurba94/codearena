import sys
d = sys.stdin.buffer.read().split(); n, m = int(d[0]), int(d[1])
p = list(range(n + 1)); comps = n; out = []
def find(x):
    while p[x] != x:
        p[x] = p[p[x]]; x = p[x]
    return x
for i in range(m):
    a, b = find(int(d[2 + 2 * i])), find(int(d[3 + 2 * i]))
    if a != b:
        p[a] = b; comps -= 1
    out.append(comps)
print('\n'.join(map(str, out)))
