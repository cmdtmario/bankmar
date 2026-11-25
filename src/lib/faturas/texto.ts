// Plano B (RF-22): texto tabular colado (resposta do ChatGPT, CSV do banco).
// Colunas: data (dd/mm/aaaa), descrição, parcela atual, total de parcelas, valor.
import { isoDeBR, parseValorBR } from '../formato';
import { LeitorError, type FaturaLida, type LinhaFatura } from './tipos';

export function lerTextoTabular(texto: string): { linhas: LinhaFatura[]; erros: string[] } {
  const brutas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!brutas.length) throw new LeitorError('Nenhum texto para importar.');
  const linhas: LinhaFatura[] = [];
  const erros: string[] = [];
  brutas.forEach((bruta, idx) => {
    if (/^\|?\s*:?-{2,}/.test(bruta)) return; // separador de tabela markdown
    let cols: string[];
    if (bruta.includes('|')) cols = bruta.replace(/^\||\|$/g, '').split('|');
    else if (bruta.includes('\t')) cols = bruta.split('\t');
    else cols = bruta.split(';');
    cols = cols.map((c) => c.trim());
    if (idx === 0 && !isoDeBR(cols[0] ?? '')) return; // cabeçalho
    const n = idx + 1;
    if (cols.length < 5) { erros.push(`linha ${n}: esperava 5 colunas, veio ${cols.length}`); return; }
    const data = isoDeBR(cols[0]);
    const valor = parseValorBR(cols[4]);
    const pa = cols[2] ? Number(cols[2]) : null;
    const pt = cols[3] ? Number(cols[3]) : null;
    if (!data) { erros.push(`linha ${n}: data inválida "${cols[0]}"`); return; }
    if (valor == null) { erros.push(`linha ${n}: valor inválido "${cols[4]}"`); return; }
    if ((pa != null && !Number.isInteger(pa)) || (pt != null && !Number.isInteger(pt))) { erros.push(`linha ${n}: parcela inválida`); return; }
    if (!cols[1]) { erros.push(`linha ${n}: descrição vazia`); return; }
    linhas.push({ data, descricao: cols[1], parcelaAtual: pa && pt && pt > 1 ? pa : null, parcelasTotal: pa && pt && pt > 1 ? pt : null, valor });
  });
  if (!linhas.length && !erros.length) throw new LeitorError('Nenhuma linha reconhecida no texto.');
  return { linhas, erros };
}

export function faturaDeTexto(texto: string, vencimento: string | null, totalEsperado: number | null): FaturaLida & { erros: string[] } {
  const { linhas, erros } = lerTextoTabular(texto);
  return { emissor: 'texto', final4: null, vencimento, totalEsperado, origemTotal: 'Total informado por você', linhas, erros };
}
