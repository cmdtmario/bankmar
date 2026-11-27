// Tipos comuns aos leitores de fatura (RF-20 a RF-22).

/** Um pedaço de texto do PDF com posição (origem no canto superior esquerdo). */
export interface TextItem {
  p: number; // página (1..n)
  x: number;
  y: number;
  s: string;
}

export interface LinhaFatura {
  data: string | null; // AAAA-MM-DD
  descricao: string; // como veio do banco, sem o sufixo de parcela
  parcelaAtual: number | null;
  parcelasTotal: number | null;
  valor: number; // R$; negativo = crédito/estorno
}

export interface FaturaLida {
  emissor: 'itau' | 'caixa' | 'texto' | 'generico';
  final4: string | null;
  vencimento: string | null; // AAAA-MM-DD
  /** Valor impresso que a soma das linhas deve igualar (RF-26). */
  totalEsperado: number | null;
  /** Descrição de onde veio o total esperado, exibida na revisão. */
  origemTotal: string;
  linhas: LinhaFatura[];
}

/** Leitor não reconheceu o arquivo: nada é importado (caso extremo 1). */
export class LeitorError extends Error {}
