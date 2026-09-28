#include <bits/stdc++.h>
using namespace std;
long long inv = 0;
void sortCount(vector<int>& a, vector<int>& t, int l, int r) {
    if (r - l < 2) return;
    int m = (l + r) / 2; sortCount(a, t, l, m); sortCount(a, t, m, r);
    int i = l, j = m, k = l;
    while (i < m && j < r) { if (a[i] <= a[j]) t[k++] = a[i++]; else { inv += m - i; t[k++] = a[j++]; } }
    while (i < m) t[k++] = a[i++];
    while (j < r) t[k++] = a[j++];
    copy(t.begin() + l, t.begin() + r, a.begin() + l);
}
int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n; cin >> n; vector<int> a(n), t(n);
    for (auto& x : a) cin >> x;
    sortCount(a, t, 0, n);
    cout << inv << "\n";
}
