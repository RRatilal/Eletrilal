"""
Analise detalhada dos rects do PDF para identificar a pagina correta e o bounding box.
"""
import pdfplumber, json

PDF = "../05 - ARQ - HID.pdf"

# Filtro: rects que podem ser quartos (area entre 500 e 100000 pts^2)
MIN_AREA = 500
MAX_AREA = 100_000

with pdfplumber.open(PDF) as pdf:
    best_page = None
    best_count = 0
    for i, page in enumerate(pdf.pages):
        rects = [r for r in page.rects
                 if MIN_AREA < (r["x1"]-r["x0"])*(r["y1"]-r["y0"]) < MAX_AREA
                 and (r["x1"]-r["x0"]) > 10 and (r["y1"]-r["y0"]) > 10]
        if len(rects) > best_count:
            best_count = len(rects)
            best_page = (i, page, rects)

idx, page, rects = best_page
print(f"Melhor pagina: {idx+1}, {len(rects)} rects, dimensao: {page.width:.0f}x{page.height:.0f}pts")
print()

# Bounding box de todos os rects
x0s = [r["x0"] for r in rects]
y0s = [r["y0"] for r in rects]
x1s = [r["x1"] for r in rects]
y1s = [r["y1"] for r in rects]
draw_x0 = min(x0s); draw_y0 = min(y0s)
draw_x1 = max(x1s); draw_y1 = max(y1s)
draw_w  = draw_x1 - draw_x0
draw_h  = draw_y1 - draw_y0
print(f"Bounding box: x={draw_x0:.0f}-{draw_x1:.0f} ({draw_w:.0f}pts)  y={draw_y0:.0f}-{draw_y1:.0f} ({draw_h:.0f}pts)")
print(f"Escala estimada (40x23.5m): {40.03/draw_w:.4f} m/pt  {23.5/draw_h:.4f} m/pt")
print()

# Mostrar todos os rects ordenados por area
rects_sorted = sorted(rects, key=lambda r: (r["x1"]-r["x0"])*(r["y1"]-r["y0"]), reverse=True)
print(f"Top 20 rects por area:")
for r in rects_sorted[:20]:
    rw = r["x1"]-r["x0"]; rh = r["y1"]-r["y0"]
    area_pts = rw * rh
    # Estimar area em m2 (assumindo 40m/draw_w escala)
    sc = 40.03 / draw_w
    area_m2 = (rw * sc) * (rh * sc)
    print(f"  x0={r['x0']:.0f} y0={r['y0']:.0f} w={rw:.0f} h={rh:.0f}  -> {rw*sc:.2f}m x {rh*sc:.2f}m = {area_m2:.1f}m2")
print()

# Extrair texto da pagina e ver quais caem dentro de rects
words = page.extract_words(x_tolerance=2, y_tolerance=2)
DIVISOES_PREFIX = ["quarto","sala","cozinha","corredor","varanda","w.c","wc","lavab","lavand","arrumo","dispensa","garagem","vestiar","hall","escada","piscina","terraço"]

print("Rotulos dentro de rects:")
for w in words:
    t = w["text"].strip().lower()
    for pref in DIVISOES_PREFIX:
        if t.startswith(pref):
            cx = (float(w["x0"]) + float(w["x1"])) / 2
            cy = (float(w["top"]) + float(w["bottom"])) / 2
            # Encontrar rect que contem este ponto
            found = [(r, (r["x1"]-r["x0"])*(r["y1"]-r["y0"])) for r in rects
                     if r["x0"] <= cx <= r["x1"] and r["y0"] <= cy <= r["y1"]]
            if found:
                r, area_pts = min(found, key=lambda x: x[1])
                rw = r["x1"]-r["x0"]; rh = r["y1"]-r["y0"]
                sc = 40.03 / draw_w
                print(f"  '{w['text']}' -> rect {rw:.0f}x{rh:.0f}pts = {rw*sc:.2f}x{rh*sc:.2f}m")
            else:
                print(f"  '{w['text']}' -> SEM rect (cx={cx:.0f}, cy={cy:.0f})")
            break
