// RF-37 / RF-39 / RF-39a: resumo por pessoa, agrupado por marcador.
import { brl, dataBR, somaCentavos } from './formato';

export interface ItemPessoa {
  data: string | null;
  descricao: string;
  parcela_atual: number | null;
  parcelas_total: number | null;
  cartao: string | null;
  marcador: string | null;
  valor: number;
}

export interface Grupo { marcador: string | null; itens: ItemPessoa[]; subtotal: number }

export function agruparPorMarcador(itens: ItemPessoa[]): Grupo[] {
  const mapa = new Map<string | null, ItemPessoa[]>();
  for (const i of itens) {
    const k = i.marcador ?? null;
    mapa.set(k, [...(mapa.get(k) ?? []), i]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => (a == null ? -1 : b == null ? 1 : a.localeCompare(b)))
    .map(([marcador, its]) => ({
      marcador,
      itens: its.sort((x, y) => (x.data ?? '').localeCompare(y.data ?? '')),
      subtotal: somaCentavos(its.map((i) => i.valor)),
    }));
}

export const rotuloParcela = (i: ItemPessoa) => (i.parcela_atual && i.parcelas_total ? ` (${i.parcela_atual}/${i.parcelas_total})` : '');

export function textoWhatsApp(p: { pessoa: string; periodo: string; itens: ItemPessoa[]; recebido: number; pix: string | null }) {
  const grupos = agruparPorMarcador(p.itens);
  const total = somaCentavos(p.itens.map((i) => i.valor));
  const linhas = [`*Resumo ${p.pessoa} — ${p.periodo}*`, ''];
  for (const g of grupos) {
    linhas.push(`*${g.marcador ?? 'Pessoal'}*`);
    for (const i of g.itens) linhas.push(`• ${dataBR(i.data)} ${i.descricao}${rotuloParcela(i)}: ${brl(i.valor)}`);
    linhas.push(`Subtotal: ${brl(g.subtotal)}`, '');
  }
  linhas.push(`*Total: ${brl(total)}*`);
  if (p.recebido) linhas.push(`Já recebido: ${brl(p.recebido)}`, `*A pagar: ${brl(somaCentavos([total, -p.recebido]))}*`);
  if (p.pix) linhas.push('', `Pix: ${p.pix}`);
  return linhas.join('\n');
}
