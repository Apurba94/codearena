import sys
s, t = sys.stdin.read().split()
prev = list(range(len(t) + 1))
for i, a in enumerate(s, 1):
    cur = [i] + [0] * len(t)
    for j, b in enumerate(t, 1):
        x = prev[j - 1] + (a != b)
        y = prev[j] + 1
        if y < x: x = y
        y = cur[j - 1] + 1
        cur[j] = y if y < x else x
    prev = cur
print(prev[-1])
