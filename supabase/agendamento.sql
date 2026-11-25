-- Agenda os avisos diários às 8h de Brasília (11:00 UTC). Rodar UMA vez no SQL Editor do Supabase,
-- depois de publicar a função "avisos-vencimento". Troque os dois valores entre <>.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'avisos-vencimento-8h',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://<ID-DO-PROJETO>.supabase.co/functions/v1/avisos-vencimento',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
