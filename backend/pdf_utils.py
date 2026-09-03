"""Utilitários comuns dos geradores PDF."""
import json

from reportlab.pdfbase.pdfmetrics import stringWidth


def valor(obj, chave, padrao=None):
    """Lê uma propriedade tanto de um dicionário como de um objeto ORM."""
    if isinstance(obj, dict):
        return obj.get(chave, padrao)
    return getattr(obj, chave, padrao)


def nome_legivel(rotulo, padrao=""):
    """Extrai um nome legível de um rótulo que pode ser texto simples ou JSON.

    Os quadros guardam configuração em JSON no campo ``rotulo``; esta função
    devolve apenas o nome apresentável (``nome`` ou ``rotulo`` interno), nunca
    a representação JSON completa.
    """
    if rotulo is None:
        return padrao
    texto = str(rotulo).strip()
    if not texto:
        return padrao
    if texto.startswith("{") or texto.startswith("["):
        try:
            dados = json.loads(texto)
        except (TypeError, ValueError, json.JSONDecodeError):
            return padrao
        if isinstance(dados, dict):
            return str(dados.get("nome") or dados.get("rotulo") or padrao).strip() or padrao
        if isinstance(dados, list):
            return padrao
    return texto


def cortar_texto(texto, largura, fonte="Helvetica", tamanho=6, sufixo="…"):
    """Corta texto pela largura real em pontos, preservando o início legível."""
    texto = str(texto or "—")
    if stringWidth(texto, fonte, tamanho) <= largura:
        return texto
    while len(texto) > 3 and stringWidth(texto + sufixo, fonte, tamanho) > largura:
        texto = texto[:-1]
    return texto + sufixo
