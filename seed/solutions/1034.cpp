#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n, q; cin >> n >> q;
    vector<vector<int>> g(n + 1);
    for (int i = 0; i < n - 1; i++) { int a, b; cin >> a >> b; g[a].push_back(b); g[b].push_back(a); }
    int LOG = 1; while ((1 << LOG) <= n) LOG++;
    vector<vector<int>> up(LOG, vector<int>(n + 1, 1)); vector<int> dep(n + 1, -1);
    vector<int> order{1}; dep[1] = 0;
    for (size_t i = 0; i < order.size(); i++) { int u = order[i]; for (int v : g[u]) if (dep[v] < 0) { dep[v] = dep[u] + 1; up[0][v] = u; order.push_back(v); } }
    for (int k = 1; k < LOG; k++) for (int v = 1; v <= n; v++) up[k][v] = up[k - 1][up[k - 1][v]];
    while (q--) {
        int u, v; cin >> u >> v; int a = u, b = v;
        if (dep[a] < dep[b]) swap(a, b);
        for (int k = LOG - 1; k >= 0; k--) if (dep[a] - (1 << k) >= dep[b]) a = up[k][a];
        if (a != b) { for (int k = LOG - 1; k >= 0; k--) if (up[k][a] != up[k][b]) { a = up[k][a]; b = up[k][b]; } a = up[0][a]; }
        cout << dep[u] + dep[v] - 2 * dep[a] << "\n";
    }
}
