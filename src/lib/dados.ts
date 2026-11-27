// Acesso a dados (Supabase). Toda regra de segurança está no banco (RLS + aal2).
import { supabase, ok } from './supabase';
import { CATEGORIAS_PADRAO, REGRAS_CATEGORIA_PADRAO, type RegraDivisao, type Pagamento } from './regras';
import { somaMeses } from './formato';

export interface Pessoa { id: string; nome: string; apelido: string | null; pix: string | null; ativo: boolean }
export interface Tag { id: string; nome: string }
export interface Categoria { id: string; nome: string; ativo: boolean }
export interface Cartao {
  id: string; apelido: string; emissor: 'itau' | 'caixa' | 'outro'; final4: string | null; dia_vencimento: number | null; banco_pagamento: string | null; ativo: boolean;
  bandeira?: string | null; dia_fechamento?: number | null; mil_conta_id?: string | null; pontos_nacional?: number | null; pontos_internacional?: number | null;
  pontos_obs?: string | null; anuidade?: number | null; link?: string | null; observacoes?: string | null; cashback_pct?: number; vip_acessos?: number | null;
  vip_renovacao?: string | null; vip_obs?: string | null; instituicao_invest?: string | null; beneficio_status?: 'nunca' | 'ok' | 'alterado' | 'nao_verificado';
  beneficio_verificado_em?: string | null; desativado_em?: string | null;
}
export interface PagamentoDb extends Pagamento { id: string; bill_id: string | null; invoice_id: string | null; banco: string | null }
export interface Conta { id: string; competencia: string; template_id: string | null; descricao: string; vencimento: string | null; valor: number; banco_pagamento: string | null; category_id: string | null; split_rule: RegraDivisao; observacao: string | null; origem: string; total_mario?: number; pagamentos: PagamentoDb[] }
export interface FaturaResumo { invoice_id: string; card_id: string; competencia: string; vencimento: string | null; total_impresso: number | null; confirmada: boolean; total: number; total_mario: number; qtd_linhas: number; qtd_projetadas: number; qtd_nao_conferidas: number; pagamentos: PagamentoDb[] }
export interface Modelo { id: string; descricao: string; dia_vencimento: number; valor_padrao: number | null; banco_pagamento: string | null; category_id: string | null; split_rule: RegraDivisao; ativo: boolean; inicio: string }

export interface Cadastros { pessoas: Pessoa[]; tags: Tag[]; categorias: Categoria[]; cartoes: Cartao[] }

export async function carregarCadastros(): Promise<Cadastros> {
  const [pessoas, tags, categorias, cartoes] = await Promise.all([
    supabase.from('people').select('*').order('nome'),
    supabase.from('tags').select('*').order('nome'),
    supabase.from('categories').select('*').order('nome'),
    supabase.from('cards').select('*').order('apelido'),
  ]);
  return { pessoas: ok(pessoas), tags: ok(tags), categorias: ok(categorias), cartoes: ok(cartoes) } as Cadastros;
}

/** Primeiro acesso: categorias e regras iniciais (RF-30/RF-31). */
export async function semearSeVazio() {
  const { count } = await supabase.from('categories').select('id', { count: 'exact', head: true });
  if (count) return;
  const cats = ok(await supabase.from('categories').insert(CATEGORIAS_PADRAO.map((nome) => ({ nome }))).select()) as Categoria[];
  const porNome = new Map(cats.map((c) => [c.nome, c.id]));
  ok(await supabase.from('category_rules').insert(REGRAS_CATEGORIA_PADRAO.map(([padrao, cat]) => ({ padrao, category_id: porNome.get(cat)! }))));
}

const ultimoDia = (comp: string) => {
  const [a, m] = comp.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};

/** RF-10: garante o mês e gera as contas recorrentes que ainda não existem. */
export async function garantirMes(comp: string) {
  ok(await supabase.from('months').upsert({ competencia: comp }, { onConflict: 'user_id,competencia', ignoreDuplicates: true }));
  const modelos = ok(await supabase.from('bill_templates').select('*').eq('ativo', true).lt('inicio', somaMeses(comp, 1))) as Modelo[];
  if (!modelos.length) return;
  const existentes = ok(await supabase.from('bills').select('template_id, valor').eq('competencia', comp).not('template_id', 'is', null)) as { template_id: string }[];
  const ja = new Set(existentes.map((e) => e.template_id));
  const faltam = modelos.filter((m) => !ja.has(m.id));
  if (!faltam.length) return;
  // valor variável: sugere o do mês anterior (marcado como estimado)
  const anteriores = ok(await supabase.from('bills').select('template_id, valor').eq('competencia', somaMeses(comp, -1))) as { template_id: string; valor: number }[];
  const ant = new Map(anteriores.map((a) => [a.template_id, a.valor]));
  ok(
    await supabase.from('bills').insert(
      faltam.map((m) => ({
        competencia: comp,
        template_id: m.id,
        descricao: m.descricao,
        vencimento: `${comp.slice(0, 8)}${String(Math.min(m.dia_vencimento, ultimoDia(comp))).padStart(2, '0')}`,
        valor: m.valor_padrao ?? ant.get(m.id) ?? 0,
        banco_pagamento: m.banco_pagamento,
        category_id: m.category_id,
        split_rule: m.split_rule,
        observacao: m.valor_padrao == null ? 'valor variável — estimado pelo mês anterior, confirme' : null,
        origem: 'recorrente',
      })),
    ),
  );
}

export async function dadosDoMes(comp: string) {
  await garantirMes(comp);
  const [mes, mesAnt, contas, resumoContas, faturas, pags] = await Promise.all([
    supabase.from('months').select('*').eq('competencia', comp).maybeSingle(),
    supabase.from('months').select('renda').lt('competencia', comp).not('renda', 'is', null).order('competencia', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('bills').select('*').eq('competencia', comp).order('vencimento'),
    supabase.from('bill_summary').select('*'),
    supabase.from('invoice_summary').select('*').eq('competencia', comp),
    supabase.from('payments').select('*'),
  ]);
  const pagamentos = ok(pags) as PagamentoDb[];
  const mario = new Map((ok(resumoContas) as { bill_id: string; total_mario: number }[]).map((r) => [r.bill_id, Number(r.total_mario)]));
  return {
    mes: ok(mes) as { id: string; renda: number | null } | null,
    rendaSugerida: (ok(mesAnt) as { renda: number } | null)?.renda ?? null,
    contas: (ok(contas) as Conta[]).map((c) => ({ ...c, valor: Number(c.valor), total_mario: mario.get(c.id) ?? 0, pagamentos: pagamentos.filter((p) => p.bill_id === c.id) })),
    faturas: (ok(faturas) as FaturaResumo[]).map((f) => ({ ...f, total: Number(f.total), total_mario: Number(f.total_mario), pagamentos: pagamentos.filter((p) => p.invoice_id === f.invoice_id) })),
  };
}

export async function salvarRenda(comp: string, renda: number | null) {
  ok(await supabase.from('months').upsert({ competencia: comp, renda }, { onConflict: 'user_id,competencia' }));
}

export async function adicionarPagamento(p: { bill_id?: string; invoice_id?: string; data: string; banco: string | null; valor: number }) {
  ok(await supabase.from('payments').insert(p));
}
export async function removerPagamento(id: string) {
  ok(await supabase.from('payments').delete().eq('id', id));
}
