import { describe, it, expect } from 'vitest';
import itauFix from './__fixtures__/itau-azul-2026-07.json';
import caixaFix from './__fixtures__/caixa-2026-08.json';
import { lerItau } from './itau';
import { lerCaixa } from './caixa';
import { lerFatura } from './index';
import { lerTextoTabular } from './texto';
import { separarParcela, inferirData } from './comum';
import { somaCentavos } from '../formato';
import { LeitorError, type TextItem } from './tipos';

const soma = (ls: { valor: number }[]) => somaCentavos(ls.map((l) => l.valor));

describe('Leitor Itaú (amostra Itaú Azul Infinite, venc. 08/07/2026)', () => {
  const f = lerItau(itauFix as TextItem[]);
  it('lê cabeçalho sem dados pessoais (RF-21a)', () => {
    expect(f.vencimento).toBe('2026-07-08');
    expect(f.final4).toBe('2781');
    expect(f.totalEsperado).toBe(4057.0);
    expect(JSON.stringify(f)).not.toMatch(/TITULAR|ENDERECO|000\.000\.000/);
  });
  it('soma das linhas confere com o total impresso (RF-26)', () => {
    expect(soma(f.linhas)).toBe(4057.0);
  });
  it('não importa pagamentos nem "próximas faturas"', () => {
    expect(f.linhas.some((l) => /PAGAMENTO/i.test(l.descricao))).toBe(false);
    // ZARA aparece 01/02 nesta fatura e 02/02 em "próximas faturas": só a 01/02 entra
    expect(f.linhas.filter((l) => l.descricao.startsWith('ZARA')).map((l) => l.parcelaAtual)).toEqual([1]);
  });
  it('separa parcela e infere o ano da compra', () => {
    const azul = f.linhas.find((l) => l.descricao === 'AZULCLFQGT')!;
    expect([azul.parcelaAtual, azul.parcelasTotal, azul.data]).toEqual([12, 12, '2025-07-25']);
    const samsung = f.linhas.find((l) => l.descricao.startsWith('EC*SAMSUNG'))!;
    expect([samsung.parcelaAtual, samsung.parcelasTotal, samsung.data, samsung.valor]).toEqual([5, 18, '2026-02-26', 459.76]);
  });
  it('mantém estornos negativos (RF-27)', () => {
    expect(f.linhas.find((l) => l.descricao === 'UNIDAS LOCADORA SA')!.valor).toBe(-0.01);
  });
  it('recusa PDF de outro banco sem importar nada (caso 1)', () => {
    expect(() => lerItau(caixaFix as TextItem[])).toThrow(LeitorError);
  });
});

describe('Leitor Caixa (amostra Caixa Visa/Elo, venc. 08/08/2026)', () => {
  const f = lerCaixa(caixaFix as TextItem[]);
  it('lê cabeçalho', () => {
    expect(f.vencimento).toBe('2026-08-08');
    expect(f.final4).toBe('4570');
    expect(f.totalEsperado).toBe(2197.44);
  });
  it('soma das linhas confere com o total impresso (RF-26)', () => {
    expect(soma(f.linhas)).toBe(2197.44);
    expect(f.linhas).toHaveLength(8);
  });
  it('trata crédito, parcela e compra internacional', () => {
    expect(f.linhas.find((l) => l.descricao.startsWith('IOF Zero'))!.valor).toBe(-42.77);
    const af = f.linhas.find((l) => l.descricao.startsWith('AF INTERNET'))!;
    expect([af.parcelaAtual, af.parcelasTotal, af.valor]).toEqual([1, 4, 623.14]);
    expect(f.linhas.find((l) => l.descricao.startsWith('PTL*'))!.valor).toBe(1207.22);
  });
  it('ignora saldo anterior e pagamento', () => {
    expect(f.linhas.some((l) => /ANTERIOR|OBRIGADO/.test(l.descricao))).toBe(false);
  });
});

describe('Escolha do leitor por emissor', () => {
  it('usa o leitor do emissor do cartão', () => {
    expect(lerFatura('itau', itauFix as TextItem[]).emissor).toBe('itau');
    expect(() => lerFatura('caixa', itauFix as TextItem[])).toThrow(/Caixa não reconheceu/);
    expect(lerFatura('outro', caixaFix as TextItem[]).emissor).toBe('generico');
  });
});

describe('Plano B — texto tabular (RF-22)', () => {
  it('aceita tabela markdown do ChatGPT', () => {
    const r = lerTextoTabular(`| Data | Descrição | Parcela | De | Valor |
|---|---|---|---|---|
| 29/01/2026 | AZULVA*N2769c8d201 TURISMO | 10 | 21 | 172,79 |
| 09/10/2026 | 99Food *Caminito | 1 | 1 | R$ 15,98 |
| 12/10/2026 | Estorno Drogaria | | | -33,18 |`);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(3);
    expect(r.linhas[0]).toEqual({ data: '2026-01-29', descricao: 'AZULVA*N2769c8d201 TURISMO', parcelaAtual: 10, parcelasTotal: 21, valor: 172.79 });
    expect(r.linhas[2]).toMatchObject({ parcelaAtual: null, valor: -33.18 });
  });
  it('aceita CSV com ponto e vírgula e TAB e aponta linhas inválidas', () => {
    const r = lerTextoTabular('data;descricao;parcela;total;valor\n05/11/2026;Mercado;1;1;1.234,56\n31/02/2026;Data ruim;1;1;10,00\n05/11/2026\tPadaria\t\t\t12,00');
    expect(r.linhas.map((l) => l.valor)).toEqual([1234.56, 12]);
    expect(r.erros[0]).toMatch(/linha 3/);
  });
  it('texto vazio não importa nada', () => {
    expect(() => lerTextoTabular('   ')).toThrow(LeitorError);
  });
});

describe('Utilidades', () => {
  it('separarParcela', () => {
    expect(separarParcela('Lyra *A 02/12')).toEqual({ descricao: 'Lyra *A', atual: 2, total: 12 });
    expect(separarParcela('PG *NIO FIBRARIO DE JAN')).toEqual({ descricao: 'PG *NIO FIBRARIO DE JAN', atual: null, total: null });
  });
  it('inferirData recua ano de parcela antiga', () => {
    expect(inferirData('10/07', '2026-08-08', 14)).toBe('2025-07-10');
    expect(inferirData('09/12', '2027-01-10', null)).toBe('2026-12-09');
  });
});

import { lerGenerico } from './generico';
describe('Leitor genérico (cartões sem leitor próprio)', () => {
  it('lê a fatura da Caixa sem conhecer o layout e confere com o leitor próprio', () => {
    const g = lerGenerico(caixaFix as TextItem[]);
    expect([g.vencimento, g.linhas.length, soma(g.linhas)]).toEqual(['2026-08-08', 8, 2197.44]);
  });
  it('não mistura colunas nem lê parcelas de faturas futuras (Itaú em duas colunas)', () => {
    const g = lerGenerico(itauFix as TextItem[]);
    expect(g.linhas.length).toBeGreaterThanOrEqual(38);
    expect(g.linhas.some((l) => /Limite de cr/i.test(l.descricao))).toBe(false);
    expect(g.linhas.find((l) => l.descricao === 'AZULCLFQGT')?.parcelaAtual).toBe(12);
  });
  it('formato com mês por extenso, crédito negativo, dólar + real e "Parcela x/y"', () => {
    const t = (y: number, ...partes: [number, string][]) => partes.map(([x, s]) => ({ p: 1, x, y, s }));
    const itens: TextItem[] = [
      ...t(40, [20, 'Data de vencimento'], [200, '15 DEZ 2026']),
      ...t(60, [20, 'Total desta fatura'], [200, 'R$ 1.234,56']),
      ...t(100, [20, '03 NOV'], [80, 'Mercado Livre - Parcela 2/6'], [400, 'R$ 150,00']),
      ...t(115, [20, '05 NOV'], [80, 'Estorno de compra'], [400, '−R$ 20,00']),
      ...t(130, [20, '07 NOV'], [80, 'Netflix.com USD 10,00'], [330, '10,00'], [400, '55,90']),
      ...t(145, [20, '10 NOV'], [80, 'Pagamento recebido'], [400, '−R$ 900,00']),
    ];
    const g = lerGenerico(itens);
    expect(g.vencimento).toBe('2026-12-15');
    expect(g.totalEsperado).toBe(1234.56);
    expect(g.linhas.map((l) => [l.data, l.descricao, l.parcelaAtual, l.valor])).toEqual([
      ['2026-11-03', 'Mercado Livre', 2, 150], ['2026-11-05', 'Estorno de compra', null, -20], ['2026-11-07', 'Netflix.com USD 10,00', null, 55.9],
    ]);
  });
});
