# Tasks

Bloqueadas até o Anderson responder as dúvidas de `spec.md` § Dúvidas (1, 3 e 5 mudam o modelo).
O campo **Modelo** segue a regra do projeto: o coordenador abre cada etapa na thread com o modelo
indicado.

- [ ] T001 Migration de expansão: `company_expense_categories`, `company_recurring_expenses`,
      `company_expense_entries` (+ índice único `recurring_expense_id, competence`) com rollback —
      `apps/api-transportada/src/database/company-expense.schema.ts`, `drizzle/` — `db:generate`,
      `db:check` e `make migration-test` limpos. **Modelo:** sonnet.
- [ ] T002 [P] Contract test de isolamento de tenant das três tabelas. **Modelo:** sonnet.
- [ ] T003 Domínio: política de geração de vencimentos (periodicidade, último dia do mês, calendário
      comercial), política de edição (só futuros em aberto), status derivado de atraso —
      `src/company-expenses/domain/` — contract tests de borda (31 em fevereiro, virada de ano).
      **Modelo:** opus.
- [ ] T004 Use-cases: CRUD de categoria e recorrente, lançar adicional, dar baixa, reabrir com
      motivo, cancelar — `src/company-expenses/application/`. **Modelo:** sonnet.
- [ ] T005 Repositório Drizzle + testes de integração (conflito de baixa concorrente). **Modelo:**
      sonnet.
- [ ] T006 Permissão `company.expenses` (`company-admin`, `finance`) e rotas HTTP com contract test
      por papel recusado — `src/company-expenses/presentation/`. **Modelo:** sonnet.
- [ ] T007 Job no cron que materializa os lançamentos da janela, idempotente —
      `apps/cron-transportada`. **Modelo:** sonnet.
- [ ] T008 Endpoint de totais por mês para a visão por período (ADR-0049 §3). **Modelo:** sonnet.
- [ ] T009 [P] Frontend: módulo `company-expense` (lista com totais, formulário de recorrente e de
      adicional, baixa com comprovante) — padrão `docs/frontend/data-tables.md`; prints 375 px,
      claro e escuro. **Modelo:** sonnet.
- [ ] T010 Notificação de vencimento no produto (spec 034). **Modelo:** sonnet.
- [ ] T011 Documentação: ADR curta da decisão "conta da empresa não é rateada por viagem" e
      `evidence.md`. **Modelo:** sonnet.
