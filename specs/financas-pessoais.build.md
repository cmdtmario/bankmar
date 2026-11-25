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
- `supabase/tests/*` — stub do Supabase e 31 testes SQL
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
