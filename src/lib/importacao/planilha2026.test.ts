// Usa a planilha real do Mário, se presente localmente (não versionada: contém dados pessoais).
// Caminho em PLANILHA_2026 ou ../data/*Contabilidade*.xlsx.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { importarPlanilha2026, totaisDoMes, PESSOA_A_REVISAR } from './planilha2026';

const dir = path.resolve(__dirname, '../../../../data');
const arq = process.env.PLANILHA_2026 ?? (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /Contabilidade/.test(f)).map((f) => path.join(dir, f))[0] : undefined);

describe.skipIf(!arq)('Importação da Contabilidade 2026 (RF-90)', () => {
  let r: ReturnType<typeof importarPlanilha2026>;
  beforeAll(() => { r = importarPlanilha2026(fs.readFileSync(arq!)); });
  it('lê os 12 meses e ignora COFRE, CARTÕES, IRRF e CHURRAS', () => {
    expect(r.meses.map((m) => m.competencia)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}-01`));
    expect(r.ignoradas.filter((i) => i.linha == null).map((i) => i.aba).sort()).toEqual(['CARTÕES', 'CHURRAS - GEAUD', 'COFRE', 'IRRF 2026']);
  });
  it('não leva nenhum dado da aba COFRE nem números de cartão', () => {
    const json = JSON.stringify(r.meses);
    expect(json).not.toMatch(/SENHA APP|Jesse|cmdtmario/i);
    expect(json).not.toMatch(/\d{16}/);
  });
  it('novembro/2026 confere com a planilha', () => {
    const nov = r.meses.find((m) => m.competencia === '2026-11-01')!;
    expect(nov.renda).toBe(31107.09);
    const aluguel = nov.contas.find((c) => c.descricao.startsWith('Aluguel'))!;
    expect(aluguel).toMatchObject({ valor: 2800, vencimento: '2026-11-10', regra: { tipo: 'pct', pessoa: 'Diego', pct: 50 } });
    expect(aluguel.pagamentos).toEqual([{ data: '2026-11-03', banco: 'BB', valor: 2800 }]);
    const cons = nov.contas.find((c) => c.descricao === 'Consórcio')!;
    expect(cons.pagamentos).toHaveLength(2);
    const claroDiego = nov.contas.find((c) => c.descricao.startsWith('Claro Diego'))!;
    expect(claroDiego.regra).toMatchObject({ tipo: 'total', pessoa: 'Diego' });
    const itau = nov.faturas.find((f) => f.cartao === 'ITAU AZUL VISA INFINITY')!;
    expect(itau.totalPlanilha).toBe(2069.1);
    const azul = itau.linhas.find((l) => l.descricao.startsWith('AZULVA'))!;
    expect(azul).toMatchObject({ parcelaAtual: 10, parcelasTotal: 21, valor: 172.79, regra: { tipo: 'pct', pessoa: 'Diego', pct: 50 } });
    const yt = itau.linhas.find((l) => l.descricao.startsWith('Google YouTube'))!;
    expect([yt.parcelaAtual, yt.regra.tipo]).toEqual([null, 'mario']);
    const mp = nov.faturas.find((f) => f.cartao === 'MERCADO PAGO')!;
    expect(mp.linhas.find((l) => l.descricao.startsWith('Perfumes'))!.regra).toMatchObject({ tipo: 'valor', pessoa: 'Diego', valor: 70, marcador: 'Salão' });
    expect(mp.linhas.find((l) => l.descricao === 'Chaleira')!.regra).toMatchObject({ tipo: 'total', pessoa: 'Diego' });
  });
  it('a parte do Mário de cada fatura bate com a coluna "Total Mário" quando a planilha é consistente', () => {
    const nov = r.meses.find((m) => m.competencia === '2026-11-01')!;
    const itau = nov.faturas.find((f) => f.cartao === 'ITAU AZUL VISA INFINITY')!;
    const mario = itau.linhas.reduce((a, l) => a + Math.round(l.valorMario * 100), 0) / 100;
    expect(mario).toBe(1950.21);
    expect(Math.abs(mario - itau.totalMarioPlanilha)).toBeLessThan(0.01);
  });
  it('relatório de conferência: totais por mês e divergências da própria planilha', () => {
    for (const m of r.meses) {
      const t = totaisDoMes(m);
      const div = r.divergencias.filter((d) => d.aba === m.aba);
      const ajuste = div.reduce((a, d) => a + Math.round(d.diferenca * 100), 0) / 100;
      // soma das faturas importadas = soma dos totais da planilha + divergências apontadas
      expect(Math.abs(Math.round((t.faturas - t.faturasPlanilha - ajuste) * 100))).toBe(0);
    }
    console.log('Divergências da planilha:', r.divergencias.length, r.divergencias.slice(0, 5));
    console.log('Pessoas:', r.pessoas, 'A revisar presente:', r.pessoas.includes(PESSOA_A_REVISAR));
    console.log('Cartões:', r.cartoes.length, r.cartoes.filter((c) => c.ativo).length, 'ativos');
  });
});
