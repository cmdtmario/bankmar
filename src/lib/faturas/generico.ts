// Leitor genérico de fatura em PDF (cartões sem leitor próprio: Nubank, Inter, C6, Santander, BB, XP, BTG, PicPay, Porto...).
// Lê qualquer linha no formato "data · descrição · valor". Não é perfeito para todo layout: a conferência do total (RF-26)
// e a tela de revisão continuam valendo, e cada banco pode ganhar um leitor próprio quando houver uma fatura de amostra.
import { parseValorBR, isoDeBR } from '../formato';
import { inferirData, separarParcela, RE_FINAL_CARTAO } from './comum';
import { LeitorError, type FaturaLida, type LinhaFatura, type TextItem } from './tipos';

const MESES: Record<string, string> = { JAN: '01', FEV: '02', FEB: '02', MAR: '03', ABR: '04', APR: '04', MAI: '05', MAY: '05', JUN: '06', JUL: '07', AGO: '08', AUG: '08', SET: '09', SEP: '09', OUT: '10', OCT: '10', NOV: '11', DEZ: '12', DEC: '12' };
const RE_INICIO = /^(\d{2}\/\d{2})(?:\/(\d{2,4}))?\s+|^(\d{1,2})\s+(JAN|FEV|FEB|MAR|ABR|APR|MAI|MAY|JUN|JUL|AGO|AUG|SET|SEP|OUT|OCT|NOV|DEZ|DEC)\.?\s+/i;
const RE_VALOR_FIM = /(-|−)?\s*(?:R\$\s*)?(-|−)?\s*(\d{1,3}(?:\.\d{3})*,\d{2})\s*(C|CR|D|-)?\s*$/i;
/** Linhas que não são compras: pagamentos, saldos e totais do resumo. */
const IGNORAR = /^(pagamento|pgto|pagto|obrigado pelo pagamento|saldo anterior|total|subtotal|limite|valor total|fatura anterior|pagamento m[ií]nimo|encargos do pr[óo]ximo|cr[ée]dito rotativo dispon)/i;
const RE_DATA_LONGA = /(\d{2}\/\d{2}\/\d{4})/;

interface Linha { p: number; y: number; texto: string }

/** Junta os pedaços do PDF em linhas de texto (mesma página e altura). */
export function linhasDoPdf(itens: TextItem[], tol = 3): Linha[] {
  const ordenados = [...itens].sort((a, b) => a.p - b.p || a.y - b.y || a.x - b.x);
  const out: { p: number; y: number; partes: TextItem[] }[] = [];
  for (const it of ordenados) {
    const l = out.find((o) => o.p === it.p && Math.abs(o.y - it.y) <= tol);
    if (l) l.partes.push(it); else out.push({ p: it.p, y: it.y, partes: [it] });
  }
  return out.map((l) => ({ p: l.p, y: l.y, texto: l.partes.sort((a, b) => a.x - b.x).map((x) => x.s.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ') }));
}

function acharVencimento(linhas: Linha[]): string | null {
  for (let i = 0; i < linhas.length; i++) {
    if (!/vencimento|vence em|data de vencimento/i.test(linhas[i].texto)) continue;
    for (const l of [linhas[i], linhas[i + 1], linhas[i + 2]].filter(Boolean)) {
      const m = l.texto.match(RE_DATA_LONGA);
      if (m) return isoDeBR(m[1]);
      const n = l.texto.match(/(\d{1,2})\s+(?:de\s+)?(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[A-Z]*\.?\s+(?:de\s+)?(\d{4})/i);
      if (n) return `${n[3]}-${MESES[n[2].toUpperCase()]}-${n[1].padStart(2, '0')}`;
    }
  }
  return null;
}

function acharTotal(linhas: Linha[]): number | null {
  const rotulos = [/total (desta|da) fatura/i, /valor total (desta |da )?fatura/i, /total a pagar/i, /valor da fatura/i, /pagamento total/i];
  for (const re of rotulos) {
    for (let i = 0; i < linhas.length; i++) {
      if (!re.test(linhas[i].texto)) continue;
      for (const l of [linhas[i], linhas[i + 1]].filter(Boolean)) {
        const depois = l === linhas[i] ? l.texto.split(re).pop() ?? '' : l.texto;
        const m = depois.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
        if (m) return parseValorBR(m[1]);
      }
    }
  }
  return null;
}

const RE_DATA_ITEM = /^(\d{2}\/\d{2}(\/\d{2,4})?|\d{1,2}\s+(JAN|FEV|FEB|MAR|ABR|APR|MAI|MAY|JUN|JUL|AGO|AUG|SET|SEP|OUT|OCT|NOV|DEZ|DEC)\.?)(\s|$)/i;
const RE_VALOR_ITEM = /^(-|−)?\s*(R\$\s*)?(-|−)?\s*\d{1,3}(\.\d{3})*,\d{2}\s*(C|CR|D|-)?$/i;

/**
 * Lançamentos em pedaços: cada pedaço começa num item com data e termina no primeiro valor depois da descrição.
 * Assim faturas com duas colunas na mesma altura (ou com textos à esquerda da data) não se misturam.
 */
export function segmentos(itens: TextItem[]): { p: number; x: number; y: number; texto: string }[] {
  const out: { p: number; x: number; y: number; texto: string }[] = [];
  for (const l of linhasDoPdfItens(itens)) {
    let atual: string[] | null = null;
    let x0 = 0;
    for (let k = 0; k < l.partes.length; k++) {
      const t = l.partes[k].s.trim();
      // "12/12" depois da descrição é parcela, não data de outro lançamento
      if (RE_DATA_ITEM.test(t) && !(atual && atual.length >= 2 && /^\d{2}\/\d{2}$/.test(t))) {
        if (atual) out.push({ p: l.p, x: x0, y: l.y, texto: atual.join(' ') });
        atual = [t]; x0 = l.partes[k].x;
        if (RE_VALOR_FIM.test(t) && t.split(' ').length > 2) { out.push({ p: l.p, x: x0, y: l.y, texto: t }); atual = null; }
        continue;
      }
      if (!atual) continue;
      if (/^R\$$/.test(t)) continue;
      atual.push(t);
      if (RE_VALOR_ITEM.test(t) && atual.length > 2) {
        // valor em dólar seguido do valor em reais: fica com o último valor encostado
        const prox = l.partes[k + 1]?.s.trim();
        if (prox && RE_VALOR_ITEM.test(prox)) { atual.pop(); continue; }
        out.push({ p: l.p, x: x0, y: l.y, texto: atual.join(' ') });
        atual = null;
      }
    }
    if (atual) out.push({ p: l.p, x: x0, y: l.y, texto: atual.join(' ') });
  }
  return out;
}

function linhasDoPdfItens(itens: TextItem[], tol = 3) {
  const ordenados = [...itens].sort((a, b) => a.p - b.p || a.y - b.y || a.x - b.x);
  const out: { p: number; y: number; partes: TextItem[] }[] = [];
  for (const it of ordenados) {
    const l = out.find((o) => o.p === it.p && Math.abs(o.y - it.y) <= tol);
    if (l) l.partes.push(it); else out.push({ p: it.p, y: it.y, partes: [it] });
  }
  for (const l of out) l.partes.sort((a, b) => a.x - b.x);
  return out;
}

export function lerGenerico(itens: TextItem[]): FaturaLida {
  const linhas = linhasDoPdf(itens);
  const vencimento = acharVencimento(linhas);
  if (!vencimento) throw new LeitorError('Não encontrei a data de vencimento neste PDF. Use "Colar texto" ou "Lançar à mão".');
  const finalItem = itens.find((i) => RE_FINAL_CARTAO.test(i.s)) ?? itens.find((i) => /final\s*\d{4}/i.test(i.s));
  const final4 = finalItem ? (finalItem.s.match(RE_FINAL_CARTAO)?.[1] ?? finalItem.s.match(/final\s*(\d{4})/i)?.[1] ?? null) : null;

  const lidas: LinhaFatura[] = [];
  const vistas = new Set<string>();
  // Seções de parcelas de faturas futuras não entram nesta fatura.
  const futuras = itens.filter((i) => /pr[óo]ximas faturas|lan[çc]amentos futuros|parcelas futuras|compras parceladas - pr/i.test(i.s));
  const ehFutura = (sg: { p: number; x: number; y: number }) => futuras.some((h) => h.p === sg.p && sg.y > h.y && sg.x >= h.x - 30);
  for (const seg of segmentos(itens)) {
    if (ehFutura(seg)) continue;
    const ini = seg.texto.match(RE_INICIO);
    if (!ini) continue;
    const resto = seg.texto.slice(ini[0].length);
    const fim = resto.match(RE_VALOR_FIM);
    if (!fim) continue;
    const desc = resto.slice(0, fim.index).replace(/\s*(R\$|US\$|USD)\s*$/i, '').trim();
    if (!desc || IGNORAR.test(desc)) continue;
    const negativo = Boolean(fim[1] || fim[2] || (fim[4] && /^(C|CR|-)$/i.test(fim[4])));
    const valor = (parseValorBR(fim[3]) ?? 0) * (negativo ? -1 : 1);
    if (!valor) continue;
    const ddmm = ini[1] ?? `${ini[3].padStart(2, '0')}/${MESES[ini[4].toUpperCase()]}`;
    const anoExplicito = ini[2] ? (ini[2].length === 2 ? `20${ini[2]}` : ini[2]) : null;
    const { descricao, atual, total } = separarParcela(desc.replace(/\s*-?\s*parcela\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})$/i, (_m, a: string, b: string) => ` ${a.padStart(2, '0')}/${b.padStart(2, '0')}`));
    const data = anoExplicito ? `${anoExplicito}-${ddmm.slice(3, 5)}-${ddmm.slice(0, 2)}` : inferirData(ddmm, vencimento, atual);
    // Algumas faturas repetem o detalhamento (resumo + extrato): a mesma linha na mesma página só entra uma vez.
    const chave = `${seg.p}|${ddmm}|${descricao}|${valor}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    lidas.push({ data, descricao, parcelaAtual: atual, parcelasTotal: total, valor: Math.round(valor * 100) / 100 });
  }
  if (!lidas.length) throw new LeitorError('Não reconheci lançamentos neste PDF (layout diferente). Use "Colar texto" e me envie uma fatura de amostra para criar o leitor deste banco.');
  return {
    emissor: 'generico', final4, vencimento, totalEsperado: acharTotal(linhas),
    origemTotal: 'Total impresso na fatura (leitor genérico: se houver saldo anterior, pagamento ou crédito fora do detalhamento, justifique a diferença)',
    linhas: lidas,
  };
}
