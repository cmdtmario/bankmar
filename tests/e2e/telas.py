"""Teste de telas do BankMaR com Playwright (skill webapp-testing).

Abre o app com um Supabase SIMULADO (dados de demonstração, nenhum dado real), navega por todas as
telas em celular (375x812) e desktop (1280x900), tira prints e falha se houver erro no console.

Uso:
  python tests/e2e/with_server.py --server "npm run e2e:server" --port 5179 -- python tests/e2e/telas.py
Prints em tests/e2e/prints/.
"""
import base64
import json
import os
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from playwright.sync_api import sync_playwright

BASE = os.environ.get("E2E_URL", "http://localhost:5179")
SAIDA = Path(__file__).parent / "prints"
SAIDA.mkdir(exist_ok=True)
USER = "00000000-0000-0000-0000-00000000000a"
HOJE = date.today()


def b64(d):
    return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")


def jwt():
    exp = int(time.time()) + 3600 * 24
    return f"{b64({'alg': 'HS256', 'typ': 'JWT'})}.{b64({'sub': USER, 'aal': 'aal2', 'role': 'authenticated', 'exp': exp, 'amr': [{'method': 'totp', 'timestamp': exp - 100}]})}.assinatura"


SESSAO = {
    "access_token": jwt(), "refresh_token": "r", "token_type": "bearer", "expires_in": 86400,
    "expires_at": int(time.time()) + 86400,
    "user": {"id": USER, "aud": "authenticated", "role": "authenticated", "email": "demo@bankmar.app",
             "factors": [{"id": "f1", "factor_type": "totp", "status": "verified"}]},
}


def mes(d, n):
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


COMP = mes(HOJE, 0)
CATS = [("c1", "Moradia"), ("c2", "Mercado"), ("c3", "Delivery"), ("c4", "Viagem"), ("c5", "Salão do Diego"), ("c6", "Assinaturas"), ("c7", "Saúde")]
DADOS = {
    "categories": [{"id": i, "nome": n, "ativo": True, "user_id": USER} for i, n in CATS],
    "people": [{"id": "p1", "nome": "Diego", "apelido": None, "pix": "diego@pix.exemplo", "ativo": True},
               {"id": "p2", "nome": "Jessy", "apelido": None, "pix": None, "ativo": True}],
    "tags": [{"id": "t1", "nome": "Salão"}],
    "cards": [{"id": "k1", "apelido": "Itaú Azul", "emissor": "itau", "final4": "1234", "dia_vencimento": 8, "banco_pagamento": "Itaú", "ativo": True},
              {"id": "k2", "apelido": "Caixa Visa", "emissor": "caixa", "final4": "5678", "dia_vencimento": 8, "banco_pagamento": "Caixa", "ativo": True},
              {"id": "k3", "apelido": "Nubank", "emissor": "outro", "final4": None, "dia_vencimento": 15, "banco_pagamento": "Nubank", "ativo": True}],
    "months": [{"id": f"m{i}", "competencia": mes(HOJE, -i).isoformat(), "renda": 15200.0 + (i % 3) * 300} for i in range(12)],
    "gastos_categoria": [
        {"competencia": mes(HOJE, -i).isoformat(), "category_id": c, "total": v * (1.3 if c in ("c1", "c2") else 1) * (1 + (i % 4) / 10),
         "total_mario": v * (1 + (i % 4) / 10)}
        for i in range(12) for c, v in [("c1", 2900), ("c2", 1350), ("c3", 640), ("c4", 900 if i % 3 == 0 else 120), ("c5", 0), ("c6", 210), ("c7", 330)]
    ],
    "bills": [
        {"id": "b1", "competencia": COMP.isoformat(), "template_id": None, "descricao": "Aluguel", "vencimento": (HOJE + timedelta(days=1)).isoformat(), "valor": 2800, "banco_pagamento": "BB", "category_id": "c1", "split_rule": {"tipo": "pct", "partes": [{"pessoa_id": "p1", "pct": 50}]}, "observacao": None, "origem": "recorrente"},
        {"id": "b2", "competencia": COMP.isoformat(), "template_id": None, "descricao": "Neoenergia", "vencimento": (HOJE - timedelta(days=3)).isoformat(), "valor": 287.4, "banco_pagamento": None, "category_id": "c1", "split_rule": {"tipo": "mario"}, "observacao": None, "origem": "boleto"},
        {"id": "b3", "competencia": COMP.isoformat(), "template_id": None, "descricao": "Condomínio", "vencimento": (HOJE + timedelta(days=6)).isoformat(), "valor": 980, "banco_pagamento": "Itaú", "category_id": "c1", "split_rule": {"tipo": "mario"}, "observacao": None, "origem": "manual"},
        {"id": "b4", "competencia": COMP.isoformat(), "template_id": None, "descricao": "Internet", "vencimento": (HOJE - timedelta(days=10)).isoformat(), "valor": 119.9, "banco_pagamento": None, "category_id": "c6", "split_rule": {"tipo": "mario"}, "observacao": None, "origem": "manual"},
    ],
    "bill_summary": [{"bill_id": "b1", "total_mario": 1400}, {"bill_id": "b2", "total_mario": 287.4}, {"bill_id": "b3", "total_mario": 980}, {"bill_id": "b4", "total_mario": 119.9}],
    "invoice_summary": [
        {"invoice_id": "i1", "card_id": "k1", "competencia": COMP.isoformat(), "vencimento": HOJE.isoformat(), "total_impresso": 4057, "confirmada": True, "total": 4057, "total_mario": 3110.5, "qtd_linhas": 42, "qtd_projetadas": 0, "qtd_nao_conferidas": 4},
        {"invoice_id": "i2", "card_id": "k2", "competencia": COMP.isoformat(), "vencimento": (HOJE + timedelta(days=9)).isoformat(), "total_impresso": 2197.44, "confirmada": True, "total": 2197.44, "total_mario": 1890, "qtd_linhas": 8, "qtd_projetadas": 0, "qtd_nao_conferidas": 0},
        {"invoice_id": "i3", "card_id": "k3", "competencia": COMP.isoformat(), "vencimento": None, "total_impresso": None, "confirmada": False, "total": 0, "total_mario": 0, "qtd_linhas": 0, "qtd_projetadas": 3, "qtd_nao_conferidas": 0},
    ],
    "payments": [{"id": "pg1", "bill_id": "b4", "invoice_id": None, "data": (HOJE - timedelta(days=11)).isoformat(), "valor": 119.9, "banco": "Nubank"}],
    "person_items": [
        {"person_id": "p1", "tag_id": None, "tag_nome": None, "valor": 1400, "origem": "conta", "item_id": "b1", "data": HOJE.isoformat(), "descricao": "Aluguel", "parcela_atual": None, "parcelas_total": None, "cartao": None, "competencia": COMP.isoformat()},
        {"person_id": "p1", "tag_id": "t1", "tag_nome": "Salão", "valor": 171.92, "origem": "fatura", "item_id": "x1", "data": HOJE.isoformat(), "descricao": "Google ADS", "parcela_atual": None, "parcelas_total": None, "cartao": "Itaú Azul", "competencia": COMP.isoformat()},
        {"person_id": "p1", "tag_id": None, "tag_nome": None, "valor": 86.39, "origem": "fatura", "item_id": "x2", "data": HOJE.isoformat(), "descricao": "Passagem Azul", "parcela_atual": 10, "parcelas_total": 21, "cartao": "Itaú Azul", "competencia": COMP.isoformat()},
        {"person_id": "p2", "tag_id": None, "tag_nome": None, "valor": 159, "origem": "fatura", "item_id": "x3", "data": HOJE.isoformat(), "descricao": "Presente", "parcela_atual": None, "parcelas_total": None, "cartao": "Caixa Visa", "competencia": COMP.isoformat()},
    ],
    "receipts": [{"id": "r1", "person_id": "p1", "data": HOJE.isoformat(), "valor": 1000, "observacao": "Pix"}],
    "share_links": [], "bill_templates": [
        {"id": "tp1", "descricao": "Aluguel", "dia_vencimento": 10, "valor_padrao": 2800, "banco_pagamento": "BB", "category_id": "c1", "split_rule": {"tipo": "pct", "partes": [{"pessoa_id": "p1", "pct": 50}]}, "ativo": True, "inicio": "2026-01-01"}],
    "category_rules": [{"id": "cr1", "padrao": "99FOOD", "category_id": "c3"}],
    "transactions": [
        {"id": "x1", "invoice_id": "i1", "purchase_id": None, "data_compra": HOJE.isoformat(), "descricao_original": "GOOGLE ADS", "descricao": "Google ADS - salão", "parcela_atual": None, "parcelas_total": None, "valor": 171.92, "category_id": "c5", "split_rule": {"tipo": "total", "pessoa_id": "p1", "tag_id": "t1"}, "conferido": True, "situacao": "real", "ordem": 1},
        {"id": "x2", "invoice_id": "i1", "purchase_id": "pu1", "data_compra": "2026-01-29", "descricao_original": "AZULVA*N2769", "descricao": "Passagem Azul", "parcela_atual": 10, "parcelas_total": 21, "valor": 172.79, "category_id": "c4", "split_rule": {"tipo": "pct", "partes": [{"pessoa_id": "p1", "pct": 50}]}, "conferido": False, "situacao": "real", "ordem": 2},
    ],
    "invoices": [{"id": "i1"}, {"id": "i2"}],
    "notification_settings": [], "import_log": [{"id": "l1", "tipo": "planilha_2026", "arquivo": "Contabilidade.xlsx", "em": HOJE.isoformat() + "T12:00:00Z", "importadas": 1615, "ignoradas": 12, "alteradas": 0}],
    "purchases": [], "learned_rules": [],
}

# Investimentos fictícios (nada do Mario)
_POS = [("PETR4", "acao", "Petrobras PN", 200, 38.1, "INTER DTVM"), ("ITSA4", "acao", "Itaúsa PN", 500, 11.2, "NU INVEST"),
        ("HGLG11", "fii", "CSHG Logística FII", 40, 158.4, "INTER DTVM"), ("MXRF11", "fii", "Maxi Renda FII", 900, 9.6, "XP INVESTIMENTOS"),
        ("BOVA11", "etf", "iShares Ibovespa", 30, 128.0, "NU INVEST"), ("WEGE3", "acao", "WEG ON", 60, 52.3, "C6 CTVM")]
DADOS.update({
    "inv_posicoes": [{"id": i, "data_ref": HOJE.isoformat(), "classe": c, "codigo": k, "produto": n, "instituicao": inst, "cnpj": None, "isin": None, "emissor": None,
                      "indexador": None, "vencimento": None, "quantidade": q, "preco": pr, "valor": q * pr, "valor_aplicado": None} for i, (k, c, n, q, pr, inst) in enumerate(_POS)]
                    + [{"id": 99, "data_ref": HOJE.isoformat(), "classe": "renda_fixa", "codigo": "CDB-BANCO-X", "produto": "CDB Banco X 110% CDI", "instituicao": "INTER DTVM",
                        "cnpj": None, "isin": None, "emissor": "Banco X", "indexador": "CDI", "vencimento": "2028-05-10", "quantidade": 10, "preco": 1180.5, "valor": 11805, "valor_aplicado": 10000}],
    "inv_negociacoes": [{"id": i, "data": f"2024-0{1 + i % 8}-10", "tipo": "Compra", "mercado": "Mercado à Vista", "instituicao": inst, "codigo": k, "quantidade": q, "preco": pr * 0.85,
                         "valor": q * pr * 0.85, "chave": f"n{i}"} for i, (k, c, n, q, pr, inst) in enumerate(_POS) if k != "WEGE3"],
    "inv_movimentacoes": [{"id": 100 + j, "data": f"{2025 + j // 12}-{1 + j % 12:02d}-15", "entrada": True, "tipo": "Rendimento" if k.endswith("11") else "Dividendo", "produto": k, "codigo": k,
                           "instituicao": "INTER DTVM", "quantidade": None, "preco": None, "valor": v, "chave": f"m{j}{k}"}
                          for j in range(23) for k, v in [("HGLG11", 44.0), ("MXRF11", 90.0)] + ([("PETR4", 140.0)] if j % 3 == 0 else [])],
    "inv_proventos_receber": [{"id": 1, "codigo": "MXRF11", "produto": "MXRF11", "tipo": "Rendimento", "evento": "RENDIMENTO", "previsao": (HOJE + timedelta(days=4)).isoformat(), "instituicao": "XP", "quantidade": 900, "valor": 90.0},
                              {"id": 2, "codigo": "PETR4", "produto": "PETR4", "tipo": "Dividendo", "evento": "DIVIDENDO", "previsao": (HOJE + timedelta(days=18)).isoformat(), "instituicao": "INTER", "quantidade": 200, "valor": 128.4}],
    "inv_ajustes": [{"codigo": "HGLG11", "preco_medio": None, "preco_alvo": 175, "origem": None, "observacao": None}],
    "inv_cotacoes": [], "inv_instituicoes": [],
    "inv_saldos_manuais": [{"id": "s1", "instituicao": "Previdência Exemplo", "produto": "PGBL Exemplo", "classe": "previdencia", "competencia": COMP.isoformat(), "saldo": 42000, "aportes": 500}],
    "inv_fotos": [{"competencia": mes(HOJE, -i).isoformat(), "valor": 118000 - i * 2100} for i in range(1, 9)],
})


def responder(route):
    req = route.request
    u = urlparse(req.url)
    if "/auth/v1/" in u.path:
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(SESSAO["user"]))
    m = re.search(r"/rest/v1/(rpc/)?([a-z_]+)", u.path)
    if not m:
        return route.fulfill(status=404, body="{}")
    if m.group(1):
        corpo = {"disponivel": True, "pessoa": "Diego", "pix": "diego@pix.exemplo", "inicio": COMP.isoformat(), "fim": (mes(HOJE, 1) - timedelta(days=1)).isoformat(),
                 "itens": [{k: i[k] for k in ("data", "descricao", "parcela_atual", "parcelas_total", "cartao", "valor")} | {"marcador": i["tag_nome"]} for i in DADOS["person_items"] if i["person_id"] == "p1"],
                 "total": 1658.31, "recebido": 1000, "saldo": 658.31} if m.group(2) == "get_shared_summary" else {}
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(corpo))
    tabela = m.group(2)
    linhas = DADOS.get(tabela, [])
    if req.method == "HEAD":
        return route.fulfill(status=200, headers={"content-range": f"0-0/{len(linhas)}"}, body="")
    if req.method != "GET":
        return route.fulfill(status=201, content_type="application/json", body="[]")
    # filtros simples eq.
    q = parse_qs(u.query)
    ops = {"eq": lambda a, b: a == b, "lt": lambda a, b: a < b, "lte": lambda a, b: a <= b, "gt": lambda a, b: a > b, "gte": lambda a, b: a >= b}
    for campo, vals in q.items():
        if campo in ("select", "order", "limit", "offset"):
            continue
        for v in vals:
            op, _, alvo = v.partition(".")
            if op in ops:
                linhas = [l for l in linhas if l.get(campo) is not None and ops[op](str(l.get(campo)), alvo)]
    if "limit" in q:
        linhas = linhas[: int(q["limit"][0])]
    if "vnd.pgrst.object" in (req.headers.get("accept") or ""):
        if not linhas:
            if os.environ.get("E2E_DEBUG"): print("406", req.url)
            return route.fulfill(status=406, content_type="application/json", body=json.dumps({"code": "PGRST116", "details": "The result contains 0 rows", "hint": None, "message": "JSON object requested, multiple (or no) rows returned"}))
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(linhas[0]))
    return route.fulfill(status=200, content_type="application/json", body=json.dumps(linhas))


TELAS = ["/", "/mes", "/faturas", "/contas", "/pessoas", "/pessoas/p1", "/categorias", "/mais", "/investimentos"]
TAMANHOS = {"celular": (375, 812), "deitado": (812, 375), "tablet": (768, 1024), "desktop": (1280, 900)}


def main():
    erros = []
    with sync_playwright() as p:
        nav = p.chromium.launch(headless=True, executable_path=os.environ.get("CHROME") or None)
        for nome_tam, (w, h) in TAMANHOS.items():
            ctx = nav.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce", locale="pt-BR", timezone_id="America/Sao_Paulo")
            ctx.route("https://demo.supabase.co/**", responder)
            # login sem sessão
            pg = ctx.new_page()
            atual = {"tela": "login"}
            pg.on("console", lambda m: m.type == "error" and erros.append(f"[{nome_tam} {atual['tela']}] {m.text}"))
            pg.on("pageerror", lambda e: erros.append(f"[{nome_tam} {atual['tela']}] {e}"))
            pg.goto(BASE + "/")
            pg.wait_for_load_state("networkidle")
            assert pg.get_by_role("button", name="Entrar").is_visible(), "tela de login não apareceu"
            pg.screenshot(path=str(SAIDA / f"{nome_tam}-00-login.png"), full_page=True)
            # sessão com 2 etapas (simulada)
            pg.evaluate("s => localStorage.setItem('sb-demo-auth-token', s)", json.dumps(SESSAO))
            for i, tela in enumerate(TELAS, 1):
                atual["tela"] = tela
                pg.goto(BASE + tela)
                pg.wait_for_load_state("networkidle")
                pg.wait_for_timeout(700)
                assert pg.locator("nav.abas").is_visible(), f"{tela}: barra de navegação ausente"
                assert not pg.locator(".erro").count(), f"{tela}: mensagem de erro na tela: {pg.locator('.erro').first.inner_text()}"
                sem_rolagem = pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
                assert sem_rolagem, f"{tela}: rolagem horizontal em {nome_tam}"
                pg.screenshot(path=str(SAIDA / f"{nome_tam}-{i:02d}{tela.replace('/', '-') or '-inicio'}.png"), full_page=True)
            # painel: conteúdo essencial
            pg.goto(BASE + "/")
            pg.wait_for_load_state("networkidle")
            assert pg.get_by_text("A pagar nos próximos dias").is_visible()
            assert pg.get_by_text("Neoenergia").is_visible(), "conta atrasada não aparece no painel"
            assert pg.get_by_text("venceu há 3 dias").is_visible()
            pg.get_by_role("button", name="Pagar").first.click()
            assert pg.get_by_role("dialog").is_visible(), "modal de pagamento não abriu"
            pg.screenshot(path=str(SAIDA / f"{nome_tam}-20-pagar.png"))
            # investimentos: abas
            pg.goto(BASE + "/investimentos")
            pg.wait_for_load_state("networkidle")
            assert pg.get_by_text("Patrimônio total").is_visible()
            assert pg.get_by_text("Próximos pagamentos").is_visible()
            for n, aba in enumerate(["Ativos", "Proventos", "Importar"], 1):
                atual["tela"] = "/investimentos " + aba
                pg.get_by_role("tab", name=aba).click()
                pg.wait_for_timeout(500)
                assert not pg.locator(".erro").count(), f"investimentos {aba}: erro na tela"
                assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), f"investimentos {aba}: rolagem horizontal em {nome_tam}"
                pg.screenshot(path=str(SAIDA / f"{nome_tam}-4{n}-investimentos-{aba.lower()}.png"), full_page=True)
            pg.get_by_role("tab", name="Ativos").click()
            assert pg.get_by_text("sem preço médio").first.is_visible(), "WEGE3 sem histórico deveria pedir preço médio"
            pg.locator(".ativo-linha").first.click()
            assert pg.get_by_role("dialog").is_visible()
            pg.screenshot(path=str(SAIDA / f"{nome_tam}-45-investimentos-editar.png"))
            pg.keyboard.press("Escape")
            # link público
            pg2 = nav.new_context(viewport={"width": w, "height": h}, reduced_motion="reduce").new_page()
            pg2.context.route("https://demo.supabase.co/**", responder)
            pg2.goto(BASE + "/c/token-demo")
            pg2.wait_for_load_state("networkidle")
            assert pg2.get_by_text("Resumo de Diego").is_visible()
            pg2.screenshot(path=str(SAIDA / f"{nome_tam}-30-link-diego.png"), full_page=True)
            ctx.close()
        nav.close()
    erros = [e for e in erros if "favicon" not in e and "manifest" not in e.lower()]
    if erros:
        print("ERROS DE CONSOLE:\n" + "\n".join(erros))
        sys.exit(1)
    print(f"OK — {len(list(SAIDA.glob('*.png')))} prints em {SAIDA}")


if __name__ == "__main__":
    main()
