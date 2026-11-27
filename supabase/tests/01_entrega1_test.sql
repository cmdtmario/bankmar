-- Testes da migration da entrega 1. Rodar com: psql -v ON_ERROR_STOP=1 -f 00_stub... -f migration -f este
\set ON_ERROR_STOP 1
create or replace function pg_temp.ok(cond boolean, nome text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FALHOU: %', nome; end if; raise notice 'ok - %', nome; end $$;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a','mario@x'), ('00000000-0000-0000-0000-00000000000b','outro@x');

-- sessão do Mário com 2 etapas
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', false);

insert into people (id, nome, pix) values ('10000000-0000-0000-0000-000000000001','Diego','diego@pix'),
                                         ('10000000-0000-0000-0000-000000000002','Jessy',null);
insert into tags (id, nome) values ('20000000-0000-0000-0000-000000000001','Salão');
insert into cards (id, apelido, emissor, final4, dia_vencimento) values ('30000000-0000-0000-0000-000000000001','Itaú Azul','itau','2781',8);
insert into invoices (id, card_id, competencia, vencimento, total_impresso, origem)
  values ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','2026-11-01','2026-11-08',100,'manual');

-- RF-36: 70/30
insert into transactions (id, invoice_id, descricao, valor, split_rule) values
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Mercado', 100.01,
  '{"tipo":"pct","partes":[{"pessoa_id":"10000000-0000-0000-0000-000000000001","pct":30}]}');
select pg_temp.ok((select valor from allocations where transaction_id='50000000-0000-0000-0000-000000000001' and person_id is not null) = 30.00, 'pct 30% trunca centavos para a pessoa');
select pg_temp.ok((select valor from allocations where transaction_id='50000000-0000-0000-0000-000000000001' and person_id is null) = 70.01, 'sobra de centavos fica com o Mário');
select pg_temp.ok((select sum(valor) from allocations where transaction_id='50000000-0000-0000-0000-000000000001') = 100.01, 'soma das partes = valor');

-- 100% Diego com marcador Salão
insert into transactions (id, invoice_id, descricao, valor, split_rule) values
 ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','Google ADS', 171.92,
  '{"tipo":"total","pessoa_id":"10000000-0000-0000-0000-000000000001","tag_id":"20000000-0000-0000-0000-000000000001"}');
select pg_temp.ok((select count(*) from allocations where transaction_id='50000000-0000-0000-0000-000000000002' and person_id is null) = 0, '100% Diego não deixa parte do Mário');
select pg_temp.ok((select tag_id from allocations where transaction_id='50000000-0000-0000-0000-000000000002') = '20000000-0000-0000-0000-000000000001', 'marcador gravado');

-- estorno dividido 50%
insert into transactions (id, invoice_id, descricao, valor, split_rule) values
 ('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','Estorno', -33.18,
  '{"tipo":"pct","partes":[{"pessoa_id":"10000000-0000-0000-0000-000000000001","pct":50}]}');
select pg_temp.ok((select valor from allocations where transaction_id='50000000-0000-0000-0000-000000000003' and person_id is not null) = -16.59, 'estorno abate da pessoa (RF-27)');

-- caso 7: partes passam do valor -> não salva
do $$ begin
  begin
    insert into transactions (invoice_id, descricao, valor, split_rule) values
     ('40000000-0000-0000-0000-000000000001','X', 10, '{"tipo":"valor","partes":[{"pessoa_id":"10000000-0000-0000-0000-000000000001","valor":12}]}');
    raise exception 'deveria ter falhado';
  exception when others then
    if sqlerrm like '%deveria%' then raise; end if;
    raise notice 'ok - divisão maior que o valor é recusada (%)', sqlerrm;
  end;
  begin
    insert into transactions (invoice_id, descricao, valor, split_rule) values
     ('40000000-0000-0000-0000-000000000001','X', 10, '{"tipo":"pct","partes":[{"pessoa_id":"10000000-0000-0000-0000-000000000001","pct":80},{"pessoa_id":"10000000-0000-0000-0000-000000000002","pct":30}]}');
    raise exception 'deveria ter falhado';
  exception when others then
    if sqlerrm like '%deveria%' then raise; end if;
    raise notice 'ok - percentuais acima de 100%% recusados';
  end;
end $$;

-- RF-04: número de cartão em texto livre é recusado
do $$ begin
  begin
    insert into bills (competencia, descricao, valor) values ('2026-11-01','cartão 4111 1111 1111 1111', 1);
    raise exception 'deveria ter falhado';
  exception when check_violation then raise notice 'ok - número de cartão recusado (RF-04)';
  end;
end $$;
insert into bills (id, competencia, descricao, valor, vencimento) values ('60000000-0000-0000-0000-000000000001','2026-11-01','IPTU - SQN 402 - 48033901', 10, '2026-11-10');
select pg_temp.ok(true, 'número curto (inscrição IPTU) aceito');

-- RF-12: no máximo 2 pagamentos
insert into payments (bill_id, data, valor) values ('60000000-0000-0000-0000-000000000001','2026-11-03',5),('60000000-0000-0000-0000-000000000001','2026-11-04',5);
do $$ begin
  begin
    insert into payments (bill_id, data, valor) values ('60000000-0000-0000-0000-000000000001','2026-11-05',1);
    raise exception 'deveria ter falhado';
  exception when others then
    if sqlerrm like '%deveria%' then raise; end if;
    raise notice 'ok - terceiro pagamento recusado';
  end;
end $$;

-- RNF-04: auditoria
update bills set valor = 12 where id = '60000000-0000-0000-0000-000000000001';
select pg_temp.ok((select (antes->>'valor')::numeric from audit_log where tabela='bills' and operacao='UPDATE' order by id desc limit 1) = 10, 'auditoria guarda valor anterior');

-- RF-40: link de consulta
insert into transactions (invoice_id, descricao, valor, split_rule) values
 ('40000000-0000-0000-0000-000000000001','Coisa da Jessy', 40, '{"tipo":"total","pessoa_id":"10000000-0000-0000-0000-000000000002"}');
insert into share_links (person_id, inicio, fim, token_hash) values
 ('10000000-0000-0000-0000-000000000001','2026-11-01','2026-11-30', encode(digest('tokenvalido','sha256'),'hex')),
 ('10000000-0000-0000-0000-000000000001','2026-11-01','2026-11-30', encode(digest('tokenrevogado','sha256'),'hex')),
 ('10000000-0000-0000-0000-000000000001','2026-11-01','2026-11-30', encode(digest('tokenexpirado','sha256'),'hex'));
update share_links set revogado_em = now() where token_hash = encode(digest('tokenrevogado','sha256'),'hex');
reset role;
update share_links set expira_em = now() - interval '1 day' where token_hash = encode(digest('tokenexpirado','sha256'),'hex');

-- visitante anônimo
set role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', false);
select pg_temp.ok((get_shared_summary('tokenvalido')->>'disponivel')::boolean, 'link válido abre sem login');
select pg_temp.ok((get_shared_summary('tokenvalido')->>'total')::numeric = 30.00 + 171.92 - 16.59, 'link mostra só os itens do Diego');
select pg_temp.ok(get_shared_summary('tokenvalido')::text not like '%Jessy%', 'link não mostra itens de outra pessoa');
select pg_temp.ok(get_shared_summary('tokenvalido')::text like '%Salão%', 'link agrupa por marcador');
select pg_temp.ok(get_shared_summary('tokenrevogado') = '{"disponivel": false}'::jsonb, 'link revogado não revela nada');
select pg_temp.ok(get_shared_summary('tokenexpirado') = '{"disponivel": false}'::jsonb, 'link expirado não revela nada');
select pg_temp.ok(get_shared_summary('qualquer') = '{"disponivel": false}'::jsonb, 'token inválido não revela nada');
do $$ begin
  begin perform * from transactions; raise exception 'deveria ter falhado';
  exception when insufficient_privilege then raise notice 'ok - anônimo não lê tabelas'; end;
end $$;
reset role;

-- RNF-02: sessão sem 2 etapas não vê nada; outro usuário não vê nada
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', false);
select pg_temp.ok((select count(*) from transactions) = 0, 'sessão aal1 (sem 2 etapas) não lê dados');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', false);
select pg_temp.ok((select count(*) from transactions) = 0 and (select count(*) from people) = 0, 'outro usuário não lê dados do Mário');
do $$ begin
  begin
    insert into allocations (user_id, bill_id, valor) values ('00000000-0000-0000-0000-00000000000b','60000000-0000-0000-0000-000000000001', 1);
    raise exception 'deveria ter falhado';
  exception when insufficient_privilege then raise notice 'ok - divisão só é escrita pelo banco';
  end;
end $$;
reset role;

-- RF-23..28: confirmação atômica de fatura com projeção de parcelas
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', false);
select confirmar_fatura('{"card_id":"30000000-0000-0000-0000-000000000001","competencia":"2026-12-01","vencimento":"2026-12-08",
  "total_impresso":300,"origem":"pdf","arquivo_nome":"fatura.pdf",
  "linhas":[{"data":"2026-11-20","descricao_original":"MERCADOLIVRE OSASCO","descricao":"MERCADO LIVRE - CASACO","chave":"MERCADOLIVRE OSASCO",
             "parcela_atual":1,"parcelas_total":6,"valor":50,"split_rule":{"tipo":"mario"},"lembrar":true},
            {"data":"2026-11-21","descricao_original":"PADARIA","descricao":"PADARIA","chave":"PADARIA","valor":250,"split_rule":{"tipo":"mario"}}]}'::jsonb);
select pg_temp.ok((select count(*) from transactions where situacao='projetada' and descricao='MERCADO LIVRE - CASACO') = 5, 'compra 1/6 projeta 5 parcelas (RF-25)');
select pg_temp.ok((select count(*) from invoices where card_id='30000000-0000-0000-0000-000000000001' and competencia between '2027-01-01' and '2027-05-01') = 5, 'faturas futuras criadas');
select pg_temp.ok((select descricao from learned_rules where chave='MERCADOLIVRE OSASCO') = 'MERCADO LIVRE - CASACO', 'correção vira regra aprendida');
-- caso 3: duplicada
do $$ begin
  begin
    perform confirmar_fatura('{"card_id":"30000000-0000-0000-0000-000000000001","competencia":"2026-12-01","linhas":[]}'::jsonb);
    raise exception 'deveria ter falhado';
  exception when others then
    if sqlerrm not like 'FATURA_DUPLICADA%' then raise; end if;
    raise notice 'ok - fatura duplicada é detectada (caso 3)';
  end;
end $$;
-- mês seguinte: parcela 2/6 casa com a compra e substitui a projeção
select confirmar_fatura(jsonb_build_object('card_id','30000000-0000-0000-0000-000000000001','competencia','2027-01-01',
  'linhas', jsonb_build_array(jsonb_build_object('descricao_original','MERCADOLIVRE OSASCO','descricao','MERCADO LIVRE - CASACO','chave','MERCADOLIVRE OSASCO',
     'parcela_atual',2,'parcelas_total',6,'valor',50,'split_rule','{"tipo":"mario"}'::jsonb,
     'purchase_id',(select id from purchases where chave='MERCADOLIVRE OSASCO'),
     'projecao_id',(select t.id from transactions t join invoices i on i.id=t.invoice_id where i.competencia='2027-01-01' and t.situacao='projetada' and t.parcela_atual=2)))));
select pg_temp.ok((select count(*) from transactions t join invoices i on i.id=t.invoice_id where i.competencia='2027-01-01' and t.descricao='MERCADO LIVRE - CASACO') = 1, 'parcela seguinte não duplica a projeção (RF-25)');
select pg_temp.ok((select count(*) from transactions where situacao='projetada' and descricao='MERCADO LIVRE - CASACO') = 4, 'restam 4 projeções');
select pg_temp.ok((select total from invoice_summary i join invoices v on v.id=i.invoice_id where v.competencia='2027-01-01' and v.card_id='30000000-0000-0000-0000-000000000001') = 50, 'resumo da fatura soma só linhas reais');
-- substituir fatura confirmada
select confirmar_fatura('{"card_id":"30000000-0000-0000-0000-000000000001","competencia":"2026-12-01","substituir":true,
  "linhas":[{"descricao_original":"X","descricao":"X","chave":"X","valor":10,"split_rule":{"tipo":"mario"}}]}'::jsonb);
select pg_temp.ok((select total from invoice_summary s join invoices v on v.id=s.invoice_id where v.competencia='2026-12-01' and v.card_id='30000000-0000-0000-0000-000000000001') = 10, 'substituir troca as linhas reais');

-- RF-90: importação da planilha
select importar_planilha('{"arquivo":"Contabilidade.xlsx","cartoes":[{"nome":"MERCADO PAGO","emissor":"outro","ativo":true}],
 "meses":[{"competencia":"2026-11-01","renda":31107.09,
   "contas":[{"descricao":"Aluguel","vencimento":"2026-11-10","valor":2800,"regra":{"tipo":"pct","pessoa":"Diego","pct":50},"pagamentos":[{"data":"2026-11-03","banco":"BB","valor":2800}]}],
   "faturas":[{"cartao":"MERCADO PAGO","vencimento":"2026-11-07","totalPlanilha":242.05,"pagamentos":[],
     "linhas":[{"data":"2026-10-30","descricao":"Perfumes + Xicaras Salão","valor":242.05,"conferido":true,
                "regra":{"tipo":"valor","pessoa":"Diego","valor":70,"marcador":"Salão"}}]}]}],
 "ignoradas":[{"aba":"COFRE","linha":null,"motivo":"credenciais"}]}'::jsonb);
select pg_temp.ok((select count(*) from people where lower(nome)='diego') = 1, 'pessoa existente é reaproveitada');
select pg_temp.ok((select a.valor from allocations a join transactions t on t.id=a.transaction_id where t.descricao like 'Perfumes%' and a.person_id is not null) = 70, 'divisão importada');
select pg_temp.ok((select ignoradas from import_log where tipo='planilha_2026') = 1, 'relatório guarda linhas ignoradas (RF-94)');
do $$ begin
  begin perform importar_planilha('{"cartoes":[],"meses":[]}'::jsonb); raise exception 'deveria ter falhado';
  exception when others then if sqlerrm not like 'PLANILHA_JA_IMPORTADA%' then raise; end if; raise notice 'ok - planilha não é importada duas vezes'; end;
end $$;
-- Entrega 3: ajustes com auditoria e deduplicação de negociações
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', false);
insert into inv_ajustes (codigo, preco_medio) values ('PETR4', 30.5);
update inv_ajustes set preco_medio = 31 where codigo = 'PETR4';
select pg_temp.ok((select count(*) from audit_log where tabela = 'inv_ajustes') = 2, 'ajuste de PM é auditado');
insert into inv_negociacoes (data, tipo, codigo, quantidade, preco, valor, chave) values ('2024-01-01','Compra','PETR4',10,30,300,'k1')
  on conflict (user_id, chave) do nothing;
insert into inv_negociacoes (data, tipo, codigo, quantidade, preco, valor, chave) values ('2024-01-01','Compra','PETR4',10,30,300,'k1')
  on conflict (user_id, chave) do nothing;
select pg_temp.ok((select count(*) from inv_negociacoes) = 1, 'reimportar a mesma negociação não duplica (RF-61)');
insert into inv_cotacoes (codigo, data, preco) values ('PETR4','2026-11-24',30),('PETR4','2026-11-25',31),('PETR4','2026-11-26',32.5),('VALE3','2026-11-26',60);
select pg_temp.ok((select anterior from inv_cotacoes_recentes where codigo='PETR4') = 31 and (select preco from inv_cotacoes_recentes where codigo='PETR4') = 32.5, 'último preço e fechamento anterior');
select pg_temp.ok((select anterior from inv_cotacoes_recentes where codigo='VALE3') is null, 'sem dia anterior fica vazio');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', false);
select pg_temp.ok((select count(*) from inv_cotacoes_recentes) = 0, 'cotações de outro usuário não aparecem');
reset role;

-- Entrega 2: cartões e milhas
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal2"}', false);
do $$ begin
  begin
    update cards set observacoes = 'cartao 4111 1111 1111 1111' where id = '30000000-0000-0000-0000-000000000001';
    raise exception 'FALHOU: número de cartão nas observações deveria ser recusado';
  exception when check_violation then raise notice 'ok - observação com número de cartão é recusada';
  end;
end $$;
insert into mil_programas (id, nome, limite_cpfs) values ('60000000-0000-0000-0000-000000000001','Latam Pass',24);
insert into mil_contas (id, programa_id) values ('61000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001');
insert into mil_contas (id, programa_id, titular, de_terceiro) values ('61000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000001','Diego',true);
insert into mil_movimentos (conta_id, data, tipo, origem, pontos) values ('61000000-0000-0000-0000-000000000001','2026-01-10','entrada','cartao',100000);
insert into mil_movimentos (conta_id, data, tipo, origem, valor) values ('61000000-0000-0000-0000-000000000001','2026-01-10','custo','clube',1500);
insert into mil_movimentos (conta_id, data, tipo, origem, pontos) values ('61000000-0000-0000-0000-000000000001','2026-02-10','saida','uso',20000);
insert into mil_vendas (conta_id, data, quantidade, valor_total, cpfs) values ('61000000-0000-0000-0000-000000000001','2026-03-01',30000,750,2);
insert into mil_emissoes (conta_id, data, milhas, cpfs) values ('61000000-0000-0000-0000-000000000001','2026-04-01',10000,1);
select pg_temp.ok((select saldo from mil_saldos where conta_id='61000000-0000-0000-0000-000000000001') = 40000, 'saldo = entradas − usos − emissões − vendas');
select pg_temp.ok((select custo_milheiro from mil_saldos where conta_id='61000000-0000-0000-0000-000000000001') = 15, 'custo do milheiro = custos ÷ entradas × 1000');
insert into card_vip_usos (card_id, data, aeroporto) values ('30000000-0000-0000-0000-000000000001','2026-11-01','BSB');
select pg_temp.ok((select count(*) from audit_log where tabela = 'card_vip_usos') = 1, 'uso de sala VIP é auditado');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal2"}', false);
select pg_temp.ok((select count(*) from mil_saldos) = 0 and (select count(*) from mil_movimentos) = 0, 'milhas de outro usuário não aparecem');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', false);
select pg_temp.ok((select count(*) from mil_movimentos) = 0, 'sem a segunda etapa de login, milhas ficam fechadas');
reset role;
select 'TODOS OS TESTES SQL PASSARAM' as resultado;
