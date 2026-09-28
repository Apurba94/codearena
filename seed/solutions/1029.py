import sys
d = sys.stdin.buffer.read().split(); n = int(d[0]); a = list(map(int, d[1:1 + n]))
inv = 0; width = 1; src = a[:]
while width < n:
    dst = []
    for lo in range(0, n, 2 * width):
        L = src[lo:lo + width]; R = src[lo + width:lo + 2 * width]; i = j = 0; nl = len(L); nr = len(R)
        while i < nl and j < nr:
            if L[i] <= R[j]:
                dst.append(L[i]); i += 1
            else:
                dst.append(R[j]); j += 1; inv += nl - i
        dst.extend(L[i:]); dst.extend(R[j:])
    src = dst; width *= 2
print(inv)
