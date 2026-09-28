import sys
d = sys.stdin.buffer.read().split(); q = int(d[0]); M = 10**9 + 7
qs = [(int(d[1 + 2 * i]), int(d[2 + 2 * i])) for i in range(q)]
N = max(max(n for n, _ in qs), 1)
f = [1] * (N + 1)
for i in range(1, N + 1): f[i] = f[i - 1] * i % M
inv = [1] * (N + 1); inv[N] = pow(f[N], M - 2, M)
for i in range(N, 0, -1): inv[i - 1] = inv[i] * i % M
print('\n'.join(str(f[n] * inv[k] % M * inv[n - k] % M) for n, k in qs))
