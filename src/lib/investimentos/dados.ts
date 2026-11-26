// Acesso a dados de investimentos (Supabase) e montagem da carteira para as telas.
import { supabase, ok } from '../supabase';
import type { ArquivoB3, Movimentacao, Negociacao, Posicao, Classe } from './b3';
import { calcularCustos, consolidar, criarAgrupador, extrairProventos, type Ajuste, type Ativo, type Provento, type CustoAtivo } from './carteira';
import { somaCentavos } from '../formato';

async function todas<T>(tabela: string, ordem: string, filtro?: (q: ReturnType<typeof supabase.from>) => unknown): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    let q = supabase.from(tabela).select('*').order(ordem).range(de, de + 999);
    if (filtro) q = filtro(q as never) as typeof q;
    const lote = ok(await q) as T[];
    out.push(...lote);
    if (lote.length < 1000) return out;
  }
}

async function inserirEmLotes(tabela: string, linhas: Record<string, unknown>[], conflito?: string) {
  let novas = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const lote = linhas.slice(i, i + 500);
    const r = conflito
      ? await supabase.from(tabela).upsert(lote, { onConflict: conflito, ignoreDuplicates: true }).select('id')
      : await supabase.from(tabela).insert(lote).select('id');
    novas += (ok(r) as unknown[]).length;
  }
  return novas;
}

/** RF-60 / RF-61: grava um arquivo da B3 sem duplicar. */
export async function importarArquivoB3(arq: ArquivoB3, nome: string): Promise<{ novas: number; total: number; dataRef?: string }> {
  let novas = 0;
  let dataRef: string | undefined;
  if (arq.tipo === 'negociacao') {
    novas = await inserirEmLotes('inv_negociacoes', arq.linhas.map(({ data, tipo, mercado, instituicao, codigo, quantidade, preco, valor, chave }) => ({ data, tipo, mercado, instituicao, codigo, quantidade, preco, valor, chave })), 'user_id,chave');
  } else if (arq.tipo === 'movimentacao') {
    novas = await inserirEmLotes('inv_movimentacoes', arq.linhas.map(({ data, entrada, tipo, produto, codigo, instituicao, quantidade, preco, valor, chave }) => ({ data, entrada, tipo, produto, codigo, instituicao, quantidade, preco, valor, chave })), 'user_id,chave');
  } else if (arq.tipo === 'proventos') {
    ok(await supabase.from('inv_proventos_receber').delete().gte('id', 0));
    novas = await inserirEmLotes('inv_proventos_receber', arq.linhas.map(({ codigo, produto, tipo, evento, previsao, instituicao, quantidade, valor }) => ({ codigo, produto, tipo, evento, previsao, instituicao, quantidade, valor })));
  } else {
    dataRef = nome.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? new Date().toISOString().slice(0, 10);
    ok(await supabase.from('inv_posicoes').delete().eq('data_ref', dataRef));
    novas = await inserirEmLotes('inv_posicoes', arq.linhas.map((p) => ({ data_ref: dataRef, classe: p.classe, codigo: p.codigo, produto: p.produto, instituicao: p.instituicao, cnpj: p.cnpj, isin: p.isin, emissor: p.emissor, indexador: p.indexador, vencimento: p.vencimento, quantidade: p.quantidade, preco: p.preco, valor: p.valor, valor_aplicado: p.valorAplicado })));
  }
  ok(await supabase.from('import_log').insert({ tipo: `b3_${arq.tipo}`, arquivo: nome, importadas: novas, ignoradas: arq.ignoradas + (arq.linhas.length - novas), detalhes: { linhas: arq.linhas.length, dataRef } }));
  return { novas, total: arq.linhas.length, dataRef };
}

export interface SaldoManual { id: string; instituicao: string; produto: string; classe: Classe; competencia: string; saldo: number; aportes: number | null }
export interface ProventoReceberDb { codigo: string; produto: string; evento: string; previsao: string | null; instituicao: string; valor: number }

export interface Carteira {
  ativos: Ativo[];
  manuais: SaldoManual[]; // último saldo de cada produto fora da B3
  proventos: Provento[];
  aReceber: ProventoReceberDb[];
  custos: Map<string, CustoAtivo>;
  fotos: { competencia: string; valor: number }[];
  dataPosicao: string | null;
  totalB3: number;
  totalManual: number;
  agrupar: (i: string) => string;
  temDados: boolean;
}

export async function carregarCarteira(): Promise<Carteira> {
  const ultimaPos = ok(await supabase.from('inv_posicoes').select('data_ref').order('data_ref', { ascending: false }).limit(1)) as { data_ref: string }[];
  const dataPosicao = ultimaPos[0]?.data_ref ?? null;
  const [negs, movs, posicoes, ajustes, cot, receber, manuais, fotos, inst] = await Promise.all([
    todas<Negociacao>('inv_negociacoes', 'id'),
    todas<Movimentacao>('inv_movimentacoes', 'id'),
    dataPosicao ? todas<Posicao & { valor_aplicado: number | null }>('inv_posicoes', 'id', (q) => (q as unknown as { eq: (a: string, b: string) => unknown }).eq('data_ref', dataPosicao)) : Promise.resolve([]),
    supabase.from('inv_ajustes').select('*'),
    supabase.from('inv_cotacoes').select('codigo, data, preco').order('data', { ascending: false }).limit(3000),
    supabase.from('inv_proventos_receber').select('*').order('previsao'),
    supabase.from('inv_saldos_manuais').select('*').order('competencia', { ascending: false }),
    supabase.from('inv_fotos').select('competencia, valor'),
    supabase.from('inv_instituicoes').select('*'),
  ]);
  const num = <T extends object>(x: T, campos: string[]): T => { const r = x as Record<string, unknown>; for (const c of campos) if (r[c] != null) r[c] = Number(r[c]); return x; };
  const n2 = negs.map((x) => num(x, ['quantidade', 'preco', 'valor']));
  const m2 = movs.map((x) => num(x, ['quantidade', 'preco', 'valor']));
  const p2 = posicoes.map((x) => ({ ...num(x, ['quantidade', 'preco', 'valor', 'valor_aplicado']), valorAplicado: x.valor_aplicado != null ? Number(x.valor_aplicado) : null })) as Posicao[];
  const cotacoes = new Map<string, { preco: number; data: string }>();
  for (const c of ok(cot) as { codigo: string; data: string; preco: number }[]) if (!cotacoes.has(c.codigo)) cotacoes.set(c.codigo, { preco: Number(c.preco), data: c.data });
  const agrupar = criarAgrupador(ok(inst) as { nome_original: string; grupo: string }[]);
  const custos = calcularCustos(n2, m2);
  const proventos = extrairProventos(m2);
  const ativos = consolidar({ posicoes: p2, custos, ajustes: (ok(ajustes) as Ajuste[]).map((a) => ({ ...a, preco_medio: a.preco_medio != null ? Number(a.preco_medio) : null, preco_alvo: a.preco_alvo != null ? Number(a.preco_alvo) : null })), proventos, cotacoes, dataPosicao, agrupar });
  const ultimos = new Map<string, SaldoManual>();
  for (const s of ok(manuais) as SaldoManual[]) { const k = `${s.instituicao}|${s.produto}`; if (!ultimos.has(k)) ultimos.set(k, { ...s, saldo: Number(s.saldo) }); }
  const porMes = new Map<string, number>();
  for (const f of ok(fotos) as { competencia: string; valor: number }[]) porMes.set(f.competencia, somaCentavos([porMes.get(f.competencia) ?? 0, Number(f.valor)]));
  const totalB3 = somaCentavos(ativos.map((a) => a.mercado));
  const totalManual = somaCentavos([...ultimos.values()].map((s) => s.saldo));
  return {
    ativos, manuais: [...ultimos.values()], proventos, custos,
    aReceber: (ok(receber) as ProventoReceberDb[]).map((r) => ({ ...r, valor: Number(r.valor) })),
    fotos: [...porMes.entries()].map(([competencia, valor]) => ({ competencia, valor })).sort((a, b) => a.competencia.localeCompare(b.competencia)),
    dataPosicao, totalB3, totalManual, agrupar, temDados: Boolean(dataPosicao || negs.length),
  };
}

export async function salvarAjuste(codigo: string, campos: { preco_medio?: number | null; preco_alvo?: number | null; origem?: string }) {
  ok(await supabase.from('inv_ajustes').upsert({ codigo, ...campos }, { onConflict: 'user_id,codigo' }));
}

/** RF-62: pede à função do servidor para atualizar as cotações agora. */
export async function atualizarCotacoes() {
  const { data, error } = await supabase.functions.invoke('investimentos-diario', { body: { acao: 'cotacoes' } });
  if (error) throw new Error('Não foi possível atualizar as cotações agora. A atualização automática roda todo dia útil às 18h30.');
  return data as { atualizadas: number; falhas: string[] };
}
