import { describe, it, expect } from 'vitest';
import { statusConta, calcularDivisao, DivisaoError, planejarImportacao, chaveEstabelecimento, sugerirCategoria, conferirTotal, contemNumeroCartao, parcelasFuturas, pagoTotalmente } from './regras';
import { lerCodigoBoleto, BoletoError } from './boleto';
import { agruparPorMarcador, textoWhatsApp } from './resumo';
import { parseValorBR, hojeBrasilia } from './formato';

describe('RF-12 status (fórmula da planilha)', () => {
  it('PAGO / FALTA / VERIFICAR / CONFERIR HOJE / AGENDADO', () => {
    expect(statusConta(2800, [{ data: '2026-11-03', valor: 2800 }], '2026-11-25').tipo).toBe('PAGO');
    expect(statusConta(1451.36, [{ data: '2026-11-03', valor: 725.68 }, { data: '2026-11-03', valor: 725.68 }], '2026-11-25').tipo).toBe('PAGO');
    expect(statusConta(100, [{ data: '2026-11-03', valor: 60 }], '2026-11-25')).toMatchObject({ tipo: 'FALTA', diferenca: 40 });
    expect(statusConta(100, [{ data: '2026-11-03', valor: 110 }], '2026-11-25')).toMatchObject({ tipo: 'VERIFICAR', diferenca: 10 });
    expect(statusConta(100, [{ data: '2026-11-25', valor: 100 }], '2026-11-25').tipo).toBe('CONFERIR HOJE');
    expect(statusConta(100, [{ data: '2026-11-30', valor: 100 }], '2026-11-25').tipo).toBe('AGENDADO');
    expect(statusConta(0, [], '2026-11-25').tipo).toBe('PAGO');
    expect(statusConta(36.91, [], '2026-11-25')).toMatchObject({ tipo: 'FALTA', diferenca: 36.91 });
  });
  it('pagoTotalmente', () => {
    expect(pagoTotalmente(100, [{ data: '2026-11-01', valor: 99.99 }])).toBe(false);
    expect(pagoTotalmente(100, [{ data: '2026-11-01', valor: 100 }])).toBe(true);
  });
});

describe('RF-36 divisão (mesma regra do banco)', () => {
  it('50%, 70/30 e centavos ao Mário', () => {
    expect(calcularDivisao(172.79, { tipo: 'pct', partes: [{ pessoa_id: 'd', pct: 50 }] })).toEqual([
      { pessoa_id: 'd', tag_id: null, valor: 86.39 },
      { pessoa_id: null, tag_id: null, valor: 86.4 },
    ]);
    expect(calcularDivisao(100.01, { tipo: 'pct', partes: [{ pessoa_id: 'd', pct: 30 }] }).map((a) => a.valor)).toEqual([30, 70.01]);
  });
  it('entre 2 pessoas, valor fixo e 100%', () => {
    expect(calcularDivisao(90, { tipo: 'pct', partes: [{ pessoa_id: 'a', pct: 33.33 }, { pessoa_id: 'b', pct: 33.33 }] }).map((a) => a.valor)).toEqual([29.99, 29.99, 30.02]);
    expect(calcularDivisao(242.05, { tipo: 'valor', partes: [{ pessoa_id: 'd', valor: 70, tag_id: 's' }] })).toEqual([
      { pessoa_id: 'd', tag_id: 's', valor: 70 },
      { pessoa_id: null, tag_id: null, valor: 172.05 },
    ]);
    expect(calcularDivisao(159, { tipo: 'total', pessoa_id: 'd' })).toEqual([{ pessoa_id: 'd', tag_id: null, valor: 159 }]);
  });
  it('caso 7: soma maior que o valor é recusada', () => {
    expect(() => calcularDivisao(10, { tipo: 'valor', partes: [{ pessoa_id: 'd', valor: 12 }] })).toThrow(DivisaoError);
    expect(() => calcularDivisao(10, { tipo: 'pct', partes: [{ pessoa_id: 'd', pct: 101 }] })).toThrow(/100%/);
  });
  it('estorno negativo', () => {
    expect(calcularDivisao(-33.18, { tipo: 'pct', partes: [{ pessoa_id: 'd', pct: 50 }] }).map((a) => a.valor)).toEqual([-16.59, -16.59]);
  });
});

describe('RF-24/25 planejamento da importação', () => {
  const compras = [{ id: 'c1', chave: chaveEstabelecimento('MERCADOLIVRE MERCADOLI OSASCO'), valor_parcela: 42.51, parcelas_total: 6, descricao: 'MERCADO LIVRE - CASACO', category_id: 'vest', split_rule: { tipo: 'mario' as const } }];
  const projecoes = [
    { id: 'p1', purchase_id: 'c1', parcela_atual: 4, valor: 42.51, descricao: 'MERCADO LIVRE - CASACO' },
    { id: 'p2', purchase_id: 'c9', parcela_atual: 2, valor: 10, descricao: 'Outra' },
  ];
  const r = planejarImportacao(
    [
      { data: '2026-07-28', descricao: 'MERCADOLIVRE MERCADOLI OSASCO', parcelaAtual: 4, parcelasTotal: 6, valor: 42.51 },
      { data: '2026-10-09', descricao: '99Food *Caminito Parril', parcelaAtual: null, parcelasTotal: null, valor: 15.98 },
      { data: '2026-10-01', descricao: 'Google ADS', parcelaAtual: null, parcelasTotal: null, valor: 171.92 },
    ],
    projecoes,
    compras,
    [{ chave: chaveEstabelecimento('Google ADS'), descricao: 'Google ADS - Salão', category_id: 'salao', split_rule: { tipo: 'total', pessoa_id: 'diego', tag_id: 'tag-salao' } }],
    [{ padrao: '99FOOD', category_id: 'delivery' }],
  );
  it('parcela seguinte herda descrição, categoria e divisão e casa a projeção', () => {
    expect(r.linhas[0]).toMatchObject({ descricaoFinal: 'MERCADO LIVRE - CASACO', category_id: 'vest', purchase_id: 'c1', projecao_id: 'p1', origemSugestao: 'parcela anterior' });
  });
  it('regra aprendida e regra de categoria', () => {
    expect(r.linhas[2]).toMatchObject({ descricaoFinal: 'Google ADS - Salão', split_rule: { tipo: 'total', pessoa_id: 'diego' }, origemSugestao: 'regra aprendida' });
    expect(r.linhas[1]).toMatchObject({ category_id: 'delivery', origemSugestao: 'regra de categoria' });
  });
  it('caso 5: projeção sem linha real fica "não encontrada"', () => {
    expect(r.naoEncontradas.map((p) => p.id)).toEqual(['p2']);
  });
  it('parcelas futuras de 1/6', () => {
    expect(parcelasFuturas(1, 6).map((p) => p.parcela)).toEqual([2, 3, 4, 5, 6]);
    expect(parcelasFuturas(6, 6)).toEqual([]);
  });
});

describe('Categorias, total e RF-04', () => {
  it('chave e sugestão', () => {
    expect(chaveEstabelecimento('Azul Linhas Ae 11/12')).toBe('AZUL LINHAS AE');
    expect(sugerirCategoria('99Food *Xique Xique Car', [{ padrao: '99', category_id: 't' }, { padrao: '99FOOD', category_id: 'd' }])).toBe('d');
  });
  it('conferirTotal (RF-26)', () => {
    expect(conferirTotal([{ valor: 10.1 }, { valor: 0.2 }], 10.3)).toMatchObject({ ok: true, diferenca: 0 });
    expect(conferirTotal([{ valor: 10 }], 10.3)).toMatchObject({ ok: false, diferenca: -0.3 });
  });
  it('detecta número de cartão (Luhn) e aceita números comuns', () => {
    expect(contemNumeroCartao('cartão 4111 1111 1111 1111')).toBe(true);
    expect(contemNumeroCartao('IPTU 48033901')).toBe(false);
    expect(contemNumeroCartao('Contrato 2051374590')).toBe(false);
  });
});

describe('RF-15 boleto', () => {
  it('linha digitável Itaú: valor e vencimento (fator após 2025)', () => {
    expect(lerCodigoBoleto('34191757774054240252050484150003115010000405700', new Date('2026-07-01'))).toMatchObject({ tipo: 'bancario', valor: 4057, vencimento: '2026-07-08' });
  });
  it('fator de vencimento escolhe o ciclo mais próximo da data de referência', async () => {
    const { dataDoFator } = await import('./boleto');
    expect(dataDoFator(1000, new Date('2000-07-01'))).toBe('2000-07-03');
    expect(dataDoFator(1000, new Date('2025-02-20'))).toBe('2025-02-22');
  });
  it('dígito errado é recusado (caso 8)', () => {
    expect(() => lerCodigoBoleto('34191757774054240252050484150003115010000405701')).toThrow(BoletoError);
    expect(() => lerCodigoBoleto('123')).toThrow(/47 ou 48/);
  });
  it('boleto sem valor/fator (ex.: fatura Caixa) devolve nulos para preencher', () => {
    const r = lerCodigoBoleto('10498188246200212764527537001110900000000000000');
    expect(r).toMatchObject({ valor: null, vencimento: null });
  });
});

describe('RF-39/39a resumo por pessoa', () => {
  const itens = [
    { data: '2026-10-01', descricao: 'Google ADS', parcela_atual: null, parcelas_total: null, cartao: 'Porto', marcador: 'Salão', valor: 171.92 },
    { data: '2026-11-03', descricao: 'Aluguel SQN 402', parcela_atual: null, parcelas_total: null, cartao: null, marcador: null, valor: 1400 },
    { data: '2026-01-29', descricao: 'AZULVA*N2769', parcela_atual: 10, parcelas_total: 21, cartao: 'Itaú', marcador: null, valor: 86.39 },
  ];
  it('agrupa e subtotaliza', () => {
    const g = agruparPorMarcador(itens);
    expect(g.map((x) => [x.marcador, x.subtotal])).toEqual([[null, 1486.39], ['Salão', 171.92]]);
  });
  it('texto WhatsApp com total, recebido e Pix', () => {
    const t = textoWhatsApp({ pessoa: 'Diego', periodo: 'novembro de 2026', itens, recebido: 1000, pix: 'diego@pix' });
    expect(t).toContain('*Salão*');
    expect(t).toContain('(10/21)');
    expect(t.replace(/ /g, ' ')).toContain('*Total: R$ 1.658,31*');
    expect(t.replace(/ /g, ' ')).toContain('*A pagar: R$ 658,31*');
    expect(t).toContain('Pix: diego@pix');
  });
});

describe('Formatos', () => {
  it('valores e fuso', () => {
    expect(parseValorBR('1.234,56')).toBe(1234.56);
    expect(parseValorBR('358,34C')).toBe(-358.34);
    expect(parseValorBR('abc')).toBeNull();
    expect(hojeBrasilia(new Date('2026-11-26T02:00:00Z'))).toBe('2026-11-25');
  });
});
