"""Own drawing for sample R46: time axis of the account over 10 years. Monthly deposits a, balance S_5 after 5 years, withdrawal V, balance S_10 after 10 years. Writes the Czech and the English SVG."""
import os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = '#1f2328'
DIM = '#5b6470'
BLUE = '#2a78d6'
RED = '#d1495b'
FONT = "font-family=\"'Cambria Math','Cambria','Times New Roman',serif\""
SANS = "font-family=\"'Segoe UI','DejaVu Sans',Arial,sans-serif\""

W, H = 640, 340
X0, X1 = 50, 590   # axis from year 0 to year 10
AY = 170           # axis height

TEXT = {
    'cs': {'year': 'rok', 'dep': 'měsíční úložka a (koncem měsíce)', 'unk': 'hledáme: roční sazbu i a úložku a',
           'q': 'úrok se připisuje čtvrtletně', 's5': 'naspořeno 500 000 Kč', 'v': 'výběr 75 000 Kč', 's10': 'naspořeno 1 100 000 Kč',
           'out': 'sazba-a-ulozka-sporeni.svg'},
    'en': {'year': 'year', 'dep': 'monthly deposit a (end of month)', 'unk': 'unknown: annual rate i and deposit a',
           'q': 'interest is credited quarterly', 's5': 'saved 500 000 Kč', 'v': 'withdrawal 75 000 Kč', 's10': 'saved 1 100 000 Kč',
           'out': 'sazba-a-ulozka-sporeni.en.svg'},
}


def yx(year):
    return X0 + (X1 - X0) * year / 10


def note(x, y, text, size=12, anchor='middle', color=DIM):
    return f'<text x="{x:.1f}" y="{y:.1f}" {SANS} font-size="{size}" fill="{color}" text-anchor="{anchor}">{text}</text>'


def var(x, y, name, sub='', size=16, anchor='middle', color=INK):
    s = f'<tspan font-size="{size * 0.72:.1f}" dy="4">{sub}</tspan>' if sub else ''
    return f'<text x="{x:.1f}" y="{y:.1f}" {FONT} font-style="italic" font-size="{size}" fill="{color}" text-anchor="{anchor}">{name}{s}</text>'


def line(x1, y1, x2, y2, color=INK, width=1.6, dash=''):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    return f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{width}" stroke-linecap="round"{d}/>'


def arrow_down(x, y1, y2, color):
    return line(x, y1, x, y2 - 6, color, 2) + f'<path d="M{x - 5:.1f} {y2 - 8:.1f} L{x + 5:.1f} {y2 - 8:.1f} L{x:.1f} {y2:.1f} Z" fill="{color}"/>'


def arrow_up(x, y1, y2, color):
    return line(x, y1, x, y2 + 6, color, 2) + f'<path d="M{x - 5:.1f} {y2 + 8:.1f} L{x + 5:.1f} {y2 + 8:.1f} L{x:.1f} {y2:.1f} Z" fill="{color}"/>'


def drawing(t):
    b = []
    b.append(line(X0 - 10, AY, X1 + 20, AY, INK, 1.6))
    # monthly deposits: short ticks above the axis, 120 of them
    for k in range(1, 121):
        x = yx(k / 12)
        h = 10 if k % 12 else 14
        b.append(line(x, AY - 2, x, AY - h, BLUE, 1))
    # quarter marks below the axis
    for k in range(0, 41):
        x = yx(k / 4)
        b.append(line(x, AY, x, AY + (8 if k % 4 == 0 else 4), DIM, 1))
    for y in (0, 5, 10):
        b.append(note(yx(y), AY + 26, str(y), 13, 'middle', INK))
    b.append(note(X1 + 20, AY + 46, t['year'], 12, 'end', DIM))
    # balances
    for y, label, sub in ((5, t['s5'], '5'), (10, t['s10'], '10')):
        x = yx(y)
        b.append(arrow_up(x, AY - 20, 62, INK))
        b.append(var(x - 4, 44, 'S', sub, anchor='end'))
        b.append(note(x, 30, label, 12, 'middle', INK) if y == 5 else note(x + 20, 30, label, 12, 'end', INK))
    # withdrawal, at the end of year 5 (under its number on the axis)
    x5 = yx(5)
    b.append(arrow_down(x5, AY + 34, AY + 100, RED))
    b.append(var(x5 + 10, AY + 76, 'V', '', anchor='start', color=RED))
    b.append(note(x5 + 30, AY + 76, t['v'], 12, 'start', RED))
    # legend
    b.append(line(X0, AY + 100, X0 + 20, AY + 100, BLUE, 1))
    b.append(note(X0 + 28, AY + 104, t['dep'], 12, 'start', DIM))
    b.append(note(X0, AY + 128, t['q'], 12, 'start', DIM))
    b.append(note(X0, AY + 148, t['unk'], 12, 'start', BLUE))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">'
            f'<rect width="{W}" height="{H}" fill="#ffffff"/>{"".join(b)}</svg>\n')


for lang, t in TEXT.items():
    with open(os.path.join(OUT, t['out']), 'w', encoding='utf8', newline='\n') as f:
        f.write(drawing(t))
    print(t['out'])
