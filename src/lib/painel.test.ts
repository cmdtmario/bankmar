import { describe, it, expect } from 'vitest';
import { montarPainel, type Brutos } from './painel';

const base: Brutos = {
  comp: '2026-11-01', hoje: '2026-11-25',
  meses: [{ competencia: '2026-11-01', renda: 10000 }, { competencia: '2026-10-01', renda: 10000 }],
  gastos: [
    { competencia: '2026-11-01', category_id: 'c1', total: 3000, total_mario: 1500 },
    { competencia: '2026-11-01', category_id: 'c2', total: 500, total_mario: 500 },
    { competencia: '2026-10-01', category_id: 'c1', total: 1000, total_mario: 1000 },
  ],
  categorias: [{ id: 'c1', nome: 'Moradia' }, { id: 'c2', nome: 'Delivery' }],
  contas: [
    { id: 'b1', descricao: 'Aluguel', vencimento: '2026-11-26', valor: 2800, banco_pagamento: 'BB' },
    { id: 'b2', descricao: 'Luz', vencimento: '2026-11-20', valor: 200, banco_pagamento: null },
    { id: 'b3', descricao: 'Água', vencimento: '2026-11-24', valor: 100, banco_pagamento: null },
    { id: 'b4', descricao: 'Longe', vencimento: '2026-12-20', valor: 100, banco_pagamento: null },
  ],
  faturas: [{ invoice_id: 'i1', card_id: 'k1', competencia: '2026-11-01', vencimento: '2026-11-25', total: 900, total_mario: 600, confirmada: true, qtd_nao_conferidas: 3 }],
  cartoes: [{ id: 'k1', apelido: 'Itaú Azul', banco_pagamento: 'Itaú' }],
  pagamentos: [{ id: 'p1', bill_id: 'b3', invoice_id: null, data: '2026-11-24', valor: 100, banco: null }],
  itensPessoas: [{ person_id: 'd', valor: 1400 }, { person_id: 'd', valor: 300 }],
  recebimentos: [{ person_id: 'd', valor: 1000 }],
  pessoas: [{ id: 'd', nome: 'Diego' }],
};

describe('Painel', () => {
  const d = montarPainel(base);
  it('totais do mês e série de 12 meses', () => {
    expect(d.gastoMario).toBe(2000);
    expect(d.gastoTotal).toBe(3500);
    expect(d.serie).toHaveLength(12);
    expect(d.serie.at(-1)).toEqual({ comp: '2026-11-01', gasto: 2000, renda: 10000 });
    expect(d.mediaTres).toBe(1000);
  });
  it('vencimentos: atrasados primeiro, pagos e distantes fora', () => {
    expect(d.vencimentos.map((v) => [v.nome, v.dias])).toEqual([['Luz', -5], ['Fatura Itaú Azul', 0], ['Aluguel', 1]]);
  });
  it('a receber, categorias e pendências', () => {
    expect(d.aReceber).toEqual([{ id: 'd', nome: 'Diego', saldo: 700 }]);
    expect(d.categorias[0]).toEqual({ nome: 'Moradia', valor: 1500 });
    expect(d.pendencias).toEqual({ naoConferidos: 3, aRevisar: 0, semRenda: false });
    expect(d.cartoes).toEqual([{ nome: 'Itaú Azul', total: 900, mario: 600 }]);
  });
});
