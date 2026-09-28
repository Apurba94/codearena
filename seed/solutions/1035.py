import sys
d = sys.stdin.buffer.read().split(); n = int(d[0]); xs = list(map(int, d[1:1 + 2 * n:2])); ys = list(map(int, d[2:2 + 2 * n:2]))
s = abs(sum(xs[i] * ys[(i + 1) % n] - xs[(i + 1) % n] * ys[i] for i in range(n)))
print(f"{s // 2}.{5 if s % 2 else 0}")
