import sys
from dxf_parser import extrair_geometria

try:
    g = extrair_geometria("../RE-MulFamHou-AprtCmpx_AF.dxf")
    print("KEYS:", list(g.keys()))
    print("STATS:", g["stats"])
    print("OFFSET:", g["offset"])
    if g["linhas"]:
        print("SAMPLE LINHA:", g["linhas"][0])
    if g["polilinhas"]:
        print("SAMPLE POLILINHA:", g["polilinhas"][0]["pontos"][:3])
except Exception as e:
    import traceback
    traceback.print_exc()
