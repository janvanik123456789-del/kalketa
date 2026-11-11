# Dávka 7 – list 02: nullspace, rank a singvals matice hodnosti 2 a matice s 1e-12 vedle 1
B := [1, 2, 3, 4 | 2, 4, 6, 8 | 1, 0, 1, 0 | 2, 0, 2, 0]
hodB := rank(B)
N := nullspace(B)
pocetN := cols(N)
resN := norm(B * col(N, 1))
s := singvals(B)
s1 := s[1]
s2 := s[2]
s3 := s[3]
C := [1, 1e-12 | 1e-12, 1e-24]
hodC := rank(C)
sC := singvals(C)
sC1 := sC[1]
sC2 := sC[2]
nC := nullspace(C)
resC := norm(C * nC)
