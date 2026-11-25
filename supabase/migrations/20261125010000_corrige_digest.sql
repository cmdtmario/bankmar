-- No Supabase o pgcrypto fica no schema "extensions": a função do link de consulta precisa enxergá-lo.
alter function public.get_shared_summary(text) set search_path = public, extensions;
