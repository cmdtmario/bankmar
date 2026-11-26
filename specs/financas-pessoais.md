# Sistema de Finanças Pessoais (BanKMar)

**Status:** Rascunho
**Data:** 2026-11-25
**Autor da entrevista:** Claude, a partir de conversa com Mário Esteves

## 1. Objetivo

Substituir as três planilhas manuais do Mário (Contabilidade 2026, Investimentos e Controle de Milhas) por um único sistema web pessoal, protegido por login e de custo zero. Ele deve manter todas as visões atuais e acrescentar visões gerenciais. O sistema existe porque manter as planilhas virou trabalho mensal pesado e sujeito a erro: redigitar faturas de cerca de 15 cartões, lançar divisões no Splitwise, entrar banco por banco para ver dividendos e atualizar milhas à mão. O sucesso é medido assim: o fechamento mensal passa a exigir apenas uploads, revisão e lançamentos pontuais que nenhuma fonte consegue fornecer.

## 2. Contexto

- **Hoje:** três planilhas no Google Drive, mantidas só pelo Mário.
  - *Contabilidade BanKMar - 2026:* uma aba por mês com renda, contas fixas e blocos de fatura por cartão. Abas auxiliares: CARTÕES (benefícios e isenções) e IRRF 2026.
  - *INVESTIMENTOS:* Papéis (cerca de 386 lotes), FIIs (cerca de 95 lotes com dividendos mensais desde 09/2020) e + CARTEIRA (renda fixa, fundos e previdência, parada desde 07/2024).
  - *Controle_Milhas:* saldos por programa, custos, acúmulos, vendas de milhas, emissões e contas de terceiros.
- **Fluxo atual das faturas:** o Mário envia o PDF ao ChatGPT, recebe as linhas no formato da planilha, confere e reescreve descrições (ex.: "MERCADO LIVRE" vira "MERCADO LIVRE - CASACO"). A marca "GPT" na coluna de conferência indica essas linhas.
- **Divisão de despesas:** principalmente com o Diego (mensal). Jessy, Lourdinha e outros aparecem de forma esporádica. A divisão hoje é lançada à mão no Splitwise.
- **Sistemas externos:** Área do Investidor B3 (exportação de posição, movimentação e proventos), páginas públicas de benefícios dos bancos e Bitwarden (cofre de credenciais, só por link).
- **Mapeamento detalhado:** documento do projeto `claude/mapeamento-planilhas.md`.

## 3. Escopo

### 3.1 Dentro do escopo
- Módulo Contabilidade: renda, contas fixas e avulsas, faturas de cartão, parcelas, pagamentos, categorias.
- Módulo Divisão: pessoas, regras de divisão, saldos, links de consulta.
- Módulo Cartões: cadastro, regras de isenção, benefícios, sala VIP.
- Módulo Milhas e Pontos: programas, contas (inclusive de terceiros), acúmulos, custos, custo médio, transferências, vendas, emissões.
- Módulo Investimentos: renda variável e renda fixa a partir da B3, previdência e aplicações fora da B3 por extrato, conciliação com a planilha antiga.
- Módulo IR: proventos, deduções e previdência PGBL contra o limite dedutível.
- Avisos por push no celular e por e-mail.
- Importação inicial do histórico.
- Botão de acesso ao cofre Bitwarden.

### 3.2 Fora do escopo
- Rateio de eventos (aba CHURRAS). É esporádico e uma planilha avulsa resolve.
- Carteira cripto, consórcio como investimento (a parcela continua como conta fixa) e simulação de entrada.
- Calculadoras do controle de milhas (ALL Accor, descontos, cashback).
- Qualquer uso de IA paga ou serviço com custo recorrente.
- Armazenar senhas, números completos de cartão, validade, CVV ou credenciais de programas de fidelidade.
- Integração direta com APIs da B3 ou do Open Finance. Exigem empresa contratante ou credenciada, inviável para pessoa física.
- Acesso com login para outras pessoas. Elas só recebem links de consulta.
- Pagamento de contas pelo sistema. Ele registra; o pagamento continua no banco.
- Ler o contracheque em PDF. A renda é digitada.
- Gerar ou importar arquivos do programa IRPF da Receita (.DEC) e ler a declaração pré-preenchida. Não existe formato público para isso, então o sistema entrega um relatório para lançamento e conferência (RF-78).
- Emitir DARF. O sistema só estima o imposto mensal de renda variável como apoio (RF-78c).

## 4. Requisitos funcionais

### 4.1 Acesso e segurança

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-01 | O sistema exige login com e-mail e senha e verificação em duas etapas por app autenticador para qualquer tela, exceto os links de consulta (RF-40). | Indispensável |
| RF-02 | Existe um único usuário administrador (o Mário). Não há tela de cadastro público. | Indispensável |
| RF-03 | O menu principal tem o botão "Abrir cofre", que abre o cofre web do Bitwarden em nova aba (no celular, o app, quando instalado). O sistema não lê nem guarda nada do cofre. | Indispensável |
| RF-04 | Campos de texto livre recusam ao salvar sequências com cara de número completo de cartão (13 a 19 dígitos que passam no algoritmo de Luhn) e avisam o usuário. | Desejável |

### 4.2 Contabilidade

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-10 | O usuário cadastra contas recorrentes (descrição, dia de vencimento, valor padrão ou variável, banco de pagamento habitual, regra de divisão, categoria). O sistema gera a instância de cada mês automaticamente. | Indispensável |
| RF-11 | O usuário cadastra contas avulsas de um único mês. | Indispensável |
| RF-12 | Cada conta ou fatura aceita até 2 pagamentos (data, banco, valor). O status é calculado como na planilha atual: PAGO, FALTA x, VERIFICAR x (pagou a mais), CONFERIR HOJE e AGENDADO. | Indispensável |
| RF-13 | O usuário informa a renda líquida do mês manualmente. O valor do mês anterior aparece como sugestão. | Indispensável |
| RF-14 | Cada conta e fatura mostra a "parte do Mário" e o "impacto pessoal" (parte do Mário ÷ renda do mês). | Indispensável |
| RF-15 | O usuário fotografa ou envia a imagem de um boleto. O sistema lê o código de barras ou a linha digitável e preenche valor e vencimento para confirmação. Se a leitura falhar, permite digitar a linha digitável. | Indispensável |
| RF-16 | Tela "Mês" equivalente à aba mensal: contas, faturas, totais, total do Mário, status e pendências. | Indispensável |

### 4.3 Faturas de cartão

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-20 | O usuário envia o PDF da fatura de um cartão. Um leitor programado para aquele emissor extrai data, descrição, parcela x/y e valor de cada lançamento, além do total e do vencimento. Sem IA. | Indispensável |
| RF-21 | Os leitores são por emissor, não por cartão: um leitor atende todos os cartões do mesmo layout de PDF. A entrega 1 inclui os leitores Itaú (amostra: Itaú Azul Infinite) e Caixa (amostra: Caixa Visa/Elo). Os demais emissores entram à medida que o Mário fornecer uma fatura de amostra. Até lá, usam o plano B (RF-22). | Indispensável |
| RF-21a | Os dados pessoais impressos na fatura (CPF, endereço, linha digitável, limite) são descartados na leitura. Do cabeçalho, só se aproveitam vencimento, total, final do cartão (4 dígitos) e lançamentos. | Indispensável |
| RF-22 | Plano B de importação: o usuário cola um texto em formato tabular padronizado (o que o ChatGPT gratuito devolve hoje, ou um CSV do banco) e o sistema importa as mesmas colunas. | Indispensável |
| RF-23 | Depois de cada importação, uma tela de revisão permite informar um lembrete amigável, a categoria e o responsável/divisão de cada linha e marcá-la como conferida antes de confirmar. A descrição que veio da fatura fica congelada (não editável); o lembrete é um campo separado e opcional. | Indispensável |
| RF-24 | Uma parcela seguinte de uma compra já lançada (mesmo estabelecimento, mesmo valor de parcela, número da parcela seguinte) recebe automaticamente o lembrete, a categoria e a divisão das parcelas anteriores. Não há regras aprendidas por estabelecimento (decisão de 25/11/2026). | Indispensável |
| RF-25 | Ao lançar ou importar uma compra parcelada, o sistema projeta as parcelas restantes nas faturas futuras. Na importação seguinte, as projeções são casadas com as linhas reais, sem duplicar. | Indispensável |
| RF-26 | O total extraído é comparado ao total impresso na fatura. Se houver diferença, a tela de revisão mostra o valor e impede a confirmação até o usuário justificar ou corrigir. | Indispensável |
| RF-27 | Estornos e créditos (valores negativos) são aceitos e abatidos do responsável correspondente. | Indispensável |
| RF-28 | Uma fatura também pode ser lançada inteiramente à mão. | Indispensável |

### 4.4 Categorias

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-30 | Existe uma lista editável de categorias (sugestão inicial: Moradia, Alimentação, Delivery, Mercado, Transporte, Viagem, Milhas, Saúde, Pet, Vestuário, Assinaturas, Salão do Diego, Presentes, Outros). | Indispensável |
| RF-31 | O sistema sugere a categoria por regras de estabelecimento cadastradas pelo usuário em “Categorias e regras” (com uma lista inicial). Correções na revisão não viram regra automaticamente (decisão de 25/11/2026). | Indispensável |
| RF-32 | Visões: gasto por categoria no mês, evolução por categoria em 12 meses e top estabelecimentos. | Indispensável |

### 4.5 Divisão com outras pessoas

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-35 | O usuário cadastra pessoas livremente (nome, apelido, chave Pix opcional para exibir no resumo). | Indispensável |
| RF-36 | Cada lançamento ou conta aceita uma das regras: só do Mário; percentual por pessoa (ex.: 50/50, 70/30, entre 2 ou mais pessoas); valor fixo por pessoa; 100% de outra pessoa. A soma das partes é igual ao valor do lançamento. | Indispensável |
| RF-37 | Uma tela por pessoa mostra os itens do período, o total devido, os recebimentos registrados e o saldo acumulado. | Indispensável |
| RF-38 | O usuário registra recebimentos (data, valor, pessoa). Eles abatem o saldo. | Indispensável |
| RF-39 | O usuário gera o resumo de uma pessoa num período como PDF e como texto pronto para WhatsApp (itens, valor de cada um, total e chave Pix para pagamento). | Indispensável |
| RF-39a | Cada lançamento atribuído a uma pessoa pode receber um marcador (ex.: "Salão" para gastos do salão do Diego, contra os gastos pessoais dele). Os marcadores são livres e cadastráveis. A tela da pessoa, o PDF, o texto e o link agrupam os itens por marcador, com subtotal de cada grupo. | Indispensável |
| RF-40 | O usuário gera um link de consulta por pessoa e período. Ele abre sem login, mostra só os itens e o saldo daquela pessoa naquele período, expira em 30 dias e pode ser revogado a qualquer momento. | Indispensável |

### 4.6 Cartões

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-44 | O usuário cadastra novos cartões a qualquer momento e pode desativar um cartão cancelado. Um cartão desativado some das telas do dia a dia e dos avisos, mas o histórico de faturas, pontos e benefícios continua consultável. Pode ser reativado. O cadastro inicial vem da aba CARTÕES e dos blocos de fatura de 2026. | Indispensável |
| RF-45 | Cadastro de cartão: apelido, emissor, bandeira, final (4 dígitos), dia de vencimento, dia de fechamento, programa de pontos, regra de pontuação (nacional e internacional por real ou dólar), anuidade, link da página oficial e observações. | Indispensável |
| RF-46 | Regras de isenção de anuidade por cartão: tipo (gasto na fatura por mês, gasto em período, valor investido, isenção promocional até uma data), meta e período. O sistema mostra o progresso com base nas faturas lançadas. | Indispensável |
| RF-47 | Sala VIP: acessos disponíveis por período e data de renovação. Botão "usei" registra data e aeroporto e desconta um acesso. O contador volta ao total na renovação. | Indispensável |
| RF-48 | Uma vez por mês, o sistema baixa o texto da página oficial de benefícios de cada cartão e compara com a última versão aprovada. Se houver mudança, mostra o trecho alterado e só atualiza o cadastro com aprovação do usuário. | Indispensável |
| RF-49 | Se a página não puder ser lida (erro, bloqueio, layout irreconhecível), o cartão fica marcado "não verificado neste mês" e os dados anteriores são mantidos. | Indispensável |

### 4.7 Milhas e pontos

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-50 | Cadastro de programas (Smiles, Latam Pass, TudoAzul, TAP, Copa, Livelo, Esfera, Iupp, PDA, All Accor e outros) e de contas por programa com titular (ex.: Smiles do Mário, Smiles do Diego). | Indispensável |
| RF-51 | Movimentos de entrada por conta, com origem: cartão, clube, compra, transferência, bônus de transferência, voo, missão/bônus, outros. | Indispensável |
| RF-52 | Pontos de cartão calculados a partir das faturas lançadas e da regra de pontuação do cartão, gerados como movimento previsto e confirmados quando o usuário informa o crédito real. A diferença entre previsto e real fica visível. | Indispensável |
| RF-53 | Transferência entre programas (ex.: Livelo → TudoAzul com 110% de bônus): debita a origem e credita o destino com o bônus, levando o custo junto. | Indispensável |
| RF-54 | Custos por conta: assinatura de clube, compra de pontos ou milhas e cashback renunciado (percentual configurável por cartão, padrão 1%). O sistema calcula o custo médio do milheiro por conta e por programa. | Indispensável |
| RF-55 | Vendas de milhas: plataforma, programa, data, quantidade, valor total, valor do milheiro, prazo e data de pagamento, CPFs usados, status e lucro (valor da venda menos o custo médio). | Indispensável |
| RF-56 | Limite de CPFs por programa (configurável, ex.: Latam Pass 24/ano, Smiles 25/ano): o sistema soma os CPFs usados em vendas e emissões no período e mostra quantos ainda estão disponíveis. Não guarda CPFs nem dados dos passageiros, só a contagem. | Indispensável |
| RF-57 | Emissões: conta usada, data, localizador, data e trecho do voo, cartão das taxas, valor, cashback (Inter, Méliuz etc.), status (emitida, remarcada, reembolsada) e valor reembolsado. | Indispensável |
| RF-58 | Visão consolidada: saldo e custo médio por programa, separando as contas do Mário das de terceiros. | Indispensável |

### 4.8 Investimentos

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-60 | O usuário envia os arquivos .xlsx exportados da Área do Investidor B3, e o sistema reconhece o tipo pelas colunas: **Negociação** (data, compra/venda, mercado, instituição, código, quantidade, preço, valor); **Movimentação** (entrada/saída, data, tipo de movimentação, produto, instituição, quantidade, preço, valor), que inclui rendimentos, dividendos, juros, transferências, aplicações e resgates de renda fixa; **Proventos a Receber** (produto, tipo, evento, previsão de pagamento, instituição, quantidade, valor líquido); e **Posição**. Com isso importa operações, lotes, posições e proventos de ações, FIIs, BDRs, ETFs, Tesouro Direto e renda fixa registrada (CDB etc.). | Indispensável |
| RF-60a | O código fracionário (ex.: PETR4F) é tratado como o mesmo ativo do código cheio (PETR4). | Indispensável |
| RF-60c | Os eventos corporativos da Movimentação ajustam quantidade e preço médio: desdobro, grupamento, bonificação, subscrição (direito, exercido, não exercido, recibo), cessão de direitos e atualização. Transferências entre corretoras (incluindo "Transferência - Liquidação") não geram compra nem venda e não alteram o preço médio. A quantidade exibida vem do arquivo de Posição da B3. O preço médio calculado pelo histórico só é usado quando o histórico explica a quantidade da Posição; senão o ativo fica marcado “sem preço médio” e recebe o PM informado pelo usuário ou o da planilha antiga (RF-69). *(Revisto em 26/11/2026: o histórico da B3 não traz compras em IPO, ofertas, conversões e renomeações, então nem sempre reconstrói a posição.)* | Indispensável |
| RF-60d | Nomes de instituição diferentes que são a mesma corretora (ex.: "INTER DISTRIBUIDORA…", "INTER DTVM LTDA", "BANCO INTER S/A") são agrupados por uma tabela de equivalência editável. | Indispensável |
| RF-60b | Os proventos a receber aparecem numa visão "próximos pagamentos" e viram proventos recebidos quando a movimentação correspondente é importada. | Indispensável |
| RF-61 | Importações repetidas do mesmo período não duplicam registros. | Indispensável |
| RF-62 | Cotação atual de ações, FIIs, BDRs e ETFs obtida de fonte gratuita, atualizada ao menos uma vez por dia útil. A data e hora da cotação aparecem na tela. | Indispensável |
| RF-63 | Por ativo e por lote: preço médio, quantidade, total investido, valor de mercado, lucro/prejuízo em R$ e %, proventos recebidos acumulados e retorno total (mercado + proventos). | Indispensável |
| RF-64 | Proventos por mês, por ativo e por tipo (dividendo, JCP, rendimento), em gráfico de 12 meses e no histórico desde 2020. | Indispensável |
| RF-65 | Preço-alvo de saída opcional por lote, com aviso visual quando a cotação atinge o alvo. | Desejável |
| RF-66 | Previdência (Brasilprev, Icatu, Itaú, Porto, Bradesco) e aplicações fora da B3: lançamento manual do saldo mensal ou upload de extrato em CSV/planilha com mapeamento de colunas. | Indispensável |
| RF-67 | Foto mensal automática do patrimônio no 1º dia útil de cada mês (por instituição, classe e ativo), para os gráficos de evolução. | Indispensável |
| RF-68 | Visões: patrimônio total, distribuição por classe, por instituição e por ativo, evolução mensal e concentração (peso dos 10 maiores ativos). | Indispensável |
| RF-69 | Conciliação inicial: o sistema importa as abas Papéis e FIIs da planilha antiga só para comparação e lista as divergências com a B3 por ativo (quantidade, preço de compra, proventos por mês). Nada da planilha sobrescreve dados da B3. | Indispensável |

### 4.9 Imposto de Renda

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-75 | Por mês: salário líquido, férias + 1/3, INSS, IR retido, plano de saúde, odontológico, despesas médicas fora (com observação) e contribuições de previdência por plano, como na aba IRRF 2026. Digitação manual. | Indispensável |
| RF-76 | Resumo anual: totais por grupo e comparação das contribuições PGBL com o limite dedutível (12% da renda tributável informada), mostrando quanto falta ou excede. | Indispensável |
| RF-77 | Proventos de investimentos do ano por tipo (dividendos, JCP, rendimentos de FII/Fiagro, juros de renda fixa), separados em isentos e de tributação exclusiva, por fonte pagadora (CNPJ), vindos do módulo de investimentos. | Indispensável |
| RF-78 | **Relatório de apoio à declaração (ano-calendário):** organizado na ordem das fichas do programa IRPF. Para cada item traz ficha, grupo e código, CNPJ (empresa, fundo, emissor ou instituição), texto de discriminação pronto para copiar (ativo, quantidade, corretora, custo médio), situação em 31/12 do ano anterior e em 31/12 do ano-calendário (pelo **custo de aquisição**, nunca pelo valor de mercado) e rendimentos associados. Cobre ao menos Bens e Direitos (ações, FIIs, Fiagros, ETFs, BDRs, CDB/RDB, LCI/LCA/CRI/CRA, Tesouro Direto, COE, fundos, contas e poupança), Rendimentos Isentos, Rendimentos de Tributação Exclusiva e Pagamentos Efetuados (PGBL, saúde). | Indispensável |
| RF-78a | A tabela de fichas, grupos e códigos é configurável por ano-calendário. Cada ano precisa ser revisado contra o manual oficial da Receita, porque os códigos mudam entre exercícios. Itens sem código mapeado aparecem destacados como "classificar". | Indispensável |
| RF-78b | O relatório pode ser exportado em PDF (para ler ao lado do programa) e em planilha (uma aba por ficha), e também visto em tela no celular, item por item, com botão de copiar em cada campo. | Indispensável |
| RF-78c | Renda variável: apuração mensal de vendas de ações, FIIs, ETFs e BDRs a partir da Negociação, separando operações comuns de day trade. Mostra total vendido no mês, ganho ou perda pelo custo médio, isenção de vendas de ações até o limite mensal vigente, prejuízo acumulado a compensar e imposto estimado do mês, como apoio à ficha Renda Variável e à conferência dos DARFs. Os percentuais e limites são parâmetros configuráveis por ano. | Indispensável |
| RF-78d | Lista de conferência com a pré-preenchida: para cada item do relatório, o usuário marca "conferido", "divergente" (com observação) ou "não veio na pré-preenchida". O sistema guarda a lista por ano. | Desejável |

### 4.10 Avisos

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-80 | Aviso no dia anterior e no dia do vencimento de cada conta ou fatura ainda não marcada como paga. | Indispensável |
| RF-81 | Aviso quando a checagem mensal (RF-48) detectar mudança no benefício de um cartão. | Indispensável |
| RF-82 | Os avisos chegam por notificação push no celular (sistema instalado como app na tela inicial) e por e-mail. | Indispensável |

### 4.11 Importação inicial

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-90 | Importar jan a dez/2026 da Contabilidade: contas, pagamentos, faturas, lançamentos, responsáveis/divisões e renda. Conferência: total de cada mês e de cada fatura igual ao da planilha. | Indispensável |
| RF-91 | Importar da aba CARTÕES os dados de benefícios e isenções, ignorando as colunas de número, validade e código. | Indispensável |
| RF-92 | Importar do Controle de Milhas saldos, acúmulos, custos, vendas e emissões, ignorando a aba de dados de CPFs e senhas. | Indispensável |
| RF-93 | Importar da aba IRRF 2026 os valores mensais. | Indispensável |
| RF-94 | Ao fim de cada importação, um relatório lista linhas ignoradas e o motivo. | Indispensável |

## 5. Requisitos não funcionais

| ID | Requisito | Critério mensurável |
|----|-----------|---------------------|
| RNF-01 | Custo | Custo mensal de infraestrutura e serviços igual a R$ 0, dentro dos planos gratuitos dos provedores escolhidos. |
| RNF-02 | Confidencialidade | Dados acessíveis só ao usuário autenticado, com controle de acesso no banco de dados (não só na tela). Tráfego só por HTTPS. Links de consulta com token aleatório de pelo menos 128 bits. |
| RNF-03 | Dados proibidos | Nenhum campo do modelo de dados guarda senha de terceiros, número completo de cartão, validade, CVV ou CPF. |
| RNF-04 | Registro e auditoria | Toda criação, alteração e exclusão de lançamentos, pagamentos e divisões grava data/hora e valor anterior. Cada importação grava arquivo de origem, data e quantidade de linhas importadas, ignoradas e alteradas. |
| RNF-05 | Celular | Todas as telas usáveis num celular com largura de 360 px. Câmera disponível para foto de boleto. Instalável como app (PWA). |
| RNF-06 | Desempenho | Importação de uma fatura de até 200 linhas termina em até 10 s. Telas principais abrem em até 3 s numa conexão 4G. |
| RNF-07 | Cópia de segurança | Exportação completa dos dados em CSV/planilha, sob demanda e automática toda semana, para um destino escolhido pelo usuário. |
| RNF-08 | Idioma e formatos | Interface em português do Brasil, valores em R$ com vírgula decimal, datas dd/mm/aaaa, fuso America/Sao_Paulo. |
| RNF-09 | Manutenção dos leitores | Cada leitor de fatura tem amostras de PDF anonimizadas e um teste automatizado. Um leitor quebrado não impede o uso dos outros nem do plano B (RF-22). |

## 6. Fluxo principal

**Fechamento mensal (Contabilidade)**
1. No início do mês, o sistema já criou as contas recorrentes do mês e as parcelas projetadas nas faturas.
2. O Mário informa a renda líquida (sugestão do mês anterior).
3. Para cada fatura que chega, envia o PDF. O sistema extrai, casa com as parcelas projetadas e aplica as regras aprendidas.
4. Na tela de revisão, ele ajusta só as compras novas (descrição, categoria, divisão) e confirma. O total confere com o da fatura.
5. Contas em papel: fotografa o boleto e confirma valor e vencimento.
6. Ao pagar no banco, registra o pagamento no sistema e o status muda para PAGO.
7. Na véspera e no dia de vencimentos sem pagamento registrado, recebe push e e-mail.
8. Gera o resumo do Diego (link ou texto para WhatsApp) e registra o recebimento quando ele pagar.

**Investimentos (mensal)**
1. Exporta da Área do Investidor B3 os arquivos do mês e envia ao sistema.
2. O sistema importa sem duplicar e atualiza posições e proventos.
3. Atualiza o saldo da previdência e das aplicações fora da B3.
4. No 1º dia útil, o sistema tira a foto mensal do patrimônio.

**Milhas (quando houver movimento)**
1. Os pontos previstos do cartão aparecem a partir das faturas. O Mário confirma o crédito real.
2. Lança transferências, compras, vendas e emissões quando acontecem.

## 7. Entradas e saídas

**Entradas**
- PDF de fatura de cada emissor da lista do RF-21.
- Texto tabular ou CSV (plano B) com as colunas: data (dd/mm/aaaa), descrição, parcela atual, total de parcelas, valor (R$, negativo para crédito).
- Imagem de boleto (JPG/PNG/HEIC) ou linha digitável digitada (47 ou 48 dígitos).
- Arquivos exportados da Área do Investidor B3, no formato que ela oferecer (planilha/CSV).
- Extratos de previdência e de outras instituições em CSV/planilha.
- Planilhas atuais (.xlsx) para a importação inicial.

**Saídas**
- Telas e gráficos dos módulos.
- PDF do resumo por pessoa, nomeado `resumo-<pessoa>-<aaaa-mm>.pdf`.
- Texto para WhatsApp.
- Link de consulta por pessoa e período.
- Exportação completa em CSV/planilha (RNF-07).
- Notificações push e e-mails.

## 8. Casos extremos e tratamento

| # | Situação | Comportamento esperado |
|---|----------|------------------------|
| 1 | PDF de fatura com layout novo ou leitor falha | Mensagem "leitor do <emissor> não reconheceu este PDF", sem importar nada parcialmente. Oferece o plano B (RF-22). |
| 2 | PDF protegido por senha | Pede a senha só para abrir o arquivo naquele momento, sem guardá-la. Se não abrir, oferece o plano B. |
| 3 | Mesma fatura enviada duas vezes | Detecta pelo cartão + mês + total e pergunta se é para substituir a importação anterior ou cancelar. Nunca duplica. |
| 4 | Total extraído diferente do total da fatura | Bloqueia a confirmação e mostra a diferença (RF-26). |
| 5 | Parcela projetada que não aparece na fatura real | Fica marcada "não encontrada" na revisão. O usuário decide se mantém para o mês seguinte ou exclui. |
| 6 | Compra em moeda estrangeira, IOF ou anuidade | Importadas como lançamentos normais, com categoria sugerida (Tarifas/IOF). Valor sempre em R$, como na fatura. |
| 7 | Divisão cuja soma não bate com o valor | Não salva e mostra a diferença. Centavos de arredondamento vão para o Mário. |
| 8 | Boleto ilegível na foto | Pede nova foto ou a digitação da linha digitável. |
| 9 | Fonte de cotação fora do ar | Mantém a última cotação, exibindo a data/hora dela, e tenta de novo na próxima execução. |
| 10 | Arquivo da B3 em formato diferente do esperado | Rejeita o arquivo inteiro com mensagem indicando as colunas não reconhecidas, sem importar parcialmente. |
| 11 | Página de benefício de cartão inacessível | Comportamento do RF-49. |
| 12 | Link de consulta expirado ou revogado | Página com "Este link não está mais disponível", sem revelar nenhum dado. |
| 13 | Acesso sem login a qualquer outra rota | Redireciona para o login. Nenhum dado é enviado ao navegador. |
| 14 | Texto com número completo de cartão | Comportamento do RF-04. |
| 15 | Limite do plano gratuito do provedor se aproximando | Aviso por e-mail a 80% do limite de armazenamento ou de uso. |

## 9. Premissas assumidas

- A hospedagem do front-end é gratuita (ideia inicial do Mário: Netlify). Banco de dados, autenticação, tarefas agendadas e envio de e-mail também usam planos gratuitos. A escolha exata dos provedores é de quem implementa, respeitando o RNF-01.
- Os leitores de fatura são programados a partir de amostras reais que o Mário fornecerá (uma fatura recente de cada cartão).
- Confirmado em 25/11/2026: a Área do Investidor exporta o histórico completo. Negociação tem 1.822 linhas, de 09/12/2019 a 05/11/2026; Movimentação tem 5.463 linhas, de 11/12/2019 a 24/11/2026, com cerca de 2.700 proventos e 10+ instituições. A carteira de investimentos é reconstruída inteiramente a partir da B3. A planilha antiga serve só para a conciliação (RF-69).
- O arquivo de Posição da B3 (25/11/2026) tem uma aba por classe: Ações, BDR, COE, ETF, Fundo de Investimento, Renda Fixa e Tesouro Direto. Traz CNPJ da empresa ou do fundo, ISIN, escriturador ou administrador, emissor, indexador e vencimento, que alimentam a discriminação do relatório de IR (RF-78). O sistema também importa COE como classe de ativo.
- As faturas de amostra (Itaú e Caixa) são PDFs com texto, sem senha e sem imagem escaneada, então dá para ler sem OCR.
- Os links de consulta valem 30 dias e são revogáveis.
- Avisos de vencimento consideram a data de vencimento no fuso de Brasília, com envio às 8h.
- O limite dedutível do PGBL é 12% da renda bruta tributável informada.
- Só o Mário opera o sistema. Não há concorrência de edição.

## 10. Riscos e dependências

- **Mudança de layout das faturas:** um leitor quebra quando o banco muda o PDF. Mitigação: testes com amostras (RNF-09), plano B (RF-22) e mensagem clara (caso 1).
- **Bloqueio ou mudança das páginas de benefícios:** mitigado pelo RF-49 e pela aprovação manual.
- **Formato dos arquivos da B3:** pode mudar sem aviso. Mitigação: validação de colunas (caso 10).
- **Limites dos planos gratuitos:** mitigados pelo aviso de 80% (caso 15) e pela exportação completa (RNF-07).
- **Dados sensíveis:** credenciais e dados completos de cartão estavam nas planilhas originais. Já foram movidos para o Bitwarden, e a importação os ignora (RF-91, RF-92).
- **Volume de trabalho:** são cerca de 17 leitores de fatura. Por isso a entrega é faseada.

**Entregas**
1. Acesso, Contabilidade, Faturas, Categorias, Divisão, Avisos de vencimento e importação de 2026 (RF-01 a RF-40, RF-80, RF-82, RF-90).
2. Cartões e Milhas e Pontos (RF-45 a RF-58, RF-81, RF-91, RF-92).
3. Investimentos (RF-60 a RF-69).
4. IR (RF-75 a RF-78d, RF-93). O ideal é estar pronta antes da declaração de 2027 (ano-calendário 2026).

## 11. Definição de concluído

A entrega está pronta quando **todos** os itens abaixo puderem ser verificados por alguém que não participou da construção:

- [ ] Abrir qualquer rota sem login redireciona para a tela de login; o login exige o código do app autenticador.
- [ ] Uma consulta direta à base de dados com a credencial pública do front-end, sem login, não retorna nenhum registro.
- [ ] O esquema de dados não tem nenhum campo para senha de terceiros, número completo de cartão, validade, CVV ou CPF.
- [ ] Os totais de cada mês de 2026 e de cada fatura importada são iguais aos da planilha original. O relatório de importação lista as linhas ignoradas.
- [ ] Para cada leitor entregue (na entrega 1: Itaú e Caixa), enviar a fatura de amostra gera linhas cujo total confere com o impresso, e nenhum CPF ou endereço fica gravado.
- [ ] Cadastrar um cartão novo e desativar um cancelado funciona, e o histórico do desativado continua consultável.
- [ ] Um gasto do Diego com o marcador "Salão" aparece num grupo separado, com subtotal, no resumo e no link dele.
- [ ] Colar no plano B um texto no formato padronizado importa as linhas corretamente.
- [ ] Depois de lançar uma compra em 6x, as 5 parcelas seguintes aparecem nas faturas futuras. A importação do mês seguinte não as duplica e mantém descrição e divisão.
- [ ] Dar o lembrete "CASACO" à parcela 1/6 de "MERCADO LIVRE" faz a parcela 2/6 vir com o mesmo lembrete, e a descrição da fatura continua a original.
- [ ] Uma compra dividida 70/30 com o Diego e outra 100% do Diego aparecem na tela do Diego com os valores corretos. O PDF e o texto de WhatsApp mostram esses itens, o total e a chave Pix.
- [ ] O link de consulta do Diego mostra só os itens dele no período, deixa de funcionar depois de revogado e após 30 dias, e não exibe nenhum dado do Mário.
- [ ] Uma conta com vencimento amanhã e sem pagamento gera push e e-mail hoje às 8h e de novo amanhã às 8h. Depois de registrar o pagamento, não há novo aviso.
- [ ] A foto de um boleto real preenche valor e vencimento corretamente.
- [ ] A regra de isenção "gasto de R$ 8.000 na fatura" mostra o progresso correto com base nas faturas lançadas.
- [ ] Usar "usei" na sala VIP desconta 1 acesso, e o contador volta ao total na data de renovação.
- [ ] Alterar manualmente a versão salva da página de benefícios de um cartão faz a checagem mensal apontar a diferença e enviar o aviso, sem alterar o cadastro até a aprovação.
- [ ] Uma transferência Livelo → TudoAzul com 110% de bônus debita e credita os saldos corretos e recalcula o custo médio do TudoAzul.
- [ ] O contador de CPFs da Latam Pass mostra os disponíveis no período considerando vendas e emissões.
- [ ] Importar os arquivos da B3 duas vezes não duplica operações nem proventos.
- [ ] A quantidade de cada ativo é a do arquivo de Posição da B3; todo ativo cujo histórico não explica essa quantidade aparece como “sem preço médio” e aceita PM manual ou da planilha antiga.
- [ ] O relatório de conciliação lista ao menos as divergências de quantidade e de proventos entre a planilha antiga e a B3, por ativo.
- [ ] O resumo anual do IR mostra o total PGBL contra o limite de 12% da renda tributável.
- [ ] O relatório de apoio ao IR de 2026 lista cada ativo em 31/12/2025 e 31/12/2026 pelo custo de aquisição, com grupo/código, CNPJ e discriminação, e os totais de proventos por tipo batem com a soma da Movimentação da B3 no ano.
- [ ] Exportar o relatório gera um PDF e uma planilha com uma aba por ficha. No celular, o botão de copiar de cada campo funciona.
- [ ] Uma venda de ações num mês com total vendido abaixo do limite de isenção aparece como isenta. Um prejuízo num mês é abatido do lucro do mês seguinte na apuração.
- [ ] A exportação completa gera arquivos que reabertos numa planilha têm os mesmos totais do sistema.
- [ ] Todas as telas funcionam num celular de 360 px e o sistema pode ser instalado na tela inicial.
- [ ] O painel de cobrança de cada provedor usado mostra custo R$ 0 no mês.

## 12. Perguntas em aberto

- Amostras de fatura dos outros emissores (Santander, Bradesco, BB, PicPay, Porto, Inter, Nubank, Mercado Pago, Carrefour, Pão de Açúcar), para ampliar os leitores depois da entrega 1.
- Revisar a tabela de códigos do IRPF (RF-78a) contra o manual oficial a cada exercício. Guias de bancos e da imprensa usam códigos diferentes conforme o ano.
- Destino da cópia de segurança semanal (e-mail, Google Drive ou outro).

**Decididas em 25/11/2026**
- Cartões: o cadastro é livre, e cartões cancelados são desativados sem perder o histórico (RF-44).
- Salão do Diego: os gastos ficam como responsabilidade do Diego, com o marcador "Salão" (RF-39a).
