import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import { cpfsUsados, custoMilheiro, lerControleMilhas, lucroVenda, pontosPrevistos, cashbackRenunciado, saldoImportado, transferencia } from './milhas';

describe('Cálculos de milhas', () => {
  it('pontos previstos e cashback renunciado da fatura (RF-52, RF-54)', () => {
    expect(pontosPrevistos(8200.5, 3)).toBe(24602);
    expect(cashbackRenunciado(8200.5, 1)).toBe(82.01);
  });
  it('custo do milheiro e lucro de venda (RF-54, RF-55)', () => {
    expect(custoMilheiro(1500, 100000)).toBe(15);
    expect(lucroVenda(750, 30000, 15)).toBe(300);
  });
  it('transferência com bônus leva o custo e não aceita saldo insuficiente (RF-53)', () => {
    expect(transferencia(10000, 110, 50000, 20)).toEqual({ sai: 10000, entra: 10000, bonus: 11000, custo: 200 });
    expect(() => transferencia(60000, 0, 50000, 20)).toThrow('Saldo insuficiente');
  });
  it('CPFs usados no ano civil e em 12 meses (RF-56)', () => {
    const itens = [{ data: '2025-12-20', cpfs: 3 }, { data: '2026-03-01', cpfs: 2 }, { data: '2026-11-01', cpfs: 1 }];
    expect(cpfsUsados('ano_civil', '2026-11-27', itens)).toBe(3);
    expect(cpfsUsados('12_meses', '2026-11-27', itens)).toBe(6);
  });
});

const ARQ = '/mnt/user-data/uploads/13cffcba-Controle_Milhas.xlsx';
describe.runIf(fs.existsSync(ARQ))('Controle_Milhas.xlsx real (RF-92)', () => {
  let r: ReturnType<typeof lerControleMilhas>;
  beforeAll(() => { r = lerControleMilhas(fs.readFileSync(ARQ), '2026-11-27'); });
  it('saldos batem com os da planilha', () => {
    for (const k of ['Smiles|Mário', 'TudoAzul|Mário', 'Smiles|Diego', 'Copa|Mário']) {
      const c = r.contas.find((x) => x.chave === k)!;
      expect(saldoImportado(r, k).saldo, k).toBeCloseTo(c.saldoPlanilha!, 1);
    }
  });
  it('não lê a aba de CPFs nem guarda observações com contatos', () => {
    expect(r.avisos.some((a) => /Dados_CPFs/.test(a))).toBe(true);
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/\d{2}\s?9?\d{4}-\d{4}/);   // telefones das observações de venda
    expect(json).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });
  it('vendas em milhares viram milhas e emissões do gerador vêm com cashback', () => {
    expect(r.vendas.find((v) => v.data === '2024-06-25')!.quantidade).toBe(24840);
    expect(r.emissoes.length).toBeGreaterThan(20);
    expect(r.emissoes.every((e) => e.milhas == null)).toBe(true);
  });
});
