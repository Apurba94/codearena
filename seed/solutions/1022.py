import sys
s, p = sys.stdin.buffer.read().split()
m = len(p); pi = [0] * m; k = 0
for i in range(1, m):
    while k and p[i] != p[k]: k = pi[k - 1]
    if p[i] == p[k]: k += 1
    pi[i] = k
cnt = 0; k = 0
for c in s:
    while k and c != p[k]: k = pi[k - 1]
    if c == p[k]: k += 1
    if k == m:
        cnt += 1; k = pi[k - 1]
print(cnt)
