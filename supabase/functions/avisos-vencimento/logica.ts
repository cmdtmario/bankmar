// Lógica pura dos avisos (RF-80), testada em src/lib/avisos.test.ts.

export interface ItemVencimento {
  user_id: string;
  tipo: 'conta' | 'fatura';
  id: string;
  descricao: string;
  vencimento: string; // AAAA-MM-DD
  valor: number;
  pago: number; // soma dos pagamentos registrados
}

export interface Aviso { user_id: string; referencia: string; titulo: string; corpo: string }

const cent = (v: number) => Math.round(v * 100);

/** Data local de Brasília (AAAA-MM-DD) e a de amanhã. */
export function diasBrasilia(agora: Date): { hoje: string; amanha: string } {
  const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
  const hoje = fmt(agora);
  const d = new Date(hoje + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return { hoje, amanha: d.toISOString().slice(0, 10) };
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Avisa na véspera (D-1) e no dia (D0) de itens ainda não pagos integralmente. */
export function montarAvisos(itens: ItemVencimento[], hoje: string, amanha: string): Aviso[] {
  const out: Aviso[] = [];
  for (const i of itens) {
    if (cent(i.valor) <= 0 || cent(i.pago) >= cent(i.valor)) continue;
    const quando = i.vencimento === hoje ? 'D0' : i.vencimento === amanha ? 'D-1' : null;
    if (!quando) continue;
    const falta = (cent(i.valor) - cent(i.pago)) / 100;
    out.push({
      user_id: i.user_id,
      referencia: `${i.tipo}:${i.id}:${i.vencimento}:${quando}`,
      titulo: quando === 'D0' ? `Vence hoje: ${i.descricao}` : `Vence amanhã: ${i.descricao}`,
      corpo: `${i.tipo === 'fatura' ? 'Fatura' : 'Conta'} de ${brl(i.valor)}${cent(i.pago) ? ` (falta ${brl(falta)})` : ''} sem pagamento registrado no BanKMar.`,
    });
  }
  return out;
}
