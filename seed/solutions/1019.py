import sys
d = sys.stdin.buffer.read().split(); q = int(d[0])
print('\n'.join(str(pow(int(d[1 + 3 * i]), int(d[2 + 3 * i]), int(d[3 + 3 * i]))) for i in range(q)))
