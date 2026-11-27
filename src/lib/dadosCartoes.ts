// Dados de Cartões (RF-44 a RF-49, RF-91) e de Milhas (RF-50 a RF-58, RF-92).
import { supabase, ok } from './supabase';
import type { Cartao } from './dados';
import type { Isencao, CartaoPlanilha } from './cartoes';
import type { ResultadoMilhas } from './milhas';
import { nomePrograma } from './milhas';

export interface IsencaoDb extends Isencao { id: string; card_id: string }
export interface UsoVip { id: string; card_id: string; data: string; aeroporto: string | null }
export interface VersaoBeneficio { id: string; card_id: string; capturado_em: string; situacao: 'aprovada' | 'pendente' | 'recusada'; diff: { removidas: string[]; adicionadas: string[] } | null }
export interface DadosCartoes {
  cartoes: Cartao[]; isencoes: IsencaoDb[]; usos: UsoVip[]; pendentes: VersaoBeneficio[];
  faturas: { card_id: string; competencia: string; total: number; invoice_id: string; confirmada: boolean }[];
  contas: ContaMilhas[];
}

export async function carregarCartoes(): Promise<DadosCartoes> {
  const desde = new Date(); desde.setMonth(desde.getMonth() - 14);
  const [cartoes, isencoes, usos, pend, fat, contas] = await Promise.all([
    supabase.from('cards').select('*').order('apelido'),
    supabase.from('card_isencoes').select('*'),
    supabase.from('card_vip_usos').select('*').order('data', { ascending: false }),
    supabase.from('card_beneficios').select('id, card_id, capturado_em, situacao, diff').eq('situacao', 'pendente').order('capturado_em', { ascending: false }),
    supabase.from('invoice_summary').select('invoice_id, card_id, competencia, total, confirmada').gte('competencia', desde.toISOString().slice(0, 8) + '01'),
    carregarContasMilhas(),
  ]);
  const n = <T extends object>(xs: T[], campos: string[]) => xs.map((x) => { const r = { ...x } as Record<string, unknown>; for (const c of campos) if (r[c] != null) r[c] = Number(r[c]); return r as T; });
  return {
    cartoes: n(ok(cartoes) as Cartao[], ['pontos_nacional', 'pontos_internacional', 'anuidade', 'cashback_pct', 'vip_acessos']),
    isencoes: n(ok(isencoes) as IsencaoDb[], ['meta', 'meses']),
    usos: ok(usos) as UsoVip[],
    pendentes: ok(pend) as VersaoBeneficio[],
    faturas: n(ok(fat) as DadosCartoes['faturas'], ['total']),
    contas,
  };
}

const CAMPOS_CARTAO = ['apelido', 'emissor', 'final4', 'dia_vencimento', 'banco_pagamento', 'ativo', 'bandeira', 'dia_fechamento', 'mil_conta_id', 'pontos_nacional',
  'pontos_internacional', 'pontos_obs', 'anuidade', 'link', 'observacoes', 'cashback_pct', 'vip_acessos', 'vip_renovacao', 'vip_obs', 'instituicao_invest', 'desativado_em'] as const;

export async function salvarCartao(c: Partial<Cartao>) {
  const d: Record<string, unknown> = {};
  for (const k of CAMPOS_CARTAO) if (k in c) d[k] = (c as Record<string, unknown>)[k] === '' ? null : (c as Record<string, unknown>)[k];
  if (c.id) ok(await supabase.from('cards').update(d).eq('id', c.id));
  else ok(await supabase.from('cards').insert(d));
}
/** RF-44: desativar some do dia a dia e dos avisos; o histórico fica. */
export const desativarCartao = async (id: string, hoje: string) => ok(await supabase.from('cards').update({ ativo: false, desativado_em: hoje }).eq('id', id));
export const reativarCartao = async (id: string) => ok(await supabase.from('cards').update({ ativo: true, desativado_em: null }).eq('id', id));

export const usarVip = async (card_id: string, data: string, aeroporto: string | null) => ok(await supabase.from('card_vip_usos').insert({ card_id, data, aeroporto }));
export const removerUsoVip = async (id: string) => ok(await supabase.from('card_vip_usos').delete().eq('id', id));
export async function salvarIsencao(r: Partial<IsencaoDb> & { card_id: string }) {
  const d = { card_id: r.card_id, tipo: r.tipo, meta: r.meta ?? null, meses: r.meses ?? null, ate: r.ate ?? null, observacao: r.observacao ?? null };
  if (r.id) ok(await supabase.from('card_isencoes').update(d).eq('id', r.id)); else ok(await supabase.from('card_isencoes').insert(d));
}
export const removerIsencao = async (id: string) => ok(await supabase.from('card_isencoes').delete().eq('id', id));

/** RF-48: aprovar a versão nova vira a referência; recusar mantém a anterior. O cadastro só muda se você editar. */
export async function decidirBeneficio(v: VersaoBeneficio, aprovar: boolean) {
  if (aprovar) ok(await supabase.from('card_beneficios').update({ situacao: 'recusada' }).eq('card_id', v.card_id).eq('situacao', 'aprovada'));
  ok(await supabase.from('card_beneficios').update({ situacao: aprovar ? 'aprovada' : 'recusada' }).eq('id', v.id));
  ok(await supabase.from('cards').update({ beneficio_status: 'ok' }).eq('id', v.card_id));
}
export async function checarBeneficiosAgora() {
  const { data, error } = await supabase.functions.invoke('beneficios-mensal', { body: {} });
  if (error) throw new Error('Não foi possível checar as páginas agora. A checagem automática roda no dia 1 de cada mês.');
  return data as { verificados: number; alterados: number; falhas: number };
}

// ---------------------------------------------------------------------------
// Milhas
// ---------------------------------------------------------------------------
export interface ContaMilhas { conta_id: string; programa_id: string; programa: string; titular: string; de_terceiro: boolean; ativa: boolean; entradas: number; saidas: number; vendidas: number; saldo: number; custos: number; custo_milheiro: number | null; receita_vendas: number }
export interface Programa { id: string; nome: string; tipo: string; limite_cpfs: number | null; periodo_cpfs: 'ano_civil' | '12_meses' }
export interface MovimentoDb { id: string; conta_id: string; data: string; tipo: 'entrada' | 'saida' | 'custo'; origem: string; pontos: number | null; valor: number | null; descricao: string | null; invoice_id: string | null; previsto: number | null; transferencia_id: string | null }
export interface VendaDb { id: string; conta_id: string; plataforma: string | null; data: string; quantidade: number; valor_total: number; prazo_dias: number | null; data_pagamento: string | null; cpfs: number; status: string }
export interface EmissaoDb { id: string; conta_id: string; data: string; localizador: string | null; data_voo: string | null; trecho: string | null; card_id: string | null; cartao_texto: string | null; milhas: number | null; valor: number | null; cashback: number; status: string; reembolsado: number; cpfs: number }

export async function carregarContasMilhas(): Promise<ContaMilhas[]> {
  const r = ok(await supabase.from('mil_saldos').select('*')) as ContaMilhas[];
  return r.map((c) => ({ ...c, entradas: Number(c.entradas), saidas: Number(c.saidas), vendidas: Number(c.vendidas), saldo: Number(c.saldo), custos: Number(c.custos), custo_milheiro: c.custo_milheiro != null ? Number(c.custo_milheiro) : null, receita_vendas: Number(c.receita_vendas) }));
}

async function todas<T>(tabela: string): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const lote = ok(await supabase.from(tabela).select('*').order('data', { ascending: false }).range(de, de + 999)) as T[];
    out.push(...lote);
    if (lote.length < 1000) return out;
  }
}

export async function carregarMilhas() {
  const num = <T extends object>(xs: T[], campos: string[]) => xs.map((x) => { const r = { ...x } as Record<string, unknown>; for (const c of campos) if (r[c] != null) r[c] = Number(r[c]); return r as T; });
  const [contas, programas, movimentos, vendas, emissoes, cartoes, faturas] = await Promise.all([
    carregarContasMilhas(),
    supabase.from('mil_programas').select('*').order('nome'),
    todas<MovimentoDb>('mil_movimentos'),
    todas<VendaDb>('mil_vendas'),
    todas<EmissaoDb>('mil_emissoes'),
    supabase.from('cards').select('id, apelido, mil_conta_id, pontos_nacional, cashback_pct, ativo').not('mil_conta_id', 'is', null),
    supabase.from('invoice_summary').select('invoice_id, card_id, competencia, total, confirmada').eq('confirmada', true).order('competencia', { ascending: false }).limit(300),
  ]);
  return {
    contas, programas: ok(programas) as Programa[],
    movimentos: num(movimentos, ['pontos', 'valor', 'previsto']), vendas: num(vendas, ['quantidade', 'valor_total']), emissoes: num(emissoes, ['milhas', 'valor', 'cashback', 'reembolsado']),
    cartoes: num(ok(cartoes) as { id: string; apelido: string; mil_conta_id: string; pontos_nacional: number | null; cashback_pct: number; ativo: boolean }[], ['pontos_nacional', 'cashback_pct']),
    faturas: num(ok(faturas) as { invoice_id: string; card_id: string; competencia: string; total: number; confirmada: boolean }[], ['total']),
  };
}
export type DadosMilhas = Awaited<ReturnType<typeof carregarMilhas>>;

/** Garante programa e conta (titular) e devolve o id da conta. */
export async function garantirConta(programa: string, titular: string, deTerceiro: boolean): Promise<string> {
  const nome = nomePrograma(programa);
  let p = ok(await supabase.from('mil_programas').select('id').eq('nome', nome).maybeSingle()) as { id: string } | null;
  if (!p) p = ok(await supabase.from('mil_programas').insert({ nome, tipo: /livelo|esfera|iupp|pda|átomos/i.test(nome) ? 'banco' : /accor/i.test(nome) ? 'hotel' : 'aereo' }).select('id').single()) as { id: string };
  let c = ok(await supabase.from('mil_contas').select('id').eq('programa_id', p.id).eq('titular', titular).maybeSingle()) as { id: string } | null;
  if (!c) c = ok(await supabase.from('mil_contas').insert({ programa_id: p.id, titular, de_terceiro: deTerceiro }).select('id').single()) as { id: string };
  return c.id;
}

export const inserirMovimentos = async (ms: Partial<MovimentoDb>[]) => ok(await supabase.from('mil_movimentos').insert(ms));
export const removerMovimento = async (id: string) => ok(await supabase.from('mil_movimentos').delete().eq('id', id));
export const salvarVenda = async (v: Partial<VendaDb>) => (v.id ? ok(await supabase.from('mil_vendas').update(v).eq('id', v.id)) : ok(await supabase.from('mil_vendas').insert(v)));
export const removerVenda = async (id: string) => ok(await supabase.from('mil_vendas').delete().eq('id', id));
export const salvarEmissao = async (e: Partial<EmissaoDb>) => (e.id ? ok(await supabase.from('mil_emissoes').update(e).eq('id', e.id)) : ok(await supabase.from('mil_emissoes').insert(e)));
export const removerEmissao = async (id: string) => ok(await supabase.from('mil_emissoes').delete().eq('id', id));
export const salvarPrograma = async (p: Partial<Programa> & { id: string }) => ok(await supabase.from('mil_programas').update({ limite_cpfs: p.limite_cpfs, periodo_cpfs: p.periodo_cpfs, tipo: p.tipo }).eq('id', p.id));

// ---------------------------------------------------------------------------
// Importações
// ---------------------------------------------------------------------------
/** RF-91: cria ou atualiza cartões pelo apelido. Usos de sala VIP só entram se o cartão ainda não tiver nenhum. */
export async function importarCartoesPlanilha(lista: CartaoPlanilha[], hoje: string, arquivo: string) {
  const existentes = ok(await supabase.from('cards').select('id, apelido')) as { id: string; apelido: string }[];
  let novos = 0, atualizados = 0;
  for (const c of lista) {
    const conta = c.programa ? await garantirConta(c.programa, 'Mário', false) : null;
    const d = { apelido: c.apelido, emissor: c.emissor, bandeira: c.bandeira, ativo: c.ativo, desativado_em: c.ativo ? null : hoje, anuidade: c.anuidade, vip_acessos: c.vip_acessos,
      vip_renovacao: c.vip_renovacao, vip_obs: c.vip_obs, pontos_nacional: c.pontos_nacional, pontos_internacional: c.pontos_internacional, pontos_obs: c.pontos_obs,
      observacoes: c.observacoes, link: c.link, ...(conta ? { mil_conta_id: conta } : {}) };
    const ja = existentes.find((e) => e.apelido.toLowerCase() === c.apelido.toLowerCase());
    let id: string;
    if (ja) { ok(await supabase.from('cards').update(d).eq('id', ja.id)); id = ja.id; atualizados++; }
    else { id = (ok(await supabase.from('cards').insert(d).select('id').single()) as { id: string }).id; novos++; }
    ok(await supabase.from('card_isencoes').delete().eq('card_id', id));
    if (c.isencoes.length) ok(await supabase.from('card_isencoes').insert(c.isencoes.map((i) => ({ ...i, card_id: id }))));
    if (c.vip_usados) {
      const { count } = await supabase.from('card_vip_usos').select('id', { count: 'exact', head: true }).eq('card_id', id);
      if (!count) ok(await supabase.from('card_vip_usos').insert(Array.from({ length: c.vip_usados }, () => ({ card_id: id, data: hoje, aeroporto: '(da planilha)' }))));
    }
  }
  ok(await supabase.from('import_log').insert({ tipo: 'cartoes', arquivo, importadas: novos + atualizados, ignoradas: 0, detalhes: { novos, atualizados } }));
  return { novos, atualizados };
}

/** RF-92: grava o Controle de Milhas; reimportar não duplica (chave por célula). */
export async function importarMilhasPlanilha(r: ResultadoMilhas, arquivo: string) {
  const ids = new Map<string, string>();
  for (const c of r.contas) ids.set(c.chave, await garantirConta(c.programa, c.titular, c.de_terceiro));
  const lotes = async (tabela: string, linhas: Record<string, unknown>[]) => {
    let novas = 0;
    for (let i = 0; i < linhas.length; i += 500) novas += (ok(await supabase.from(tabela).upsert(linhas.slice(i, i + 500), { onConflict: 'user_id,chave', ignoreDuplicates: true }).select('id')) as unknown[]).length;
    return novas;
  };
  const m = await lotes('mil_movimentos', r.movimentos.map(({ conta, ...x }) => ({ ...x, conta_id: ids.get(conta) })));
  const v = await lotes('mil_vendas', r.vendas.map(({ conta, ...x }) => ({ ...x, conta_id: ids.get(conta) })));
  const e = await lotes('mil_emissoes', r.emissoes.map(({ conta, ...x }) => ({ ...x, conta_id: ids.get(conta) })));
  ok(await supabase.from('import_log').insert({ tipo: 'milhas', arquivo, importadas: m + v + e, ignoradas: r.movimentos.length + r.vendas.length + r.emissoes.length - (m + v + e), detalhes: { movimentos: m, vendas: v, emissoes: e } }));
  return { movimentos: m, vendas: v, emissoes: e };
}
