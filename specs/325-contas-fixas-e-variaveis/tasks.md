# Tasks — 325 Contas fixas e variáveis

Uma task por vez, PR para staging, merge com CI verde. Contrato: `bun --env-file=../../.env.test test --timeout 120000`;
integração: `bun --env-file=../../.env.test run test:integration` (de dentro de `apps/api-transportada`). Task só fecha com
evidência em `evidence.md`. Telas: componentes padrão do design system, prints claro/escuro e desktop/celular antes do PR.

## Fase 0 — Decisões

- [ ] **T0.1** Anderson responde as 4 dúvidas (ou aceita os padrões); spec atualizada.
  > 🤖 Modelo: `opus`
- [x] **T0.2** ADR curta: despesa da empresa como módulo próprio, separado do lançamento de viagem (061/169). Aceite: ADR aceita.
      Feita: [ADR-0115](../../docs/adr/0115-a-conta-da-empresa-e-modulo-proprio.md), aceita (inclui o pagamento de motorista/agregado lido das viagens, sem somar de novo).
  > 🤖 Modelo: `opus`

## Fase 1 — API

- [ ] **T1.1** Contratos vermelhos: motorista obrigatório na categoria de motorista, motorista de outra empresa, isolamento por empresa, baixa idempotente, geração única de ocorrência, dia 31, permissões.
  > 🤖 Modelo: `sonnet`
- [ ] **T1.2** Schema (inclui `payee_driver_id`) + migration aditiva + rollback; categorias semeadas (`make migration-test`).
  > 🤖 Modelo: `sonnet`
- [ ] **T1.3** Permissões `expenses.read`/`expenses.manage` em `authorization.policy.ts` + papéis.
  > 🤖 Modelo: `opus` (decide quem acessa)
- [ ] **T1.4** Casos de uso e rotas: contas, categorias, ocorrências, baixa, cancelamento, listagem com totais; auditoria.
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
