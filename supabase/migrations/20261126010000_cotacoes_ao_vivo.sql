-- Cotação ao vivo + histórico diário: hora da última atualização e visão com o último preço e o fechamento anterior.
alter table public.inv_cotacoes add column atualizado_em timestamptz not null default now();

create view public.inv_cotacoes_recentes with (security_invoker = true) as
select codigo, data, preco, atualizado_em, anterior, data_anterior
from (
  select c.codigo, c.data, c.preco, c.atualizado_em,
         lead(c.preco) over w as anterior, lead(c.data) over w as data_anterior,
         row_number() over w as n
  from public.inv_cotacoes c
  window w as (partition by c.user_id, c.codigo order by c.data desc)
) x
where n = 1;

grant select on public.inv_cotacoes_recentes to authenticated;
