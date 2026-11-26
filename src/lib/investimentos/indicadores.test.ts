import { describe, it, expect } from 'vitest';
import { calcular, resumoDecisao } from './indicadores';
import type { Ativo } from './carteira';

const base: Ativo = {
  codigo: 'HGLG11', classe: 'fii', nome: 'CSHG Log', instituicoes: ['Inter'], quantidade: 100, pm: 160, origemPm: 'histórico B3', custoCompleto: true,
  investido: 16000, preco: 150, dataPreco: '2026-11-26', mercado: 15000, resultado: -1000, resultadoPct: -0.0625, proventos: 1200, retornoTotal: 200,
  alvo: 170, atingiuAlvo: false, cnpj: null,
};
const provs = [
  { data: '2026-10-15', codigo: 'HGLG11', tipo: 'rendimento' as const, valor: 110, instituicao: 'Inter' },
  { data: '2026-09-15', codigo: 'HGLG11', tipo: 'rendimento' as const, valor: 110, instituicao: 'Inter' },
  { data: '2024-01-15', codigo: 'HGLG11', tipo: 'rendimento' as const, valor: 980, instituicao: 'Inter' },
];

describe('Indicadores do ativo', () => {
  const i = calcular(base, provs, { preco: 150, anterior: 148, data: '2026-11-26' }, 60000, [{ data: '2026-03-01', preco: 140 }, { data: '2026-06-01', preco: 165 }], '2026-11-26');
  it('variação do dia e desde a entrada', () => {
    expect(i.varDia).toBeCloseTo(150 / 148 - 1);
    expect(i.varDiaValor).toBe(200);
    expect(i.varEntrada).toBeCloseTo(-0.0625);
  });
  it('proventos, retorno total e preço de equilíbrio', () => {
    expect(i.proventosTotal).toBe(1200);
    expect(i.proventos12m).toBe(220);
    expect(i.retornoTotal).toBe(200);
    expect(i.equilibrio).toBe(148); // (16000 − 1200) / 100
    expect(i.yoc).toBeCloseTo(220 / 16000);
    expect(i.dy12m).toBeCloseTo(2.2 / 150);
    expect(i.numeroMagico).toBe(Math.ceil(150 / (2.2 / 12)));
    expect(i.peso).toBe(0.25);
    expect([i.minimo52, i.maximo52]).toEqual([140, 165]);
  });
  it('texto de decisão mostra prejuízo de preço compensado pelos proventos', () => {
    const t = resumoDecisao(base, i, 150).join(' ').replace(/\u00a0/g, ' ');
    expect(t).toContain('prejuízo de 6,3% (−R$ 1.000,00)');
    expect(t).toContain('Os proventos já cobrem a queda do preço.');
    expect(t).toContain('acima de R$ 148,00');
  });
  it('sem preço médio pede o dado em vez de inventar resultado', () => {
    const s = calcular({ ...base, pm: null, investido: null }, provs, undefined, 60000, [], '2026-11-26');
    expect(s.retornoTotal).toBeNull();
    expect(resumoDecisao({ ...base, pm: null }, s, 150)[0]).toContain('Sem preço médio');
  });
});
