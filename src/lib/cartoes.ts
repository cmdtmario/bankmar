// Cartões: sala VIP, isenção de anuidade, comparação de benefícios e importação da aba CARTÕES (RF-44 a RF-49, RF-91).
import * as XLSX from 'xlsx';
import { contemNumeroCartao } from './regras';

const r2 = (v: number) => Math.round(v * 100) / 100;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const somaAnos = (dia: string, anos: number) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() + anos); return iso(d); };

// ---------------------------------------------------------------------------
// RF-47: sala VIP
// ---------------------------------------------------------------------------
export const VIP_ILIMITADO = 999;

/** Ciclo atual de acessos: termina na próxima renovação (a data avança um ano a cada vez que passa). */
export function cicloVip(renovacao: string | null, hoje: string): { inicio: string; fim: string } {
  if (!renovacao) { const ano = hoje.slice(0, 4); return { inicio: `${ano}-01-01`, fim: `${Number(ano) + 1}-01-01` }; }
  let fim = renovacao;
  while (fim <= hoje) fim = somaAnos(fim, 1);
  while (somaAnos(fim, -1) > hoje) fim = somaAnos(fim, -1);
  return { inicio: somaAnos(fim, -1), fim };
}

export function acessosVip(total: number | null, renovacao: string | null, usos: { data: string }[], hoje: string) {
  const { inicio, fim } = cicloVip(renovacao, hoje);
  const usados = usos.filter((u) => u.data >= inicio && u.data < fim).length;
  const ilimitado = total != null && total >= VIP_ILIMITADO;
  return { total, usados, disponiveis: total == null ? null : ilimitado ? null : Math.max(0, total - usados), ilimitado, inicio, renovaEm: fim };
}

// ---------------------------------------------------------------------------
// RF-46: progresso das regras de isenção
// ---------------------------------------------------------------------------
export interface Isencao { id?: string; tipo: 'gasto_mensal' | 'gasto_periodo' | 'investido' | 'promocional'; meta: number | null; meses: number | null; ate: string | null; observacao: string | null }
export interface Progresso { atual: number; meta: number | null; pct: number | null; atingida: boolean; texto: string }

/** faturas: total de cada fatura do cartão por competência (AAAA-MM-01). investido: valor na instituição ligada ao cartão. */
export function progressoIsencao(r: Isencao, faturas: { competencia: string; total: number }[], investido: number | null, hoje: string): Progresso {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const compAtual = hoje.slice(0, 8) + '01';
  if (r.tipo === 'promocional') {
    const dias = Math.round((Date.parse(r.ate! + 'T12:00:00Z') - Date.parse(hoje + 'T12:00:00Z')) / 864e5);
    return { atual: dias, meta: null, pct: null, atingida: dias >= 0, texto: dias >= 0 ? `Isenção promocional até ${r.ate!.split('-').reverse().join('/')} (${dias} dias)` : `Isenção promocional terminou em ${r.ate!.split('-').reverse().join('/')}` };
  }
  if (r.tipo === 'investido') {
    if (investido == null) return { atual: 0, meta: r.meta, pct: null, atingida: false, texto: 'Informe no cartão em qual instituição fica o investimento.' };
    const pct = r.meta ? investido / r.meta : null;
    return { atual: investido, meta: r.meta, pct, atingida: investido >= (r.meta ?? 0), texto: `${fmt(investido)} investidos de ${fmt(r.meta ?? 0)}` };
  }
  if (r.tipo === 'gasto_mensal') {
    // Mês de referência: a última fatura fechada (a do mês atual, se já existe; senão a anterior).
    const ultima = [...faturas].filter((f) => f.competencia <= compAtual).sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
    const atual = ultima?.total ?? 0;
    const pct = r.meta ? atual / r.meta : null;
    return { atual, meta: r.meta, pct, atingida: atual >= (r.meta ?? 0), texto: `${fmt(atual)} na última fatura de ${fmt(r.meta ?? 0)} por mês` };
  }
  const n = r.meses ?? 1;
  const d = new Date(compAtual + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - (n - 1));
  const inicio = iso(d);
  const atual = r2(faturas.filter((f) => f.competencia >= inicio && f.competencia <= compAtual).reduce((s, f) => s + f.total, 0));
  const pct = r.meta ? atual / r.meta : null;
  return { atual, meta: r.meta, pct, atingida: atual >= (r.meta ?? 0), texto: `${fmt(atual)} em ${n} meses de ${fmt(r.meta ?? 0)}` };
}

// ---------------------------------------------------------------------------
// RF-48: texto da página de benefícios e comparação
// ---------------------------------------------------------------------------
export { textoDaPagina, diffTexto } from '../../supabase/functions/beneficios-mensal/logica';

// ---------------------------------------------------------------------------
// RF-91: importação da aba CARTÕES (as colunas de número, validade e código não são lidas)
// ---------------------------------------------------------------------------
export interface CartaoPlanilha {
  apelido: string; emissor: 'itau' | 'caixa' | 'outro'; bandeira: string | null; ativo: boolean;
  anuidade: number | null; vip_acessos: number | null; vip_usados: number; vip_renovacao: string | null; vip_obs: string | null;
  pontos_nacional: number | null; pontos_internacional: number | null; pontos_obs: string | null; programa: string | null;
  observacoes: string | null; link: string | null; isencoes: Isencao[];
}

const COLUNAS_PERMITIDAS = 14; // A..N. O..Q (número, validade, código) nunca são lidas.
const num = (v: unknown): number | null => {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (typeof v === 'string') { const m = v.replace(/\./g, '').replace(',', '.').match(/^\s*(\d+(\.\d+)?)\s*$/); return m ? Number(m[1]) : null; }
  return null;
};
const texto = (v: unknown) => { const t = v == null ? '' : String(v).trim(); return t && !contemNumeroCartao(t) ? t : null; };
const dataIso = (v: unknown) => (v instanceof Date ? iso(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 12))) : null);
const PROGRAMAS = ['ESFERA', 'LIVELO', 'AZUL', 'SMILES', 'GOL', 'LATAM', 'UAU', 'PORTO PLUS', 'ATOMOS', 'IUPP', 'PDA', 'ALL'];

export function lerAbaCartoes(dados: ArrayBuffer | Uint8Array): { cartoes: CartaoPlanilha[]; ignoradas: string[] } {
  const wb = XLSX.read(dados, { type: 'array', cellDates: true });
  const ws = wb.Sheets['CARTÕES'] ?? wb.Sheets['CARTOES'];
  if (!ws) throw new Error('A planilha não tem a aba CARTÕES.');
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const cartoes: CartaoPlanilha[] = [];
  const ignoradas: string[] = [];
  for (const bruta of linhas.slice(1)) {
    const r = bruta.slice(0, COLUNAS_PERMITIDAS);
    const apelido = texto(r[0]);
    if (!apelido) continue;
    // "CANCELADO EM ..." fica numa coluna livre depois de N; só o texto é olhado, nunca números.
    const resto = bruta.slice(COLUNAS_PERMITIDAS).filter((v) => typeof v === 'string');
    const cancelado = resto.some((v) => /cancelad/i.test(v as string));
    const isencoes: Isencao[] = [];
    const fatura = num(r[1]); const aplicacao = num(r[3]);
    if (fatura) isencoes.push({ tipo: 'gasto_mensal', meta: fatura, meses: null, ate: null, observacao: null });
    if (aplicacao) isencoes.push({ tipo: 'investido', meta: aplicacao, meses: null, ate: null, observacao: null });
    const obs = texto(r[11]);
    const promo = obs?.match(/vence em (janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(\d{4})/i);
    if (promo) {
      const m = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'].indexOf(promo[1].toLowerCase()) + 1;
      const ultimo = new Date(Date.UTC(Number(promo[2]), m, 0, 12));
      isencoes.push({ tipo: 'promocional', meta: null, meses: null, ate: iso(ultimo), observacao: obs!.slice(0, 120) });
    }
    const anuidadeTxt = r[2];
    const anuidade = num(anuidadeTxt);
    const pObs = texto(r[10]);
    const programa = pObs ? PROGRAMAS.find((p) => pObs.toUpperCase().includes(p)) ?? null : null;
    const nomeMin = apelido.toLowerCase();
    cartoes.push({
      apelido: apelido.slice(0, 60),
      emissor: /ita[uú]/.test(nomeMin) ? 'itau' : /caixa/.test(nomeMin) ? 'caixa' : 'outro',
      bandeira: /visa/.test(nomeMin) ? 'Visa' : /master/.test(nomeMin) ? 'Mastercard' : /elo\b/.test(nomeMin) ? 'Elo' : /amex|american/.test(nomeMin) ? 'Amex' : null,
      ativo: !cancelado,
      anuidade,
      vip_acessos: num(r[4]),
      vip_usados: Math.max(0, Math.round(num(r[5]) ?? 0)),
      vip_renovacao: dataIso(r[7]),
      vip_obs: texto(r[12]),
      pontos_nacional: num(r[8]),
      pontos_internacional: num(r[9]),
      pontos_obs: [pObs, typeof anuidadeTxt === 'string' && anuidade == null ? `Anuidade: ${anuidadeTxt}` : null, typeof r[8] === 'string' && num(r[8]) == null ? `Nacional: ${r[8]}` : null, typeof r[9] === 'string' && num(r[9]) == null ? `Internacional: ${r[9]}` : null].filter(Boolean).join(' · ') || null,
      programa,
      observacoes: obs,
      link: typeof r[13] === 'string' && /^https?:\/\//i.test(r[13]) ? r[13].trim() : null,
      isencoes,
    });
    if (typeof r[7] === 'string' && r[7].trim()) ignoradas.push(`${apelido}: renovação "${r[7]}" não é data, ficou em branco.`);
  }
  return { cartoes, ignoradas };
}
