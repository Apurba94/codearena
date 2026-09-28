import sys
d = sys.stdin.buffer.read().split(); n = int(d[0]); h = list(map(int, d[1:1 + n]))
ans = [0] * n; st = []
for i in range(n - 1, -1, -1):
    while st and h[st[-1]] <= h[i]: st.pop()
    ans[i] = st[-1] + 1 if st else 0
    st.append(i)
print(' '.join(map(str, ans)))
