"""Gera src/demo/dados.json com os mesmos dados fictícios das telas de teste (para o modo demonstração)."""
import json, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import telas  # noqa: E402

saida = pathlib.Path(__file__).resolve().parents[2] / "src" / "demo" / "dados.json"
saida.write_text(json.dumps({"tabelas": telas.DADOS, "vivo": telas.VIVO, "usuario": telas.SESSAO["user"]}, ensure_ascii=False))
print("ok", saida)
