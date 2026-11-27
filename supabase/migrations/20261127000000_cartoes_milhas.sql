-- Entrega 2: Cartões (RF-44 a RF-49, RF-81, RF-91) e Milhas e Pontos (RF-50 a RF-58, RF-92).
-- Nenhum campo guarda número completo de cartão, validade, código de segurança, CPF ou senha.

-- ---------------------------------------------------------------------------
-- Milhas: programas e contas (vêm antes porque o cartão aponta para a conta de pontos)
-- ---------------------------------------------------------------------------
create table public.mil_programas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  tipo text not null default 'aereo' check (tipo in ('aereo','banco','hotel','outro')),
  limite_cpfs int check (limite_cpfs >= 0),                      -- RF-56
  periodo_cpfs text not null default 'ano_civil' check (periodo_cpfs in ('ano_civil','12_meses')),
  observacao text check (not contains_card_number(observacao)),
  unique (user_id, nome)
);

create table public.mil_contas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  programa_id uuid not null references public.mil_programas(id) on delete cascade,
  titular text not null default 'Mário' check (not contains_card_number(titular)),
  de_terceiro boolean not null default false,                     -- RF-58: separa contas do Mário das de terceiros
  ativa boolean not null default true,
  unique (programa_id, titular)
);

-- ---------------------------------------------------------------------------
-- Cartões: cadastro completo (RF-45)
-- ---------------------------------------------------------------------------
alter table public.cards
  add column bandeira text,
  add column dia_fechamento int check (dia_fechamento between 1 and 31),
  add column mil_conta_id uuid references public.mil_contas(id) on delete set null,
  add column pontos_nacional numeric(6,2) check (pontos_nacional >= 0),
  add column pontos_internacional numeric(6,2) check (pontos_internacional >= 0),
  add column pontos_obs text check (not contains_card_number(pontos_obs)),
  add column anuidade numeric(12,2) check (anuidade >= 0),
  add column link text check (link ~* '^https?://'),
  add column observacoes text check (not contains_card_number(observacoes)),
  add column cashback_pct numeric(5,2) not null default 1 check (cashback_pct between 0 and 100),   -- RF-54
  add column vip_acessos int check (vip_acessos >= 0),             -- RF-47 (vazio = sem sala VIP; 999 = ilimitado)
  add column vip_renovacao date,
  add column vip_obs text check (not contains_card_number(vip_obs)),
  add column instituicao_invest text,                              -- RF-46: onde está o valor investido que isenta
  add column beneficio_status text not null default 'nunca' check (beneficio_status in ('nunca','ok','alterado','nao_verificado')),
  add column beneficio_verificado_em timestamptz,
  add column desativado_em date;

-- RF-46: regras de isenção de anuidade
create table public.card_isencoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  tipo text not null check (tipo in ('gasto_mensal','gasto_periodo','investido','promocional')),
  meta numeric(14,2) check (meta >= 0),
  meses int check (meses between 1 and 24),
  ate date,
  observacao text check (not contains_card_number(observacao)),
  check (tipo <> 'promocional' or ate is not null),
  check (tipo = 'promocional' or meta is not null),
  check (tipo <> 'gasto_periodo' or meses is not null)
);

-- RF-47: usos da sala VIP
create table public.card_vip_usos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  data date not null,
  aeroporto text check (char_length(aeroporto) <= 80)
);

-- RF-48: versões do texto da página oficial de benefícios
create table public.card_beneficios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  capturado_em timestamptz not null default now(),
  texto text not null,
  hash text not null,
  situacao text not null check (situacao in ('aprovada','pendente','recusada')),
  diff jsonb
);
create index card_beneficios_card on public.card_beneficios (card_id, capturado_em desc);

-- ---------------------------------------------------------------------------
-- Milhas: movimentos, vendas e emissões
-- ---------------------------------------------------------------------------
create table public.mil_movimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conta_id uuid not null references public.mil_contas(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('entrada','saida','custo')),
  origem text not null check (origem in ('cartao','clube','compra','transferencia','bonus_transferencia','voo','bonus','outros',
                                         'uso','expiracao','ajuste','cashback')),
  pontos numeric(14,2),
  valor numeric(14,2),                   -- R$ (custos; negativo quando o custo sai junto numa transferência)
  descricao text check (not contains_card_number(descricao)),
  invoice_id uuid references public.invoices(id) on delete set null,   -- RF-52
  previsto numeric(14,2),                -- RF-52: pontos previstos pela regra do cartão
  transferencia_id uuid,                 -- RF-53: liga a saída e a entrada
  chave text,                            -- importação sem duplicar
  check ((tipo = 'custo' and valor is not null) or (tipo <> 'custo' and pontos is not null and pontos >= 0)),
  unique (user_id, chave)
);
create unique index mil_mov_fatura on public.mil_movimentos (invoice_id) where invoice_id is not null and tipo = 'entrada';
create index mil_mov_conta on public.mil_movimentos (conta_id, data);

create table public.mil_vendas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conta_id uuid not null references public.mil_contas(id) on delete cascade,
  plataforma text check (not contains_card_number(plataforma)),
  data date not null,
  quantidade numeric(14,2) not null check (quantidade >= 0),
  valor_total numeric(14,2) not null check (valor_total >= 0),
  prazo_dias int check (prazo_dias >= 0),
  data_pagamento date,
  cpfs int not null default 0 check (cpfs >= 0),                 -- RF-56: só a contagem
  status text not null default 'aguardando' check (status in ('aguardando','pago','cancelado')),
  chave text,
  unique (user_id, chave)
);

create table public.mil_emissoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conta_id uuid not null references public.mil_contas(id) on delete cascade,
  data date not null,
  localizador text check (localizador ~ '^[A-Za-z0-9]{5,16}$'),
  data_voo text check (char_length(data_voo) <= 40),
  trecho text check (char_length(trecho) <= 80),
  card_id uuid references public.cards(id) on delete set null,
  cartao_texto text check (not contains_card_number(cartao_texto)),
  milhas numeric(14,2) check (milhas >= 0),                       -- se pago com milhas, sai do saldo
  valor numeric(14,2) check (valor >= 0),                         -- R$ (taxas ou tarifa)
  cashback numeric(14,2) not null default 0 check (cashback >= 0),
  status text not null default 'emitida' check (status in ('emitida','remarcada','reembolsada','cancelada')),
  reembolsado numeric(14,2) not null default 0 check (reembolsado >= 0),
  cpfs int not null default 1 check (cpfs >= 0),
  chave text,
  unique (user_id, chave)
);

-- Saldo, entradas e custos por conta (RF-54, RF-58)
create view public.mil_saldos with (security_invoker = true) as
select c.id as conta_id, c.programa_id, p.nome as programa, c.titular, c.de_terceiro, c.ativa,
       coalesce(m.entradas, 0) as entradas,
       coalesce(m.saidas, 0) + coalesce(e.milhas, 0) as saidas,
       coalesce(v.vendidas, 0) as vendidas,
       coalesce(m.entradas, 0) - coalesce(m.saidas, 0) - coalesce(e.milhas, 0) - coalesce(v.vendidas, 0) as saldo,
       coalesce(m.custos, 0) as custos,
       case when coalesce(m.entradas, 0) > 0 then round(coalesce(m.custos, 0) / m.entradas * 1000, 4) end as custo_milheiro,
       coalesce(v.receita, 0) as receita_vendas
from public.mil_contas c
join public.mil_programas p on p.id = c.programa_id
left join (select conta_id,
                  sum(pontos) filter (where tipo = 'entrada') as entradas,
                  sum(pontos) filter (where tipo = 'saida') as saidas,
                  sum(valor) filter (where tipo = 'custo') as custos
           from public.mil_movimentos group by conta_id) m on m.conta_id = c.id
left join (select conta_id, sum(quantidade) as vendidas, sum(valor_total) as receita
           from public.mil_vendas where status <> 'cancelado' group by conta_id) v on v.conta_id = c.id
left join (select conta_id, sum(milhas) as milhas from public.mil_emissoes where status <> 'cancelada' group by conta_id) e on e.conta_id = c.id;

-- ---------------------------------------------------------------------------
-- RLS, permissões e auditoria (mesmo padrão das entregas anteriores)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mil_programas','mil_contas','card_isencoes','card_vip_usos','card_beneficios',
                           'mil_movimentos','mil_vendas','mil_emissoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy dono_aal2 on public.%I for all to authenticated
                    using (user_id = auth.uid() and public.is_aal2())
                    with check (user_id = auth.uid() and public.is_aal2())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
grant select on public.mil_saldos to authenticated;
revoke all on public.mil_saldos from anon;

do $$
declare t text;
begin
  foreach t in array array['mil_programas','mil_contas','card_isencoes','card_vip_usos','mil_movimentos','mil_vendas','mil_emissoes'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;
