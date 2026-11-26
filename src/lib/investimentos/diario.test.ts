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
