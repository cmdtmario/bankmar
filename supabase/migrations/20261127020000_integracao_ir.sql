-- Integração Mês ↔ Imposto de Renda (pedido do Mário em 27/11/2026): um dado, um lugar.
--  1) Renda líquida do mês = líquido da folha + férias + 13º recebidos naquele mês (vem do IR mês a mês).
--  2) Contas de previdência do Mês alimentam as contribuições do IR (PGBL/VGBL), sem digitar duas vezes.

alter table public.ir_mensal add column decimo_terceiro numeric(14,2);

alter table public.bill_templates
  add column ir_plano text check (char_length(ir_plano) <= 60),
  add column ir_tipo text check (ir_tipo in ('PGBL','VGBL'));
alter table public.bills
  add column ir_plano text check (char_length(ir_plano) <= 60),
  add column ir_tipo text check (ir_tipo in ('PGBL','VGBL'));

alter table public.ir_previdencia
  add column origem text not null default 'manual' check (origem in ('manual','conta')),
  add column bill_id uuid unique references public.bills(id) on delete cascade;

-- Nome do plano sem acento e em maiúsculas: "Previdência Itaú" e "ITAU" são o mesmo plano.
create or replace function public.norm_plano(t text) returns text language sql immutable as $$
  select nullif(upper(trim(regexp_replace(translate(coalesce(t, ''), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '\s+', ' ', 'g'))), '')
$$;
-- "Previdencia PORTO" -> "PORTO"
create or replace function public.plano_da_descricao(d text) returns text language sql immutable as $$
  select public.norm_plano(regexp_replace(d, '^\s*previd[eê]ncia(\s+privada)?\s*[-:]?\s*', '', 'i'))
$$;

-- Conta nova: herda o plano do modelo recorrente; se não tiver modelo e a descrição começar com "Previdência", usa o nome.
create or replace function public.bills_ir_padrao() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.ir_plano is null and new.template_id is not null then
    select t.ir_plano, t.ir_tipo into new.ir_plano, new.ir_tipo from public.bill_templates t where t.id = new.template_id;
  end if;
  if tg_op = 'INSERT' and new.ir_plano is null and new.descricao ~* '^\s*previd' then
    new.ir_plano := public.plano_da_descricao(new.descricao);
  end if;
  new.ir_plano := public.norm_plano(new.ir_plano);
  if new.ir_plano is not null and new.ir_tipo is null then new.ir_tipo := 'PGBL'; end if;
  return new;
end $$;
create trigger trg_bills_ir_padrao before insert or update on public.bills for each row execute function public.bills_ir_padrao();

create or replace function public.templates_ir_norm() returns trigger language plpgsql as $$
begin
  new.ir_plano := public.norm_plano(new.ir_plano);
  if new.ir_plano is not null and new.ir_tipo is null then new.ir_tipo := 'PGBL'; end if;
  return new;
end $$;
create trigger trg_templates_ir_norm before insert or update on public.bill_templates for each row execute function public.templates_ir_norm();

-- Conta de previdência -> contribuição do IR no mesmo mês (o valor da conta manda).
create or replace function public.bills_ir_sync() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    delete from public.ir_previdencia where bill_id = old.id
      and (tg_op = 'DELETE' or new.ir_plano is distinct from old.ir_plano or new.competencia <> old.competencia);
  end if;
  if tg_op in ('INSERT','UPDATE') and new.ir_plano is not null then
    insert into public.ir_previdencia (user_id, competencia, plano, tipo, valor, origem, bill_id)
    values (new.user_id, new.competencia, public.norm_plano(new.ir_plano), coalesce(new.ir_tipo, 'PGBL'), greatest(new.valor, 0), 'conta', new.id)
    on conflict (user_id, competencia, plano) do update
      set valor = excluded.valor, tipo = excluded.tipo, origem = 'conta', bill_id = excluded.bill_id;
  end if;
  return null;
end $$;
create trigger trg_bills_ir_sync after insert or update or delete on public.bills for each row execute function public.bills_ir_sync();

-- Plano do IR sempre normalizado (o conflito "mesmo plano no mesmo mês" usa o nome normalizado).
create or replace function public.ir_prev_norm() returns trigger language plpgsql as $$
begin new.plano := coalesce(public.norm_plano(new.plano), new.plano); return new; end $$;
create trigger trg_ir_prev_norm before insert or update on public.ir_previdencia for each row execute function public.ir_prev_norm();
update public.ir_previdencia set plano = public.norm_plano(plano) where plano <> public.norm_plano(plano);

-- IR mês a mês -> renda líquida do mês em que o dinheiro entrou (recebido_em; sem data, o mês seguinte à folha).
create or replace function public.mes_recebimento(competencia date, recebido_em date) returns date language sql immutable as $$
  select date_trunc('month', coalesce(recebido_em, competencia + interval '1 month'))::date
$$;
create or replace function public.recalcular_renda(p_user uuid, p_mes date) returns void language plpgsql as $$
declare v numeric;
begin
  select sum(coalesce(salario_liquido,0) + coalesce(ferias_terco,0) + coalesce(decimo_terceiro,0)) into v
    from public.ir_mensal where user_id = p_user and public.mes_recebimento(competencia, recebido_em) = p_mes;
  if v is null then return; end if;     -- sem lançamento no IR: a renda do mês continua manual
  insert into public.months (user_id, competencia, renda) values (p_user, p_mes, v)
  on conflict (user_id, competencia) do update set renda = excluded.renda;
end $$;
create or replace function public.ir_mensal_renda() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.recalcular_renda(old.user_id, public.mes_recebimento(old.competencia, old.recebido_em)); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.recalcular_renda(new.user_id, public.mes_recebimento(new.competencia, new.recebido_em)); end if;
  return null;
end $$;
create trigger trg_ir_mensal_renda after insert or update or delete on public.ir_mensal for each row execute function public.ir_mensal_renda();

-- Dados que já existem: liga as contas e modelos de previdência e recalcula a renda dos meses com folha lançada.
update public.bill_templates set ir_plano = public.plano_da_descricao(descricao) where ir_plano is null and descricao ~* '^\s*previd';
update public.bills set ir_plano = public.plano_da_descricao(descricao), ir_tipo = coalesce(ir_tipo, 'PGBL') where ir_plano is null and descricao ~* '^\s*previd';
select public.recalcular_renda(user_id, public.mes_recebimento(competencia, recebido_em)) from (select distinct user_id, competencia, recebido_em from public.ir_mensal) x;

-- As funções rodam com a permissão de quem salva (RLS continua valendo: só mexe nos próprios meses e contas).
grant execute on function public.norm_plano(text), public.plano_da_descricao(text), public.mes_recebimento(date, date), public.recalcular_renda(uuid, date) to authenticated;
revoke execute on function public.recalcular_renda(uuid, date) from anon;
