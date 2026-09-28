import sys
M = 10**9 + 7
def fib(n):
    a, b = 0, 1
    for bit in bin(n)[2:]:
        c = a * (2 * b - a) % M; e = (a * a + b * b) % M
        a, b = (e, (c + e) % M) if bit == '1' else (c, e)
    return a
d = sys.stdin.buffer.read().split(); t = int(d[0])
print('\n'.join(str(fib(int(x))) for x in d[1:1 + t]))
