// Edge Function (Deno) — RF-62 (cotações diárias) e RF-67 (foto mensal do patrimônio).
// Chamada pelo agendamento (Bearer CRON_SECRET, todos os usuários) ou pelo app (JWT do usuário, só ele).
// Fonte de cotação gratuita: Yahoo Finance (sem chave). Se BRAPI_TOKEN existir, usa a brapi.dev como reserva.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { primeiroDiaUtil, valorDaFoto } from './logica.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const NEGOCIAVEIS = ['acao', 'bdr', 'etf', 'fii'];

async function cotacaoYahoo(codigo: string): Promise<number | null> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${codigo}.SA?range=1d&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) return null;
  const j = await r.json();
  const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
  return typeof p === 'number' && p > 0 ? p : null;
}
async function cotacaoBrapi(codigo: string): Promise<number | null> {
  if (!env('BRAPI_TOKEN')) return null;
  const r = await fetch(`https://brapi.dev/api/quote/${codigo}?token=${env('BRAPI_TOKEN')}`);
  if (!r.ok) return null;
  const p = (await r.json())?.results?.[0]?.regularMarketPrice;
  return typeof p === 'number' && p > 0 ? p : null;
}

Deno.serve(async (req) => {
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const auth = req.headers.get('authorization') ?? '';
  let usuarios: string[] = [];
  if (env('CRON_SECRET') && auth === `Bearer ${env('CRON_SECRET')}`) {
    const { data } = await db.from('inv_posicoes').select('user_id');
    usuarios = [...new Set((data ?? []).map((x) => x.user_id as string))];
  } else {
    const { data } = await db.auth.getUser(auth.replace(/^Bearer /, ''));
    if (!data.user) return new Response('não autorizado', { status: 401 });
    usuarios = [data.user.id];
  }
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const resultado = { atualizadas: 0, falhas: [] as string[], fotos: 0 };

  for (const uid of usuarios) {
    const { data: ult } = await db.from('inv_posicoes').select('data_ref').eq('user_id', uid).order('data_ref', { ascending: false }).limit(1);
    if (!ult?.length) continue;
    const { data: pos } = await db.from('inv_posicoes').select('*').eq('user_id', uid).eq('data_ref', ult[0].data_ref);
    const codigos = [...new Set((pos ?? []).filter((p) => NEGOCIAVEIS.includes(p.classe)).map((p) => p.codigo as string))];
    const precos = new Map<string, number>();
    for (const c of codigos) {
      const p = (await cotacaoYahoo(c).catch(() => null)) ?? (await cotacaoBrapi(c).catch(() => null));
      if (p == null) { resultado.falhas.push(c); continue; } // caso 9: mantém a última cotação
      precos.set(c, p);
      await db.from('inv_cotacoes').upsert({ user_id: uid, codigo: c, data: hoje, preco: p, fonte: 'yahoo' }, { onConflict: 'user_id,codigo,data' });
      resultado.atualizadas++;
    }
    // RF-67: no 1º dia útil, foto do fechamento do mês anterior
    const comp = primeiroDiaUtil(hoje);
    if (comp) {
      const { count } = await db.from('inv_fotos').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('competencia', comp);
      if (!count) {
        const { data: man } = await db.from('inv_saldos_manuais').select('*').eq('user_id', uid).order('competencia', { ascending: false });
        const linhas = valorDaFoto(pos ?? [], precos, man ?? []).map((l) => ({ ...l, user_id: uid, competencia: comp }));
        if (linhas.length) await db.from('inv_fotos').insert(linhas);
        resultado.fotos += linhas.length;
      }
    }
  }
  return Response.json(resultado);
});
