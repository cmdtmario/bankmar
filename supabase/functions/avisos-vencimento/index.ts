// Edge Function (Deno) — RF-80 / RF-82: avisos de vencimento por push e e-mail.
// Chamada todo dia às 8h de Brasília pelo agendamento em supabase/agendamento.sql.
// Segredos: CRON_SECRET, RESEND_API_KEY, AVISO_REMETENTE, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';
import { diasBrasilia, montarAvisos, type ItemVencimento } from './logica.ts';

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}` || !env('CRON_SECRET')) {
    return new Response('não autorizado', { status: 401 });
  }
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { hoje, amanha } = diasBrasilia(new Date());

  const [contas, faturas, pags, cards] = await Promise.all([
    db.from('bills').select('id, user_id, descricao, vencimento, valor').in('vencimento', [hoje, amanha]),
    db.from('invoice_summary').select('invoice_id, user_id, card_id, vencimento, total, confirmada').in('vencimento', [hoje, amanha]),
    db.from('payments').select('bill_id, invoice_id, valor'),
    db.from('cards').select('id, apelido'),
  ]);
  for (const r of [contas, faturas, pags, cards]) if (r.error) return new Response(r.error.message, { status: 500 });

  const pagoDe = (campo: 'bill_id' | 'invoice_id', id: string) =>
    (pags.data ?? []).filter((p) => p[campo] === id).reduce((a, p) => a + Number(p.valor), 0);
  const nomeCartao = (id: string) => (cards.data ?? []).find((c) => c.id === id)?.apelido ?? 'Cartão';
  const itens: ItemVencimento[] = [
    ...(contas.data ?? []).map((c) => ({ user_id: c.user_id, tipo: 'conta' as const, id: c.id, descricao: c.descricao, vencimento: c.vencimento, valor: Number(c.valor), pago: pagoDe('bill_id', c.id) })),
    ...(faturas.data ?? []).filter((f) => f.confirmada).map((f) => ({ user_id: f.user_id, tipo: 'fatura' as const, id: f.invoice_id, descricao: `fatura ${nomeCartao(f.card_id)}`, vencimento: f.vencimento, valor: Number(f.total), pago: pagoDe('invoice_id', f.invoice_id) })),
  ];
  const avisos = montarAvisos(itens, hoje, amanha);

  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:avisos@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const resultado = { avisos: avisos.length, push: 0, email: 0, erros: 0 };

  for (const a of avisos) {
    // push
    const { error: dupPush } = await db.from('notification_log').insert({ user_id: a.user_id, referencia: a.referencia, canal: 'push' });
    if (!dupPush) {
      const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', a.user_id);
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ titulo: a.titulo, corpo: a.corpo, url: '/' }));
          resultado.push++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
          else { resultado.erros++; await db.from('notification_log').update({ erro: String(e) }).eq('referencia', a.referencia).eq('canal', 'push'); }
        }
      }
    }
    // e-mail
    const { data: cfg } = await db.from('notification_settings').select('email').eq('user_id', a.user_id).maybeSingle();
    if (cfg?.email) {
      const { error: dupMail } = await db.from('notification_log').insert({ user_id: a.user_id, referencia: a.referencia, canal: 'email' });
      if (!dupMail) {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: env('AVISO_REMETENTE') || 'BanKMar <onboarding@resend.dev>', to: [cfg.email], subject: a.titulo, text: a.corpo }),
        });
        if (r.ok) resultado.email++;
        else { resultado.erros++; await db.from('notification_log').update({ erro: await r.text() }).eq('referencia', a.referencia).eq('canal', 'email'); }
      }
    }
  }
  return Response.json(resultado);
});
