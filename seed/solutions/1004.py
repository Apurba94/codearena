from math import gcd
n, a, b = map(int, input().split())
l = a // gcd(a, b) * b
print(n // a + n // b - n // l)
