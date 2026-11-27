// Edge Function (Deno) — RF-48, RF-49, RF-81: checagem mensal da página oficial de benefícios de cada cartão.
// Agendamento (Bearer CRON_SECRET): todos os usuários. App (JWT do usuário): só os cartões dele.
// Nunca altera o cadastro do cartão: só grava a versão nova como "pendente" e avisa.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { diffTexto, textoDaPagina } from './logica.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

async function sha256(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

async function lerPagina(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (BankMaR checagem mensal)' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
    if (!r.ok) return null;
    const texto = textoDaPagina(await r.text());
    return texto.length >= 200 ? texto : null;   // página vazia ou só com script: layout irreconhecível
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (d: unknown, status = 200) => Response.json(d, { status, headers: cors });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const auth = req.headers.get('authorization') ?? '';
  let filtroUsuario: string | null = null;
  if (!(env('CRON_SECRET') && auth === `Bearer ${env('CRON_SECRET')}`)) {
    const { data } = await db.auth.getUser(auth.replace(/^Bearer /, ''));
    if (!data.user) return json({ erro: 'não autorizado' }, 401);
    filtroUsuario = data.user.id;
  }
  let q = db.from('cards').select('id, user_id, apelido, link').eq('ativo', true).not('link', 'is', null);
  if (filtroUsuario) q = q.eq('user_id', filtroUsuario);
  const { data: cartoes } = await q;
  const res = { verificados: 0, alterados: 0, falhas: 0 };
  const mes = new Date().toISOString().slice(0, 7);

  for (const c of cartoes ?? []) {
    const texto = await lerPagina(c.link);
    if (!texto) { // RF-49: mantém os dados e marca
      await db.from('cards').update({ beneficio_status: 'nao_verificado', beneficio_verificado_em: new Date().toISOString() }).eq('id', c.id);
      res.falhas++; continue;
    }
    res.verificados++;
    const hash = await sha256(texto);
    const { data: ult } = await db.from('card_beneficios').select('texto, hash').eq('card_id', c.id).eq('situacao', 'aprovada').order('capturado_em', { ascending: false }).limit(1);
    const { data: pend } = await db.from('card_beneficios').select('hash').eq('card_id', c.id).eq('situacao', 'pendente');
    if (!ult?.length) {
      await db.from('card_beneficios').insert({ user_id: c.user_id, card_id: c.id, texto, hash, situacao: 'aprovada' });
      await db.from('cards').update({ beneficio_status: 'ok', beneficio_verificado_em: new Date().toISOString() }).eq('id', c.id);
      continue;
    }
    if (ult[0].hash === hash) {
      await db.from('cards').update({ beneficio_status: (pend?.length ? 'alterado' : 'ok'), beneficio_verificado_em: new Date().toISOString() }).eq('id', c.id);
      continue;
    }
    if (pend?.some((p) => p.hash === hash)) continue; // mesma mudança já está esperando aprovação
    const diff = diffTexto(ult[0].texto, texto);
    await db.from('card_beneficios').insert({ user_id: c.user_id, card_id: c.id, texto, hash, situacao: 'pendente', diff });
    await db.from('cards').update({ beneficio_status: 'alterado', beneficio_verificado_em: new Date().toISOString() }).eq('id', c.id);
    res.alterados++;
    await avisar(db, c.user_id, `beneficio:${c.id}:${mes}`, `Benefícios do ${c.apelido} mudaram`, `A página oficial mudou ${diff.adicionadas.length + diff.removidas.length} trecho(s). Confira em Cartões.`);
  }
  return json(res);
});

// RF-81: aviso por push e e-mail (mesmos canais dos avisos de vencimento); não repete no mesmo mês.
async function avisar(db: ReturnType<typeof createClient>, user_id: string, referencia: string, titulo: string, corpo: string) {
  const { error: dupPush } = await db.from('notification_log').insert({ user_id, referencia, canal: 'push' });
  if (!dupPush && env('VAPID_PRIVATE_KEY')) {
    webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:avisos@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
    const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', user_id);
    for (const s of subs ?? []) {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ titulo, corpo, url: '/cartoes' })); }
      catch (e) { await db.from('notification_log').update({ erro: String(e) }).eq('referencia', referencia).eq('canal', 'push'); }
    }
  }
  const { error: dupMail } = await db.from('notification_log').insert({ user_id, referencia, canal: 'email' });
  const { data: cfg } = await db.from('notification_settings').select('email').eq('user_id', user_id).maybeSingle();
  if (!dupMail && cfg?.email && env('RESEND_API_KEY')) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('AVISO_REMETENTE'), to: cfg.email, subject: titulo, text: corpo }),
    });
    if (!r.ok) await db.from('notification_log').update({ erro: await r.text() }).eq('referencia', referencia).eq('canal', 'email');
  }
}
