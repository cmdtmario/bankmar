import type { TextItem } from './tipos';

/**
 * Datas da fatura vêm como dd/mm. O ano é o maior possível com data <= vencimento;
 * para parcelas muito antigas (ex.: 06/21), recua o ano se a compra ficaria recente demais.
 */
export function inferirData(ddmm: string, vencimentoIso: string, parcelaAtual: number | null): string | null {
  const m = ddmm.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const [va, vm, vd] = vencimentoIso.split('-').map(Number);
  let ano = va;
  if (mes > vm || (mes === vm && dia > vd)) ano -= 1;
  if (parcelaAtual && parcelaAtual > 1) {
    // a compra da parcela n aconteceu cerca de n-1 meses antes desta fatura
    let meses = (va - ano) * 12 + (vm - mes);
    while (meses < parcelaAtual - 2) {
      ano -= 1;
      meses += 12;
    }
  }
  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const d = new Date(iso + 'T12:00:00Z');
  return d.getUTCMonth() + 1 === mes ? iso : null;
}

/** Separa "AZUL LINHAS 11/12" ou "AF INTERNET 01 DE 04" em descrição + parcela. */
export function separarParcela(desc: string): { descricao: string; atual: number | null; total: number | null } {
  const t = desc.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*?)[\s*]*(\d{2})\s*(?:\/|DE)\s*(\d{2})$/i);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= Number(m[3]) && Number(m[3]) > 1) {
    return { descricao: m[1].trim() || t, atual: Number(m[2]), total: Number(m[3]) };
  }
  return { descricao: t, atual: null, total: null };
}

/** Agrupa itens em linhas (mesma página, y a até `tol` pontos). */
export function mesmaLinha(itens: TextItem[], ref: TextItem, tol = 2.5): TextItem[] {
  return itens.filter((i) => i.p === ref.p && Math.abs(i.y - ref.y) <= tol);
}

export const RE_DDMM = /^\d{2}\/\d{2}$/;
export const RE_DATA_COMPLETA = /(\d{2}\/\d{2}\/\d{4})/;
export const RE_FINAL_CARTAO = /\d{4}\.X{4}\.X{4}\.(\d{4})/;
