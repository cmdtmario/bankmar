// Lógica pura da função diária (testada em src/lib/investimentos/diario.test.ts).

/** Se `hoje` (AAAA-MM-DD) é o 1º dia útil do mês (seg–sex, sem feriados), devolve a competência do mês anterior. */
export function primeiroDiaUtil(hoje: string): string | null {
  const d = new Date(hoje + 'T12:00:00Z');
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  while (p.getUTCDay() === 0 || p.getUTCDay() === 6) p.setUTCDate(p.getUTCDate() + 1);
  if (p.toISOString().slice(0, 10) !== hoje) return null;
  const ant = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return ant.toISOString().slice(0, 10);
}

interface Pos { classe: string; codigo: string; instituicao: string; quantidade: number; valor: number | null }
interface Manual { instituicao: string; produto: string; classe: string; saldo: number }

/** Valor de cada linha da foto: negociáveis pela cotação do dia; demais pelo valor da posição; saldos manuais mais recentes. */
export function valorDaFoto(pos: Pos[], precos: Map<string, number>, manuais: Manual[]) {
  const out = new Map<string, { classe: string; instituicao: string; codigo: string; valor: number }>();
  const add = (classe: string, instituicao: string, codigo: string, valor: number) => {
    const k = `${classe}|${instituicao}|${codigo}`;
    const v = out.get(k);
    out.set(k, { classe, instituicao, codigo, valor: Math.round(((v?.valor ?? 0) + valor) * 100) / 100 });
  };
  for (const p of pos) {
    const preco = precos.get(p.codigo);
    add(p.classe, p.instituicao, p.codigo, preco != null ? preco * Number(p.quantidade) : Number(p.valor ?? 0));
  }
  const vistos = new Set<string>();
  for (const m of manuais) {
    const k = `${m.instituicao}|${m.produto}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    add(m.classe, m.instituicao, m.produto, Number(m.saldo));
  }
  return [...out.values()];
}
