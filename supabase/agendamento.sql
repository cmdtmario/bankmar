-- Agenda os avisos diários às 8h de Brasília (11:00 UTC). Rodar UMA vez no SQL Editor do Supabase,
-- (Com a integração GitHub do Supabase, migrations e a função de avisos são publicadas a cada push na main.)
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

-- Investimentos: cotações todo dia útil às 18h30 de Brasília (21:30 UTC) e foto mensal no 1º dia útil.
select cron.schedule(
  'investimentos-diario',
  '30 21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://<ID-DO-PROJETO>.supabase.co/functions/v1/investimentos-diario',
    headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
