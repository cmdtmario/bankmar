# Relatório de implementação — Sistema de Finanças Pessoais (BanKMar), Entrega 1

**Spec:** specs/financas-pessoais.md
**Data:** 2026-11-25
**Escopo desta construção:** Entrega 1 — RF-01 a RF-40 (incluindo RF-21a e RF-39a), RF-80, RF-82, RF-90 e os RNFs aplicáveis.
**Repositório:** github.com/cmdtmario/bankmar (`main`)

Abreviação usada nos caminhos: `M` = `supabase/migrations/20261125000000_entrega1.sql`.

## Requisitos atendidos

| ID | Requisito (resumo) | Status | Onde | Como verificar |
|----|--------------------|--------|------|----------------|
| RF-01 | Login com e-mail, senha e TOTP; nada abre sem login, exceto os links | Atendido | `src/paginas/Login.tsx`, `src/App.tsx:20`, `M:17` (is_aal2), `M:427` (RLS) | Teste SQL "sessão aal1 não lê dados"; entrar no app pede o código do autenticador |
| RF-02 | Usuário único, sem cadastro público | Atendido (com configuração) | `supabase/config.toml`, README §1.3; RLS `user_id = auth.uid()` | Teste SQL "outro usuário não lê dados". Desligar "Allow new users to sign up" no painel |
| RF-03 | Botão "Abrir cofre" (Bitwarden) | Atendido | `src/App.tsx:16,39` | O botão no topo abre vault.bitwarden.com em nova aba |
| RF-04 | Recusa número de cartão (Luhn) em texto livre | Atendido | `M:23` (CHECK no banco), `src/lib/regras.ts:189` (tela) | Teste SQL "número de cartão recusado"; `regras.test.ts` |
| RF-10 | Contas recorrentes geradas a cada mês | Atendido | `src/lib/dados.ts:42`, `src/paginas/Contas.tsx:60` | Criar uma recorrente e abrir o mês seguinte em "Mês" |
| RF-11 | Contas avulsas | Atendido | `src/paginas/Contas.tsx:101` | "+ Conta avulsa" |
| RF-12 | Até 2 pagamentos; status PAGO / FALTA / VERIFICAR / CONFERIR HOJE / AGENDADO | Atendido | `src/lib/regras.ts:16`, `M:217` | `regras.test.ts`; teste SQL "terceiro pagamento recusado" |
| RF-13 | Renda manual, com o mês anterior como sugestão | Atendido | `src/paginas/Mes.tsx:53`, `src/lib/dados.ts` (rendaSugerida) | Tela "Mês" mostra a sugestão e o botão "Usar" |
| RF-14 | Parte do Mário e impacto na renda | Atendido | `M:500` (invoice_summary, bill_summary), `src/paginas/Mes.tsx` | Cada item mostra "meu" e "% da renda" |
| RF-15 | Boleto por foto ou linha digitável | Atendido | `src/lib/boleto.ts`, `src/paginas/Contas.tsx:123` | `regras.test.ts` (boleto Itaú real: R$ 4.057,00, venc. 08/07/2026) |
| RF-16 | Tela "Mês" | Atendido | `src/paginas/Mes.tsx` | Abre na entrada do app |
| RF-20 | Leitura do PDF da fatura sem IA | Atendido | `src/lib/faturas/pdf.ts`, `itau.ts`, `caixa.ts` | `leitores.test.ts` |
| RF-21 | Leitores por emissor: Itaú e Caixa | Atendido | `src/lib/faturas/index.ts` | Amostras: total Itaú R$ 4.057,00 e Caixa R$ 2.197,44, iguais ao impresso |
| RF-21a | Descarta CPF, endereço, linha digitável e limites | Atendido | `itau.ts`, `caixa.ts` (só extraem vencimento, total, final e linhas) | `leitores.test.ts` "lê cabeçalho sem dados pessoais" |
| RF-22 | Plano B: colar texto (markdown, TAB ou ;) | Atendido | `src/lib/faturas/texto.ts`, `src/paginas/Faturas.tsx:87` | `leitores.test.ts` "Plano B" |
| RF-23 | Tela de revisão | Atendido | `src/paginas/Revisao.tsx` | Importar uma fatura |
| RF-24 | Aprende correções; parcela seguinte herda descrição, categoria e divisão | Atendido | `src/lib/regras.ts:132`, `M:614` | `regras.test.ts`; testes SQL "correção vira regra" e "parcela seguinte" |
| RF-25 | Projeção de parcelas sem duplicar | Atendido | `M:597` | Teste SQL "compra 1/6 projeta 5" e "não duplica a projeção" |
| RF-26 | Total extraído x impresso; bloqueia sem justificativa | Atendido | `src/paginas/Revisao.tsx:47` | O botão "Confirmar" fica desabilitado com diferença e sem justificativa |
| RF-27 | Estornos negativos abatidos do responsável | Atendido | `M:253` | Teste SQL "estorno abate da pessoa" |
| RF-28 | Fatura lançada à mão | Atendido | `src/paginas/Faturas.tsx:74`, `Revisao.tsx:71` | "Lançar à mão" → "+ Lançamento manual" |
| RF-30 | Categorias editáveis, com lista inicial | Atendido | `src/lib/dados.ts:28`, `src/paginas/Categorias.tsx:95` | No primeiro acesso as 15 categorias já existem |
| RF-31 | Sugestão por regra; correção vira regra com confirmação ("lembrar") | Atendido | `src/lib/regras.ts:96`, `M:614` | `regras.test.ts` |
| RF-32 | Gasto por categoria, 12 meses e top estabelecimentos | Atendido | `src/paginas/Categorias.tsx:63-83`, `M:519` | Aba "Gastos" |
| RF-35 | Cadastro de pessoas | Atendido | `src/paginas/Pessoas.tsx` | Aba "Pessoas" |
| RF-36 | Divisão por percentual, valor fixo ou 100%; soma = valor | Atendido | `M:253` (banco), `src/lib/regras.ts:47` (prévia na tela) | Testes SQL e `regras.test.ts` |
| RF-37 | Tela por pessoa: itens, total, recebido, saldo acumulado | Atendido | `src/paginas/Pessoas.tsx:72` | Abrir uma pessoa |
| RF-38 | Recebimentos | Atendido | `src/paginas/Pessoas.tsx:181` | "Registrar recebimento" |
| RF-39 | PDF e texto de WhatsApp com itens, total e Pix | Atendido | `src/lib/pdfResumo.ts`, `src/lib/resumo.ts` | `regras.test.ts` (texto); botão "Baixar PDF" |
| RF-39a | Marcadores (ex.: Salão) agrupados com subtotal | Atendido | `src/lib/resumo.ts`, `M:444`, `src/paginas/Pessoas.tsx` | Testes SQL e TS "agrupa e subtotaliza" |
| RF-40 | Link sem login, só da pessoa e do período, expira em 30 dias, revogável | Atendido | `M:462`, `src/paginas/Compartilhado.tsx`, `src/lib/token.ts` | Testes SQL "link válido / revogado / expirado / não mostra outra pessoa" |
| RF-80 | Aviso na véspera e no dia, sem pagamento | Atendido (sem execução real) | `supabase/functions/avisos-vencimento/` | `src/lib/avisos.test.ts`. O envio real depende das chaves (README §4) |
| RF-82 | Push e e-mail | Parcial | `src/lib/push.ts`, `src/sw.ts`, Edge Function | Código pronto; não testado contra Resend e Web Push de verdade. No iPhone, push só funciona com o app instalado na tela inicial |
| RF-90 | Importar jan–dez/2026 com conferência dos totais | Atendido | `src/lib/importacao/planilha2026.ts`, `M:681`, `src/paginas/Mais.tsx` | Planilha real importada num Postgres local: 185 contas, 146 faturas e 1.430 lançamentos. 145 de 146 faturas batem com a planilha; a que não bate tem R$ 0,01 de diferença (03/2026 Itaú Azul, total com fração de centavo na própria planilha) e aparece no relatório |
| RNF-01 | Custo zero | Atendido (por projeto) | Netlify, Supabase, Resend e GitHub Actions, todos gratuitos | Ver o painel de cobrança após implantar |
| RNF-02 | Confidencialidade (RLS, HTTPS, token de 256 bits) | Atendido | `M:427`, `M:738`, `src/lib/token.ts`, `netlify.toml` | Testes SQL "anônimo não lê tabelas" |
| RNF-03 | Nenhum campo para senha, número completo, validade, CVV ou CPF | Atendido | Esquema em `M` | Revisão do esquema: `cards` só tem `final4` |
| RNF-04 | Auditoria e log de importações | Atendido | `M:384` (audit_row), `import_log` | Teste SQL "auditoria guarda valor anterior". A importação real gerou 2.058 registros de auditoria |
| RNF-05 | Celular 360 px; PWA instalável; câmera | Atendido (não medido em aparelho) | `src/index.css`, `vite.config.ts`, `src/sw.ts` | Build gera manifest e service worker |
| RNF-06 | Fatura de 200 linhas em ≤ 10 s; telas em ≤ 3 s | Não verificado | — | Sem backend real aqui. Leitura local dos PDFs de amostra < 1 s |
| RNF-07 | Exportação completa sob demanda e semanal | Parcial | `src/lib/exportar.ts` | Exportação sob demanda feita. A semanal automática depende do destino (pergunta em aberto) |
| RNF-08 | pt-BR, R$, dd/mm/aaaa, fuso de Brasília | Atendido | `src/lib/formato.ts` | `regras.test.ts` (fuso) |
| RNF-09 | Amostras anonimizadas e testes por leitor; leitor quebrado não afeta os outros | Atendido | `src/lib/faturas/__fixtures__`, `scripts/anonimizar-fixture.mjs`, `index.ts` | `leitores.test.ts` |

## Casos extremos

| # | Situação | Tratamento implementado | Onde |
|---|----------|-------------------------|------|
| 1 | Layout novo ou leitor falha | `LeitorError`; nada é importado; oferece "Colar texto" | `Faturas.tsx:30`, `itau.ts`, `caixa.ts` |
| 2 | PDF com senha | Pede a senha só para abrir; não é guardada | `pdf.ts` |
| 3 | Fatura enviada duas vezes | Detecta cartão + mês já confirmados; exige "substituir" ou cancelar | `M:560`, `Revisao.tsx` |
| 4 | Total diferente | Mostra a diferença e bloqueia sem justificativa | `Revisao.tsx:47` |
| 5 | Parcela projetada que não veio | "Manter para o mês seguinte" ou "Excluir" | `Revisao.tsx:129`, `M:567` |
| 6 | Moeda estrangeira, IOF ou anuidade | Linha normal em R$; regra inicial IOF/ANUIDADE → Tarifas/IOF | `regras.ts`, `caixa.ts` (internacional testado) |
| 7 | Divisão que não bate | Não salva e mostra a diferença; centavos vão para o Mário | `M:253`, `regras.ts:47` |
| 8 | Boleto ilegível | Pede nova foto ou a linha digitável; dígito inválido é recusado | `Contas.tsx:123`, `boleto.ts` |
| 9 | Fonte de cotação fora do ar | Não se aplica à entrega 1 | — |
| 10 | Arquivo B3 em outro formato | Não se aplica à entrega 1 | — |
| 11 | Página de benefício inacessível | Não se aplica à entrega 1 | — |
| 12 | Link expirado ou revogado | "Este link não está mais disponível", sem nenhum dado | `M:462`, `Compartilhado.tsx` |
| 13 | Rota sem login | Redireciona para o login antes de buscar qualquer dado | `App.tsx:32` |
| 14 | Número de cartão em texto | Recusado na tela e no banco | `regras.ts:189`, `M:23` |
| 15 | Plano gratuito perto do limite (80%) | **Não atendido** — não há API gratuita simples de uso do plano para consultar | — |

## Definição de concluído (itens da entrega 1)

- [x] Rota sem login vai para o login, que exige o código do autenticador — `App.tsx`; testes SQL aal1.
- [x] Consulta direta ao banco com a credencial pública, sem login, não retorna registros — teste SQL "anônimo não lê tabelas".
- [x] Esquema sem campos para dados proibidos — revisão do esquema.
- [x] Totais de cada mês e fatura de 2026 iguais aos da planilha, com relatório de ignoradas — 145/146 exatas; a diferença de R$ 0,01 vem da própria planilha e está no relatório.
- [x] Faturas de amostra Itaú e Caixa conferem com o impresso, sem CPF ou endereço gravado — `leitores.test.ts`.
- [x] Colar texto no formato padronizado importa corretamente — `leitores.test.ts`.
- [x] Compra em 6x projeta 5 parcelas sem duplicar no mês seguinte e mantém a descrição — testes SQL.
- [x] "MERCADO LIVRE" corrigido faz a parcela seguinte vir corrigida — `regras.test.ts` + teste SQL.
- [x] Divisão 70/30 e 100% Diego, com PDF/texto e Pix — testes SQL e TS (o PDF não foi aberto visualmente).
- [x] Link do Diego: só os itens dele; deixa de funcionar após revogação e expiração — testes SQL.
- [ ] Push e e-mail às 8h na véspera e no dia — lógica testada; envio real não verificado (depende de chaves e da implantação).
- [x] Foto/linha de boleto real preenche valor e vencimento — testado com a linha digitável real da fatura Itaú. A leitura da foto pela câmera não foi testada em aparelho.
- [ ] Exportação reaberta numa planilha com os mesmos totais — implementada, não executada contra o banco real.
- [ ] Telas em celular de 360 px e instalação na tela inicial — CSS mobile-first e PWA gerados; não testado em aparelho.
- [ ] Painel de cobrança com R$ 0 — depende da implantação.

## Arquivos criados

- `supabase/migrations/20261125000000_entrega1.sql` — esquema, RLS aal2, Luhn, divisão, auditoria, visões, RPCs de fatura, planilha e link
- `supabase/tests/*` — stub do Supabase e 35 testes SQL
- `supabase/functions/avisos-vencimento/*` — Edge Function de avisos; `supabase/agendamento.sql` — cron das 8h
- `src/lib/faturas/*` — leitores Itaú, Caixa e texto; extração de PDF; fixtures anonimizadas
- `src/lib/regras.ts`, `boleto.ts`, `resumo.ts`, `formato.ts`, `token.ts`, `pdfResumo.ts`, `exportar.ts`, `push.ts`, `dados.ts`, `supabase.ts`
- `src/lib/importacao/planilha2026.ts` — importador da planilha
- `src/paginas/*`, `src/ui/comum.tsx`, `src/App.tsx`, `src/sw.ts`, `src/index.css`
- `netlify.toml`, `.github/workflows/{supabase,testes}.yml`, `README.md`, `.gitignore`, `public/icon-*.png`

## Desvios e decisões

- **Cadastro de cartões:** é RF-44/45 (entrega 2), mas as faturas precisam dele. Foi feito o mínimo: apelido, leitor, final, dia de vencimento, banco e ativo/desativado. Benefícios e isenções continuam na entrega 2.
- **Total esperado no Itaú:** usa "Lançamentos atuais" (sem saldo anterior). Na Caixa, usa "Valor total desta fatura − saldo anterior − pagamentos". Ambos são o total impresso relevante para conferir as linhas.
- **Competência da fatura:** é o mês do vencimento, igual à planilha.
- **Leitura dos PDFs:** acontece no navegador, para o arquivo não sair do aparelho (reforça o RF-21a).
- **Divisões das contas fixas na importação:** usam o rodapé "VALOR DIEGO" da planilha para identificar o Diego. Divisões sem responsável identificável vão para a pessoa "A revisar (planilha)". O marcador "Salão" só é aplicado quando a descrição contém "Salão".
- **Linhas da planilha só com valor, sem descrição:** entram na soma da planilha, então são importadas como "(sem descrição na planilha)".
- **"Total Mário" maior que o valor (erro da planilha):** a linha é importada como 100% Mário e aparece no relatório.
- **Contas variáveis:** a recorrência usa o valor do mês anterior como estimativa, marcada para confirmação.
- **Planilha importada:** não gera compras nem projeções de parcelas. As parcelas de 2027 passam a ser aprendidas na primeira fatura importada.
- **Banco e função de avisos:** publicados por GitHub Actions, seguindo o pedido de automação via GitHub.

## Fora de escopo (não implementado de propósito)

- Entregas 2 a 4 (benefícios de cartão, milhas, investimentos, IR).
- IA paga, pagamento de contas, leitura de contracheque e acesso com login para outras pessoas.
- Leitores de outros emissores: aguardam amostras.

## Pendências para o revisor

- Implantar (README) e executar no ambiente real os 4 itens não verificados da definição de concluído.
- Caso 15 (aviso de 80% do plano gratuito): decidir se vira verificação manual ou se sai do escopo.
- RNF-07: definir o destino da cópia semanal.
- Revisar os itens "A revisar (planilha)" depois da importação.

---

# Relatório de implementação — Entrega 3 (Investimentos)

**Spec:** specs/financas-pessoais.md · **Data:** 2026-11-26 · **Branch:** dev (não publicada)

| ID | Requisito (resumo) | Status | Onde | Como verificar |
|----|--------------------|--------|------|----------------|
| RF-60 | Importar Negociação, Movimentação, Proventos a receber e Posição, reconhecendo o tipo pelas colunas | Atendido | `src/lib/investimentos/b3.ts`, `dados.ts:importarArquivoB3` | Investir → Importar → enviar os 4 arquivos; teste `carteira.test.ts` com arquivos reais |
| RF-60c | Eventos corporativos e transferências | Atendido (com desvio) | `carteira.ts:calcularCustos` | ver “Desvios” |
| RF-60d | Equivalência de instituições | Parcial | `carteira.ts:criarAgrupador`, tabela `inv_instituicoes` | agrupamento padrão funciona; ainda não há tela para editar a tabela |
| RF-61 | Reimportar não duplica | Atendido | `unique(user_id, chave)` + upsert ignoreDuplicates | teste SQL “reimportar a mesma negociação não duplica” |
| RF-62 | Cotação diária | Atendido | `supabase/functions/investimentos-diario` + botão Cotações | depende de publicar a função e do agendamento |
| RF-63–65 | Ativos com PM, resultado, proventos, alvo, PM manual | Atendido | `paginas/Investimentos.tsx` (Ativos/EditarAtivo) | e2e `*-41`, `*-45` |
| RF-66 | Previdência e saldos fora da B3 | Atendido | aba Importar → formulário | e2e `*-43` |
| RF-67 | Foto mensal e evolução | Atendido | função diária (`logica.ts`), gráfico Evolução | `diario.test.ts` |
| RF-68 | Proventos por mês/tipo/ativo/ano e próximos pagamentos | Atendido | aba Proventos, card Próximos pagamentos | e2e `*-42` |
| RF-69 | Conciliação com a planilha antiga + “usar preço da planilha” | Atendido | `planilhaAntiga.ts` | com a planilha real: 16 dos 19 ativos sem PM são cobertos |

## Desvios e decisões
- Quantidade vem do arquivo de Posição. O histórico da B3 não traz IPOs, ofertas, conversões e renomeações (ex.: ALSO3→ALOS3). Com os seus arquivos, 28 dos 83 ativos têm o custo completo pelo histórico. Para os outros, o PM vem do valor que você informar ou da planilha antiga. A spec (RF-60c e a definição de concluído) foi atualizada.
- Na Movimentação, as linhas “Compra/Venda” (termo/FCA) são ignoradas, e as “Transferência - Liquidação” espelham negociações já contadas.
- Cotações vêm do Yahoo Finance, que é gratuito e não pede chave. A brapi.dev entra como reserva se BRAPI_TOKEN for configurado.

## Pendências
- Publicar a função `investimentos-diario` e criar o agendamento (`supabase/agendamento.sql`, 2º bloco).
- Tela de equivalência de instituições (RF-60d).

---

# Relatório de implementação — Entregas 2 (Cartões, Milhas) e 4 (Imposto de Renda)

**Spec:** specs/financas-pessoais.md · **Data:** 2026-11-27 · **Branch:** dev (não publicada)

## Requisitos atendidos

| ID | Requisito (resumo) | Status | Onde | Como verificar |
|----|--------------------|--------|------|----------------|
| RF-44 | Cadastrar, desativar e reativar cartão; desativado some do dia a dia e dos avisos | Atendido | `paginas/Cartoes.tsx`, `lib/painel.ts`, `functions/avisos-vencimento` | e2e: "Cartão Antigo" não aparece na lista; aparece em "Ver cartões cancelados" |
| RF-45 | Cadastro completo do cartão | Atendido | migração `20261127000000_cartoes_milhas.sql`, `EditarCartao` | Cartões → + Cartão |
| RF-46 | Regras de isenção com progresso pelas faturas | Atendido | `lib/cartoes.ts:progressoIsencao` | `cartoes.test.ts` (gasto mensal, período, investido, promocional) |
| RF-47 | Sala VIP com "usei" e renovação | Atendido | `lib/cartoes.ts:acessosVip`, detalhe do cartão | `cartoes.test.ts`; e2e mostra "3 de 4" |
| RF-48 | Checagem mensal da página de benefícios com aprovação | Atendido | `functions/beneficios-mensal`, `decidirBeneficio` | e2e mostra o trecho alterado; aprovar/ignorar no detalhe |
| RF-49 | Página ilegível → "não verificado neste mês" | Atendido | `beneficios-mensal/index.ts:lerPagina` | status `nao_verificado` mantém os dados |
| RF-50 | Programas e contas por titular | Atendido | `mil_programas`, `mil_contas` | Milhas → Resumo; contas de terceiros separadas |
| RF-51 | Entradas com origem | Atendido | `mil_movimentos`, `NovoMovimento` | Milhas → Movimentos → + Movimento |
| RF-52 | Pontos de cartão previstos × confirmados | Atendido | `Milhas.tsx:ConfirmarPontos`, `pontosPrevistos` | Resumo → "Pontos de cartão a confirmar" |
| RF-53 | Transferência com bônus levando o custo | Atendido | `lib/milhas.ts:transferencia`, `Transferir` | `milhas.test.ts` |
| RF-54 | Custos e custo médio do milheiro | Atendido | view `mil_saldos`, `cashbackRenunciado` | teste SQL "custo do milheiro" |
| RF-55 | Vendas com lucro pelo custo médio | Atendido | `mil_vendas`, `lucroVenda` | Milhas → Vendas |
| RF-56 | Limite de CPFs por programa (só contagem) | Atendido | `cpfsUsados`, `EditarPrograma` | `milhas.test.ts`; Resumo mostra "4 de 25" |
| RF-57 | Emissões | Atendido | `mil_emissoes`, `NovaEmissao` | Milhas → Emissões |
| RF-58 | Visão consolidada, Mário × terceiros | Atendido | `Milhas.tsx:Resumo` | e2e |
| RF-81 | Aviso de mudança de benefício | Atendido | `beneficios-mensal/index.ts:avisar` | push + e-mail, uma vez por mês por cartão |
| RF-91 | Importar aba CARTÕES sem número/validade/código | Atendido | `lib/cartoes.ts:lerAbaCartoes` | `cartoes.test.ts` confere que nenhum valor das colunas O–Q aparece |
| RF-92 | Importar Controle de Milhas sem a aba de CPFs | Atendido (com desvios) | `lib/milhas.ts:lerControleMilhas` | `milhas.test.ts`: saldos de Smiles, TudoAzul, Smiles Diego e Copa iguais aos da planilha |
| RF-75 | Valores mensais da folha e previdência | Atendido | `ir_mensal`, `ir_previdencia`, aba "Mês a mês" | e2e |
| RF-76 | PGBL × 12% da renda tributável | Atendido | `lib/ir.ts:resumoAnual` | `ir.test.ts` |
| RF-77 | Proventos do ano por tipo e CNPJ | Atendido | `montarRelatorio` (itens `rend:`) | `ir.test.ts`: total do relatório = soma da Movimentação de 2025 |
| RF-78 | Relatório por ficha com código, CNPJ, discriminação e custo em 31/12 | Atendido | `montarRelatorio` | `ir.test.ts`; aba Relatório |
| RF-78a | Códigos configuráveis por ano, "classificar" quando sem código | Atendido | `ir_config`, aba Configurar | aviso até marcar como revisado |
| RF-78b | Exportar PDF e planilha; copiar no celular | Atendido | `dadosIr.ts:exportarPdfIr/exportarPlanilhaIr`, `Copiar` | e2e copia o CNPJ e confere a área de transferência |
| RF-78c | Renda variável mês a mês | Atendido | `lib/ir.ts:rendaVariavel` | `ir.test.ts` (isenção, compensação, day trade, FII, DARF mínimo) |
| RF-78d | Conferência com a pré-preenchida | Atendido | `ir_conferencia`, `Conferir` | Relatório → "Conferir" |
| RF-93 | Importar aba IRRF 2026 | Atendido | `lib/ir.ts:lerAbaIrrf` | `ir.test.ts`: totais iguais à linha TOTAL da planilha |

## Desvios e decisões
- RF-47: o "Utilizado" da aba CARTÕES vira usos com a data da importação (a planilha não tem as datas). Só entra se o cartão ainda não tem usos.
- RF-48: a primeira leitura de cada página vira a versão de referência. "Aceitar" troca a referência; o cadastro do cartão só muda se você editar.
- RF-52: os pontos previstos usam só a pontuação nacional; a fatura não separa compras internacionais.
- RF-55/RF-92: as observações das vendas não são importadas (têm telefones e perfis de compradores).
- RF-92: a planilha tem diferenças próprias: o saldo da Latam Pass difere em 5 milhas entre a aba do programa e a aba de vendas, e várias colunas "Total" de custo não somam todos os meses. O BankMaR soma mês a mês e mostra as duas colunas na conferência. As abas ALL ACCOR, CONTROLE_PONTOS_ACUM e as calculadoras não são importadas.
- RF-78: renda fixa, Tesouro e COE vêm com o valor aplicado da posição atual; o saldo de 31/12 do ano anterior precisa vir da declaração passada (a B3 não guarda). Os códigos padrão (inclusive FII isento 26 e odontológico) precisam de revisão contra o manual do IRPF 2027.
- RF-78c: não considera corretagem nem o IR de 0,005% retido na fonte. Prejuízo em mês isento continua compensável.
- Correção: fundos imobiliários com "FDO INV IMOB" no nome eram classificados como "fundo"; agora são FII.

## Pendências para o revisor
- Revisar a tabela de códigos de 2026 em Imposto de Renda → Configurar.
- Publicar as funções `beneficios-mensal` e `investimentos-diario` e rodar o agendamento.

---

# Ajustes de 27/11/2026 (pedidos do Mário)

| Pedido | Onde | Como verificar |
|--------|------|----------------|
| Leitor de PDF para os demais cartões | `lib/faturas/generico.ts` (emissor "outro") | `leitores.test.ts`: lê a fatura da Caixa sem conhecer o layout (8 linhas, R$ 2.197,44); não mistura colunas do Itaú; formato "03 NOV", crédito, dólar + real, "Parcela 2/6" |
| Senha do PDF guardada | `lib/senhasPdf.ts`, Ajustes e importações, `faturas/pdf.ts` | o sistema tenta as senhas guardadas antes de perguntar e oferece guardar a que você digitar |
| Logos de bancos e programas | `ui/Logo.tsx` em Início, Mês, Faturas, Cartões, Investimentos e Milhas | ícone do site da instituição; sigla colorida se não carregar |
| Renda do mês vem do IR | migração `20261127020000_integracao_ir.sql` (`recalcular_renda`), Mês | testes SQL: líquido + férias + 13º recebidos no mês; corrigir o IR corrige a renda |
| Previdência: conta do Mês = contribuição do IR | mesma migração (`bills_ir_sync`), campo "Previdência no IR" nas contas | testes SQL: criar, alterar e excluir a conta reflete no IR, sem duplicar com o lançamento manual |

## Decisões que mudam a spec
- Caso 2 (PDF com senha): a senha pode ser guardada **só no aparelho**, cifrada pelo navegador (AES-GCM, chave não exportável). Continua sem nenhum campo de senha no banco de dados.
- RF-13: quando há folha lançada no IR para o mês em que o dinheiro entrou, a renda do Mês vem de lá e não é digitada; sem folha, continua manual.
- RF-75: contribuições de previdência que são contas no Mês entram no IR sozinhas; à mão só o que não é conta. Contas que começam com "Previdência" já foram ligadas pelo nome do plano.
- RF-21: o leitor genérico atende os bancos sem leitor próprio; a conferência do total (RF-26) continua obrigatória.

---

## Ajustes de 27/11 (2ª rodada)

| Pedido | Status | Onde | Como verificar |
|---|---|---|---|
| Mês todo pago → já mostra o mês seguinte | Atendido | `src/paginas/Mes.tsx` (avanço automático + aviso) | Pagar tudo do mês e abrir Mês |
| Fatura zerada aparece no mês, com selo e "Conferi: veio zerada" | Atendido | migration `20261127030000`, `invoices.zerada_conferida_em`; `Mes.tsx` | e2e `celular-72-mes-fatura-zerada.png` |
| Cartão sem fatura importada aparece como "Aguardando a fatura" | Atendido | `Mes.tsx` | e2e (Nubank no Mês) |
| PGBL: quanto falta para o teto, por mês até dezembro | Atendido | `src/lib/ir.ts` `tetoPgbl`, `src/ui/PainelPgbl.tsx` (Início e topo do IR) | vitest `Teto do PGBL`; print `celular-01-.png` |
| Logos: sigla quando não há logo, mais bancos/contas | Atendido | `src/ui/Logo.tsx` (iniciais + cor estável; CEF, BRB, PagBank, utilidades, streaming, planos) | Visual |
| Milhas: habilitar/desabilitar programas | Atendido | `mil_programas.ativo`; modal "Programas que uso" | e2e (Latam oculto) |
| Milhas: painel gerencial por programa | Atendido | `Milhas.tsx` `PorPrograma`, `src/lib/milhas.ts` `painelConta`/`potencial` | e2e `celular-55-milhas-programa.png`; vitest `Painel por programa` |

Decisões: teto do PGBL sem renda informada é estimado pela folha lançada (média dos meses lançados para os que faltam) e aparece como estimativa. Programa desabilitado some de telas e totais, mas os lançamentos continuam guardados. A cotação do milheiro é informada à mão, por programa.
