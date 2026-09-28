import sys
d = sys.stdin.buffer.read().split(); n, x = int(d[0]), int(d[1]); M = 10**9 + 7
dp = [0] * (x + 1); dp[0] = 1
for c in map(int, d[2:2 + n]):
    for s in range(c, x + 1):
        v = dp[s] + dp[s - c]
        dp[s] = v - M if v >= M else v
print(dp[x])
