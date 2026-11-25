// RF-82: inscreve este aparelho para notificações push (Web Push / VAPID).
import { supabase, ok } from './supabase';

const b64ParaUint8 = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export async function ativarPush() {
  const chave = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!chave) throw new Error('Falta a variável VITE_VAPID_PUBLIC_KEY.');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Este navegador não suporta notificações push. No iPhone, adicione o app à tela de início primeiro.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão de notificação negada.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaUint8(chave) }));
  const j = sub.toJSON();
  ok(await supabase.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth }, { onConflict: 'endpoint' }));
}
