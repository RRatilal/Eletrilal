from pdf_plant_builder import extrair_planta_pdf
import json

r = extrair_planta_pdf("../05 - ARQ - HID.pdf")
print(f"Divisoes: {len(r['divisoes'])}")
print(f"Terreno: {r['terreno_w']} x {r['terreno_h']}")
print(f"Escala: {r['escala']}")
print()
for d in r['divisoes']:
    print(f"  {d['nome']:25s} | {str(d['area_m2'])+' m2':10s} | {d['dim_w']}m x {d['dim_h']}m | pos({d['x_mundo']}, {d['y_mundo']})")
