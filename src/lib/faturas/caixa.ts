// Leitor de faturas Cartões CAIXA (Visa e Elo) — RF-20/RF-21/RF-21a.
import { parseValorBR, isoDeBR } from '../formato';
import { inferirData, separarParcela, mesmaLinha, RE_DDMM, RE_FINAL_CARTAO } from './comum';
import { LeitorError, type FaturaLida, type LinhaFatura, type TextItem } from './tipos';

const ANTERIOR = /^TOTAL DA FATURA ANTERIOR/i;
const PAGAMENTO = /^(OBRIGADO PELO PAGAMENTO|PAGAMENTO)/i;
const RE_VALOR_DC = /^[\d.]+,\d{2}\s?[DC]$/;

export function pareceCaixa(itens: TextItem[]): boolean {
  return itens.some((i) => /CART[ÕO]ES CAIXA/i.test(i.s)) && itens.some((i) => /^Demonstrativo$/i.test(i.s.trim()));
}

export function lerCaixa(itens: TextItem[]): FaturaLida {
  if (!pareceCaixa(itens)) throw new LeitorError('O leitor da Caixa não reconheceu este PDF.');

  const p1 = itens.filter((i) => i.p === 1);
  const rotVenc = p1.find((i) => i.s.trim() === 'VENCIMENTO');
  const vencItem = rotVenc
    ? p1.filter((i) => i.y > rotVenc.y && i.y < rotVenc.y + 40 && Math.abs(i.x - rotVenc.x) < 40 && isoDeBR(i.s)).sort((a, b) => a.y - b.y)[0]
    : undefined;
  const vencimento = vencItem ? isoDeBR(vencItem.s) : null;
  if (!vencimento) throw new LeitorError('O leitor da Caixa não encontrou o vencimento neste PDF.');
  const finalItem = itens.find((i) => RE_FINAL_CARTAO.test(i.s));
  const final4 = finalItem ? finalItem.s.match(RE_FINAL_CARTAO)![1] : null;

  let totalFatura: number | null = null;
  for (const rot of itens.filter((i) => /^Valor total desta fatura/i.test(i.s.trim()))) {
    const v = mesmaLinha(itens, rot).filter((i) => i.x > rot.x).map((i) => parseValorBR(i.s.replace(/\s/g, ''))).find((x) => x != null);
    if (v != null) { totalFatura = v; break; }
  }

  // Demonstrativo: datas à direita da página (x >= 300) a partir da página 2.
  const linhas: LinhaFatura[] = [];
  let anterior = 0;
  let pagamentos = 0;
  const cand = itens.filter((i) => i.p >= 2 && i.x >= 295 && RE_DDMM.test(i.s.trim())).sort((a, b) => a.p - b.p || a.y - b.y);
  for (const d of cand) {
    const linha = mesmaLinha(itens, d).filter((i) => i.x > d.x).sort((a, b) => a.x - b.x);
    const vItem = [...linha].reverse().find((i) => RE_VALOR_DC.test(i.s.trim()));
    if (!vItem) continue;
    const valor = parseValorBR(vItem.s.replace(/\s/g, ''))!;
    const descItem = linha[0];
    if (!descItem || descItem === vItem) continue;
    const desc = descItem.s.trim();
    if (ANTERIOR.test(desc)) { anterior += valor; continue; }
    if (PAGAMENTO.test(desc)) { pagamentos += valor; continue; }
    const { descricao, atual, total } = separarParcela(desc);
    linhas.push({ data: inferirData(d.s.trim(), vencimento, atual), descricao, parcelaAtual: atual, parcelasTotal: total, valor });
  }
  if (!linhas.length) throw new LeitorError('O leitor da Caixa não encontrou lançamentos neste PDF.');
  // Total da fatura = saldo anterior − pagamentos + lançamentos do período.
  const totalEsperado = totalFatura == null ? null : Math.round((totalFatura - anterior - pagamentos) * 100) / 100;
  return {
    emissor: 'caixa',
    final4,
    vencimento,
    totalEsperado,
    origemTotal: 'Valor total desta fatura, descontados saldo anterior e pagamentos',
    linhas,
  };
}
