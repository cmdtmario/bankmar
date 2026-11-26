// Formatos brasileiros (RNF-08) e utilidades numéricas.

/** "1.234,56" | "-33,18" | "R$ 12,00" | "358,34D" -> número. Retorna null se não for valor. */
export function parseValorBR(s: string): number | null {
  const t = s.replace(/R\$/g, '').replace(/\s+/g, '').trim();
  const m = t.match(/^(-)?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})([DC])?$/);
  if (!m) return null;
  const n = Number(m[2].replace(/\./g, '') + '.' + m[3]);
  const neg = m[1] === '-' || m[4] === 'C';
  return neg ? -n : n;
}

export const brl = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** AAAA-MM-DD -> dd/mm/aaaa */
export const dataBR = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** dd/mm/aaaa -> AAAA-MM-DD (null se inválida) */
export function isoDeBR(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d.getTime()) || d.getUTCDate() !== Number(m[1]) ? null : iso;
}

export const centavos = (v: number) => Math.round(v * 100);
export const somaCentavos = (vs: number[]) => vs.reduce((a, v) => a + centavos(v), 0) / 100;

/** Hoje no fuso de Brasília (RNF-08), AAAA-MM-DD. */
export function hojeBrasilia(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

/** Primeiro dia do mês de uma data ISO. */
export const competenciaDe = (iso: string) => iso.slice(0, 7) + '-01';

export function somaMeses(competencia: string, n: number): string {
  const [a, m] = competencia.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export const nomeMes = (competencia: string) => {
  const [a, m] = competencia.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return t.charAt(0).toUpperCase() + t.slice(1); // "Novembro de 2026"
};

/** 0.4213 -> "42,1%" */
export const pctBR = (fracao: number, casas = 1) => `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`;
