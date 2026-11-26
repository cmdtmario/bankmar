import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { lerArquivoB3, codigoBase, ArquivoB3Error, type Negociacao, type Movimentacao, type Posicao } from './b3';
import { calcularCustos, extrairProventos, consolidar, criarAgrupador } from './carteira';

describe('Regras do motor (sintético)', () => {
  const neg = (data: string, tipo: 'Compra' | 'Venda', q: number, preco: number, codigo = 'PETR4'): Negociacao => ({ data, tipo, mercado: '', instituicao: 'INTER DTVM', codigo, quantidade: q, preco, valor: q * preco, chave: data + tipo });
  const mov = (data: string, tipo: string, q: number, entrada = true, valor: number | null = null, codigo = 'PETR4'): Movimentacao => ({ data, entrada, tipo, produto: `${codigo} - X`, codigo, instituicao: 'INTER', quantidade: q, preco: null, valor, chave: data + tipo });
  it('preço médio, venda e resultado', () => {
    const c = calcularCustos([neg('2024-01-01', 'Compra', 10, 30), neg('2024-02-01', 'Compra', 10, 40), neg('2024-03-01', 'Venda', 5, 50)], []).get('PETR4')!;
    expect(c.quantidade).toBe(15);
    expect(c.pm).toBe(35);
    expect(c.vendas[0]).toMatchObject({ custo: 175, resultado: 75, dayTrade: false });
  });
  it('desdobro mantém o custo; grupamento usa a quantidade resultante; bonificação soma custo', () => {
    const c = calcularCustos([neg('2024-01-01', 'Compra', 10, 90, 'PORD11')], [mov('2024-04-08', 'Desdobro', 90, true, null, 'PORD11')]).get('PORD11')!;
    expect([c.quantidade, c.custo, c.pm]).toEqual([100, 900, 9]);
    const g = calcularCustos([neg('2024-01-01', 'Compra', 100, 3, 'TORD11')], [mov('2025-06-06', 'Grupamento', 33.33, true, null, 'TORD11')]).get('TORD11')!;
    expect(g.quantidade).toBe(33.33);
    const b = calcularCustos([neg('2024-01-01', 'Compra', 100, 10, 'KLBN11')], [mov('2024-05-08', 'Bonificação em Ativos', 10, true, 50, 'KLBN11')]).get('KLBN11')!;
    expect([b.quantidade, b.custo]).toEqual([110, 1050]);
  });
  it('day trade e evento sem custo', () => {
    const c = calcularCustos([neg('2024-01-01', 'Compra', 10, 10), neg('2024-01-01', 'Venda', 10, 11)], [mov('2024-02-01', 'Atualização', 5)]).get('PETR4')!;
    expect(c.vendas[0].dayTrade).toBe(true);
    expect(c.eventosSemCusto).toEqual(['2024-02-01 atualização']);
  });
  it('proventos: tipos e cancelamento', () => {
    const p = extrairProventos([mov('2024-01-10', 'Rendimento', 10, true, 9.9, 'MXRF11'), mov('2024-01-11', 'Rendimento - Cancelado', 10, false, 9.9, 'MXRF11'), mov('2024-01-12', 'Juros Sobre Capital Próprio', 10, true, 5), mov('2024-01-13', 'Transferência - Liquidação', 10, true, 100)]);
    expect(p.map((x) => [x.tipo, x.valor])).toEqual([['rendimento', 9.9], ['rendimento', -9.9], ['jcp', 5]]);
  });
  it('consolidação: ajuste manual tem prioridade; histórico incompleto não inventa PM', () => {
    const pos: Posicao[] = [{ classe: 'acao', codigo: 'PETR4', produto: 'PETR4 - PETROBRAS', instituicao: 'INTER DTVM', cnpj: null, isin: null, emissor: null, indexador: null, vencimento: null, quantidade: 52, preco: 40, valor: 2080, valorAplicado: null }];
    const custos = calcularCustos([neg('2024-01-01', 'Compra', 54, 30)], []);
    const [a] = consolidar({ posicoes: pos, custos, ajustes: [], proventos: [], cotacoes: new Map(), dataPosicao: '2026-11-25', agrupar: criarAgrupador([]) });
    expect([a.custoCompleto, a.pm, a.mercado, a.instituicoes]).toEqual([false, null, 2080, ['Inter']]);
    const [b] = consolidar({ posicoes: pos, custos, ajustes: [{ codigo: 'PETR4', preco_medio: 30, preco_alvo: 39 }], proventos: [], cotacoes: new Map([['PETR4', { preco: 41, data: '2026-11-26' }]]), dataPosicao: null, agrupar: criarAgrupador([]) });
    expect([b.pm, b.origemPm, b.mercado, b.resultado, b.atingiuAlvo]).toEqual([30, 'ajuste manual', 2132, 572, true]);
  });
  it('código fracionário', () => { expect(codigoBase('B3SA3F')).toBe('B3SA3'); expect(codigoBase('HGLG11')).toBe('HGLG11'); });
  it('arquivo desconhecido é rejeitado inteiro (caso 10)', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['A', 'B'], [1, 2]]), 'X');
    expect(() => lerArquivoB3(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))).toThrow(ArquivoB3Error);
  });
});

// Arquivos reais do Mário (não versionados): pulam se não existirem.
const U = '/mnt/user-data/uploads/';
const arq = (p: string) => (fs.existsSync(U) ? fs.readdirSync(U).find((f) => f.includes(p) && f.endsWith('.xlsx') && /2026-11-25-10-5/.test(f)) : undefined);
const fNeg = arq('negociacao'), fMov = arq('movimentacao'), fPos = arq('posicao');
describe.skipIf(!fNeg || !fMov || !fPos)('Arquivos reais da B3', () => {
  const ler = (f: string) => lerArquivoB3(fs.readFileSync(U + f));
  it('lê os quatro tipos e consolida', () => {
    const n = ler(fNeg!), m = ler(fMov!), p = ler(fPos!);
    expect([n.tipo, m.tipo, p.tipo]).toEqual(['negociacao', 'movimentacao', 'posicao']);
    expect(n.linhas.length).toBe(1822);
    expect(m.linhas.length).toBe(5463);
    expect(new Set(n.linhas.map((x) => x.chave)).size).toBe(n.linhas.length);
    expect(new Set(m.linhas.map((x) => x.chave)).size).toBe(m.linhas.length);
    const custos = calcularCustos(n.linhas as Negociacao[], m.linhas as Movimentacao[]);
    const prov = extrairProventos(m.linhas as Movimentacao[]);
    const ativos = consolidar({ posicoes: p.linhas as Posicao[], custos, ajustes: [], proventos: prov, cotacoes: new Map(), dataPosicao: '2026-11-25', agrupar: criarAgrupador([]) });
    const completos = ativos.filter((a) => a.custoCompleto).length;
    const totalProv = prov.reduce((a, x) => a + x.valor, 0);
    console.log(`ativos ${ativos.length}, custo completo ${completos}, proventos R$ ${totalProv.toFixed(2)}, patrimônio R$ ${ativos.reduce((a, x) => a + x.mercado, 0).toFixed(2)}`);
    expect(ativos.length).toBeGreaterThan(50);
    expect(totalProv).toBeGreaterThan(1000);
  });
});

import { recortar } from './carteira';
describe('Recorte por instituição', () => {
  it('quantidade, valor e custo só da parte na instituição; PM é o da carteira', () => {
    const a = { codigo: 'PETR4', classe: 'acao', nome: 'Petrobras', instituicoes: ['Inter', 'Nubank'], quantidade: 200, pm: 30, origemPm: 'histórico B3', custoCompleto: true,
      investido: 6000, preco: 40, dataPreco: null, mercado: 8000, resultado: 2000, resultadoPct: 1 / 3, proventos: 500, retornoTotal: 2500, alvo: null, atingiuAlvo: false, cnpj: null,
      porInstituicao: [{ instituicao: 'Inter', quantidade: 120, valor: 4800 }, { instituicao: 'Nubank', quantidade: 80, valor: 3200 }] } as const;
    const r = recortar(a as never, 'Nubank')!;
    expect([r.quantidade, r.mercado, r.investido, r.resultado, r.pm]).toEqual([80, 3200, 2400, 800, 30]);
    expect(recortar(a as never, 'XP')).toBeNull();
  });
});
