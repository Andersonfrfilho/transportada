# Tasks — 325 Contas fixas e variáveis

Uma task por vez, PR para staging, merge com CI verde. Contrato: `bun --env-file=../../.env.test test --timeout 120000`;
integração: `bun --env-file=../../.env.test run test:integration` (de dentro de `apps/api-transportada`). Task só fecha com
evidência em `evidence.md`. Telas: componentes padrão do design system, prints claro/escuro e desktop/celular antes do PR.

## Fase 0 — Decisões

- [x] **T0.1** Anderson responde as 4 dúvidas (ou aceita os padrões); spec atualizada.
      Feita em 2026-11-13: padrões aceitos ("certo pode criar"); spec com a seção "Dúvidas" fechada.
  > 🤖 Modelo: `opus`
- [x] **T0.2** ADR curta: despesa da empresa como módulo próprio, separado do lançamento de viagem (061/169). Aceite: ADR aceita.
      Feita: [ADR-0115](../../docs/adr/0115-a-conta-da-empresa-e-modulo-proprio.md), aceita (inclui o pagamento de motorista/agregado lido das viagens, sem somar de novo).
  > 🤖 Modelo: `opus`

## Fase 1 — API

- [x] **T1.1** Contratos vermelhos: motorista obrigatório na categoria de motorista, motorista de outra empresa, isolamento por empresa, baixa idempotente, geração única de ocorrência, dia 31, permissões.
      Feita: 22 contratos em `apps/api-transportada/test/expenses/` (entrypoint `test/expenses/red-entrypoint.ts`), todos vermelhos; `tsc` e `eslint` limpos.
      ⚠️ **Fora da lista `test` do `package.json` de propósito**, para o CI de staging não ficar vermelho: **a T1.4 (e a T1.3, para `permissions.contract.ts`) move o entrypoint para `test/expenses.contract.test.ts` e o registra na lista (o guard `test-registry` só vê `test/*.contract.test.ts`, por isso o parking em `test/expenses/`)** quando o contrato ficar verde. Esqueleto em `src/expenses/` (portas, erros, casos de uso que lançam "not implemented").
  > 🤖 Modelo: `sonnet`
- [x] **T1.2** Schema (inclui `payee_driver_id`) + migration aditiva + rollback; categorias semeadas (`make migration-test`).
      Feita: `company_expense_categories`, `company_expenses` (com `payee_driver_id` e `vehicle_id` opcionais, recorrência `fortnightly`) e `company_expense_occurrences`, migration `20261113175316_company_expenses` + rollback (recusa com conta/ocorrência gravada). **Chave da ocorrência: `unique(expense_id, competence, slot)`**, `slot` 1/2 (quinzenal: dia 15 = 1, último dia = 2; as demais usam 1). Semente das 8 categorias para as empresas existentes; **empresa nova precisa da semente na T1.4** (garantir categorias ao primeiro uso). O `insertIfAbsent` da T1.4 passa a receber `slot`.
  > 🤖 Modelo: `sonnet`
- [x] **T1.3** Permissões `expenses.read`/`expenses.manage` em `authorization.policy.ts` + papéis.
      Feita: as duas no catálogo, só no `company-admin`, concedíveis por grupo, sem herança de `trip.financials`/`billing.*`. Painel aceita as duas no `/auth/me` e a matriz de grupos as mostra no grupo "Contas". `permissions.contract.ts` saiu do entrypoint vermelho e roda por **`test/expenses.contract.test.ts`, já registrado no `package.json`**: a T1.4 só acrescenta os imports ali. Notas para a T1.4 em `evidence.md` § T1.3.
  > 🤖 Modelo: `opus` (decide quem acessa)
- [x] **T1.4** Casos de uso e rotas: contas, categorias, ocorrências, baixa, cancelamento, listagem com totais; auditoria.
      Feita: casos de uso em `src/expenses/application/`, rotas em `presentation/expense.routes.ts` (`GET|POST /expenses`, `PATCH /expenses/:id`, `GET /expense-occurrences` com totais, `POST …/:id/settlement` e `…/cancellation`, `GET|POST|PATCH /expense-categories`), portas Drizzle em `infrastructure/`. Leitura `expenses.read`, escrita `expenses.manage`. Categorias semeadas no primeiro uso; `insertIfAbsent` recebe `slot`. Os 4 contratos vermelhos da T1.1 passaram para `test/expenses.contract.test.ts` e `red-entrypoint.ts` foi apagado. Notas e provas em `evidence.md` § T1.4. **Não inclui** a T1.4c (ajudante e chave `unique(trip_id, parcel_kind)`, PR #741): a porta de ocorrência não assume nada da viagem, então ela entra sem mexer aqui.
  > 🤖 Modelo: `sonnet`
- [ ] **T1.4b** Viagens do pagamento: tabela `company_expense_occurrence_trips` (migration aditiva), listar viagens disponíveis do motorista no período, incluir/remover, total vira o previsto; contratos do CA05c.
  > 🤖 Modelo: `opus` (leitura cruzada com a parcela da viagem, sem somar de novo)
- [ ] **T1.5** Rotina no `cron-transportada` que gera as ocorrências das fixas (idempotente).
  > 🤖 Modelo: `sonnet`

## Fase 2 — Painel

- [ ] **T2.1** Módulo `expenses` no frontend: cliente, validação de resposta, hooks, locales pt/en.
  > 🤖 Modelo: `sonnet`
- [ ] **T2.2** Página `/contas` (lista, filtros, totais), formulário nova conta fixa/variável (com seletor de motorista/agregado) e diálogo de baixa; item no menu (`workspaceNavigation.constant.ts`) com guarda de permissão.
  > 🤖 Modelo: `sonnet`
- [ ] **T2.2b** Diálogo "Viagens do pagamento" (lista de viagens com diária × dias, incluir/remover, total).
  > 🤖 Modelo: `sonnet`
- [ ] **T2.3** Painel "Categorias de contas" em Configurações (`SETTINGS_PANELS`).
  > 🤖 Modelo: `sonnet`
- [ ] **T2.4** Prints claro/escuro × desktop/celular comparados a outra tela do painel; evidência.
  > 🤖 Modelo: `sonnet`

## Fase 3 — Publicação

- [ ] **T3.1** Staging: migration + deploy; conferir a rotina do cron e a baixa de ponta a ponta. Produção só na próxima promoção (não é bug crítico).
  > 🤖 Modelo: `sonnet`
