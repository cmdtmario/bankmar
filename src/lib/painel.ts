// Dados da tela inicial (painel). Cálculos puros em `montarPainel` (testados); busca em `carregarPainel`.
import { supabase, ok } from './supabase';
import { garantirMes, type PagamentoDb } from './dados';
import { somaMeses, somaCentavos, centavos } from './formato';

export interface Vencimento {
  tipo: 'conta' | 'fatura';
  id: string;
  nome: string;
  vencimento: string;
  valor: number;
  pago: number;
  falta: number;
  dias: number; // negativo = atrasado
  banco: string | null;
  pagamentos: PagamentoDb[];
}

export interface PainelDados {
  comp: string;
  renda: number | null;
  gastoMario: number;
  gastoTotal: number;
  serie: { comp: string; gasto: number; renda: number | null }[];
  categorias: { nome: string; valor: number }[];
  vencimentos: Vencimento[];
  aReceber: { id: string; nome: string; saldo: number }[];
  cartoes: { nome: string; total: number; mario: number }[];
  pendencias: { naoConferidos: number; aRevisar: number; semRenda: boolean };
  mediaTres: number | null;
}

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(ate + 'T12:00:00Z') - Date.parse(de + 'T12:00:00Z')) / 86400000);

export interface Brutos {
  comp: string;
  hoje: string;
  meses: { competencia: string; renda: number | null }[];
  gastos: { competencia: string; category_id: string | null; total: number; total_mario: number }[];
  categorias: { id: string; nome: string }[];
  contas: { id: string; descricao: string; vencimento: string | null; valor: number; banco_pagamento: string | null }[];
  faturas: { invoice_id: string; card_id: string; competencia: string; vencimento: string | null; total: number; total_mario: number; confirmada: boolean; qtd_nao_conferidas: number }[];
  cartoes: { id: string; apelido: string; banco_pagamento: string | null }[];
  pagamentos: PagamentoDb[];
  itensPessoas: { person_id: string; valor: number }[];
  recebimentos: { person_id: string; valor: number }[];
  pessoas: { id: string; nome: string }[];
}

export function montarPainel(b: Brutos): PainelDados {
  const nomeCat = (id: string | null) => b.categorias.find((c) => c.id === id)?.nome ?? 'Sem categoria';
  const mesesSerie = Array.from({ length: 12 }, (_, i) => somaMeses(b.comp, i - 11));
  const gastoDe = (m: string, campo: 'total' | 'total_mario') => somaCentavos(b.gastos.filter((g) => g.competencia === m).map((g) => Number(g[campo])));
  const serie = mesesSerie.map((m) => ({ comp: m, gasto: gastoDe(m, 'total_mario'), renda: b.meses.find((x) => x.competencia === m)?.renda ?? null }));

  const porCat = new Map<string, number>();
  for (const g of b.gastos.filter((x) => x.competencia === b.comp)) porCat.set(nomeCat(g.category_id), somaCentavos([porCat.get(nomeCat(g.category_id)) ?? 0, Number(g.total_mario)]));
  const ordenadas = [...porCat.entries()].filter(([, v]) => v > 0).sort((a, b2) => b2[1] - a[1]);
  const top = ordenadas.slice(0, 5).map(([nome, valor]) => ({ nome, valor }));
  const resto = somaCentavos(ordenadas.slice(5).map(([, v]) => v));
  if (resto > 0) top.push({ nome: 'Outras', valor: resto });

  const pagoDe = (campo: 'bill_id' | 'invoice_id', id: string) => b.pagamentos.filter((p) => p[campo] === id);
  const cartao = (id: string) => b.cartoes.find((c) => c.id === id);
  const vencimentos: Vencimento[] = [
    ...b.contas.filter((c) => c.vencimento).map((c) => ({ tipo: 'conta' as const, id: c.id, nome: c.descricao, vencimento: c.vencimento!, valor: Number(c.valor), banco: c.banco_pagamento, pagamentos: pagoDe('bill_id', c.id) })),
    ...b.faturas.filter((f) => f.confirmada && f.vencimento).map((f) => ({ tipo: 'fatura' as const, id: f.invoice_id, nome: `Fatura ${cartao(f.card_id)?.apelido ?? ''}`.trim(), vencimento: f.vencimento!, valor: Number(f.total), banco: cartao(f.card_id)?.banco_pagamento ?? null, pagamentos: pagoDe('invoice_id', f.invoice_id) })),
  ]
    .map((v) => {
      const pago = somaCentavos(v.pagamentos.map((p) => Number(p.valor)));
      return { ...v, pago, falta: (centavos(v.valor) - centavos(pago)) / 100, dias: diasEntre(b.hoje, v.vencimento) };
    })
    .filter((v) => v.falta > 0 && v.dias <= 10 && v.dias >= -60)
    .sort((a, c) => a.dias - c.dias || c.falta - a.falta);

  const saldo = new Map<string, number>();
  for (const i of b.itensPessoas) saldo.set(i.person_id, somaCentavos([saldo.get(i.person_id) ?? 0, Number(i.valor)]));
  for (const r of b.recebimentos) saldo.set(r.person_id, somaCentavos([saldo.get(r.person_id) ?? 0, -Number(r.valor)]));
  const aReceber = [...saldo.entries()]
    .map(([id, s]) => ({ id, nome: b.pessoas.find((p) => p.id === id)?.nome ?? '?', saldo: s }))
    .filter((p) => Math.abs(p.saldo) >= 0.01)
    .sort((a, c) => c.saldo - a.saldo);

  const fatMes = b.faturas.filter((f) => f.competencia === b.comp && Number(f.total) !== 0);
  const cartoes = fatMes.map((f) => ({ nome: cartao(f.card_id)?.apelido ?? 'Cartão', total: Number(f.total), mario: Number(f.total_mario) })).sort((a, c) => c.total - a.total);

  const anteriores = serie.slice(8, 11).map((s) => s.gasto).filter((v) => v > 0);
  const renda = b.meses.find((m) => m.competencia === b.comp)?.renda ?? null;
  return {
    comp: b.comp,
    renda: renda == null ? null : Number(renda),
    gastoMario: gastoDe(b.comp, 'total_mario'),
    gastoTotal: gastoDe(b.comp, 'total'),
    serie,
    categorias: top,
    vencimentos,
    aReceber,
    cartoes,
    pendencias: {
      naoConferidos: fatMes.reduce((a, f) => a + Number(f.qtd_nao_conferidas), 0),
      aRevisar: aReceber.filter((p) => /a revisar/i.test(p.nome)).length,
      semRenda: renda == null,
    },
    mediaTres: anteriores.length ? somaCentavos(anteriores) / anteriores.length : null,
  };
}

export async function carregarPainel(comp: string, hoje: string): Promise<PainelDados> {
  await garantirMes(comp);
  const ini = somaMeses(comp, -11);
  const [meses, gastos, categorias, contas, faturas, cartoes, pagamentos, itens, recs, pessoas] = await Promise.all([
    supabase.from('months').select('competencia, renda').gte('competencia', ini).lte('competencia', comp),
    supabase.from('gastos_categoria').select('*').gte('competencia', ini).lte('competencia', comp),
    supabase.from('categories').select('id, nome'),
    supabase.from('bills').select('id, descricao, vencimento, valor, banco_pagamento').gte('vencimento', somaMeses(comp, -2)).lte('vencimento', somaMeses(comp, 2)),
    supabase.from('invoice_summary').select('*').gte('competencia', somaMeses(comp, -2)).lte('competencia', somaMeses(comp, 1)),
    supabase.from('cards').select('id, apelido, banco_pagamento'),
    supabase.from('payments').select('*'),
    supabase.from('person_items').select('person_id, valor').not('person_id', 'is', null),
    supabase.from('receipts').select('person_id, valor'),
    supabase.from('people').select('id, nome'),
  ]);
  return montarPainel({
    comp, hoje,
    meses: ok(meses) as Brutos['meses'],
    gastos: ok(gastos) as Brutos['gastos'],
    categorias: ok(categorias) as Brutos['categorias'],
    contas: ok(contas) as Brutos['contas'],
    faturas: ok(faturas) as Brutos['faturas'],
    cartoes: ok(cartoes) as Brutos['cartoes'],
    pagamentos: ok(pagamentos) as PagamentoDb[],
    itensPessoas: ok(itens) as Brutos['itensPessoas'],
    recebimentos: ok(recs) as Brutos['recebimentos'],
    pessoas: ok(pessoas) as Brutos['pessoas'],
  });
}
