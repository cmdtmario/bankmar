-- Entrega 4: Imposto de Renda (RF-75 a RF-78d, RF-93).

-- RF-75: valores mensais da folha (digitação manual, como na aba IRRF 2026)
create table public.ir_mensal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),   -- mês da folha
  recebido_em date,
  salario_liquido numeric(14,2), ferias_terco numeric(14,2),
  inss_folha numeric(14,2), inss_ferias numeric(14,2),
  ir_folha numeric(14,2), ir_ferias numeric(14,2), ir_vinculo_unico numeric(14,2),
  plano_saude numeric(14,2), odontologico numeric(14,2), ensino numeric(14,2),
  medico_fora numeric(14,2), obs_medico text check (char_length(obs_medico) <= 200),
  unique (user_id, competencia)
);

-- RF-75: contribuições de previdência por plano e mês
create table public.ir_previdencia (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),
  plano text not null check (char_length(plano) between 1 and 60),
  tipo text not null default 'PGBL' check (tipo in ('PGBL','VGBL')),
  valor numeric(14,2) not null check (valor >= 0),
  unique (user_id, competencia, plano)
);

-- RF-76 / RF-78a / RF-78c: configuração por ano-calendário (códigos das fichas, alíquotas e limites, renda tributável)
create table public.ir_config (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ano int not null check (ano between 2020 and 2100),
  renda_tributavel numeric(14,2) check (renda_tributavel >= 0),
  codigos jsonb not null default '{}'::jsonb,
  parametros jsonb not null default '{}'::jsonb,
  revisado_em date,
  primary key (user_id, ano)
);

-- RF-78d: conferência com a pré-preenchida
create table public.ir_conferencia (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ano int not null,
  item text not null check (char_length(item) <= 120),
  situacao text not null check (situacao in ('conferido','divergente','nao_veio')),
  observacao text check (char_length(observacao) <= 300),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, ano, item)
);

do $$
declare t text;
begin
  foreach t in array array['ir_mensal','ir_previdencia','ir_config','ir_conferencia'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy dono_aal2 on public.%I for all to authenticated
                    using (user_id = auth.uid() and public.is_aal2())
                    with check (user_id = auth.uid() and public.is_aal2())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;
