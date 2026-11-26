import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && anon);
// Na demonstração a sessão fica só na memória (a página pode rodar onde o navegador bloqueia o localStorage).
export const memoriaDemo = new Map<string, string>();
const armazenamento = import.meta.env.VITE_DEMO
  ? { getItem: (k: string) => memoriaDemo.get(k) ?? null, setItem: (k: string, v: string) => void memoriaDemo.set(k, v), removeItem: (k: string) => void memoriaDemo.delete(k) }
  : undefined;
export const supabase = createClient(url ?? 'http://localhost', anon ?? 'anon', {
  auth: { persistSession: true, autoRefreshToken: !import.meta.env.VITE_DEMO, storage: armazenamento },
});

/** Lança erro legível a partir da resposta do Supabase. */
export function ok<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}
