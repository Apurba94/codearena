import sys
d = sys.stdin.buffer.read().split(); n, W = int(d[0]), int(d[1])
dp = [0] * (W + 1)
for i in range(n):
    w, v = int(d[2 + 2 * i]), int(d[3 + 2 * i])
    if w <= W:
        dp[w:] = [a if a >= b + v else b + v for a, b in zip(dp[w:], dp[:W + 1 - w])]
print(dp[W])
