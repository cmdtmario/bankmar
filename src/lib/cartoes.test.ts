import { describe, it, expect } from 'vitest';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { acessosVip, cicloVip, diffTexto, lerAbaCartoes, progressoIsencao, textoDaPagina } from './cartoes';

describe('Sala VIP (RF-47)', () => {
  it('ciclo avança a renovação anual e zera o contador', () => {
    expect(cicloVip('2025-12-31', '2026-11-27')).toEqual({ inicio: '2025-12-31', fim: '2026-12-31' });
    expect(cicloVip('2026-11-03', '2026-11-27')).toEqual({ inicio: '2026-11-03', fim: '2027-11-03' });
  });
  it('usei desconta um acesso; na renovação volta ao total', () => {
    const usos = [{ data: '2026-05-10' }, { data: '2026-11-20' }];
    expect(acessosVip(4, '2026-07-04', usos, '2026-11-27').disponiveis).toBe(3);   // só o de 20/11 está no ciclo
    expect(acessosVip(4, '2026-07-04', usos, '2027-07-05').disponiveis).toBe(4);   // renovou
    expect(acessosVip(999, null, usos, '2026-11-27').ilimitado).toBe(true);
  });
});

describe('Isenção de anuidade (RF-46)', () => {
  const faturas = [{ competencia: '2026-09-01', total: 7000 }, { competencia: '2026-10-01', total: 9000 }, { competencia: '2026-11-01', total: 8200 }];
  it('gasto mensal usa a última fatura', () => {
    const p = progressoIsencao({ tipo: 'gasto_mensal', meta: 8000, meses: null, ate: null, observacao: null }, faturas, null, '2026-11-27');
    expect([p.atual, p.atingida]).toEqual([8200, true]);
  });
  it('gasto no período soma os meses', () => {
    const p = progressoIsencao({ tipo: 'gasto_periodo', meta: 30000, meses: 3, ate: null, observacao: null }, faturas, null, '2026-11-27');
    expect([p.atual, p.atingida]).toEqual([24200, false]);
  });
  it('investido e promocional', () => {
    expect(progressoIsencao({ tipo: 'investido', meta: 50000, meses: null, ate: null, observacao: null }, [], 62000, '2026-11-27').atingida).toBe(true);
    expect(progressoIsencao({ tipo: 'promocional', meta: null, meses: null, ate: '2026-11-30', observacao: null }, [], null, '2026-11-27').texto).toContain('3 dias');
  });
});

describe('Página de benefícios (RF-48)', () => {
  it('extrai texto sem scripts e aponta o que mudou', () => {
    const a = textoDaPagina('<html><script>var x=1</script><p>Sala VIP: 4 acessos por ano.</p><p>Pontos: 2,5 por dólar.</p></html>');
    const b = textoDaPagina('<p>Sala VIP: 2 acessos por ano.</p><p>Pontos: 2,5 por dólar.</p>');
    expect(a).not.toContain('var x');
    expect(diffTexto(a, b)).toEqual({ removidas: ['Sala VIP: 4 acessos por ano.'], adicionadas: ['Sala VIP: 2 acessos por ano.'] });
  });
});

const PLANILHA = '/home/claude/data/project-file-57972fb7-f6c6-4c8e-a1e5-3b72ae0763a7-Contabilidade_BanKMar_-_2026-71e84654.xlsx';
describe.runIf(fs.existsSync(PLANILHA))('Aba CARTÕES real (RF-91)', () => {
  it('lê os cartões sem tocar em número, validade ou código', () => {
    const { cartoes } = lerAbaCartoes(fs.readFileSync(PLANILHA));
    expect(cartoes.length).toBeGreaterThan(15);
    const json = JSON.stringify(cartoes);
    expect(json).not.toMatch(/\d{13,19}/);           // nenhum número de cartão
    // nada das colunas de número, validade e código (O a Q) chega ao resultado
    const ws = XLSX.read(fs.readFileSync(PLANILHA), { type: 'buffer' }).Sheets['CARTÕES'];
    const proibidos = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '' }).slice(1)
      .flatMap((r) => r.slice(14, 17)).map((v) => String(v).trim()).filter((v) => v && !/cancel/i.test(v));
    expect(proibidos.length).toBeGreaterThan(3);
    for (const v of proibidos) expect(json).not.toContain(v);
    const latam = cartoes.find((c) => /LATAM/.test(c.apelido))!;
    expect(latam.ativo).toBe(false);                 // "CANCELADO EM ..."
    const azul = cartoes.find((c) => /AZUL/.test(c.apelido))!;
    expect(azul.emissor).toBe('itau');
    expect(azul.isencoes.map((i) => i.tipo)).toContain('promocional');
    expect(azul.vip_usados).toBe(2);
  });
});
