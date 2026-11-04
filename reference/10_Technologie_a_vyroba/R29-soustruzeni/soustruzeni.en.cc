# Rough turning of a cylindrical surface: a high-speed steel tool or a cemented carbide insert
"Based on a Slovak collection of problems in machining technology (see the source below), example 1. On a series of 350 parts a cylindrical surface is rough-turned by external longitudinal turning. We can use a tool of high-speed steel (RO) or a holder with a replaceable cemented carbide insert (SK). For both tools we determine the spindle speed, the machining time per part and the number of cutting edges for the whole series. Each tool is one variant of the calculation. The cutting conditions are from the source (machinability class 14b), the drawing is our own."
"Source: Čirčová, Ižol: Malá zbierka príkladov z technológie obrábania, TU Košice 2004, https://web.archive.org/web/2023/https://www.sjf.tuke.sk/ktmappv/images/E_materialy/priklady_obrabanie.pdf (a copy in a web archive; the file is no longer on the university site)"

## Input
D := 72 mm                    ' diameter of the blank
l := 138 mm                   ' length of the machined surface
l_n := 5 mm                   ' tool approach
n_s := 350                    ' parts in the series
a_p := 3 mm                   ' depth of cut
f := 0.18 mm                  ' feed per revolution
"Tools: cutting speed, tool life and the number of edges the tool gives. An RO tool is resharpened when blunt (each tool life counts as one edge), the SK insert has four usable cutting edges and is replaced after them."
table Nastroje: {variants=SK}
    | nastroj | v_c [m/min] | T [min] | z |
    | RO      | 45          | 60      | 1 |
    | SK      | 155         | 45      | 4 |
![Longitudinal turning: a workpiece of diameter D with revolutions n, a tool with feed f and depth of cut a_p, the tool path L from the approach l_n and the length of the surface l](images/soustruzeni.en.svg){width=80%}

## Spindle speed and machining time
n := v_c/(π·D) | min^-1 {eq}
L := l + l_n | mm
t_m := L/(n·f) | min {eq}
t_s := n_s·t_m | h
"For RO the source rounds the speed to 199 min⁻¹ and the time to 3.99 ≐ 4 min, for SK to 685 min⁻¹ and 1.2 min."

## Tool consumption
"How many parts one tool machines (an RO tool between two resharpenings, an SK insert with all four edges), how many tools the series uses up and how many times the tool is therefore resharpened or replaced:"
p := floor(z·T/t_m)
k := ceil(n_s/p)
k_v := k - 1
"The RO tool is resharpened 23 times during the series, three SK inserts will be needed and replaced twice, as in the source. The source uses the time rounded to 1.2 min and gets 150 parts per insert instead of 155."

## Comparison of the tools
porovnani := compare(Nastroje, n, t_m, t_s, p, k)
"The SK insert machines 3.4 times faster: the whole series takes it just under 7 hours instead of 23."
