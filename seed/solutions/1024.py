import sys
lines = sys.stdin.read().split(); t = int(lines[0]); match = {')': '(', ']': '[', '}': '{'}; out = []
for s in lines[1:1 + t]:
    st = []; ok = True
    for ch in s:
        if ch in match:
            if not st or st.pop() != match[ch]:
                ok = False; break
        else:
            st.append(ch)
    out.append('yes' if ok and not st else 'no')
print('\n'.join(out))
