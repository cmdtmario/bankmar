// RF-60: leitura dos arquivos exportados da Área do Investidor B3 (.xlsx), reconhecidos pelas colunas.
import * as XLSX from 'xlsx';

export interface Negociacao { data: string; tipo: 'Compra' | 'Venda'; mercado: string; instituicao: string; codigo: string; quantidade: number; preco: number; valor: number; chave: string }
export interface Movimentacao { data: string; entrada: boolean; tipo: string; produto: string; codigo: string; instituicao: string; quantidade: number; preco: number | null; valor: number | null; chave: string }
export interface ProventoReceber { codigo: string; produto: string; tipo: string; evento: string; previsao: string | null; instituicao: string; quantidade: number; valor: number; chave: string }
export type Classe = 'acao' | 'bdr' | 'etf' | 'fii' | 'fundo' | 'renda_fixa' | 'tesouro' | 'coe' | 'previdencia' | 'outro';
export interface Posicao { classe: Classe; codigo: string; produto: string; instituicao: string; cnpj: string | null; isin: string | null; emissor: string | null; indexador: string | null; vencimento: string | null; quantidade: number; preco: number | null; valor: number | null; valorAplicado: number | null }

export type ArquivoB3 =
  | { tipo: 'negociacao'; linhas: Negociacao[]; ignoradas: number }
  | { tipo: 'movimentacao'; linhas: Movimentacao[]; ignoradas: number }
  | { tipo: 'proventos'; linhas: ProventoReceber[]; ignoradas: number }
  | { tipo: 'posicao'; linhas: Posicao[]; ignoradas: number };

export class ArquivoB3Error extends Error {}

type Cel = string | number | null | undefined;
const s = (v: Cel) => (v == null ? '' : String(v).trim());
const n = (v: Cel): number | null => {
  if (typeof v === 'number') return v;
  const t = s(v);
  if (!t || t === '-') return null;
  const x = Number(t.replace(/\./g, '').replace(',', '.'));
  return isFinite(x) ? x : null;
};
const d = (v: Cel): string | null => {
  const m = s(v).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
/** "PETR4F" (fracionário) -> "PETR4" (RF-60a). */
export const codigoBase = (c: string) => {
  const t = c.trim().toUpperCase();
  return /^[A-Z0-9]{4}\d{1,2}F$/.test(t) ? t.slice(0, -1) : t;
};
/** "CPTS11 - CAPITANIA ..." -> "CPTS11" */
export const codigoDoProduto = (p: string) => codigoBase(p.split(' - ')[0]);
const chave = (...partes: (string | number | null)[]) => partes.map((x) => String(x ?? '')).join('|');

const COLS = {
  negociacao: ['Data do Negócio', 'Tipo de Movimentação', 'Mercado', 'Instituição', 'Código de Negociação', 'Quantidade', 'Preço', 'Valor'],
  movimentacao: ['Entrada/Saída', 'Data', 'Movimentação', 'Produto', 'Instituição', 'Quantidade'],
  proventos: ['Produto', 'Tipo de Evento', 'Previsão de pagamento', 'Valor líquido'],
};

function tabela(ws: XLSX.WorkSheet): Record<string, Cel>[] {
  return XLSX.utils.sheet_to_json<Record<string, Cel>>(ws, { raw: true, defval: null });
}
const temColunas = (linhas: Record<string, Cel>[], cols: string[]) => linhas.length > 0 && cols.every((c) => c in linhas[0]);

const CLASSE_ABA: Record<string, Classe> = { acoes: 'acao', 'ações': 'acao', bdr: 'bdr', etf: 'etf', 'fundo de investimento': 'fii', 'renda fixa': 'renda_fixa', 'tesouro direto': 'tesouro', coe: 'coe' };

export function lerArquivoB3(dados: ArrayBuffer | Uint8Array): ArquivoB3 {
  const wb = XLSX.read(dados, { type: 'array' });
  const primeira = tabela(wb.Sheets[wb.SheetNames[0]]);
  let ignoradas = 0;

  if (temColunas(primeira, COLS.negociacao)) {
    const linhas: Negociacao[] = [];
    const vistas = new Map<string, number>();
    for (const r of primeira) {
      const data = d(r['Data do Negócio']);
      const tipo = s(r['Tipo de Movimentação']);
      const q = n(r['Quantidade']);
      if (!data || (tipo !== 'Compra' && tipo !== 'Venda') || q == null) { ignoradas++; continue; }
      const base = chave(data, tipo, s(r['Instituição']), s(r['Código de Negociação']), q, n(r['Preço']), n(r['Valor']));
      const k = (vistas.get(base) ?? 0) + 1; // linhas idênticas no mesmo dia são negócios distintos
      vistas.set(base, k);
      linhas.push({ data, tipo, mercado: s(r['Mercado']), instituicao: s(r['Instituição']), codigo: codigoBase(s(r['Código de Negociação'])), quantidade: q, preco: n(r['Preço']) ?? 0, valor: n(r['Valor']) ?? 0, chave: `${base}|${k}` });
    }
    return { tipo: 'negociacao', linhas, ignoradas };
  }

  if (temColunas(primeira, COLS.movimentacao)) {
    const linhas: Movimentacao[] = [];
    const vistas = new Map<string, number>();
    for (const r of primeira) {
      const data = d(r['Data']);
      const q = n(r['Quantidade']);
      if (!data || q == null) { ignoradas++; continue; }
      const produto = s(r['Produto']);
      const base = chave(data, s(r['Entrada/Saída']), s(r['Movimentação']), produto, s(r['Instituição']), q, n(r['Preço unitário']), n(r['Valor da Operação']));
      const k = (vistas.get(base) ?? 0) + 1;
      vistas.set(base, k);
      linhas.push({ data, entrada: /cr[eé]dito/i.test(s(r['Entrada/Saída'])), tipo: s(r['Movimentação']), produto, codigo: codigoDoProduto(produto), instituicao: s(r['Instituição']), quantidade: q, preco: n(r['Preço unitário']), valor: n(r['Valor da Operação']), chave: `${base}|${k}` });
    }
    return { tipo: 'movimentacao', linhas, ignoradas };
  }

  if (temColunas(primeira, COLS.proventos)) {
    const linhas: ProventoReceber[] = [];
    for (const r of primeira) {
      const produto = s(r['Produto']);
      const valor = n(r['Valor líquido']);
      if (!produto || valor == null) { ignoradas++; continue; }
      const previsao = d(r['Previsão de pagamento']);
      linhas.push({ codigo: codigoDoProduto(produto), produto, tipo: s(r['Tipo']), evento: s(r['Tipo de Evento']), previsao, instituicao: s(r['Instituição']), quantidade: n(r['Quantidade']) ?? 0, valor, chave: chave(produto, s(r['Tipo de Evento']), previsao, s(r['Instituição']), valor) });
    }
    return { tipo: 'proventos', linhas, ignoradas };
  }

  // Posição: uma aba por classe
  const abasPosicao = wb.SheetNames.filter((a) => CLASSE_ABA[a.toLowerCase()]);
  if (abasPosicao.length) {
    const linhas: Posicao[] = [];
    for (const aba of abasPosicao) {
      const classe = CLASSE_ABA[aba.toLowerCase()];
      for (const r of tabela(wb.Sheets[aba])) {
        const produto = s(r['Produto']);
        const q = n(r['Quantidade']);
        if (!produto || q == null) { ignoradas++; continue; }
        const codigo = codigoBase(s(r['Código de Negociação']) || s(r['Código']) || s(r['Código ISIN']) || produto);
        const ehFii = classe === 'fii' && /FII|IMOB|FIAGRO|AGRO|INFRA/i.test(produto);
        linhas.push({
          classe: classe === 'fii' && !ehFii ? 'fundo' : classe,
          codigo, produto,
          instituicao: s(r['Instituição']),
          cnpj: s(r['CNPJ da Empresa']) || s(r['CNPJ do Fundo']) || null,
          isin: (s(r['Código ISIN / Distribuição']) || s(r['Código ISIN'])).split(' - ')[0] || null,
          emissor: s(r['Emissor']) || s(r['Escriturador']) || s(r['Administrador']) || null,
          indexador: s(r['Indexador']) || null,
          vencimento: d(r['Vencimento']),
          quantidade: q,
          preco: n(r['Preço de Fechamento']) ?? n(r['Preço Atualizado CURVA']) ?? n(r['Preço Atualizado MTM']),
          valor: n(r['Valor Atualizado']) ?? n(r['Valor Atualizado CURVA']) ?? n(r['Valor Atualizado MTM']) ?? n(r['Valor Atualizado FECHAMENTO']) ?? n(r['Valor Aplicado']),
          valorAplicado: n(r['Valor Aplicado']),
        });
      }
    }
    return { tipo: 'posicao', linhas, ignoradas };
  }

  // caso extremo 10: formato desconhecido — nada é importado
  const cols = Object.keys(primeira[0] ?? {}).join(', ') || '(planilha vazia)';
  throw new ArquivoB3Error(`Arquivo da B3 não reconhecido. Colunas encontradas: ${cols}. Esperado: Negociação, Movimentação, Posição ou Proventos a Receber.`);
}
