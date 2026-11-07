"""Own drawing for sample R47: molar heat capacity c_p(T) of K2SO4 with a thin strip dT; the area is the heat per mole; each strip brings the entropy dQ/T."""
import os

OUT = os.path.dirname(os.path.abspath(__file__))
INK, DIM, BLUE, FILL = '#1f2328', '#5b6470', '#2a78d6', '#cfe1f7'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""
W, H = 640, 340
X0, X1, Y0, Y1 = 90, 590, 270, 40  # plot box in px (x: left..right, y: bottom..top)
T_LO, T_HI, C_LO, C_HI = 250.0, 750.0, 100.0, 200.0
T1, T2 = 298.15, 700.15
a, b, c = 120.4, 99.6e-3, -17.8e-6

TEXT = {
    'cs': {'x': 'teplota T', 'y': 'molární tepelná kapacita', 'strip': 'proužek dT: dQ = n·c_p·dT,', 'strip2': 'dS = dQ/T', 'sum': 'plocha od T', 'sum2': 'do T', 'sum3': '= Q/n (teplo na mol)'},
    'en': {'x': 'temperature T', 'y': 'molar heat capacity', 'strip': 'strip dT: dQ = n·c_p·dT,', 'strip2': 'dS = dQ/T', 'sum': 'area from T', 'sum2': 'to T', 'sum3': '= Q/n (heat per mole)'},
}


def px(T):
    return X0 + (T - T_LO) / (T_HI - T_LO) * (X1 - X0)


def py(cp):
    return Y0 + (cp - C_LO) / (C_HI - C_LO) * (Y1 - Y0)


def cp(T):
    return a + b * T + c / T**2


def t(x, y, s, size=12, anchor='middle', color=INK, font=SANS, style=''):
    return f'<text x="{x:.1f}" y="{y:.1f}" {font} {style} font-size="{size}" fill="{color}" text-anchor="{anchor}">{s}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.4, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}"{d}/>'


def drawing(lang):
    s = TEXT[lang]
    o = []
    # Area under the curve between T1 and T2 (the strips together).
    pts = [(px(T1), py(C_LO))] + [(px(T), py(cp(T))) for T in [T1 + (T2 - T1) * i / 50 for i in range(51)]] + [(px(T2), py(C_LO))]
    o.append('<path d="M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + f' Z" fill="{FILL}" stroke="none"/>')
    # Strips drawn as thin lines.
    for i in range(1, 40):
        T = T1 + (T2 - T1) * i / 40
        o.append(line(px(T), py(C_LO), px(T), py(cp(T)), '#ffffff', 1.2))
    # One highlighted strip.
    Ts = 520.0
    o.append(f'<rect x="{px(Ts):.1f}" y="{py(cp(Ts)):.1f}" width="9" height="{py(C_LO) - py(cp(Ts)):.1f}" fill="{BLUE}" fill-opacity="0.75" stroke="{BLUE}"/>')
    # Axes.
    o.append(line(X0, Y0, X1 + 10, Y0))
    o.append(line(X0, Y0, X0, Y1 - 10))
    # Curve.
    curve = [(px(T), py(cp(T))) for T in [T_LO + (T_HI - T_LO) * i / 100 for i in range(101)]]
    o.append('<path d="M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in curve) + f'" fill="none" stroke="{INK}" stroke-width="2.2"/>')
    # Limits T1, T2.
    for T, sub in ((T1, '1'), (T2, '2')):
        o.append(line(px(T), py(C_LO), px(T), py(cp(T)), DIM, 1.2, '4 3'))
        o.append(f'<text x="{px(T):.1f}" y="{Y0 + 20}" {FONT} font-style="italic" font-size="15" fill="{INK}" text-anchor="middle">T<tspan font-size="11" dy="4">{sub}</tspan></text>')
    # Axis labels.
    o.append(t((X0 + X1) / 2, H - 22, s['x'] + ' (K)', 12, 'middle', DIM))
    o.append(f'<text x="22" y="{(Y0 + Y1) / 2:.1f}" {SANS} font-size="12" fill="{DIM}" text-anchor="middle" transform="rotate(-90 22 {(Y0 + Y1) / 2:.1f})">{s["y"]} c<tspan font-size="9" dy="3">p</tspan><tspan dy="-3"> (J/(mol·K))</tspan></text>')
    # Callout for the highlighted strip, inside the area to the right of it.
    cx, cy = px(Ts) + 9, py(145)
    o.append(line(px(Ts) + 5, py(130), px(Ts) + 22, py(145), DIM, 1.0))
    o.append(t(px(Ts) + 26, py(145) - 6, s['strip'], 12, 'start', INK))
    o.append(t(px(Ts) + 26, py(145) + 10, s['strip2'], 13, 'start', BLUE, FONT, 'font-style="italic"'))
    # Sum in the area, left of the strip, on two lines.
    xm = (px(T1) + px(Ts)) / 2
    o.append(t(xm, py(125) - 6, s['sum'] + '₁ ' + s['sum2'] + '₂', 12, 'middle', INK))
    o.append(t(xm, py(125) + 10, s['sum3'], 12, 'middle', INK))
    # y ticks.
    for v in (100, 150, 200):
        o.append(line(X0 - 4, py(v), X0, py(v)))
        o.append(t(X0 - 8, py(v) + 4, str(v), 11, 'end', DIM))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(o)}</svg>\n'


for lang, name in (('cs', 'ohrev.svg'), ('en', 'ohrev.en.svg')):
    with open(os.path.join(OUT, name), 'w', encoding='utf8', newline='\n') as f:
        f.write(drawing(lang))
    print(name)
