import sys
d = sys.stdin.buffer.read().split(); n, m = int(d[0]), int(d[1]); W = m + 2
land = bytearray(W * (n + 2))
for i in range(n):
    base = (i + 1) * W + 1
    land[base:base + m] = d[2 + i].replace(b'.', b'\x00').replace(b'#', b'\x01')
cnt = 0
for s in range(len(land)):
    if land[s]:
        cnt += 1; land[s] = 0; st = [s]
        while st:
            c = st.pop()
            for k in (c + 1, c - 1, c + W, c - W):
                if land[k]:
                    land[k] = 0; st.append(k)
print(cnt)
