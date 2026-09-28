import sys
d = sys.stdin.buffer.read().split(); n, m = int(d[0]), int(d[1]); g = d[2:2 + n]; M = 10**9 + 7
dp = [0] * m
for i in range(n):
    row = g[i]; left = 0
    for j in range(m):
        if row[j] == 35:  # '#'
            left = 0
        elif i == 0 and j == 0:
            left = 1
        else:
            left = (dp[j] + left) % M
        dp[j] = left
print(dp[m - 1])
