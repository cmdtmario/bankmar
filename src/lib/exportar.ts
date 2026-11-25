// RNF-07: exportação completa sob demanda, uma planilha com uma aba por tabela.
import * as XLSX from 'xlsx';
import { supabase, ok } from './supabase';

const TABELAS = ['months', 'bill_templates', 'bills', 'payments', 'cards', 'invoices', 'transactions', 'purchases', 'allocations',
  'people', 'tags', 'receipts', 'categories', 'category_rules', 'learned_rules', 'share_links', 'import_log', 'audit_log'] as const;

export async function exportarTudo() {
  const wb = XLSX.utils.book_new();
  for (const t of TABELAS) {
    const linhas: Record<string, unknown>[] = [];
    for (let de = 0; ; de += 1000) {
      const lote = ok(await supabase.from(t).select('*').range(de, de + 999)) as Record<string, unknown>[];
      linhas.push(...lote.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v != null && typeof v === 'object' ? JSON.stringify(v) : v]))));
      if (lote.length < 1000) break;
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), t.slice(0, 31));
  }
  XLSX.writeFile(wb, `bankmar-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
