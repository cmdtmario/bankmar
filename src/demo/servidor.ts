// Modo demonstração: responde às chamadas do Supabase com dados fictícios, sem rede e sem conta.
// Usado só no arquivo de demonstração (npm run build:demo). Nunca entra no site publicado.
// dados.json é gerado na hora (npm run build:demo) e não fica no repositório.
const dados = Object.values(import.meta.glob('./dados.json', { eager: true, import: 'default' }))[0] as { tabelas: Record<string, unknown[]>; vivo: unknown; usuario: { id: string } & Record<string, unknown> };
import { memoriaDemo } from '../lib/supabase';

type Linha = Record<string, unknown>;
const tabelas = dados.tabelas as unknown as Record<string, Linha[]>;
const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function instalarDemo() {
  const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 86400;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: dados.usuario.id, aal: 'aal2', role: 'authenticated', exp, amr: [{ method: 'totp', timestamp: exp - 100 }] })}.demo`;
  memoriaDemo.set('sb-demo-auth-token', JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'demo', user: dados.usuario }));

  const original = window.fetch.bind(window);
  const json = (d: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', ...extra } });
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    if (url.hostname !== 'demo.supabase.co') return original(entrada, init);
    const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : 'GET')).toUpperCase();
    if (url.pathname.includes('/auth/v1/')) return json(dados.usuario);
    if (url.pathname.includes('/functions/v1/')) return json(dados.vivo);
    const m = url.pathname.match(/\/rest\/v1\/(rpc\/)?([a-z_]+)/);
    if (!m) return json({}, 404);
    if (m[1]) return json({ disponivel: false });
    let linhas = [...(tabelas[m[2]] ?? [])];
    if (metodo === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': `0-0/${linhas.length}` } });
    if (metodo !== 'GET') return json([], 201); // gravações são ignoradas na demonstração
    const ops: Record<string, (a: string, b: string) => boolean> = { eq: (a, b) => a === b, lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b };
    for (const [campo, v] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset'].includes(campo)) continue;
      const [op, ...resto] = v.split('.');
      const alvo = resto.join('.');
      if (ops[op]) linhas = linhas.filter((l) => l[campo] != null && ops[op](typeof l[campo] === 'boolean' ? String(l[campo]).toLowerCase() : String(l[campo]), alvo));
    }
    const ordem = url.searchParams.get('order');
    if (ordem) {
      const [campo, dir] = ordem.split(',')[0].split('.');
      linhas.sort((a, b) => String(a[campo] ?? '').localeCompare(String(b[campo] ?? '')) * (dir === 'desc' ? -1 : 1));
    }
    const lim = url.searchParams.get('limit');
    if (lim) linhas = linhas.slice(0, Number(lim));
    const accept = new Headers(init?.headers).get('accept') ?? '';
    if (accept.includes('vnd.pgrst.object')) return linhas.length ? json(linhas[0]) : json({ code: 'PGRST116', message: 'no rows' }, 406);
    return json(linhas);
  };
}
