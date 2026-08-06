# Tasks

> 🤖 Modelo: `sonnet` para T003–T005 e T008–T010 (mecânico, com contrato escrito antes).
> T001, T002, T006 e T007 são 🧠 — vocabulário de domínio duplicado entre apps e fiação do
> composition root. Validar com `opus`.

Nenhum `[NEEDS CLARIFICATION]` aberto: escopo, permissões e o desenho das duas rotas de leitura
foram resolvidos com o usuário (ver `spec.md` § Decisões).

- [x] T001 🧠 Contract test do vocabulário de razões na API —
      `apps/api-transportada/test/companies/distribution-eligibility.contract.ts` cobrindo as sete
      razões da tabela D1 e a ordem de precedência. Escrito **antes** de T002.
- [x] T002 🧠 `distribution-eligibility.policy.ts` na API —
      `apps/api-transportada/src/companies/domain/` — devolve
      `{ eligible: true } | { eligible: false, reason }`. T001 passa a verde.
- [x] T003 [P] Contract test da mesma tabela no cron —
      `apps/cron-transportada/test/nfe-distribution-pull/eligibility-reasons.contract.ts`.
- [x] T004 Policy do cron passa a devolver razão —
      `apps/cron-transportada/src/nfe-distribution-pull/domain/distribution-eligibility.policy.ts`
      — `select-eligible-companies.use-case.ts` continua filtrando por `eligible`.
- [x] T005 Cron loga o descarte — `cron_company_not_eligible` por empresa em
      `select-eligible-companies.use-case.ts`, e contagem por razão em `cron_cycle_completed`
      (`run-cycle.ts`). Teste confere que uma empresa sem opt-in produz `reason: 'not_opted_in'`.
- [x] T006 🧠 Use-case de status — `get-scheduled-distribution-status.use-case.ts` em
      `src/companies/application/` — compõe opt-in + elegibilidade (T002) + cursor + última
      importação automática (`triggered_by = 'automation'`). Port de leitura próprio.
- [x] T007 🧠 Use-case de desligar + rotas — `disable-scheduled-distribution.use-case.ts`,
      `PUT`/`DELETE`/`GET /company-settings/scheduled-distribution` em
      `company-settings.routes.ts`, e fiação de `createEnableScheduledDistributionUseCase` (que
      hoje não tem consumidor) no composition root. Contract test de permissão e idempotência
      escrito antes.
- [x] T008 `GET /nfe-imports/distribution` estendida com o mesmo `ScheduledDistributionStatus`
      (D2) — `nfe-imports.routes.ts` — contract test confere corpo idêntico ao da rota de
      configurações para o mesmo estado.
- [x] T009 [P] Frontend: painel de status + toggle em `company-settings` — client, hook, componente,
      esqueleto e `*.locale.json` acentuado. Razões traduzidas em pt-BR.
- [x] T010 [P] Frontend: aba Remota do `nfe-workspace` — estado, última execução, notas trazidas,
      próxima janela e atalho para configurações quando desligado.
- [ ] T011 Deploy em staging + ligar o opt-in pela UI + aguardar uma janela do cron; anexar em
      `evidence.md` o log de enfileiramento e a primeira nota recebida.
- [x] T012 Atualizar `CLAUDE.md` (rotas novas) e `docs/spec/architecture.md` se a duplicação da
      policy exigir nota — regra §14 do code-standart.
- [x] T013 Log estruturado sobrevive fora do ambiente local — `shouldPrettyPrintLogs` em
      `src/logging/log-format.policy.ts` de api, worker e cron, consumida nos quatro pontos que
      montam logger. Descoberta ao validar T011: `pretty` descarta o `meta`, e staging usa
      `APP_ENV=staging`, então `ineligibleCounts` e a razão por empresa não chegavam ao log.
- [x] T014 A varredura do cron parte de `companies` —
      `drizzle-distribution-candidate.source.ts` partia de `company_distribution_settings`, cuja
      linha só nasce ao mexer no interruptor, então empresa que nunca optou não era contada nem
      reportada. Contrato em `test/nfe-distribution-pull/candidate-scope.contract.ts`.
