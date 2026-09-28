import sys
s = sys.stdin.readline().strip()
t = '^#' + '#'.join(s) + '#$'; n = len(t); p = [0] * n; c = r = best = 0
for i in range(1, n - 1):
    if i < r: p[i] = min(r - i, p[2 * c - i])
    while t[i + p[i] + 1] == t[i - p[i] - 1]: p[i] += 1
    if i + p[i] > r: c, r = i, i + p[i]
    if p[i] > best: best = p[i]
print(best)
