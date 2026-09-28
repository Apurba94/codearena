import sys
d = sys.stdin.buffer.read().split(); t = int(d[0]); out = []
for x in d[1:1 + t]:
    v = float(x); r = v ** (1.0 / 3.0) if v > 0 else 0.0
    if r > 0: r -= (r * r * r - v) / (3 * r * r)  # one Newton step for accuracy
    out.append('%.9f' % r)
print('\n'.join(out))
