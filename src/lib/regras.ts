// Regras de negócio puras da entrega 1 (testadas em regras.test.ts).
import { centavos, somaCentavos } from './formato';

// ---------------------------------------------------------------------------
// RF-12: status de conta/fatura, igual à fórmula da planilha:
// =SE(HOJE()>MÁXIMO(F;I); SE(C=H+K;"PAGO"; SE(C>=H+K; "FALTA: x"; "VERIFICAR: x")); SE(HOJE()=MÁXIMO(F;I);"CONFERIR HOJE";"AGENDADO"))
// ---------------------------------------------------------------------------
export interface Pagamento { data: string; valor: number; banco?: string | null }
export type Status =
  | { tipo: 'PAGO'; texto: string }
  | { tipo: 'FALTA'; texto: string; diferenca: number }
  | { tipo: 'VERIFICAR'; texto: string; diferenca: number }
  | { tipo: 'CONFERIR HOJE'; texto: string }
  | { tipo: 'AGENDADO'; texto: string };

export function statusConta(valor: number, pagamentos: Pagamento[], hoje: string): Status {
  const ultima = pagamentos.map((p) => p.data).sort().at(-1) ?? '0000-00-00';
  const pago = somaCentavos(pagamentos.map((p) => p.valor));
  if (hoje > ultima) {
    const dif = (centavos(valor) - centavos(pago)) / 100;
    if (dif === 0) return { tipo: 'PAGO', texto: 'PAGO' };
    if (dif > 0) return { tipo: 'FALTA', texto: `FALTA: ${fmt(dif)}`, diferenca: dif };
    return { tipo: 'VERIFICAR', texto: `VERIFICAR: ${fmt(-dif)}`, diferenca: -dif };
  }
  if (hoje === ultima) return { tipo: 'CONFERIR HOJE', texto: 'CONFERIR HOJE' };
  return { tipo: 'AGENDADO', texto: 'AGENDADO' };
}
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** RF-80: "ainda não marcada como paga" = pagamentos registrados não cobrem o valor. */
export const pagoTotalmente = (valor: number, pagamentos: Pagamento[]) =>
  centavos(somaCentavos(pagamentos.map((p) => p.valor))) >= centavos(valor);

// ---------------------------------------------------------------------------
// RF-36: divisão (espelho de public.compute_allocations, para pré-visualizar na tela)
// ---------------------------------------------------------------------------
export interface Parte { pessoa_id: string; pct?: number; valor?: number; tag_id?: string | null }
export type RegraDivisao =
  | { tipo: 'mario' }
  | { tipo: 'pct'; partes: Parte[] }
  | { tipo: 'valor'; partes: Parte[] }
  | { tipo: 'total'; pessoa_id: string; tag_id?: string | null };
export interface Alocacao { pessoa_id: string | null; tag_id: string | null; valor: number }

export class DivisaoError extends Error {}

export function calcularDivisao(total: number, regra: RegraDivisao): Alocacao[] {
  const sinal = total < 0 ? -1 : 1;
  const abs = Math.abs(centavos(total));
  if (regra.tipo === 'mario') return [{ pessoa_id: null, tag_id: null, valor: total }];
  if (regra.tipo === 'total') {
    if (!regra.pessoa_id) throw new DivisaoError('Escolha a pessoa que paga 100%.');
    return [{ pessoa_id: regra.pessoa_id, tag_id: regra.tag_id ?? null, valor: total }];
  }
  const out: Alocacao[] = [];
  let soma = 0;
  if (regra.tipo === 'pct') {
    const somaPct = regra.partes.reduce((a, p) => a + (p.pct ?? 0), 0);
    if (somaPct > 100) throw new DivisaoError(`Os percentuais somam ${somaPct}% — passam de 100%.`);
    for (const p of regra.partes) {
      const c = Math.trunc((abs * (p.pct ?? 0)) / 100); // trunca; sobra vai ao Mário
      soma += c;
      out.push({ pessoa_id: p.pessoa_id, tag_id: p.tag_id ?? null, valor: (sinal * c) / 100 });
    }
  } else {
    for (const p of regra.partes) {
      const c = Math.abs(centavos(p.valor ?? 0));
      soma += c;
      out.push({ pessoa_id: p.pessoa_id, tag_id: p.tag_id ?? null, valor: (sinal * c) / 100 });
    }
    if (soma > abs) throw new DivisaoError(`As partes somam ${fmt(soma / 100)}, mais que o valor ${fmt(abs / 100)} — diferença ${fmt((soma - abs) / 100)}.`);
  }
  if (abs - soma !== 0) out.push({ pessoa_id: null, tag_id: null, valor: (sinal * (abs - soma)) / 100 });
  return out;
}

export const parteDoMario = (total: number, regra: RegraDivisao) =>
  somaCentavos(calcularDivisao(total, regra).filter((a) => a.pessoa_id == null).map((a) => a.valor));

// ---------------------------------------------------------------------------
// RF-24 / RF-31: chave normalizada de estabelecimento
// ---------------------------------------------------------------------------
export function chaveEstabelecimento(desc: string): string {
  return desc
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\b\d{2}\s*(\/|DE)\s*\d{2}\b\s*$/, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// RF-31: sugestão de categoria por regra "contém"
export interface RegraCategoria { padrao: string; category_id: string }
export function sugerirCategoria(desc: string, regras: RegraCategoria[]): string | null {
  const k = chaveEstabelecimento(desc);
  const hit = [...regras].sort((a, b) => b.padrao.length - a.padrao.length).find((r) => k.includes(chaveEstabelecimento(r.padrao)));
  return hit?.category_id ?? null;
}

export const CATEGORIAS_PADRAO = ['Moradia', 'Alimentação', 'Delivery', 'Mercado', 'Transporte', 'Viagem', 'Milhas', 'Saúde', 'Pet', 'Vestuário', 'Assinaturas', 'Salão do Diego', 'Presentes', 'Tarifas/IOF', 'Outros'];

/** Regras iniciais (o usuário edita; cada correção na revisão vira regra). */
export const REGRAS_CATEGORIA_PADRAO: [string, string][] = [
  ['99FOOD', 'Delivery'], ['IFD', 'Delivery'], ['IFOOD', 'Delivery'], ['99 ', 'Transporte'], ['UBER', 'Transporte'],
  ['AZUL', 'Viagem'], ['LATAM', 'Viagem'], ['GOL ', 'Viagem'], ['SMILES', 'Milhas'], ['LIVELO', 'Milhas'], ['ESFERA', 'Milhas'],
  ['CARREFOUR', 'Mercado'], ['BIG BOX', 'Mercado'], ['PAO DE ACUCAR', 'Mercado'], ['SAMS', 'Mercado'],
  ['DROGARIA', 'Saúde'], ['PET', 'Pet'], ['SPOTIFY', 'Assinaturas'], ['YOUTUBE', 'Assinaturas'], ['NETFLIX', 'Assinaturas'],
  ['WELLHUB', 'Assinaturas'], ['IOF', 'Tarifas/IOF'], ['ANUIDADE', 'Tarifas/IOF'], ['ZARA', 'Vestuário'],
  ['GOOGLE ADS', 'Salão do Diego'], ['FACEBK', 'Salão do Diego'],
];

// ---------------------------------------------------------------------------
// RF-24 / RF-25: planejamento da importação de uma fatura
// ---------------------------------------------------------------------------
export interface LinhaEntrada { data: string | null; descricao: string; parcelaAtual: number | null; parcelasTotal: number | null; valor: number }
export interface Compra { id: string; chave: string; valor_parcela: number; parcelas_total: number; descricao: string | null; category_id: string | null; split_rule: RegraDivisao }
export interface Projecao { id: string; purchase_id: string | null; parcela_atual: number | null; valor: number; descricao: string }
export interface RegraAprendida { chave: string; descricao: string; category_id: string | null; split_rule: RegraDivisao | null }

export interface LinhaPlanejada extends LinhaEntrada {
  descricao_original: string;
  descricaoFinal: string;
  category_id: string | null;
  split_rule: RegraDivisao;
  purchase_id: string | null; // compra existente casada
  projecao_id: string | null; // projeção substituída
  origemSugestao: 'parcela anterior' | 'regra aprendida' | 'regra de categoria' | 'nenhuma';
}

export function planejarImportacao(
  linhas: LinhaEntrada[],
  projecoesDoMes: Projecao[],
  compras: Compra[],
  aprendidas: RegraAprendida[],
  regrasCategoria: RegraCategoria[],
): { linhas: LinhaPlanejada[]; naoEncontradas: Projecao[] } {
  const livres = new Set(projecoesDoMes.map((p) => p.id));
  const planejadas = linhas.map((l): LinhaPlanejada => {
    const chave = chaveEstabelecimento(l.descricao);
    const base = { ...l, descricao_original: l.descricao, projecao_id: null as string | null };
    if (l.parcelaAtual && l.parcelasTotal) {
      const compra = compras.find(
        (c) => c.chave === chave && c.parcelas_total === l.parcelasTotal && Math.abs(centavos(c.valor_parcela) - centavos(l.valor)) <= 1,
      );
      if (compra) {
        const proj = projecoesDoMes.find((p) => livres.has(p.id) && p.purchase_id === compra.id && p.parcela_atual === l.parcelaAtual);
        if (proj) livres.delete(proj.id);
        return {
          ...base,
          projecao_id: proj?.id ?? null,
          descricaoFinal: compra.descricao ?? l.descricao,
          category_id: compra.category_id,
          split_rule: compra.split_rule,
          purchase_id: compra.id,
          origemSugestao: 'parcela anterior',
        };
      }
    }
    const regra = aprendidas.find((r) => r.chave === chave);
    if (regra) {
      return { ...base, descricaoFinal: regra.descricao, category_id: regra.category_id ?? sugerirCategoria(l.descricao, regrasCategoria), split_rule: regra.split_rule ?? { tipo: 'mario' }, purchase_id: null, origemSugestao: 'regra aprendida' };
    }
    const cat = sugerirCategoria(l.descricao, regrasCategoria);
    return { ...base, descricaoFinal: l.descricao, category_id: cat, split_rule: { tipo: 'mario' }, purchase_id: null, origemSugestao: cat ? 'regra de categoria' : 'nenhuma' };
  });
  return { linhas: planejadas, naoEncontradas: projecoesDoMes.filter((p) => livres.has(p.id)) };
}

/** RF-25: parcelas futuras de uma compra lançada na parcela `atual` da competência `comp`. */
export function parcelasFuturas(atual: number, total: number): { parcela: number; mesesAFrente: number }[] {
  const out = [];
  for (let n = atual + 1; n <= total; n++) out.push({ parcela: n, mesesAFrente: n - atual });
  return out;
}

// RF-26: conferência do total
export function conferirTotal(linhas: { valor: number }[], esperado: number | null) {
  const soma = somaCentavos(linhas.map((l) => l.valor));
  if (esperado == null) return { soma, diferenca: null as number | null, ok: false };
  const diferenca = (centavos(soma) - centavos(esperado)) / 100;
  return { soma, diferenca, ok: diferenca === 0 };
}

// ---------------------------------------------------------------------------
// RF-04: número de cartão em texto livre (mesma regra do banco)
// ---------------------------------------------------------------------------
export function contemNumeroCartao(t: string | null | undefined): boolean {
  if (!t) return false;
  for (const m of t.matchAll(/((?:\d[ .-]?){12,18}\d)/g)) {
    const d = m[1].replace(/\D/g, '');
    if (d.length < 13 || d.length > 19) continue;
    let s = 0;
    let dbl = false;
    for (let i = d.length - 1; i >= 0; i--) {
      let n = Number(d[i]);
      if (dbl) { n *= 2; if (n > 9) n -= 9; }
      s += n;
      dbl = !dbl;
    }
    if (s % 10 === 0) return true;
  }
  return false;
}
