// Escolhe o leitor pelo emissor do cartão (RF-21). Um leitor quebrado não afeta os outros (RNF-09).
import { lerItau } from './itau';
import { lerCaixa } from './caixa';
import { lerGenerico } from './generico';
import { type FaturaLida, type TextItem } from './tipos';

export type Emissor = 'itau' | 'caixa' | 'outro';

export const LEITORES: Record<Exclude<Emissor, 'outro'>, (i: TextItem[]) => FaturaLida> = {
  itau: lerItau,
  caixa: lerCaixa,
};

export function lerFatura(emissor: Emissor, itens: TextItem[]): FaturaLida {
  // Cartões sem leitor próprio usam o leitor genérico (data · descrição · valor).
  if (emissor === 'outro') return lerGenerico(itens);
  return LEITORES[emissor](itens);
}

export * from './tipos';
