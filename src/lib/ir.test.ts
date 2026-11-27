import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { categoriaDe, lerAbaIrrf, montarRelatorio, rendaVariavel, resumoAnual, CODIGOS_PADRAO } from './ir';
import type { Negociacao, Movimentacao, Posicao } from './investimentos/b3';
import { lerArquivoB3 } from './investimentos/b3';
import { criarAgrupador, extrairProventos } from './investimentos/carteira';

describe('Resumo anual (RF-76)', () => {
  it('compara PGBL com 12% da renda tributável', () => {
    const r = resumoAnual(
      [{ competencia: '2026-01-01', recebido_em: null, salario_liquido: 10000, ferias_terco: null, inss_folha: 900, inss_ferias: null, ir_folha: 2000, ir_ferias: null, ir_vinculo_unico: null, plano_saude: 200, odontologico: null, ensino: null, medico_fora: null, obs_medico: null }],
      [{ competencia: '2026-01-01', plano: 'Porto', tipo: 'PGBL', valor: 1000 }, { competencia: '2026-02-01', plano: 'Porto', tipo: 'PGBL', valor: 500 }], 20000);
    expect([r.pgbl, r.limitePgbl, r.faltaPgbl, r.rendaEstimada]).toEqual([1500, 2400, 900, 12900]);
  });
});

describe('Renda variável (RF-78c)', () => {
  const cat = (c: string) => categoriaDe(c, new Map([['HGLG11', 'fii'], ['BOVA11', 'etf']]));
  it('vendas de ações até R$ 20 mil no mês são isentas; prejuízo compensa ganhos seguintes', () => {
    const m = rendaVariavel([
      { data: '2026-01-10', codigo: 'PETR4', quantidade: 100, valor: 15000, resultado: 3000, dayTrade: false }, // isento
      { data: '2026-02-10', codigo: 'VALE3', quantidade: 100, valor: 30000, resultado: -2000, dayTrade: false }, // prejuízo
      { data: '2026-03-10', codigo: 'ITUB4', quantidade: 100, valor: 25000, resultado: 5000, dayTrade: false }, // tributa 3000
      { data: '2026-03-12', codigo: 'HGLG11', quantidade: 10, valor: 1600, resultado: 100, dayTrade: false },  // FII 20%
    ], cat, 2026);
    expect(m[0].isento).toBe(true);
    expect(m[0].comum.imposto).toBe(0);
    expect(m[1].prejuizo.comum).toBe(2000);
    expect(m[2].comum).toEqual({ resultado: 5000, compensado: 2000, base: 3000, imposto: 450 });
    expect(m[2].fii.imposto).toBe(20);
    expect(m[2].darf).toBe(470);
  });
  it('day trade separado a 20% e DARF abaixo de R$ 10 acumula', () => {
    const m = rendaVariavel([
      { data: '2026-04-10', codigo: 'PETR4', quantidade: 10, valor: 400, resultado: 30, dayTrade: true },
      { data: '2026-05-10', codigo: 'PETR4', quantidade: 10, valor: 400, resultado: 30, dayTrade: true },
    ], cat, 2026);
    expect([m[0].day.imposto, m[0].darf, m[0].acumuladoDarf]).toEqual([6, 0, 6]);
    expect(m[1].darf).toBe(12);
  });
  it('ETF não tem isenção dos R$ 20 mil', () => {
    const m = rendaVariavel([{ data: '2026-06-10', codigo: 'BOVA11', quantidade: 10, valor: 1300, resultado: 100, dayTrade: false }], cat, 2026);
    expect(m[0].comum.imposto).toBe(15);
  });
});

describe('Relatório por ficha (RF-78)', () => {
  const negs: Negociacao[] = [
    { data: '2025-03-10', tipo: 'Compra', mercado: 'Vista', instituicao: 'INTER DTVM', codigo: 'PETR4', quantidade: 100, preco: 30, valor: 3000, chave: 'a' },
    { data: '2026-05-10', tipo: 'Compra', mercado: 'Vista', instituicao: 'INTER DTVM', codigo: 'PETR4', quantidade: 100, preco: 40, valor: 4000, chave: 'b' },
  ];
  const movs: Movimentacao[] = [
    { data: '2026-06-01', entrada: true, tipo: 'Dividendo', produto: 'PETR4 - PETROBRAS', codigo: 'PETR4', instituicao: 'INTER DTVM', quantidade: 200, preco: null, valor: 150, chave: 'm1' },
    { data: '2026-07-01', entrada: true, tipo: 'Juros Sobre Capital Próprio', produto: 'PETR4 - PETROBRAS', codigo: 'PETR4', instituicao: 'INTER DTVM', quantidade: 200, preco: null, valor: 80, chave: 'm2' },
  ];
  const posicoes: Posicao[] = [{ classe: 'acao', codigo: 'PETR4', produto: 'PETR4 - PETROBRAS PN', instituicao: 'INTER DTVM', cnpj: '33000167000101', isin: null, emissor: null, indexador: null, vencimento: null, quantidade: 200, preco: 38, valor: 7600, valorAplicado: null }];
  const r = montarRelatorio({ ano: 2026, negs, movs, posicoes, dataPosicao: '2026-12-30', ajustes: [], manuais: [], mensal: [], previdencia: [], agrupar: criarAgrupador([]) });
  it('bens pelo custo de aquisição em 31/12 dos dois anos, com código e CNPJ', () => {
    const b = r.itens.find((i) => i.chave === 'bem:PETR4')!;
    expect([b.grupo, b.codigo, b.anterior, b.atual, b.cnpj]).toEqual(['03', '01', 3000, 7000, '33.000.167/0001-01']);
    expect(b.discriminacao).toContain('200 ações de PETR4');
  });
  it('proventos do ano batem com a Movimentação e vão para a ficha certa', () => {
    const div = r.itens.find((i) => i.chave === 'rend:PETR4:dividendo')!;
    const jcp = r.itens.find((i) => i.chave === 'rend:PETR4:jcp')!;
    expect([div.codigo, div.rendimento, jcp.codigo, jcp.ficha]).toEqual(['09', 150, '10', CODIGOS_PADRAO.exclusivo_jcp.ficha]);
    expect(r.proventos.reduce((s, p) => s + p.valor, 0)).toBe(230);
  });
});

const PLANILHA = '/home/claude/data/project-file-57972fb7-f6c6-4c8e-a1e5-3b72ae0763a7-Contabilidade_BanKMar_-_2026-71e84654.xlsx';
describe.runIf(fs.existsSync(PLANILHA))('Aba IRRF 2026 real (RF-93)', () => {
  it('lê os 13 meses e os totais batem com a linha TOTAL', () => {
    const r = lerAbaIrrf(fs.readFileSync(PLANILHA));
    expect(r.ano).toBe(2026);
    expect(r.mensal.length).toBe(13);
    const soma = (k: 'salario_liquido' | 'ferias_terco' | 'inss_folha' | 'inss_ferias' | 'ir_folha' | 'ir_ferias') => Math.round(r.mensal.reduce((s, m) => s + (m[k] ?? 0), 0) * 100) / 100;
    expect(soma('salario_liquido') + soma('ferias_terco')).toBeCloseTo(217454.89, 1); // o TOTAL da planilha soma líquido + férias
    expect(soma('inss_folha') + soma('inss_ferias')).toBeCloseTo(11820.39, 1);
    expect(soma('ir_folha') + soma('ir_ferias')).toBeCloseTo(49999.76, 1);
    expect(r.previdencia.some((p) => p.plano === 'PORTO' && p.valor === 300)).toBe(true);
  });
});

const U = '/mnt/user-data/uploads/';
describe.runIf(fs.existsSync(U + '1ef58c99-movimentacao-2026-11-25-10-43-21.xlsx'))('Proventos reais (RF-77)', () => {
  it('total por tipo no relatório = soma da Movimentação do ano', () => {
    const movs = [...(lerArquivoB3(fs.readFileSync(U + '1ef58c99-movimentacao-2026-11-25-10-43-21.xlsx')) as { linhas: Movimentacao[] }).linhas];
    const r = montarRelatorio({ ano: 2025, negs: [], movs, posicoes: [], dataPosicao: null, ajustes: [], manuais: [], mensal: [], previdencia: [], agrupar: criarAgrupador([]) });
    const esperado = extrairProventos(movs).filter((p) => p.data.startsWith('2025')).reduce((s, p) => s + p.valor, 0);
    const noRelatorio = r.itens.filter((i) => i.chave.startsWith('rend:')).reduce((s, i) => s + (i.rendimento ?? 0), 0);
    // Itens com total negativo no ano (só estornos) não entram; aqui não deve haver nenhum.
    expect(noRelatorio).toBeCloseTo(esperado, 1);
  });
});
