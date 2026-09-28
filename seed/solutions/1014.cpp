#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int n, m; cin >> n >> m;
    vector<vector<pair<int, long long>>> g(n + 1);
    for (int i = 0; i < m; i++) { int a, b; long long c; cin >> a >> b >> c; g[a].push_back({b, c}); }
    vector<long long> d(n + 1, LLONG_MAX); d[1] = 0;
    priority_queue<pair<long long, int>, vector<pair<long long, int>>, greater<>> pq; pq.push({0, 1});
    while (!pq.empty()) {
        auto [du, u] = pq.top(); pq.pop();
        if (du != d[u]) continue;
        for (auto [v, c] : g[u]) if (du + c < d[v]) { d[v] = du + c; pq.push({d[v], v}); }
    }
    for (int i = 1; i <= n; i++) cout << (d[i] == LLONG_MAX ? -1 : d[i]) << " \n"[i == n];
}
