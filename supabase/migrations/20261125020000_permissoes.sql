-- Permissões explícitas: no Supabase as tabelas criadas pela integração GitHub não recebem
-- automaticamente os GRANTs para o papel "authenticated". A RLS continua decidindo o que cada um vê.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Divisões só são escritas pelo banco; auditoria e log de avisos são só leitura para o app.
revoke insert, update, delete on public.allocations from authenticated;
revoke insert, update, delete on public.audit_log from authenticated;
revoke insert, update, delete on public.notification_log from authenticated;

-- Visitante anônimo continua sem acesso a tabelas; só a função do link.
revoke all on all tables in schema public from anon;
