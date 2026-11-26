// RF-69: leitura das abas Papéis e FIIs da planilha antiga, só para conferir contra a B3.
import * as XLSX from 'xlsx';
import { codigoBase } from './b3';

export interface LotePlanilha { codigo: string; quantidade: number; preco: number; aba: 'Papéis' | 'FIIs' }
export interface ResumoPlanilha { codigo: string; quantidade: number; pm: number; proventosPorMes: Map<string, number> }

type Cel = string | number | Date | null | undefined;
const num = (v: Cel) => (typeof v === 'number' && isFinite(v) ? v : null);
const RE_TICKER = /^[A-Z]{4}\d{1,2}$/;

/** "09/20" | "3/21" | Date -> "2020-09" */
function mesDoCabecalho(v: Cel): string | null {
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`;
  const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{2})$/);
  return m ? `20${m[2]}-${m[1].padStart(2, '0')}` : null;
}

export function lerPlanilhaAntiga(dados: ArrayBuffer | Uint8Array): { lotes: LotePlanilha[]; resumo: Map<string, ResumoPlanilha> } {
  const wb = XLSX.read(dados, { type: 'array', cellDates: true });
  const lotes: LotePlanilha[] = [];
  const resumo = new Map<string, ResumoPlanilha>();
  const add = (l: LotePlanilha) => {
    lotes.push(l);
    const r = resumo.get(l.codigo) ?? { codigo: l.codigo, quantidade: 0, pm: 0, proventosPorMes: new Map() };
    const custo = r.pm * r.quantidade + l.preco * l.quantidade;
    r.quantidade += l.quantidade;
    r.pm = r.quantidade ? custo / r.quantidade : 0;
    resumo.set(l.codigo, r);
  };
  const papeis = wb.Sheets['Papéis'];
  if (papeis) {
    for (const r of XLSX.utils.sheet_to_json<Cel[]>(papeis, { header: 1, raw: true, defval: null }).slice(3)) {
      const cod = String(r[2] ?? '').trim().toUpperCase();
      const preco = num(r[4]); const q = num(r[6]);
      if (RE_TICKER.test(cod) && preco != null && q) add({ codigo: codigoBase(cod), quantidade: q, preco, aba: 'Papéis' });
    }
  }
  const fiis = wb.Sheets['FIIs'];
  if (fiis) {
    const linhas = XLSX.utils.sheet_to_json<Cel[]>(fiis, { header: 1, raw: true, defval: null });
    const cab = linhas[2] ?? [];
    const meses = cab.map((h, i) => (i >= 6 ? mesDoCabecalho(h) : null));
    for (const r of linhas.slice(3)) {
      const cod = String(r[1] ?? '').trim().toUpperCase();
      const preco = num(r[3]); const q = num(r[5]);
      if (!RE_TICKER.test(cod) || preco == null || !q) continue;
      add({ codigo: cod, quantidade: q, preco, aba: 'FIIs' });
      const res = resumo.get(cod)!;
      meses.forEach((m, i) => { const v = num(r[i]); if (m && v && v > 0) res.proventosPorMes.set(m, Math.round(((res.proventosPorMes.get(m) ?? 0) + v) * 100) / 100); });
    }
  }
  return { lotes, resumo };
}

export interface Divergencia { codigo: string; campo: 'quantidade' | 'preço médio' | 'proventos'; planilha: string; b3: string; detalhe?: string }

export function conciliar(
  planilha: Map<string, ResumoPlanilha>,
  b3: { codigo: string; quantidade: number; pm: number | null; custoCompleto: boolean }[],
  proventosB3: { data: string; codigo: string; valor: number }[],
): Divergencia[] {
  const out: Divergencia[] = [];
  const f = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const porMesB3 = new Map<string, number>();
  for (const p of proventosB3) { const k = `${p.codigo}|${p.data.slice(0, 7)}`; porMesB3.set(k, Math.round(((porMesB3.get(k) ?? 0) + p.valor) * 100) / 100); }
  for (const [codigo, r] of planilha) {
    const a = b3.find((x) => x.codigo === codigo);
    const qB3 = a?.quantidade ?? 0;
    if (Math.abs(qB3 - r.quantidade) > 1e-6) out.push({ codigo, campo: 'quantidade', planilha: f(r.quantidade), b3: f(qB3), detalhe: qB3 === 0 ? 'na planilha, sem posição na B3 (vendido?)' : undefined });
    if (a?.pm != null && a.custoCompleto && Math.abs(a.pm - r.pm) / r.pm > 0.01) out.push({ codigo, campo: 'preço médio', planilha: f(r.pm), b3: f(a.pm) });
    if (qB3 === 0) continue; // ativo já vendido: proventos antigos não são conferidos um a um
    for (const [mes, v] of r.proventosPorMes) {
      const vb = porMesB3.get(`${codigo}|${mes}`) ?? 0;
      if (Math.abs(vb - v) > 0.05) out.push({ codigo, campo: 'proventos', planilha: f(v), b3: f(vb), detalhe: mes.split('-').reverse().join('/') });
    }
  }
  for (const a of b3) if (!planilha.has(a.codigo) && a.quantidade > 0 && /^[A-Z]{4}\d{1,2}$/.test(a.codigo)) out.push({ codigo: a.codigo, campo: 'quantidade', planilha: '0', b3: f(a.quantidade), detalhe: 'não está na planilha' });
  return out.sort((x, y) => x.codigo.localeCompare(y.codigo) || x.campo.localeCompare(y.campo));
}
