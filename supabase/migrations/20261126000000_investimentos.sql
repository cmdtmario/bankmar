-- Entrega 3 — Investimentos (RF-60 a RF-69). Mesmas regras: dono + duas etapas (aal2).

-- Auditoria passa a aceitar tabelas sem coluna id uuid (chave composta ou bigserial).
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old)); v_id text := r ->> 'id';
begin
  insert into public.audit_log (user_id, tabela, registro_id, operacao, antes, depois)
  values (coalesce(auth.uid(), (r ->> 'user_id')::uuid), tg_table_name,
          case when v_id ~* '^[0-9a-f-]{36}$' then v_id::uuid end, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create table public.inv_negociacoes (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null, tipo text not null check (tipo in ('Compra','Venda')), mercado text, instituicao text,
  codigo text not null, quantidade numeric not null, preco numeric, valor numeric,
  chave text not null, unique (user_id, chave)                       -- RF-61: reimportar não duplica
);
create table public.inv_movimentacoes (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null, entrada boolean not null, tipo text not null, produto text, codigo text not null,
  instituicao text, quantidade numeric, preco numeric, valor numeric,
  chave text not null, unique (user_id, chave)
);
create table public.inv_proventos_receber (                          -- RF-60b (substituída a cada importação)
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codigo text not null, produto text, tipo text, evento text, previsao date, instituicao text,
  quantidade numeric, valor numeric not null, importado_em timestamptz not null default now()
);
create table public.inv_posicoes (                                   -- RF-60 (foto da B3 por data)
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data_ref date not null, classe text not null, codigo text not null, produto text, instituicao text,
  cnpj text, isin text, emissor text, indexador text, vencimento date,
  quantidade numeric not null, preco numeric, valor numeric, valor_aplicado numeric
);
create index on public.inv_posicoes (user_id, data_ref);
create table public.inv_ajustes (                                    -- PM manual / da planilha e alvo (RF-65, RF-69)
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codigo text not null, preco_medio numeric, preco_alvo numeric, origem text, observacao text,
  primary key (user_id, codigo)
);
create table public.inv_cotacoes (                                   -- RF-62
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codigo text not null, data date not null, preco numeric not null, fonte text,
  primary key (user_id, codigo, data)
);
create table public.inv_saldos_manuais (                             -- RF-66 previdência e fora da B3
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  instituicao text not null, produto text not null, classe text not null default 'previdencia'
    check (classe in ('previdencia','renda_fixa','fundo','outro')),
  competencia date not null check (extract(day from competencia) = 1),
  saldo numeric not null, aportes numeric,
  unique (user_id, instituicao, produto, competencia)
);
create table public.inv_fotos (                                      -- RF-67 foto mensal do patrimônio
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  competencia date not null, classe text not null, instituicao text not null, codigo text not null, valor numeric not null,
  unique (user_id, competencia, classe, instituicao, codigo)
);
create table public.inv_instituicoes (                               -- RF-60d equivalência de nomes
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome_original text not null, grupo text not null,
  primary key (user_id, nome_original)
);

do $$
declare t text;
begin
  foreach t in array array['inv_negociacoes','inv_movimentacoes','inv_proventos_receber','inv_posicoes','inv_ajustes',
                           'inv_cotacoes','inv_saldos_manuais','inv_fotos','inv_instituicoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy dono_aal2 on public.%I for all to authenticated
                    using (user_id = auth.uid() and public.is_aal2())
                    with check (user_id = auth.uid() and public.is_aal2())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['inv_ajustes','inv_saldos_manuais','inv_instituicoes'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;
