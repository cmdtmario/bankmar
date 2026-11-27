// Milhas e pontos: cálculos (RF-52 a RF-58) e importação do Controle_Milhas.xlsx (RF-92).
import * as XLSX from 'xlsx';
import { contemNumeroCartao } from './regras';

const r2 = (v: number) => Math.round(v * 100) / 100;
const iso = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12)).toISOString().slice(0, 10);

export type Origem = 'cartao' | 'clube' | 'compra' | 'transferencia' | 'bonus_transferencia' | 'voo' | 'bonus' | 'outros' | 'uso' | 'expiracao' | 'ajuste' | 'cashback';
export interface Movimento { conta: string; data: string; tipo: 'entrada' | 'saida' | 'custo'; origem: Origem; pontos: number | null; valor: number | null; descricao: string; chave: string }
export interface Venda { conta: string; plataforma: string | null; data: string; quantidade: number; valor_total: number; prazo_dias: number | null; data_pagamento: string | null; cpfs: number; status: 'aguardando' | 'pago' | 'cancelado'; chave: string }
export interface Emissao { conta: string; data: string; localizador: string | null; data_voo: string | null; trecho: string | null; cartao_texto: string | null; valor: number | null; milhas: number | null; cashback: number; status: 'emitida' | 'remarcada' | 'reembolsada' | 'cancelada'; reembolsado: number; cpfs: number; chave: string }
export interface ContaPlanilha { chave: string; programa: string; titular: string; de_terceiro: boolean; saldoPlanilha: number | null; custoPlanilha: number | null }

export const NOMES_PROGRAMA: Record<string, string> = {
  smile: 'Smiles', smiles: 'Smiles', 'tudo azul': 'TudoAzul', tudoazul: 'TudoAzul', 'tudo_azul': 'TudoAzul', azul: 'TudoAzul',
  'latam pass': 'Latam Pass', latam: 'Latam Pass', livelo: 'Livelo', esfera: 'Esfera', iupp: 'Iupp', pda: 'PDA', copa: 'Copa', tap: 'TAP', 'all accor': 'All Accor',
};
export const nomePrograma = (t: string) => NOMES_PROGRAMA[t.trim().toLowerCase()] ?? t.trim();

// ---------------------------------------------------------------------------
// Cálculos
// ---------------------------------------------------------------------------
/** RF-52: pontos previstos de uma fatura pela regra do cartão (pontos por real; internacional não é separado na fatura). */
export const pontosPrevistos = (totalFatura: number, pontosPorReal: number | null) => (pontosPorReal ? Math.round(Math.max(0, totalFatura) * pontosPorReal) : 0);
/** RF-54: cashback renunciado ao usar o cartão de pontos. */
export const cashbackRenunciado = (totalFatura: number, pct: number) => r2(Math.max(0, totalFatura) * pct / 100);
/** RF-54: custo médio do milheiro. */
export const custoMilheiro = (custos: number, entradas: number) => (entradas > 0 ? (custos / entradas) * 1000 : null);
/** RF-55: lucro de uma venda pelo custo médio da conta. */
export const lucroVenda = (valor: number, quantidade: number, custoMil: number | null) => r2(valor - (quantidade / 1000) * (custoMil ?? 0));

/** RF-53: transferência com bônus, levando o custo proporcional. */
export function transferencia(pontos: number, bonusPct: number, saldoOrigem: number, custoMilOrigem: number | null) {
  if (pontos <= 0) throw new Error('Informe quantos pontos transferir.');
  if (pontos > saldoOrigem) throw new Error(`Saldo insuficiente: a conta de origem tem ${saldoOrigem.toLocaleString('pt-BR')} pontos.`);
  const recebidos = Math.round(pontos * (1 + bonusPct / 100));
  const custo = r2((pontos / 1000) * (custoMilOrigem ?? 0));
  return { sai: pontos, entra: pontos, bonus: recebidos - pontos, custo };
}

/** RF-56: CPFs usados no período do programa (ano civil ou 12 meses móveis) por vendas e emissões. */
export function cpfsUsados(periodo: 'ano_civil' | '12_meses', hoje: string, itens: { data: string; cpfs: number }[]) {
  const inicio = periodo === 'ano_civil' ? `${hoje.slice(0, 4)}-01-01` : new Date(Date.parse(hoje + 'T12:00:00Z') - 365 * 864e5).toISOString().slice(0, 10);
  return itens.filter((i) => i.data >= inicio && i.data <= hoje).reduce((s, i) => s + i.cpfs, 0);
}

// ---------------------------------------------------------------------------
// RF-92: importação do Controle_Milhas.xlsx
// ---------------------------------------------------------------------------
const ABAS_PROGRAMA: Record<string, { programa: string; titular: string }> = {
  TUDO_AZUL: { programa: 'TudoAzul', titular: 'Mário' }, SMILES: { programa: 'Smiles', titular: 'Mário' }, 'SMILES Diego': { programa: 'Smiles', titular: 'Diego' },
  LIVELO: { programa: 'Livelo', titular: 'Mário' }, 'LATAM PASS': { programa: 'Latam Pass', titular: 'Mário' }, COPA: { programa: 'Copa', titular: 'Mário' },
  IUPP: { programa: 'Iupp', titular: 'Mário' }, ESFERA: { programa: 'Esfera', titular: 'Mário' }, PDA: { programa: 'PDA', titular: 'Mário' },
};
const ABAS_PROIBIDAS = /cpf|senha|cofre/i;

type Cel = string | number | Date | null;
type Secao = 'custo' | 'entrada' | 'uso' | 'transferida' | 'vendida';
function secaoDe(linha: Cel[]): Secao | null {
  const textos = linha.filter((v): v is string => typeof v === 'string').map((v) => v.trim().toUpperCase());
  if (textos.some((t) => t.startsWith('CUSTO DAS OPERA') || t.startsWith('CUSTO OPERA'))) return 'custo';
  if (textos.some((t) => t.startsWith('MILHAS USADAS') || t.startsWith('PONTOS USADOS'))) return 'uso';
  if (textos.some((t) => t.startsWith('MILHAS VENDIDAS'))) return 'vendida';
  if (textos.some((t) => t.startsWith('PONTOS TRANSFERIDOS') || t === 'TRANSFERÊNCIAS' || t === 'TRANSFERENCIAS')) return 'transferida';
  if (textos.some((t) => t.startsWith('MILHAS ACUMULADAS') || t.startsWith('PONTOS ACUMULADOS'))) return 'entrada';
  return null;
}
function origemEntrada(rotulo: string): Origem {
  const t = rotulo.toLowerCase();
  if (/b[oô]nus.*transf|transf.*b[oô]nus|\d+%/.test(t) && /transf|bonus|bônus/.test(t)) return /transf/.test(t) ? 'transferencia' : 'bonus_transferencia';
  if (/transf/.test(t)) return 'transferencia';
  if (/cart[aã]o/.test(t)) return 'cartao';
  if (/clube|assinatura/.test(t)) return 'clube';
  if (/b[oô]nus|bonifica|miss[aã]o|anivers/.test(t)) return 'bonus';
  if (/voo|[a-z]{3}\s*>\s*[a-z]{3}/i.test(t)) return 'voo';
  if (/compra|aquisi/.test(t)) return 'compra';
  return 'outros';
}
function origemCusto(rotulo: string): Origem {
  const t = rotulo.toLowerCase();
  if (/clube|assinatura|anuidade/.test(t)) return 'clube';
  if (/compra|turbo/.test(t)) return 'compra';
  if (/cart[aã]o|cashback|\d+%/.test(t)) return 'cashback';
  return 'outros';
}
const limpo = (t: string) => (contemNumeroCartao(t) ? '(descrição removida: tinha número de cartão)' : t.replace(/\s+/g, ' ').trim().slice(0, 120));

export interface ResultadoMilhas { contas: ContaPlanilha[]; movimentos: Movimento[]; vendas: Venda[]; emissoes: Emissao[]; avisos: string[] }

export function lerControleMilhas(dados: ArrayBuffer | Uint8Array, hoje: string): ResultadoMilhas {
  const wb = XLSX.read(dados, { type: 'array', cellDates: true });
  const contas: ContaPlanilha[] = []; const movimentos: Movimento[] = []; const vendas: Venda[] = []; const emissoes: Emissao[] = []; const avisos: string[] = [];
  const contaDe = (programa: string, titular: string) => {
    const chave = `${programa}|${titular}`;
    if (!contas.some((c) => c.chave === chave)) contas.push({ chave, programa, titular, de_terceiro: titular !== 'Mário', saldoPlanilha: null, custoPlanilha: null });
    return chave;
  };

  for (const nome of wb.SheetNames) {
    if (ABAS_PROIBIDAS.test(nome)) { avisos.push(`Aba "${nome}" não foi lida (dados pessoais).`); continue; }
    const info = ABAS_PROGRAMA[nome.trim()];
    if (!info) continue;
    const conta = contaDe(info.programa, info.titular);
    const linhas = XLSX.utils.sheet_to_json<Cel[]>(wb.Sheets[nome], { header: 1, raw: true, defval: null });
    let secao: Secao | null = null; let datas: (string | null)[] = []; let n = 0;
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      const s = secaoDe(l);
      const prox = linhas[i + 1] ?? [];
      if (s && prox.filter((v) => v instanceof Date).length >= 2) {
        secao = s; datas = prox.map((v) => (v instanceof Date ? iso(v) : null)); i++; continue;
      }
      const rotulo = typeof l[0] === 'string' ? l[0].trim() : typeof l[0] === 'number' ? String(l[0]) : '';
      if (!secao) continue;
      if (/^total|^custo m[eé]dio|^milhas a ser|^valor estimado|^lucro/i.test(rotulo)) { if (/^total$/i.test(rotulo)) secao = null; else if (!/^total$/i.test(rotulo)) secao = null; continue; }
      if (!rotulo) continue;
      if (secao === 'vendida') {
        // Vendas detalhadas vêm da aba VENDAS MILHAS; só a conta do Diego (que não está lá) é lida daqui.
        if (info.titular === 'Mário') continue;
        const milheiro = Number(rotulo.replace(',', '.'));
        datas.forEach((d, j) => { const q = l[j]; if (d && typeof q === 'number' && q > 0) vendas.push({ conta, plataforma: null, data: d, quantidade: q, valor_total: r2(q / 1000 * (isFinite(milheiro) ? milheiro : 0)), prazo_dias: null, data_pagamento: d, cpfs: 0, status: 'pago', chave: `mil:${nome}:v:${i}:${j}` }); });
        continue;
      }
      datas.forEach((d, j) => {
        const v = l[j];
        if (!d || typeof v !== 'number' || v === 0) return;
        n++;
        const base = { conta, data: d, descricao: limpo(rotulo), chave: `mil:${nome}:${i}:${j}` };
        if (secao === 'custo') movimentos.push({ ...base, tipo: 'custo', origem: origemCusto(rotulo), pontos: null, valor: r2(v) });
        else if (secao === 'entrada') {
          // Valores negativos na área de acumulados são estornos (ex.: bônus retirado).
          movimentos.push({ ...base, tipo: v > 0 ? 'entrada' : 'saida', origem: v > 0 ? origemEntrada(rotulo) : 'ajuste', pontos: Math.abs(v), valor: null });
        } else if (secao === 'uso') movimentos.push({ ...base, tipo: 'saida', origem: 'uso', pontos: Math.abs(v), valor: null });
        else if (secao === 'transferida') movimentos.push({ ...base, tipo: 'saida', origem: 'transferencia', pontos: Math.abs(v), valor: null });
      });
    }
    // Saldo que a própria planilha calcula, para conferência.
    for (let i = 0; i < linhas.length; i++) {
      const rot = String(linhas[i][0] ?? '');
      if (/^total de milhas a ser vendid/i.test(rot) && typeof linhas[i][1] === 'number') contas.find((c) => c.chave === conta)!.saldoPlanilha = linhas[i][1] as number;
      if (/^total gastos/i.test(rot) && typeof linhas[i][1] === 'number') contas.find((c) => c.chave === conta)!.custoPlanilha = r2(linhas[i][1] as number);
    }
    if (!n) avisos.push(`Aba "${nome}": nenhum valor encontrado.`);
  }

  // Vendas (RF-55). Quantidade na planilha está em milhares. Observações não são importadas (têm contatos de terceiros).
  const wsV = wb.Sheets['VENDAS MILHAS'];
  if (wsV) {
    const linhas = XLSX.utils.sheet_to_json<Cel[]>(wsV, { header: 1, raw: true, defval: null });
    const cab = linhas.findIndex((l) => String(l[0] ?? '').trim().toLowerCase() === 'plataforma');
    linhas.slice(cab + 1).forEach((l, k) => {
      if (!(l[2] instanceof Date) || typeof l[3] !== 'number' || typeof l[1] !== 'string') return;
      if (!l[3]) return;
      const programa = nomePrograma(l[1]);
      const st = String(l[10] ?? '').toUpperCase();
      vendas.push({
        conta: contaDe(programa, 'Mário'), plataforma: typeof l[0] === 'string' ? limpo(l[0]) : null, data: iso(l[2]),
        quantidade: Math.round(l[3] * 1000), valor_total: r2(Number(l[4] ?? 0)), prazo_dias: typeof l[7] === 'number' ? l[7] : null,
        data_pagamento: l[6] instanceof Date ? iso(l[6]) : null, cpfs: typeof l[8] === 'number' ? Math.round(l[8]) : 0,
        status: st === 'OK' || st === 'PAGO' ? 'pago' : /CANCEL/.test(st) ? 'cancelado' : 'aguardando', chave: `mil:vendas:${cab + 1 + k}`,
      });
    });
  }

  // Emissões (RF-57) da aba GERADOR LATAM: pagas em dinheiro para gerar pontos (não saem do saldo).
  const wsE = wb.Sheets['GERADOR LATAM'];
  if (wsE) {
    const linhas = XLSX.utils.sheet_to_json<Cel[]>(wsE, { header: 1, raw: true, defval: null });
    linhas.slice(1).forEach((l, k) => {
      if (typeof l[0] !== 'string' || !(l[1] instanceof Date)) return;
      const titular = /diego/i.test(l[0]) ? 'Diego' : 'Mário';
      const st = String(l[10] ?? '').toUpperCase();
      const loc = typeof l[2] === 'string' && /^[A-Za-z0-9]{5,16}$/.test(l[2].trim()) ? l[2].trim() : null;
      emissoes.push({
        conta: contaDe('Latam Pass', titular), data: iso(l[1]), localizador: loc,
        data_voo: l[3] instanceof Date ? iso(l[3]).split('-').reverse().join('/') : l[3] != null ? String(l[3]).slice(0, 40) : null,
        trecho: l[4] != null ? String(l[4]).slice(0, 80) : null, cartao_texto: typeof l[5] === 'string' ? limpo(l[5]) : null,
        valor: typeof l[6] === 'number' ? r2(l[6]) : null, milhas: null,
        cashback: r2([l[7], l[8], l[9]].reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0)),
        status: /REEMBOLS/.test(st) ? 'reembolsada' : /REMARC/.test(st) ? 'remarcada' : /CANCEL/.test(st) ? 'cancelada' : 'emitida',
        reembolsado: typeof l[13] === 'number' ? r2(l[13]) : 0, cpfs: 1, chave: `mil:gerador:${k + 1}`,
      });
    });
  }
  void hoje;
  return { contas, movimentos, vendas, emissoes, avisos };
}

/** Saldo calculado de uma conta importada (para conferir com a planilha). */
export function saldoImportado(r: ResultadoMilhas, conta: string) {
  const m = r.movimentos.filter((x) => x.conta === conta);
  const ent = m.filter((x) => x.tipo === 'entrada').reduce((s, x) => s + (x.pontos ?? 0), 0);
  const sai = m.filter((x) => x.tipo === 'saida').reduce((s, x) => s + (x.pontos ?? 0), 0);
  const ven = r.vendas.filter((x) => x.conta === conta && x.status !== 'cancelado').reduce((s, x) => s + x.quantidade, 0);
  const custos = m.filter((x) => x.tipo === 'custo').reduce((s, x) => s + (x.valor ?? 0), 0);
  return { entradas: ent, saldo: Math.round((ent - sai - ven) * 100) / 100, custos: r2(custos) };
}
