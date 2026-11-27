# BanKMar — finanças pessoais

Sistema pessoal que substitui as planilhas de contabilidade, investimentos e milhas.
Especificação: `specs/financas-pessoais.md` (no projeto do Claude). Esta versão implementa a **Entrega 1**:
contas, faturas, categorias, divisão com outras pessoas, avisos e importação da planilha 2026.

- **Telas:** React + Vite, instalável no celular (PWA), hospedado no Netlify. Deploy automático a cada push na `main`.
- **Banco, login e agendamento:** Supabase, plano gratuito. Toda regra de acesso está no banco (RLS); só uma sessão com verificação em duas etapas lê dados.
- **Faturas:** lidas no navegador (pdf.js). O PDF não vai para servidor nenhum. Há leitores para Itaú e Caixa; os demais emissores usam "Colar texto".
- **Avisos:** Edge Function diária às 8h de Brasília, com push (Web Push) e e-mail (Resend, plano gratuito).

## Implantação (uma vez)

### 1. Supabase
1. Crie um projeto em supabase.com (região *South America (São Paulo)*) e anote a **senha do banco**.
2. Em **Authentication → Users → Add user**, crie o seu usuário (e-mail e senha).
3. Em **Authentication → Sign In / Providers**, desligue **Allow new users to sign up**. Só você terá acesso.
4. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.

### 2. GitHub → Supabase (publica o banco e a função automaticamente)
Em **GitHub → cmdtmario/bankmar → Settings → Secrets and variables → Actions**, crie:
- `SUPABASE_ACCESS_TOKEN`: gerado em supabase.com → Account → Access Tokens
- `SUPABASE_PROJECT_REF`: o ID do projeto (o trecho antes de `.supabase.co`)
- `SUPABASE_DB_PASSWORD`: a senha do banco

Depois, em **Actions → Supabase → Run workflow**, rode uma vez. Isso cria as tabelas e publica a função de avisos.

### 3. Netlify
Em **Site configuration → Environment variables**:
- `VITE_SUPABASE_URL`: a Project URL
- `VITE_SUPABASE_ANON_KEY`: a chave anon public
- `VITE_VAPID_PUBLIC_KEY`: a chave pública de push (ver passo 4)

Em seguida, use **Deploys → Trigger deploy**.

### 4. Avisos (push e e-mail)
1. Crie uma conta gratuita em resend.com e gere uma **API key**.
2. Em **Supabase → Edge Functions → Secrets**, crie:
   `CRON_SECRET` (qualquer texto longo e aleatório), `RESEND_API_KEY`, `AVISO_REMETENTE` (`BanKMar <onboarding@resend.dev>`),
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (`mailto:seu-email`).
3. Publique as funções `avisos-vencimento`, `investimentos-diario` e `beneficios-mensal` (pelo GitHub Actions, depois de criar os secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF` no repositório, ou pelo `supabase functions deploy`).
4. No **SQL Editor**, rode `supabase/agendamento.sql` trocando o ID do projeto e o `CRON_SECRET`. Ele agenda os avisos (8h), as cotações (18h30 dos dias úteis) e a checagem de benefícios (dia 1, 9h).
5. No app, em **Mais**, salve seu e-mail e toque em **Ativar notificações neste aparelho**.

### 5. Primeiro acesso
1. Entre com e-mail e senha e leia o QR code no seu app autenticador.
2. Em **Mais → Importar planilha 2026**, envie a planilha, confira os totais e grave.
3. Em **Mais → Cartões → Importar da planilha**, envie a mesma planilha (aba CARTÕES). Depois complete o final e o dia de vencimento de cada cartão.
4. Em **Investir → Importar**, envie os arquivos da B3 (Negociação, Movimentação, Posição, Proventos a receber).
5. Em **Mais → Milhas e pontos → Importar**, envie o Controle_Milhas.xlsx.
6. Em **Mais → Imposto de Renda → Configurar**, importe a aba IRRF e revise os códigos das fichas.

## Fluxo de publicação (economiza créditos do Netlify)
- Todo desenvolvimento vai para a branch **`dev`**. O Netlify publica só a `main`, então nada em `dev` gasta deploy.
- A cada push em `dev`, o GitHub roda os testes e o **teste de telas** (prints em Actions → Telas → artefato).
- Só quando o Mário aprovar, `dev` é juntada na `main` e o Netlify publica.

## Desenvolvimento
```
npm ci
npx vitest run              # testes (leitores, regras, importação, avisos)
supabase/tests/run.sh       # testes do banco num Postgres local (porta 5433)
npm run dev
```
Dados pessoais (planilhas, PDFs) nunca entram no repositório (`.gitignore`). As faturas de teste em
`src/lib/faturas/__fixtures__` são anonimizadas por `scripts/anonimizar-fixture.mjs`.
