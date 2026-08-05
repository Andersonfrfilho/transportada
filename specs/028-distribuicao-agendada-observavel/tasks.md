# Tasks

> 🤖 Modelo: `sonnet` para T003–T005 e T008–T010 (mecânico, com contrato escrito antes).
> T001, T002, T006 e T007 são 🧠 — vocabulário de domínio duplicado entre apps e fiação do
> composition root. Validar com `opus`.

Nenhum `[NEEDS CLARIFICATION]` aberto: escopo, permissões e o desenho das duas rotas de leitura
foram resolvidos com o usuário (ver `spec.md` § Decisões).

- [ ] T001 🧠 Contract test do vocabulário de razões na API —
      `apps/api-transportada/test/companies/distribution-eligibility.contract.ts` cobrindo as sete
      razões da tabela D1 e a ordem de precedência. Escrito **antes** de T002.
- [ ] T002 🧠 `distribution-eligibility.policy.ts` na API —
      `apps/api-transportada/src/companies/domain/` — devolve
      `{ eligible: true } | { eligible: false, reason }`. T001 passa a verde.
- [ ] T003 [P] Contract test da mesma tabela no cron —
      `apps/cron-transportada/test/nfe-distribution-pull/eligibility-reasons.contract.ts`.
- [ ] T004 Policy do cron passa a devolver razão —
      `apps/cron-transportada/src/nfe-distribution-pull/domain/distribution-eligibility.policy.ts`
      — `select-eligible-companies.use-case.ts` continua filtrando por `eligible`.
- [ ] T005 Cron loga o descarte — `cron_company_not_eligible` por empresa em
      `select-eligible-companies.use-case.ts`, e contagem por razão em `cron_cycle_completed`
      (`run-cycle.ts`). Teste confere que uma empresa sem opt-in produz `reason: 'not_opted_in'`.
- [ ] T006 🧠 Use-case de status — `get-scheduled-distribution-status.use-case.ts` em
      `src/companies/application/` — compõe opt-in + elegibilidade (T002) + cursor + última
      importação automática (`triggered_by = 'automation'`). Port de leitura próprio.
- [ ] T007 🧠 Use-case de desligar + rotas — `disable-scheduled-distribution.use-case.ts`,
      `PUT`/`DELETE`/`GET /company-settings/scheduled-distribution` em
      `company-settings.routes.ts`, e fiação de `createEnableScheduledDistributionUseCase` (que
      hoje não tem consumidor) no composition root. Contract test de permissão e idempotência
      escrito antes.
- [ ] T008 `GET /nfe-imports/distribution` estendida com o mesmo `ScheduledDistributionStatus`
      (D2) — `nfe-imports.routes.ts` — contract test confere corpo idêntico ao da rota de
      configurações para o mesmo estado.
- [ ] T009 [P] Frontend: painel de status + toggle em `company-settings` — client, hook, componente,
      esqueleto e `*.locale.json` acentuado. Razões traduzidas em pt-BR.
- [ ] T010 [P] Frontend: aba Remota do `nfe-workspace` — estado, última execução, notas trazidas,
      próxima janela e atalho para configurações quando desligado.
- [ ] T011 Deploy em staging + ligar o opt-in pela UI + aguardar uma janela do cron; anexar em
      `evidence.md` o log de enfileiramento e a primeira nota recebida.
- [ ] T012 Atualizar `CLAUDE.md` (rotas novas) e `docs/spec/architecture.md` se a duplicação da
      policy exigir nota — regra §14 do code-standart.
