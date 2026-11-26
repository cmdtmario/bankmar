import { describe, it, expect } from 'vitest';
import { primeiroDiaUtil, valorDaFoto } from '../../../supabase/functions/investimentos-diario/logica';

describe('Função diária de investimentos', () => {
  it('1º dia útil do mês gera a foto do mês anterior', () => {
    expect(primeiroDiaUtil('2026-12-01')).toBe('2026-11-01'); // terça
    expect(primeiroDiaUtil('2026-11-02')).toBe('2026-10-01'); // 1/11 é domingo
    expect(primeiroDiaUtil('2026-11-03')).toBeNull();
  });
  it('foto usa cotação para negociáveis, valor da posição para o resto e o último saldo manual', () => {
    const f = valorDaFoto(
      [{ classe: 'acao', codigo: 'PETR4', instituicao: 'Inter', quantidade: 10, valor: 300 }, { classe: 'renda_fixa', codigo: 'CDB1', instituicao: 'Inter', quantidade: 2, valor: 2090.01 }],
      new Map([['PETR4', 40]]),
      [{ instituicao: 'Brasilprev', produto: 'PGBL', classe: 'previdencia', saldo: 5000 }, { instituicao: 'Brasilprev', produto: 'PGBL', classe: 'previdencia', saldo: 4000 }],
    );
    expect(f.map((x) => [x.codigo, x.valor])).toEqual([['PETR4', 400], ['CDB1', 2090.01], ['PGBL', 5000]]);
  });
});

import { lerYahoo, pregaoAberto } from '../../../supabase/functions/investimentos-diario/logica';
describe('Cotação ao vivo (Yahoo)', () => {
  const t = (d: string) => Date.parse(d) / 1000;
  const resp = { chart: { result: [{ meta: { regularMarketPrice: 32.5, regularMarketTime: t('2026-11-26T15:30:00Z'), chartPreviousClose: 29 },
    timestamp: [t('2026-11-24T13:00:00Z'), t('2026-11-25T13:00:00Z'), t('2026-11-26T13:00:00Z')], indicators: { quote: [{ close: [30, 31, 32.1] }] } }] } };
  it('preço atual, fechamento do pregão anterior e dias', () => {
    const c = lerYahoo('PETR4', resp)!;
    expect(c.preco).toBe(32.5);
    expect(c.anterior).toBe(31);
    expect(c.dias).toEqual([{ data: '2026-11-24', preco: 30 }, { data: '2026-11-25', preco: 31 }, { data: '2026-11-26', preco: 32.5 }]);
  });
  it('resposta vazia ou sem preço não vira cotação', () => {
    expect(lerYahoo('XXXX3', { chart: { result: null } })).toBeNull();
    expect(lerYahoo('XXXX3', { chart: { result: [{ meta: { regularMarketPrice: 0 } }] } })).toBeNull();
  });
  it('pregão só em dia útil, das 10h às 18h15 de Brasília', () => {
    expect(pregaoAberto(new Date('2026-11-26T14:00:00Z'))).toBe(true);  // qui 11h
    expect(pregaoAberto(new Date('2026-11-26T12:00:00Z'))).toBe(false); // qui 9h
    expect(pregaoAberto(new Date('2026-11-28T14:00:00Z'))).toBe(false); // sábado
  });
});
