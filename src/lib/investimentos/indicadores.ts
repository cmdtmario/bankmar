// Indicadores por ativo e o texto "se vender hoje", para apoiar decisões. Funções puras.
import type { Ativo, Provento } from './carteira';
import { brl, pctBR } from '../formato';

export interface Cotacao { preco: number; anterior: number | null; data: string; hora?: string | null }

export interface Indicadores {
  varDia: number | null;        // % desde o fechamento do pregão anterior
  varDiaValor: number | null;   // R$ na posição
  varEntrada: number | null;    // % do preço atual sobre o preço médio
  resultadoPreco: number | null; // R$ só pela variação de preço
  proventosTotal: number;
  proventos12m: number;
  retornoTotal: number | null;  // preço + proventos, R$
  retornoTotalPct: number | null;
  dy12m: number | null;         // proventos de 12 meses por cota ÷ preço atual
  yoc: number | null;           // proventos de 12 meses ÷ valor investido (yield on cost)
  equilibrio: number | null;    // preço de venda que zera o resultado, contando os proventos
  peso: number;                 // fatia na carteira
  distanciaAlvo: number | null; // % que falta (positivo) ou que passou (negativo) do alvo
  numeroMagico: number | null;  // FII: cotas para que 1 mês de rendimento compre uma cota nova
  minimo52: number | null; maximo52: number | null;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function calcular(a: Ativo, provs: Provento[], cot: Cotacao | undefined, totalCarteira: number, historico: { data: string; preco: number }[] = [], hoje = new Date().toISOString().slice(0, 10)): Indicadores {
  const preco = cot?.preco ?? a.preco;
  const meus = provs.filter((p) => p.codigo === a.codigo);
  const ini12 = new Date(Date.parse(hoje + 'T12:00:00Z') - 365 * 864e5).toISOString().slice(0, 10);
  const prov12 = r2(meus.filter((p) => p.data > ini12).reduce((s, p) => s + p.valor, 0));
  const provTot = r2(meus.reduce((s, p) => s + p.valor, 0));
  const anterior = cot?.anterior ?? null;
  const varDia = preco != null && anterior ? preco / anterior - 1 : null;
  const investido = a.pm != null ? a.pm * a.quantidade : a.investido;
  const mercado = preco != null && ['acao', 'bdr', 'etf', 'fii'].includes(a.classe) ? preco * a.quantidade : a.mercado;
  const resultadoPreco = investido != null ? r2(mercado - investido) : null;
  const retornoTotal = resultadoPreco != null ? r2(resultadoPreco + provTot) : null;
  const porCota12 = a.quantidade ? prov12 / a.quantidade : 0;
  const ano = historico.filter((h) => h.data > ini12).map((h) => h.preco);
  return {
    varDia,
    varDiaValor: preco != null && anterior ? r2((preco - anterior) * a.quantidade) : null,
    varEntrada: preco != null && a.pm ? preco / a.pm - 1 : null,
    resultadoPreco,
    proventosTotal: provTot,
    proventos12m: prov12,
    retornoTotal,
    retornoTotalPct: retornoTotal != null && investido ? retornoTotal / investido : null,
    dy12m: preco && prov12 ? porCota12 / preco : null,
    yoc: investido && prov12 ? prov12 / investido : null,
    equilibrio: investido != null && a.quantidade ? Math.max(0, (investido - provTot) / a.quantidade) : null,
    peso: totalCarteira ? mercado / totalCarteira : 0,
    distanciaAlvo: a.alvo != null && preco ? a.alvo / preco - 1 : null,
    numeroMagico: a.classe === 'fii' && preco && porCota12 > 0 ? Math.ceil(preco / (porCota12 / 12)) : null,
    minimo52: ano.length ? Math.min(...ano) : null,
    maximo52: ano.length ? Math.max(...ano) : null,
  };
}

/** Frases curtas para a decisão de vender ou manter. Nunca recomenda: só descreve números. */
export function resumoDecisao(a: Ativo, i: Indicadores, preco: number | null): string[] {
  const f: string[] = [];
  const sinal = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const pct = (v: number) => `${sinal(v)}${pctBR(Math.abs(v))}`;
  const rs = (v: number) => `${sinal(v)}${brl(Math.abs(v))}`;
  if (i.varDia != null && i.varDiaValor != null) f.push(`Hoje: ${pct(i.varDia)} (${rs(i.varDiaValor)} na sua posição).`);
  if (i.resultadoPreco == null || i.varEntrada == null) {
    f.push('Sem preço médio: informe o preço de compra para ver o resultado.');
    if (i.proventosTotal) f.push(`Proventos já recebidos: ${brl(i.proventosTotal)}.`);
    return f;
  }
  f.push(`Se vender hoje${preco != null ? ` a ${brl(preco)}` : ''}: o preço dá ${i.resultadoPreco >= 0 ? 'lucro' : 'prejuízo'} de ${pctBR(Math.abs(i.varEntrada))} (${rs(i.resultadoPreco)}).`);
  if (i.proventosTotal) {
    f.push(`Com os proventos já recebidos (${brl(i.proventosTotal)}), o resultado total fica ${rs(i.retornoTotal!)}${i.retornoTotalPct != null ? ` (${pct(i.retornoTotalPct)})` : ''}.`);
    if (i.resultadoPreco < 0 && i.retornoTotal! >= 0) f.push('Os proventos já cobrem a queda do preço.');
    if (i.resultadoPreco < 0 && i.retornoTotal! < 0) f.push(`Os proventos cobrem ${pctBR(i.proventosTotal / Math.abs(i.resultadoPreco), 0)} da queda do preço.`);
  }
  if (i.equilibrio != null && preco != null) f.push(i.equilibrio <= preco ? `Você está no positivo vendendo acima de ${brl(i.equilibrio)}.` : `Para sair no zero (com proventos), o preço precisa chegar a ${brl(i.equilibrio)} (${pct(i.equilibrio / preco - 1)} do atual).`);
  if (i.yoc != null) f.push(`Nos últimos 12 meses rendeu ${brl(i.proventos12m)} em proventos: ${pctBR(i.yoc)} sobre o que você pagou${i.dy12m != null ? ` e ${pctBR(i.dy12m)} sobre o preço de hoje` : ''}.`);
  if (i.distanciaAlvo != null) f.push(i.distanciaAlvo <= 0 ? `Alvo de ${brl(a.alvo)} atingido.` : `Faltam ${pctBR(i.distanciaAlvo)} para o alvo de ${brl(a.alvo)}.`);
  return f;
}
