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

/** Data de Brasília (AAAA-MM-DD) de um instante em segundos. */
export function dataBrasilia(seg: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(seg * 1000));
}

export interface CotacaoAoVivo { codigo: string; preco: number; anterior: number | null; hora: string; dias: { data: string; preco: number }[] }

/** Lê a resposta do gráfico do Yahoo: preço atual, fechamento do pregão anterior e os fechamentos diários. */
export function lerYahoo(codigo: string, j: unknown): CotacaoAoVivo | null {
  const r = (j as { chart?: { result?: { meta?: Record<string, number>; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] } })?.chart?.result?.[0];
  const meta = r?.meta;
  const preco = meta?.regularMarketPrice;
  if (typeof preco !== 'number' || !(preco > 0)) return null;
  const hoje = dataBrasilia(meta!.regularMarketTime ?? Date.now() / 1000);
  const ts = r?.timestamp ?? [];
  const fech = r?.indicators?.quote?.[0]?.close ?? [];
  const porDia = new Map<string, number>();
  ts.forEach((t, i) => { const v = fech[i]; if (typeof v === 'number' && v > 0) porDia.set(dataBrasilia(t), Math.round(v * 1e4) / 1e4); });
  porDia.set(hoje, preco);
  const dias = [...porDia.entries()].map(([data, p]) => ({ data, preco: p })).sort((a, b) => a.data.localeCompare(b.data));
  const antes = dias.filter((d) => d.data < hoje);
  const anterior = antes.length ? antes[antes.length - 1].preco : (typeof meta!.chartPreviousClose === 'number' ? meta!.chartPreviousClose : null);
  return { codigo, preco, anterior, hora: new Date((meta!.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(), dias };
}

/** Pregão da B3 (com margem para o leilão de fechamento): seg–sex, 10h00–18h15 de Brasília. */
export function pregaoAberto(agora: Date): boolean {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(agora);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  if (['Sat', 'Sun'].includes(g('weekday'))) return false;
  const min = Number(g('hour')) * 60 + Number(g('minute'));
  return min >= 600 && min <= 1095;
}

export const INDICES: Record<string, string> = { IBOV: '^BVSP', DOLAR: 'USDBRL=X', EURO: 'EURBRL=X' };
