import sys
d = sys.stdin.buffer.read().split(); n = int(d[0]); t = list(map(int, d[1:1 + n]))
print(max((abs(t[i + 1] - t[i]) for i in range(n - 1)), default=0))
