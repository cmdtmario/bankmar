-- Pedidos de 27/11/2026: fatura zerada conferida, programas de milhas habilitáveis e cotação do milheiro por programa.

-- Fatura que veio zerada: você confirma que conferiu e ela sai das pendências.
alter table public.invoices add column zerada_conferida_em timestamptz;

create or replace view public.invoice_summary with (security_invoker = true) as
  select i.id as invoice_id, i.user_id, i.card_id, i.competencia, i.vencimento, i.total_impresso, i.confirmada,
         coalesce(sum(t.valor) filter (where t.situacao = 'real'), 0) as total,
         coalesce((select sum(a.valor) from public.allocations a
                    join public.transactions t2 on t2.id = a.transaction_id
                   where t2.invoice_id = i.id and a.person_id is null), 0) as total_mario,
         count(t.id) filter (where t.situacao = 'real') as qtd_linhas,
         count(t.id) filter (where t.situacao = 'projetada') as qtd_projetadas,
         count(t.id) filter (where t.situacao = 'real' and not t.conferido) as qtd_nao_conferidas,
         i.zerada_conferida_em
    from public.invoices i
    left join public.transactions t on t.invoice_id = i.id
   group by i.id;

-- Programas de milhas: mostrar só os que você usa, e a cotação do milheiro para o valor estimado de venda.
alter table public.mil_programas
  add column ativo boolean not null default true,
  add column cotacao_milheiro numeric(10,2) check (cotacao_milheiro >= 0);

create or replace view public.mil_saldos with (security_invoker = true) as
select c.id as conta_id, c.programa_id, p.nome as programa, c.titular, c.de_terceiro, c.ativa,
       coalesce(m.entradas, 0) as entradas,
       coalesce(m.saidas, 0) + coalesce(e.milhas, 0) as saidas,
       coalesce(v.vendidas, 0) as vendidas,
       coalesce(m.entradas, 0) - coalesce(m.saidas, 0) - coalesce(e.milhas, 0) - coalesce(v.vendidas, 0) as saldo,
       coalesce(m.custos, 0) as custos,
       case when coalesce(m.entradas, 0) > 0 then round(coalesce(m.custos, 0) / m.entradas * 1000, 4) end as custo_milheiro,
       coalesce(v.receita, 0) as receita_vendas,
       p.ativo as programa_ativo
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

grant select on public.invoice_summary, public.mil_saldos to authenticated;
