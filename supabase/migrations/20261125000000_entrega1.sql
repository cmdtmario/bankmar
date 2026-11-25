-- BanKMar — Entrega 1 (Contabilidade, Faturas, Categorias, Divisão, Avisos)
-- Spec: specs/financas-pessoais.md
-- Regras gerais:
--   * Todo dado pertence ao usuário autenticado (user_id = auth.uid()).
--   * Acesso só com sessão verificada em duas etapas (aal2)  -> RF-01 / RNF-02.
--   * Nenhuma coluna guarda senha de terceiros, número completo de cartão,
--     validade, CVV ou CPF                                    -> RNF-03.
--   * Textos livres recusam números de cartão (Luhn)          -> RF-04.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Funções utilitárias
-- ---------------------------------------------------------------------------

-- Sessão com verificação em duas etapas concluída.
create or replace function public.is_aal2() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- RF-04: detecta sequência de 13 a 19 dígitos (com espaços/pontos/hífens) que passa no Luhn.
create or replace function public.contains_card_number(t text) returns boolean
language plpgsql immutable as $$
declare
  m text;
  digits text;
  s int; d int; i int; dbl boolean;
begin
  if t is null then return false; end if;
  for m in select x[1] from regexp_matches(t, '((?:\d[ .\-]?){12,18}\d)', 'g') as x loop
    digits := regexp_replace(m, '\D', '', 'g');
    if length(digits) between 13 and 19 then
      s := 0; dbl := false;
      for i in reverse length(digits)..1 loop
        d := substr(digits, i, 1)::int;
        if dbl then d := d * 2; if d > 9 then d := d - 9; end if; end if;
        s := s + d; dbl := not dbl;
      end loop;
      if s % 10 = 0 then return true; end if;
    end if;
  end loop;
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- Cadastros
-- ---------------------------------------------------------------------------

create table public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (not contains_card_number(nome)),
  apelido text check (not contains_card_number(apelido)),
  pix text, -- chave Pix opcional exibida no resumo (RF-35)
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.tags (               -- marcadores (RF-39a)
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (not contains_card_number(nome)),
  unique (user_id, nome)
);

create table public.categories (         -- RF-30
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  unique (user_id, nome)
);

create table public.category_rules (     -- RF-31: estabelecimento -> categoria
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  padrao text not null,                  -- chave normalizada do estabelecimento (contém)
  category_id uuid not null references public.categories(id) on delete cascade,
  unique (user_id, padrao)
);

-- Cadastro mínimo de cartão necessário às faturas da entrega 1.
-- (O cadastro completo de benefícios/isenções é da entrega 2.)
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  apelido text not null check (not contains_card_number(apelido)),
  emissor text not null check (emissor in ('itau','caixa','outro')),
  final4 char(4) check (final4 ~ '^\d{4}$'),
  dia_vencimento int check (dia_vencimento between 1 and 31),
  banco_pagamento text,
  ativo boolean not null default true,
  unique (user_id, apelido)
);

-- ---------------------------------------------------------------------------
-- Competência (mês) e renda — RF-13
-- ---------------------------------------------------------------------------
create table public.months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),
  renda numeric(12,2),
  unique (user_id, competencia)
);

-- ---------------------------------------------------------------------------
-- Contas (recorrentes e avulsas) — RF-10, RF-11
-- ---------------------------------------------------------------------------
create table public.bill_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  descricao text not null check (not contains_card_number(descricao)),
  dia_vencimento int not null check (dia_vencimento between 1 and 31),
  valor_padrao numeric(12,2),            -- null = valor variável
  banco_pagamento text,
  category_id uuid references public.categories(id) on delete set null,
  split_rule jsonb not null default '{"tipo":"mario"}',
  ativo boolean not null default true,
  inicio date not null default date_trunc('month', now())::date
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),
  template_id uuid references public.bill_templates(id) on delete set null,
  descricao text not null check (not contains_card_number(descricao)),
  vencimento date,
  valor numeric(12,2) not null default 0,
  banco_pagamento text,
  category_id uuid references public.categories(id) on delete set null,
  split_rule jsonb not null default '{"tipo":"mario"}',
  observacao text check (not contains_card_number(observacao)),
  origem text not null default 'manual' check (origem in ('manual','recorrente','boleto','planilha')),
  unique (user_id, competencia, template_id)
);

-- ---------------------------------------------------------------------------
-- Faturas e lançamentos — RF-20 a RF-28
-- ---------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete restrict,
  competencia date not null check (extract(day from competencia) = 1),
  vencimento date,
  total_impresso numeric(12,2),          -- total que o leitor comparou (RF-26)
  origem text not null default 'manual' check (origem in ('pdf','texto','manual','planilha')),
  arquivo_nome text,
  justificativa_diferenca text,
  confirmada boolean not null default false,
  importada_em timestamptz,
  unique (user_id, card_id, competencia)  -- caso 3: nunca duplica
);

-- Compra (agrupa as parcelas de uma mesma compra) — RF-24, RF-25
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  chave text not null,                   -- estabelecimento normalizado
  data_compra date,
  valor_parcela numeric(12,2) not null,
  parcelas_total int not null check (parcelas_total >= 1),
  descricao text check (not contains_card_number(descricao)),
  category_id uuid references public.categories(id) on delete set null,
  split_rule jsonb not null default '{"tipo":"mario"}'
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  purchase_id uuid references public.purchases(id) on delete set null,
  data_compra date,
  descricao_original text check (not contains_card_number(descricao_original)),
  descricao text not null check (not contains_card_number(descricao)),
  parcela_atual int,
  parcelas_total int,
  valor numeric(12,2) not null,          -- negativo = estorno/crédito (RF-27)
  category_id uuid references public.categories(id) on delete set null,
  split_rule jsonb not null default '{"tipo":"mario"}',
  conferido boolean not null default false,
  situacao text not null default 'real' check (situacao in ('real','projetada','nao_encontrada')),
  ordem int
);
create index on public.transactions (invoice_id);
create index on public.transactions (purchase_id);

-- Regras aprendidas na revisão — RF-24
create table public.learned_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chave text not null,                   -- descrição original normalizada (sem parcela)
  descricao text not null check (not contains_card_number(descricao)),
  category_id uuid references public.categories(id) on delete set null,
  split_rule jsonb,
  unique (user_id, chave)
);

-- ---------------------------------------------------------------------------
-- Pagamentos — RF-12 (até 2 por conta ou fatura)
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete cascade,
  data date not null,
  banco text,
  valor numeric(12,2) not null,
  check ((bill_id is null) <> (invoice_id is null))
);

create or replace function public.payments_max_two() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.payments p
       where (new.bill_id is not null and p.bill_id = new.bill_id)
          or (new.invoice_id is not null and p.invoice_id = new.invoice_id)) >= 2 then
    raise exception 'Cada conta ou fatura aceita no máximo 2 pagamentos';
  end if;
  return new;
end $$;
create trigger trg_payments_max_two before insert on public.payments
  for each row execute function public.payments_max_two();

-- ---------------------------------------------------------------------------
-- Divisão — RF-36 / RF-39a
-- split_rule:
--   {"tipo":"mario"}
--   {"tipo":"pct",   "partes":[{"pessoa_id":uuid,"pct":50,"tag_id":uuid?}, ...]}
--   {"tipo":"valor", "partes":[{"pessoa_id":uuid,"valor":10.5,"tag_id":uuid?}, ...]}
--   {"tipo":"total", "pessoa_id":uuid, "tag_id":uuid?}
-- O restante (e os centavos de arredondamento) fica com o Mário (caso 7).
-- ---------------------------------------------------------------------------
create table public.allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid references public.bills(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  person_id uuid references public.people(id) on delete restrict, -- null = Mário
  tag_id uuid references public.tags(id) on delete set null,
  valor numeric(12,2) not null,
  check ((bill_id is null) <> (transaction_id is null))
);
create index on public.allocations (person_id);
create index on public.allocations (transaction_id);
create index on public.allocations (bill_id);

create or replace function public.compute_allocations(total numeric, rule jsonb)
returns table (person_id uuid, tag_id uuid, valor numeric)
language plpgsql immutable as $$
declare
  tipo text := coalesce(rule ->> 'tipo', 'mario');
  p jsonb;
  soma numeric := 0;
  v numeric;
  sinal numeric := case when total < 0 then -1 else 1 end;
begin
  if tipo = 'mario' then
    person_id := null; tag_id := null; valor := total; return next; return;
  elsif tipo = 'total' then
    person_id := (rule ->> 'pessoa_id')::uuid; tag_id := (rule ->> 'tag_id')::uuid; valor := total;
    if person_id is null then raise exception 'Divisão 100%%: pessoa não informada'; end if;
    return next; return;
  elsif tipo = 'pct' then
    if (select coalesce(sum((x ->> 'pct')::numeric), 0) from jsonb_array_elements(rule -> 'partes') x) > 100 then
      raise exception 'Divisão: percentuais somam mais de 100%%';
    end if;
    for p in select * from jsonb_array_elements(rule -> 'partes') loop
      v := trunc(abs(total) * (p ->> 'pct')::numeric / 100, 2) * sinal;  -- trunca centavos; sobra vai ao Mário
      person_id := (p ->> 'pessoa_id')::uuid; tag_id := (p ->> 'tag_id')::uuid; valor := v;
      soma := soma + v; return next;
    end loop;
  elsif tipo = 'valor' then
    for p in select * from jsonb_array_elements(rule -> 'partes') loop
      v := abs((p ->> 'valor')::numeric) * sinal;
      person_id := (p ->> 'pessoa_id')::uuid; tag_id := (p ->> 'tag_id')::uuid; valor := v;
      soma := soma + v; return next;
    end loop;
    if abs(soma) > abs(total) then
      raise exception 'Divisão: as partes (%) passam do valor do lançamento (%) — diferença %', abs(soma), abs(total), abs(soma) - abs(total);
    end if;
  else
    raise exception 'Divisão: tipo desconhecido %', tipo;
  end if;
  if total - soma <> 0 then
    person_id := null; tag_id := null; valor := total - soma; return next;
  end if;
end $$;

create or replace function public.refresh_allocations() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'bills' then
    delete from public.allocations where bill_id = new.id;
    insert into public.allocations (user_id, bill_id, person_id, tag_id, valor)
      select new.user_id, new.id, a.person_id, a.tag_id, a.valor
        from public.compute_allocations(new.valor, new.split_rule) a;
  else
    delete from public.allocations where transaction_id = new.id;
    if new.situacao = 'real' then
      insert into public.allocations (user_id, transaction_id, person_id, tag_id, valor)
        select new.user_id, new.id, a.person_id, a.tag_id, a.valor
          from public.compute_allocations(new.valor, new.split_rule) a;
    end if;
  end if;
  return new;
end $$;
create trigger trg_bills_alloc after insert or update of valor, split_rule on public.bills
  for each row execute function public.refresh_allocations();
create trigger trg_tx_alloc after insert or update of valor, split_rule, situacao on public.transactions
  for each row execute function public.refresh_allocations();

-- ---------------------------------------------------------------------------
-- Recebimentos e links de consulta — RF-38, RF-40
-- ---------------------------------------------------------------------------
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  data date not null,
  valor numeric(12,2) not null check (valor > 0),
  observacao text check (not contains_card_number(observacao))
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  inicio date not null,
  fim date not null,
  token_hash text not null unique,        -- sha256 do token (o token só existe no link)
  expira_em timestamptz not null default now() + interval '30 days',
  revogado_em timestamptz,
  criado_em timestamptz not null default now(),
  check (fim >= inicio)
);

-- ---------------------------------------------------------------------------
-- Avisos — RF-80, RF-82
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

create table public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  email text not null
);

create table public.notification_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  referencia text not null,               -- ex.: bill:<id>:2026-11-10:D-1
  canal text not null,
  enviado_em timestamptz not null default now(),
  erro text,
  unique (referencia, canal)
);

-- ---------------------------------------------------------------------------
-- Auditoria e importações — RNF-04, RF-94
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigserial primary key,
  user_id uuid,
  tabela text not null,
  registro_id uuid,
  operacao text not null,
  antes jsonb,
  depois jsonb,
  em timestamptz not null default now()
);

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, tabela, registro_id, operacao, antes, depois)
  values (coalesce(auth.uid(), coalesce(new.user_id, old.user_id)), tg_table_name,
          coalesce(new.id, old.id), tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['bills','bill_templates','invoices','transactions','payments','receipts','people','months','share_links'] loop
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s
                    for each row execute function public.audit_row()', t);
  end loop;
end $$;

create table public.import_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null,                     -- fatura_pdf | fatura_texto | planilha_2026 | boleto
  arquivo text,
  em timestamptz not null default now(),
  importadas int not null default 0,
  ignoradas int not null default 0,
  alteradas int not null default 0,
  detalhes jsonb
);

-- ---------------------------------------------------------------------------
-- RLS — RNF-02
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['people','tags','categories','category_rules','cards','months','bill_templates',
                           'bills','invoices','purchases','transactions','learned_rules','payments',
                           'allocations','receipts','share_links','push_subscriptions',
                           'notification_settings','notification_log','import_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy dono_aal2 on public.%I for all to authenticated
                    using (user_id = auth.uid() and public.is_aal2())
                    with check (user_id = auth.uid() and public.is_aal2())', t);
  end loop;
end $$;

alter table public.audit_log enable row level security;
create policy dono_le on public.audit_log for select to authenticated
  using (user_id = auth.uid() and public.is_aal2());

-- allocations são escritas só pelo trigger
revoke insert, update, delete on public.allocations from authenticated;
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- Visão de itens por pessoa (usada pela tela da pessoa e pelo link)
-- ---------------------------------------------------------------------------
create or replace view public.person_items with (security_invoker = true) as
  select a.user_id, a.person_id, a.tag_id, t2.nome as tag_nome, a.valor,
         'fatura'::text as origem, tx.id as item_id,
         coalesce(tx.data_compra, i.vencimento) as data, tx.descricao,
         tx.parcela_atual, tx.parcelas_total, c.apelido as cartao, i.competencia
    from public.allocations a
    join public.transactions tx on tx.id = a.transaction_id
    join public.invoices i on i.id = tx.invoice_id
    join public.cards c on c.id = i.card_id
    left join public.tags t2 on t2.id = a.tag_id
  union all
  select a.user_id, a.person_id, a.tag_id, t2.nome, a.valor,
         'conta', b.id, b.vencimento, b.descricao, null, null, null, b.competencia
    from public.allocations a
    join public.bills b on b.id = a.bill_id
    left join public.tags t2 on t2.id = a.tag_id;

-- RF-40: consulta pública por token. Devolve só a pessoa e o período do link.
create or replace function public.get_shared_summary(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  l public.share_links;
  pessoa public.people;
  itens jsonb;
  recebidos jsonb;
  total numeric; pago numeric;
begin
  select * into l from public.share_links
   where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  if not found or l.revogado_em is not null or l.expira_em < now() then
    return jsonb_build_object('disponivel', false);   -- caso 12: não revela nada
  end if;
  select * into pessoa from public.people where id = l.person_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'data', pi.data, 'descricao', pi.descricao, 'parcela_atual', pi.parcela_atual,
           'parcelas_total', pi.parcelas_total, 'cartao', pi.cartao, 'marcador', pi.tag_nome,
           'valor', pi.valor) order by pi.tag_nome nulls first, pi.data), '[]'::jsonb),
         coalesce(sum(pi.valor), 0)
    into itens, total
    from public.person_items pi
   where pi.person_id = l.person_id and pi.competencia between date_trunc('month', l.inicio) and l.fim;
  select coalesce(jsonb_agg(jsonb_build_object('data', r.data, 'valor', r.valor) order by r.data), '[]'::jsonb),
         coalesce(sum(r.valor), 0)
    into recebidos, pago
    from public.receipts r
   where r.person_id = l.person_id and r.data between l.inicio and l.fim;
  return jsonb_build_object('disponivel', true, 'pessoa', pessoa.nome, 'pix', pessoa.pix,
                            'inicio', l.inicio, 'fim', l.fim, 'itens', itens,
                            'total', total, 'recebido', pago, 'saldo', total - pago);
end $$;
revoke all on function public.get_shared_summary(text) from public;
grant execute on function public.get_shared_summary(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Visões de resumo (RF-14, RF-16, RF-32)
-- ---------------------------------------------------------------------------
create or replace view public.invoice_summary with (security_invoker = true) as
  select i.id as invoice_id, i.user_id, i.card_id, i.competencia, i.vencimento, i.total_impresso, i.confirmada,
         coalesce(sum(t.valor) filter (where t.situacao = 'real'), 0) as total,
         coalesce((select sum(a.valor) from public.allocations a
                    join public.transactions t2 on t2.id = a.transaction_id
                   where t2.invoice_id = i.id and a.person_id is null), 0) as total_mario,
         count(t.id) filter (where t.situacao = 'real') as qtd_linhas,
         count(t.id) filter (where t.situacao = 'projetada') as qtd_projetadas,
         count(t.id) filter (where t.situacao = 'real' and not t.conferido) as qtd_nao_conferidas
    from public.invoices i
    left join public.transactions t on t.invoice_id = i.id
   group by i.id;

create or replace view public.bill_summary with (security_invoker = true) as
  select b.id as bill_id, b.user_id,
         coalesce((select sum(a.valor) from public.allocations a where a.bill_id = b.id and a.person_id is null), 0) as total_mario
    from public.bills b;

-- Gasto por categoria e competência (parte do Mário e total)
create or replace view public.gastos_categoria with (security_invoker = true) as
  select t.user_id, i.competencia, t.category_id,
         sum(t.valor) as total,
         sum((select coalesce(sum(a.valor),0) from public.allocations a where a.transaction_id = t.id and a.person_id is null)) as total_mario
    from public.transactions t join public.invoices i on i.id = t.invoice_id
   where t.situacao = 'real'
   group by t.user_id, i.competencia, t.category_id
  union all
  select b.user_id, b.competencia, b.category_id, sum(b.valor),
         sum((select coalesce(sum(a.valor),0) from public.allocations a where a.bill_id = b.id and a.person_id is null))
    from public.bills b
   group by b.user_id, b.competencia, b.category_id;

-- ---------------------------------------------------------------------------
-- Confirmação atômica da importação de uma fatura — RF-23 a RF-28, casos 3 e 5
-- ---------------------------------------------------------------------------
create or replace function public.ensure_invoice(p_card uuid, p_comp date) returns uuid
language plpgsql as $$
declare v uuid;
begin
  select id into v from public.invoices where card_id = p_card and competencia = p_comp;
  if v is null then
    insert into public.invoices (card_id, competencia, origem) values (p_card, p_comp, 'manual') returning id into v;
  end if;
  return v;
end $$;

create or replace function public.confirmar_fatura(p jsonb) returns uuid
language plpgsql as $$
declare
  v_card uuid := (p ->> 'card_id')::uuid;
  v_comp date := (p ->> 'competencia')::date;
  v_inv uuid;
  v_existente public.invoices;
  l jsonb; ne jsonb;
  v_purchase uuid; v_chave text; n int; v_fut uuid;
  v_novas int := 0; v_alt int := 0;
begin
  if not public.is_aal2() then raise exception 'Sessão sem verificação em duas etapas'; end if;
  select * into v_existente from public.invoices where card_id = v_card and competencia = v_comp;
  if found and v_existente.confirmada and not coalesce((p ->> 'substituir')::boolean, false) then
    raise exception 'FATURA_DUPLICADA: já existe fatura confirmada deste cartão em %', to_char(v_comp, 'MM/YYYY');
  end if;
  v_inv := public.ensure_invoice(v_card, v_comp);
  if coalesce((p ->> 'substituir')::boolean, false) then
    delete from public.transactions where invoice_id = v_inv and situacao in ('real','nao_encontrada');
  end if;

  -- caso 5: projeções sem linha real
  for ne in select * from jsonb_array_elements(coalesce(p -> 'nao_encontradas', '[]')) loop
    if ne ->> 'acao' = 'excluir' then
      delete from public.transactions where id = (ne ->> 'id')::uuid and situacao = 'projetada';
    else
      update public.transactions
         set invoice_id = public.ensure_invoice(v_card, (v_comp + interval '1 month')::date)
       where id = (ne ->> 'id')::uuid and situacao = 'projetada';
    end if;
  end loop;

  for l in select * from jsonb_array_elements(p -> 'linhas') loop
    v_purchase := nullif(l ->> 'purchase_id', '')::uuid;
    v_chave := l ->> 'chave';
    if l ->> 'projecao_id' is not null then
      delete from public.transactions where id = (l ->> 'projecao_id')::uuid and situacao = 'projetada';
    end if;
    if v_purchase is not null then
      update public.purchases set descricao = l ->> 'descricao', category_id = nullif(l ->> 'category_id','')::uuid,
                                  split_rule = l -> 'split_rule'
       where id = v_purchase;
      -- RF-24: projeções futuras da mesma compra herdam a correção
      update public.transactions set descricao = l ->> 'descricao', category_id = nullif(l ->> 'category_id','')::uuid,
                                     split_rule = l -> 'split_rule'
       where purchase_id = v_purchase and situacao = 'projetada';
    elsif (l ->> 'parcelas_total')::int > 1 then
      insert into public.purchases (card_id, chave, data_compra, valor_parcela, parcelas_total, descricao, category_id, split_rule)
      values (v_card, v_chave, nullif(l ->> 'data','')::date, (l ->> 'valor')::numeric, (l ->> 'parcelas_total')::int,
              l ->> 'descricao', nullif(l ->> 'category_id','')::uuid, l -> 'split_rule')
      returning id into v_purchase;
      -- RF-25: projeta as parcelas restantes nas faturas futuras
      for n in ((l ->> 'parcela_atual')::int + 1)..(l ->> 'parcelas_total')::int loop
        v_fut := public.ensure_invoice(v_card, (v_comp + make_interval(months => n - (l ->> 'parcela_atual')::int))::date);
        insert into public.transactions (invoice_id, purchase_id, data_compra, descricao_original, descricao, parcela_atual,
                                         parcelas_total, valor, category_id, split_rule, situacao)
        values (v_fut, v_purchase, nullif(l ->> 'data','')::date, l ->> 'descricao_original', l ->> 'descricao', n,
                (l ->> 'parcelas_total')::int, (l ->> 'valor')::numeric, nullif(l ->> 'category_id','')::uuid,
                l -> 'split_rule', 'projetada');
      end loop;
    end if;
    insert into public.transactions (invoice_id, purchase_id, data_compra, descricao_original, descricao, parcela_atual,
                                     parcelas_total, valor, category_id, split_rule, conferido, situacao, ordem)
    values (v_inv, v_purchase, nullif(l ->> 'data','')::date, l ->> 'descricao_original', l ->> 'descricao',
            nullif(l ->> 'parcela_atual','')::int, nullif(l ->> 'parcelas_total','')::int, (l ->> 'valor')::numeric,
            nullif(l ->> 'category_id','')::uuid, coalesce(l -> 'split_rule', '{"tipo":"mario"}'),
            coalesce((l ->> 'conferido')::boolean, false), 'real', v_novas);
    v_novas := v_novas + 1;
    -- RF-24 / RF-31: correções confirmadas viram regra
    if coalesce((l ->> 'lembrar')::boolean, false) and v_chave <> '' then
      insert into public.learned_rules (chave, descricao, category_id, split_rule)
      values (v_chave, l ->> 'descricao', nullif(l ->> 'category_id','')::uuid, l -> 'split_rule')
      on conflict (user_id, chave) do update set descricao = excluded.descricao, category_id = excluded.category_id,
                                                 split_rule = excluded.split_rule;
      if nullif(l ->> 'category_id','') is not null then
        insert into public.category_rules (padrao, category_id) values (v_chave, (l ->> 'category_id')::uuid)
        on conflict (user_id, padrao) do update set category_id = excluded.category_id;
      end if;
      v_alt := v_alt + 1;
    end if;
  end loop;

  update public.invoices set vencimento = nullif(p ->> 'vencimento','')::date,
         total_impresso = nullif(p ->> 'total_impresso','')::numeric, origem = coalesce(p ->> 'origem','manual'),
         arquivo_nome = p ->> 'arquivo_nome', justificativa_diferenca = nullif(p ->> 'justificativa',''),
         confirmada = true, importada_em = now()
   where id = v_inv;
  insert into public.import_log (tipo, arquivo, importadas, ignoradas, alteradas, detalhes)
  values ('fatura_' || coalesce(p ->> 'origem','manual'), p ->> 'arquivo_nome', v_novas, 0, v_alt,
          jsonb_build_object('invoice_id', v_inv, 'substituiu', coalesce((p ->> 'substituir')::boolean,false),
                             'avisos', p -> 'avisos'));
  return v_inv;
end $$;

-- ---------------------------------------------------------------------------
-- Importação da planilha 2026 — RF-90 / RF-94 (atômica)
-- ---------------------------------------------------------------------------
create or replace function public.pessoa_por_nome(p_nome text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  if p_nome is null then return null; end if;
  select id into v from public.people where lower(nome) = lower(p_nome);
  if v is null then insert into public.people (nome) values (p_nome) returning id into v; end if;
  return v;
end $$;

create or replace function public.tag_por_nome(p_nome text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  if p_nome is null then return null; end if;
  select id into v from public.tags where lower(nome) = lower(p_nome);
  if v is null then insert into public.tags (nome) values (p_nome) returning id into v; end if;
  return v;
end $$;

-- Converte {"tipo":"pct","pessoa":"Diego","pct":50,"marcador":"Salão"} em regra com ids.
create or replace function public.regra_com_ids(r jsonb) returns jsonb
language plpgsql as $$
begin
  case r ->> 'tipo'
    when 'mario' then return '{"tipo":"mario"}';
    when 'total' then return jsonb_build_object('tipo','total','pessoa_id', public.pessoa_por_nome(r ->> 'pessoa'),
                                                'tag_id', public.tag_por_nome(r ->> 'marcador'));
    when 'pct' then return jsonb_build_object('tipo','pct','partes', jsonb_build_array(jsonb_build_object(
                             'pessoa_id', public.pessoa_por_nome(r ->> 'pessoa'), 'pct', (r ->> 'pct')::numeric,
                             'tag_id', public.tag_por_nome(r ->> 'marcador'))));
    when 'valor' then return jsonb_build_object('tipo','valor','partes', jsonb_build_array(jsonb_build_object(
                             'pessoa_id', public.pessoa_por_nome(r ->> 'pessoa'), 'valor', (r ->> 'valor')::numeric,
                             'tag_id', public.tag_por_nome(r ->> 'marcador'))));
    else raise exception 'regra inválida %', r;
  end case;
end $$;

create or replace function public.importar_planilha(p jsonb) returns jsonb
language plpgsql as $$
declare
  m jsonb; c jsonb; f jsonb; l jsonb; pg jsonb; card jsonb;
  v_bill uuid; v_inv uuid; v_card uuid; v_comp date;
  n_contas int := 0; n_fat int := 0; n_lin int := 0;
begin
  if not public.is_aal2() then raise exception 'Sessão sem verificação em duas etapas'; end if;
  if exists (select 1 from public.import_log where tipo = 'planilha_2026') then
    raise exception 'PLANILHA_JA_IMPORTADA: a planilha 2026 já foi importada';
  end if;
  for card in select * from jsonb_array_elements(p -> 'cartoes') loop
    insert into public.cards (apelido, emissor, ativo)
    values (card ->> 'nome', card ->> 'emissor', (card ->> 'ativo')::boolean)
    on conflict (user_id, apelido) do nothing;
  end loop;
  for m in select * from jsonb_array_elements(p -> 'meses') loop
    v_comp := (m ->> 'competencia')::date;
    insert into public.months (competencia, renda) values (v_comp, nullif(m ->> 'renda','')::numeric)
    on conflict (user_id, competencia) do update set renda = excluded.renda;
    for c in select * from jsonb_array_elements(m -> 'contas') loop
      insert into public.bills (competencia, descricao, vencimento, valor, split_rule, observacao, origem)
      values (v_comp, c ->> 'descricao', nullif(c ->> 'vencimento','')::date, (c ->> 'valor')::numeric,
              public.regra_com_ids(c -> 'regra'), c ->> 'observacao', 'planilha')
      returning id into v_bill;
      for pg in select * from jsonb_array_elements(c -> 'pagamentos') loop
        insert into public.payments (bill_id, data, banco, valor) values (v_bill, (pg ->> 'data')::date, pg ->> 'banco', (pg ->> 'valor')::numeric);
      end loop;
      n_contas := n_contas + 1;
    end loop;
    for f in select * from jsonb_array_elements(m -> 'faturas') loop
      select id into v_card from public.cards where apelido = f ->> 'cartao';
      insert into public.invoices (card_id, competencia, vencimento, total_impresso, origem, confirmada, importada_em)
      values (v_card, v_comp, nullif(f ->> 'vencimento','')::date, (f ->> 'totalPlanilha')::numeric, 'planilha', true, now())
      returning id into v_inv;
      for pg in select * from jsonb_array_elements(f -> 'pagamentos') loop
        insert into public.payments (invoice_id, data, banco, valor) values (v_inv, (pg ->> 'data')::date, pg ->> 'banco', (pg ->> 'valor')::numeric);
      end loop;
      for l in select * from jsonb_array_elements(f -> 'linhas') loop
        insert into public.transactions (invoice_id, data_compra, descricao_original, descricao, parcela_atual, parcelas_total,
                                         valor, split_rule, conferido, situacao, ordem, category_id)
        values (v_inv, nullif(l ->> 'data','')::date, l ->> 'descricao', l ->> 'descricao',
                nullif(l ->> 'parcelaAtual','')::int, nullif(l ->> 'parcelasTotal','')::int, (l ->> 'valor')::numeric,
                public.regra_com_ids(l -> 'regra'), (l ->> 'conferido')::boolean, 'real', n_lin,
                nullif(l ->> 'category_id','')::uuid);
        n_lin := n_lin + 1;
      end loop;
      n_fat := n_fat + 1;
    end loop;
  end loop;
  insert into public.import_log (tipo, arquivo, importadas, ignoradas, detalhes)
  values ('planilha_2026', p ->> 'arquivo', n_contas + n_lin, jsonb_array_length(coalesce(p -> 'ignoradas','[]')),
          jsonb_build_object('contas', n_contas, 'faturas', n_fat, 'lancamentos', n_lin,
                             'ignoradas', p -> 'ignoradas', 'divergencias', p -> 'divergencias'));
  return jsonb_build_object('contas', n_contas, 'faturas', n_fat, 'lancamentos', n_lin);
end $$;

-- Visitante anônimo não acessa nenhuma tabela ou visão; só a função do link (RF-40).
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
grant execute on function public.get_shared_summary(text) to anon;
