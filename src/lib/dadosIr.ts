// Dados do Imposto de Renda (RF-75 a RF-78d, RF-93) e exportações do relatório (RF-78b).
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase, ok } from './supabase';
import { CODIGOS_PADRAO, FICHAS, PARAMETROS_PADRAO, type ChaveCodigo, type Codigo, type ItemIR, type Mensal, type MesRV, type Parametros, type Previdencia } from './ir';
import type { Movimentacao, Negociacao, Posicao } from './investimentos/b3';
import { criarAgrupador, type Ajuste } from './investimentos/carteira';
import type { Classe } from './investimentos/b3';

export interface ConfigIr { ano: number; renda_tributavel: number | null; codigos: Partial<Record<ChaveCodigo, Codigo>>; parametros: Partial<Parametros>; revisado_em: string | null }
export interface Conferencia { item: string; situacao: 'conferido' | 'divergente' | 'nao_veio'; observacao: string | null }

async function todas<T>(tabela: string, ordem = 'id'): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const lote = ok(await supabase.from(tabela).select('*').order(ordem).range(de, de + 999)) as T[];
    out.push(...lote);
    if (lote.length < 1000) return out;
  }
}
const num = <T extends object>(xs: T[], campos: string[]) => xs.map((x) => { const r = { ...x } as Record<string, unknown>; for (const c of campos) if (r[c] != null) r[c] = Number(r[c]); return r as T; });
const CAMPOS_MENSAL = ['salario_liquido', 'ferias_terco', 'inss_folha', 'inss_ferias', 'ir_folha', 'ir_ferias', 'ir_vinculo_unico', 'plano_saude', 'odontologico', 'ensino', 'medico_fora'];

export async function carregarIr(ano: number) {
  const [mensal, prev, cfg, conf] = await Promise.all([
    supabase.from('ir_mensal').select('*').gte('competencia', `${ano}-01-01`).lte('competencia', `${ano}-12-01`).order('competencia'),
    supabase.from('ir_previdencia').select('*').gte('competencia', `${ano}-01-01`).lte('competencia', `${ano}-12-01`).order('competencia'),
    supabase.from('ir_config').select('*').eq('ano', ano).maybeSingle(),
    supabase.from('ir_conferencia').select('*').eq('ano', ano),
  ]);
  const c = ok(cfg) as ConfigIr | null;
  return {
    mensal: num(ok(mensal) as (Mensal & { id: string })[], CAMPOS_MENSAL),
    previdencia: num(ok(prev) as (Previdencia & { id: string })[], ['valor']),
    config: { ano, renda_tributavel: c?.renda_tributavel != null ? Number(c.renda_tributavel) : null, codigos: c?.codigos ?? {}, parametros: c?.parametros ?? {}, revisado_em: c?.revisado_em ?? null } as ConfigIr,
    conferencia: ok(conf) as Conferencia[],
  };
}
export type DadosIr = Awaited<ReturnType<typeof carregarIr>>;

export const parametrosDe = (c: ConfigIr): Parametros => ({ ...PARAMETROS_PADRAO, ...c.parametros });
export const codigosDe = (c: ConfigIr) => ({ ...CODIGOS_PADRAO, ...c.codigos });

export async function salvarMensal(m: Partial<Mensal> & { competencia: string }) {
  ok(await supabase.from('ir_mensal').upsert(m, { onConflict: 'user_id,competencia' }));
}
export async function salvarPrevidencia(p: Previdencia) {
  ok(await supabase.from('ir_previdencia').upsert(p, { onConflict: 'user_id,competencia,plano' }));
}
export const removerPrevidencia = async (id: string) => ok(await supabase.from('ir_previdencia').delete().eq('id', id));
export async function salvarConfig(c: ConfigIr) {
  ok(await supabase.from('ir_config').upsert({ ano: c.ano, renda_tributavel: c.renda_tributavel, codigos: c.codigos, parametros: c.parametros, revisado_em: c.revisado_em }, { onConflict: 'user_id,ano' }));
}
export async function marcarConferencia(ano: number, item: string, situacao: Conferencia['situacao'] | null, observacao: string | null) {
  if (!situacao) ok(await supabase.from('ir_conferencia').delete().eq('ano', ano).eq('item', item));
  else ok(await supabase.from('ir_conferencia').upsert({ ano, item, situacao, observacao, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id,ano,item' }));
}

/** RF-93: grava a aba IRRF (substitui os meses e planos que vierem na planilha). */
export async function importarIrrf(r: { mensal: Mensal[]; previdencia: Previdencia[] }, arquivo: string) {
  for (let i = 0; i < r.mensal.length; i += 100) ok(await supabase.from('ir_mensal').upsert(r.mensal.slice(i, i + 100), { onConflict: 'user_id,competencia' }));
  for (let i = 0; i < r.previdencia.length; i += 200) ok(await supabase.from('ir_previdencia').upsert(r.previdencia.slice(i, i + 200), { onConflict: 'user_id,competencia,plano' }));
  ok(await supabase.from('import_log').insert({ tipo: 'irrf', arquivo, importadas: r.mensal.length + r.previdencia.length, ignoradas: 0, detalhes: { meses: r.mensal.length, previdencia: r.previdencia.length } }));
}

/** Base de investimentos para o relatório: tudo da B3 já importado + saldos manuais. */
export async function carregarBaseInvestimentos() {
  const ultima = ok(await supabase.from('inv_posicoes').select('data_ref').order('data_ref', { ascending: false }).limit(1)) as { data_ref: string }[];
  const dataPosicao = ultima[0]?.data_ref ?? null;
  const [negs, movs, pos, aj, man, inst] = await Promise.all([
    todas<Negociacao>('inv_negociacoes'), todas<Movimentacao>('inv_movimentacoes'),
    dataPosicao ? supabase.from('inv_posicoes').select('*').eq('data_ref', dataPosicao) : Promise.resolve({ data: [], error: null }),
    supabase.from('inv_ajustes').select('*'), supabase.from('inv_saldos_manuais').select('*'), supabase.from('inv_instituicoes').select('*'),
  ]);
  const posicoes = (num(ok(pos) as (Posicao & { valor_aplicado: number | null })[], ['quantidade', 'preco', 'valor', 'valor_aplicado'])).map((p) => ({ ...p, valorAplicado: p.valor_aplicado })) as Posicao[];
  return {
    negs: num(negs, ['quantidade', 'preco', 'valor']), movs: num(movs, ['quantidade', 'preco', 'valor']), posicoes, dataPosicao,
    ajustes: num(ok(aj) as Ajuste[], ['preco_medio', 'preco_alvo']),
    manuais: num(ok(man) as { instituicao: string; produto: string; classe: Classe; competencia: string; saldo: number }[], ['saldo']),
    agrupar: criarAgrupador(ok(inst) as { nome_original: string; grupo: string }[]),
  };
}

// ---------------------------------------------------------------------------
// RF-78b: exportações
// ---------------------------------------------------------------------------
const brl = (v: number | null) => (v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const codigoTxt = (i: ItemIR) => (i.classificar ? 'CLASSIFICAR' : [i.grupo && `Grupo ${i.grupo}`, `Código ${i.codigo}`].filter(Boolean).join(' · '));

export function exportarPlanilhaIr(ano: number, itens: ItemIR[], rv: MesRV[]) {
  const wb = XLSX.utils.book_new();
  for (const ficha of FICHAS) {
    if (ficha === 'Renda Variável') continue;
    const linhas = itens.filter((i) => i.ficha === ficha).map((i) => ({
      Grupo: i.grupo, Código: i.codigo || 'CLASSIFICAR', 'Tipo': i.nomeCodigo, CNPJ: i.cnpj ?? '', Discriminação: i.discriminacao,
      [`Situação em 31/12/${ano - 1}`]: i.anterior, [`Situação em 31/12/${ano}`]: i.atual, Valor: i.rendimento, Observação: i.observacao ?? '',
    }));
    if (linhas.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), ficha.slice(0, 31));
  }
  if (rv.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rv.map((m) => ({
    Mês: m.mes, 'Vendas de ações': m.vendasAcoes, 'Isento (ações)': m.isento ? 'sim' : 'não', 'Resultado comum': m.comum.resultado, 'Imposto comum': m.comum.imposto,
    'Resultado day trade': m.day.resultado, 'Imposto day trade': m.day.imposto, 'Resultado FII': m.fii.resultado, 'Imposto FII': m.fii.imposto,
    'Prejuízo a compensar (comum)': m.prejuizo.comum, 'Prejuízo (day trade)': m.prejuizo.day, 'Prejuízo (FII)': m.prejuizo.fii, 'DARF do mês': m.darf,
  }))), 'Renda Variável');
  XLSX.writeFile(wb, `ir-${ano}-apoio-declaracao.xlsx`);
}

export function exportarPdfIr(ano: number, itens: ItemIR[], rv: MesRV[]) {
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(15); doc.text(`Apoio à declaração do IR — ano-calendário ${ano}`, 14, 16);
  doc.setFontSize(9); doc.text('Valores de bens pelo custo de aquisição. Confira cada código com o manual da Receita do ano.', 14, 22);
  let y = 28;
  for (const ficha of FICHAS) {
    if (ficha === 'Renda Variável') continue;
    const fs = itens.filter((i) => i.ficha === ficha);
    if (!fs.length) continue;
    autoTable(doc, {
      startY: y, head: [[ficha, 'CNPJ', 'Discriminação', `31/12/${ano - 1}`, `31/12/${ano}`, 'Valor']],
      body: fs.map((i) => [codigoTxt(i), i.cnpj ?? '', i.discriminacao + (i.observacao ? `\n(${i.observacao})` : ''), brl(i.anterior), brl(i.atual), brl(i.rendimento)]),
      styles: { fontSize: 8, cellPadding: 1.5 }, columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 34 }, 2: { cellWidth: 130 } }, headStyles: { fillColor: [40, 36, 28] },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }
  if (rv.length) autoTable(doc, {
    startY: y, head: [['Renda variável (mês)', 'Vendas de ações', 'Comum', 'Day trade', 'FII', 'Prejuízo a compensar', 'DARF']],
    body: rv.map((m) => [m.mes.split('-').reverse().join('/'), `${brl(m.vendasAcoes)}${m.isento ? ' (isento)' : ''}`, `${brl(m.comum.resultado)} → ${brl(m.comum.imposto)}`, `${brl(m.day.resultado)} → ${brl(m.day.imposto)}`, `${brl(m.fii.resultado)} → ${brl(m.fii.imposto)}`, brl(m.prejuizo.comum + m.prejuizo.day + m.prejuizo.fii), brl(m.darf)]),
    styles: { fontSize: 8 }, headStyles: { fillColor: [40, 36, 28] },
  });
  doc.save(`ir-${ano}-apoio-declaracao.pdf`);
}
