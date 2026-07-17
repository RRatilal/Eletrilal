"""
Diagnostico: encontrar em que paginas do PDF estao os labels de divisoes.
"""
import pdfplumber, re

PDF = "../05 - ARQ - HID.pdf"
PREFIXES = ["quarto","sala","cozinha","corredor","varanda","w.c","wc",
            "lavab","lavand","arrumo","dispensa","garagem","vestiar",
            "hall","escada","piscina","suite","suíte"]

with pdfplumber.open(PDF) as pdf:
    for i, page in enumerate(pdf.pages):
        # Metodo 1: extract_text simples
        t = page.extract_text() or ""
        found = []
        for line in t.split("\n"):
            l = line.strip().lower()
            for p in PREFIXES:
                if l.startswith(p) and len(l) < 30:
                    found.append(line.strip())
                    break
        
        # Metodo 2: extract_words
        words = page.extract_words(x_tolerance=2, y_tolerance=2) or []
        found_words = []
        for w in words:
            t2 = w["text"].strip().lower()
            for p in PREFIXES:
                if t2.startswith(p) and len(t2) < 25:
                    cx = (float(w["x0"]) + float(w["x1"])) / 2
                    cy = (float(w["top"]) + float(w["bottom"])) / 2
                    found_words.append(f"'{w['text']}' @({cx:.0f},{cy:.0f})")
                    break
        
        n_rects = len([r for r in page.rects 
                       if (r["x1"]-r["x0"])>15 and (r["y1"]-r["y0"])>15
                       and (r["x1"]-r["x0"])*(r["y1"]-r["y0"]) < 100000])
        
        if found or found_words:
            print(f"\nPagina {i+1} [{n_rects} rects]:")
            for f in found[:10]: print(f"  text: {f}")
            for f in found_words[:15]: print(f"  word: {f}")
