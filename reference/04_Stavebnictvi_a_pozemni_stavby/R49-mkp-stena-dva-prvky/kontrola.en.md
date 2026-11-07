# Check in Python

The calculation of the sheet again, by another way: the constant-strain element written in plain Python entry by entry (no matrix functions and no scatter), the full 8 × 8 matrix assembled from the elements, the boundary conditions by leaving out the fixed degrees of freedom, the system solved by Gaussian elimination. The button above the script runs it in the built-in Python and places the results beside the values of the sheet.

```python
# Plane stress, two constant-strain triangles. Everything from first principles with plain lists.
E, nu, t = 20e9, 0.2, 0.1
xy = {1: (0.0, 0.0), 2: (1.0, 0.0), 3: (1.0, 1.0), 4: (0.0, 1.0)}
elements = [(1, 2, 4), (2, 3, 4)]
c = E / (1 - nu ** 2)
D = [[c, c * nu, 0.0], [c * nu, c, 0.0], [0.0, 0.0, c * (1 - nu) / 2]]


def matmul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(len(B))) for j in range(len(B[0]))] for i in range(len(A))]


def transpose(A):
    return [list(r) for r in zip(*A)]


def strain_matrix(nodes):
    (xi, yi), (xj, yj), (xk, yk) = (xy[n] for n in nodes)
    area = ((xj - xi) * (yk - yi) - (xk - xi) * (yj - yi)) / 2
    b = [yj - yk, yk - yi, yi - yj]
    cc = [xk - xj, xi - xk, xj - xi]
    B = [[0.0] * 6 for _ in range(3)]
    for a in range(3):
        B[0][2 * a] = b[a] / (2 * area)
        B[1][2 * a + 1] = cc[a] / (2 * area)
        B[2][2 * a] = cc[a] / (2 * area)
        B[2][2 * a + 1] = b[a] / (2 * area)
    return area, B


K = [[0.0] * 8 for _ in range(8)]
parts = []
for nodes in elements:
    area, B = strain_matrix(nodes)
    ke = matmul(transpose(B), matmul(D, B))
    ke = [[t * area * v for v in row] for row in ke]
    code = [2 * (n - 1) + s for n in nodes for s in (0, 1)]
    for i in range(6):
        for j in range(6):
            K[code[i]][code[j]] += ke[i][j]
    parts.append((B, code))

# Nodes 1 and 2 are fixed: unknowns are the displacements of nodes 3 and 4 (places 4 to 7).
F = [0.0] * 8
F[4], F[7] = -10e3, -20e3
free = [4, 5, 6, 7]
A = [[K[i][j] for j in free] + [F[i]] for i in free]
for col in range(4):
    p = max(range(col, 4), key=lambda r: abs(A[r][col]))
    A[col], A[p] = A[p], A[col]
    for r in range(col + 1, 4):
        f = A[r][col] / A[col][col]
        A[r] = [a - f * b for a, b in zip(A[r], A[col])]
x = [0.0] * 4
for r in range(3, -1, -1):
    x[r] = (A[r][4] - sum(A[r][j] * x[j] for j in range(r + 1, 4))) / A[r][r]
u = [0.0] * 4 + x

# Reactions: rows of the full matrix of the fixed nodes.
R = [sum(K[i][j] * u[j] for j in range(8)) for i in range(4)]

result("u_3", u[4] * 1e6, "μm")
result("v_3", u[5] * 1e6, "μm")
result("u_4", u[6] * 1e6, "μm")
result("v_4", u[7] * 1e6, "μm")
result("R_x1", R[0] / 1e3, "kN")
result("R_y1", R[1] / 1e3, "kN")
result("R_x2", R[2] / 1e3, "kN")
result("R_y2", R[3] / 1e3, "kN")
for k, (B, code) in enumerate(parts, 1):
    sigma = matmul(D, matmul(B, [[u[i]] for i in code]))
    for name, v in zip(("σ_x", "σ_y", "τ_xy"), sigma):
        result(f"{name}{k}", v[0] / 1e3, "kPa")
```
