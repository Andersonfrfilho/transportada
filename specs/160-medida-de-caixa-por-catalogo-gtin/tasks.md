# Tasks

> ⏸️ **Suspensa após a Fase 1** — ver o topo de `spec.md`. T007–T020 não serão executadas.

> 🤖 Modelo: `sonnet` (T001 e T012 são 🧠 — validar com `opus` antes)

## Fase 1 — Fundação pura, sem rede

> 🤖 Modelo: `sonnet`

- [x] T001 🧠 Fixtures com payload real dos provedores (Cosmos torto do `7896098909768`, GS1, Open
      Products Facts) — `apps/api-transportada/test/fixtures/gtin-catalog.fixture.ts` — fixture
      revisada contra a tabela do `plan.md`
- [x] T002 [P] Teste de contrato da sanidade (CA01) antes da implementação —
      `test/package-box-catalog/sanity.contract.ts` + entrada no `package.json` — testes vermelhos
- [x] T003 [P] Teste de contrato do consenso (CA02, CA03) —
      `test/package-box-catalog/consensus.contract.ts` — testes vermelhos
- [x] T004 `package-box-catalog-sanity.policy.ts` com os cinco códigos do RF05 — T002 verde
      (implementados os seis códigos do RF05 por extenso; ver evidence.md)
- [x] T005 `package-box-catalog-consensus.policy.ts` com tolerância 15 mm / 5% — T003 verde
- [x] T006 `'catalog'` em `PACKAGE_BOX_MEASUREMENT_SOURCES` (schema da API **e** cópia espelhada do
      worker) — typecheck verde nas duas apps (cópia do worker não existe ainda; ver evidence.md)

## Fase 2 — Persistência e cota

> 🤖 Modelo: `sonnet`

- [ ] T007 Migration aditiva `gtin_catalog_lookups` + `gtin_catalog_quota_usage`, sem `company_id`,
      varchar no lugar de ENUM — `make migration-test` verde
- [ ] T008 `drizzle-gtin-catalog-lookup.repository.ts` + contador de cota na mesma transação —
      teste de contrato do repositório
- [ ] T009 `cached-package-box-catalog.gateway.ts` (cache permanente + cota + circuito aberto) —
      CA05 e CA06 verdes

## Fase 3 — Gateways

> 🤖 Modelo: `haiku` (mecânico: três adaptadores do mesmo formato)

- [ ] T010 [P] `open-products-facts-package-box-catalog.gateway.ts` — o único sem token; devolve
      peso/nome e nunca dimensão — teste de contrato com payload salvo
- [ ] T011 [P] `cosmos-package-box-catalog.gateway.ts` (`X-Cosmos-Token`, desligado sem env) +
      `x-cosmos-token` na lista de headers redigidos do logger — teste de contrato
- [ ] T012 [P] `gs1-package-box-catalog.gateway.ts` — teste de contrato

## Fase 4 — Orquestração e cron

> 🤖 Modelo: `sonnet`

- [ ] T013 `resolve-package-box-from-catalog.use-case.ts` — consulta → sanidade → consenso →
      proposta ou promoção condicional (`WHERE length_mm IS NULL`) — CA04 verde
- [ ] T014 Entrypoint one-shot em `apps/cron-transportada/src/package-box-catalog/` respeitando a
      cota e retomando de onde parou — CA06
- [ ] T015 Teste de integração do cron completo com gateways falsos —
      `test/integration/package-box-catalog.integration.ts`, rodado com
      `bun --env-file=../../.env.test test --timeout 120000` — CA07
- [ ] T016 Agendamento do cron em `.railway/railway.ts` (`cronSchedule`), conferido contra o
      `railway.json` correspondente — `railway config plan` sem surpresa

## Fase 5 — Fila e fechamento

> 🤖 Modelo: `sonnet`

- [ ] T017 Origem da medida proposta no item da fila (provedor + data) na API — teste de contrato
- [ ] T018 UI da fila: proposta, origem e as ações aceitar/corrigir/descartar; duas propostas
      divergentes lado a lado (P4) — `apps/frontend-transportada`
- [ ] T019 🧠 Revisão de design e usabilidade da fila, fechada com print — CA08
- [ ] T020 `make check` completo + evidência consolidada em `evidence.md`

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/160-medida-de-caixa-por-catalogo-gtin/ (leia
spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 → executor model=sonnet (T001 🧠 → opus) · Fase 2 → executor model=sonnet ·
Fase 3 → executor model=haiku · Fase 4 e 5 → executor model=sonnet · T019 🧠 → designer ·
revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
A integração da API roda com `bun --env-file=../../.env.test test --timeout 120000` de dentro de
apps/api-transportada — sem a flag ela pula em silêncio e não vale como evidência.
Pare e pergunte antes de: deploy, migration destrutiva, gravar medida de catálogo por cima de
medida humana, qualquer [NEEDS CLARIFICATION].
```
