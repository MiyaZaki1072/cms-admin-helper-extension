#include <iostream>
int main() { int n; long long x, m; std::cin >> n >> m; for (int i = 1; i < n; i++) { std::cin >> x; if (x > m) m = x; } std::cout << m << "\n"; }
