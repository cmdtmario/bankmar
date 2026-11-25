import { describe, it, expect } from 'vitest';
import { montarAvisos, diasBrasilia } from '../../supabase/functions/avisos-vencimento/logica';

describe('RF-80 avisos de vencimento', () => {
  const base = { user_id: 'u', tipo: 'conta' as const, descricao: 'Aluguel', valor: 2800, pago: 0 };
  it('avisa na véspera e no dia; não avisa se pago', () => {
    const a = montarAvisos([
      { ...base, id: '1', vencimento: '2026-11-26' },
      { ...base, id: '2', vencimento: '2026-11-25' },
      { ...base, id: '3', vencimento: '2026-11-25', pago: 2800 },
      { ...base, id: '4', vencimento: '2026-11-27' },
    ], '2026-11-25', '2026-11-26');
    expect(a.map((x) => x.referencia)).toEqual(['conta:1:2026-11-26:D-1', 'conta:2:2026-11-25:D0']);
    expect(a[0].titulo).toBe('Vence amanhã: Aluguel');
  });
  it('pagamento parcial ainda avisa com o que falta', () => {
    const [a] = montarAvisos([{ ...base, id: '1', vencimento: '2026-11-25', pago: 1000 }], '2026-11-25', '2026-11-26');
    expect(a.corpo.replace(/ /g, ' ')).toContain('falta R$ 1.800,00');
  });
  it('8h de Brasília = 11h UTC; datas no fuso de Brasília', () => {
    expect(diasBrasilia(new Date('2026-11-25T11:00:00Z'))).toEqual({ hoje: '2026-11-25', amanha: '2026-11-26' });
    expect(diasBrasilia(new Date('2026-12-01T01:00:00Z'))).toEqual({ hoje: '2026-11-30', amanha: '2026-12-01' });
  });
});
