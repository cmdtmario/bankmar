// Edge Function (Deno) — cotações (ao vivo, histórico diário) e foto mensal do patrimônio (RF-62, RF-67).
// Chamadas:
//   agendamento (Bearer CRON_SECRET): fechamento do dia para todos os usuários + foto no 1º dia útil;
//   app (JWT do usuário) {acao:'ao_vivo'}: preço atual, fechamento anterior e índices; grava o dia;
//   app (JWT do usuário) {acao:'historico', codigos}: carrega até 2 anos de fechamentos diários.
// Fonte gratuita, sem chave: Yahoo Finance (atraso de ~15 min, como o GOOGLEFINANCE).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { INDICES, lerYahoo, primeiroDiaUtil, valorDaFoto, type CotacaoAoVivo } from './logica.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const NEGOCIAVEIS = ['acao', 'bdr', 'etf', 'fii'];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

async function cotar(codigo: string, range: '5d' | '2y'): Promise<CotacaoAoVivo | null> {
  const simbolo = INDICES[codigo] ?? `${codigo}.SA`;
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=${range}&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    return r.ok ? lerYahoo(codigo, await r.json()) : null;
  } catch { return null; }
}
async function cotarVarios(codigos: string[], range: '5d' | '2y') {
  const out: CotacaoAoVivo[] = []; const falhas: string[] = [];
  for (let i = 0; i < codigos.length; i += 8) {
    const lote = await Promise.all(codigos.slice(i, i + 8).map((c) => cotar(c, range)));
    lote.forEach((x, j) => (x ? out.push(x) : falhas.push(codigos[i + j]))); // caso 9: sem cotação mantém a última
  }
  return { out, falhas };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (d: unknown, status = 200) => Response.json(d, { status, headers: cors });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const auth = req.headers.get('authorization') ?? '';
  const corpo = await req.json().catch(() => ({})) as { acao?: string; codigos?: string[] };
  const agendado = Boolean(env('CRON_SECRET')) && auth === `Bearer ${env('CRON_SECRET')}`;
  let usuarios: string[];
  if (agendado) {
    const { data } = await db.from('inv_posicoes').select('user_id');
    usuarios = [...new Set((data ?? []).map((x) => x.user_id as string))];
  } else {
    const { data } = await db.auth.getUser(auth.replace(/^Bearer /, ''));
    if (!data.user) return json({ erro: 'não autorizado' }, 401);
    usuarios = [data.user.id];
  }
  const gravar = async (uid: string, cots: CotacaoAoVivo[]) => {
    const linhas = cots.flatMap((c) => c.dias.map((d) => ({ user_id: uid, codigo: c.codigo, data: d.data, preco: d.preco, fonte: 'yahoo', atualizado_em: new Date().toISOString() })));
    for (let i = 0; i < linhas.length; i += 1000) await db.from('inv_cotacoes').upsert(linhas.slice(i, i + 1000), { onConflict: 'user_id,codigo,data' });
  };
  const codigosDe = async (uid: string) => {
    const { data: ult } = await db.from('inv_posicoes').select('data_ref').eq('user_id', uid).order('data_ref', { ascending: false }).limit(1);
    if (!ult?.length) return { pos: [], codigos: [] as string[] };
    const { data: pos } = await db.from('inv_posicoes').select('*').eq('user_id', uid).eq('data_ref', ult[0].data_ref);
    return { pos: pos ?? [], codigos: [...new Set((pos ?? []).filter((p) => NEGOCIAVEIS.includes(p.classe)).map((p) => p.codigo as string))] };
  };

  if (!agendado && corpo.acao === 'historico') {
    const pedidos = (corpo.codigos ?? []).filter((c) => /^[A-Z0-9^=.]{2,12}$/.test(c)).slice(0, 60);
    const { out, falhas } = await cotarVarios(pedidos, '2y');
    await gravar(usuarios[0], out);
    return json({ dias: out.reduce((a, c) => a + c.dias.length, 0), falhas });
  }

  const resultado = { atualizadas: 0, falhas: [] as string[], fotos: 0, cotacoes: [] as Omit<CotacaoAoVivo, 'dias'>[] };
  for (const uid of usuarios) {
    const { pos, codigos } = await codigosDe(uid);
    const { out, falhas } = await cotarVarios([...codigos, ...Object.keys(INDICES)], '5d');
    await gravar(uid, out);
    resultado.atualizadas += out.length;
    resultado.falhas.push(...falhas);
    if (!agendado) resultado.cotacoes = out.map(({ dias: _d, ...c }) => c);
    // RF-67: no 1º dia útil, foto do fechamento do mês anterior (só no agendamento)
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const comp = agendado ? primeiroDiaUtil(hoje) : null;
    if (comp) {
      const { count } = await db.from('inv_fotos').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('competencia', comp);
      if (!count) {
        const precos = new Map(out.map((c) => [c.codigo, c.preco]));
        const { data: man } = await db.from('inv_saldos_manuais').select('*').eq('user_id', uid).order('competencia', { ascending: false });
        const linhas = valorDaFoto(pos, precos, man ?? []).map((l) => ({ ...l, user_id: uid, competencia: comp }));
        if (linhas.length) await db.from('inv_fotos').insert(linhas);
        resultado.fotos += linhas.length;
      }
    }
  }
  return json(resultado);
});
