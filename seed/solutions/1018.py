n = int(input())
if n < 2:
    print(0)
else:
    s = bytearray([1]) * (n + 1); s[0] = s[1] = 0
    for i in range(2, int(n ** 0.5) + 1):
        if s[i]: s[i * i::i] = bytes(len(range(i * i, n + 1, i)))
    print(sum(s))
