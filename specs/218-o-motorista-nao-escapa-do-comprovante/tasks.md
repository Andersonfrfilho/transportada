# Tasks — Spec 218 (o motorista não escapa do comprovante)

## Fase 0 — Localização (concluída, ver `evidence.md`)

> 🤖 Modelo: `sonnet`

- [x] **T0** Achados registrados em `evidence.md` (T0.1-T0.4): call sites de `deliveryProof` e
      `attachmentMode`, junção emitente→`contractors`, arquivo de rotas do catálogo.
- [x] **T0b** Achado registrado em `evidence.md`: os dois caminhos de ocorrência usam modelos de
      dado incompatíveis. Decisão do usuário (29/09/2026): migrar o enum fixo de "Deu problema" para
      dentro de `company_occurrence_types`, com campo novo `flow` (`document | stop`) editável em
      `OccurrenceTypeCatalogPanel`. Ver spec.md D1 e RF-B5.

## Fase 1 — Comprovante por contratante (RF-C, RF-D1)

> 🤖 Modelo: `sonnet` (T2 é 🧠 — migration com backfill, validar antes de aplicar)

- [ ] **T1** Contratos antes, vistos falhar:
  - `resolve-with-overrides.policy` (RF-D1): as 4 combinações de presença (P4 do spec.md).
  - `resolveDeliveryProofSettings` com 3 camadas.
  - Rotas novas: CRUD feliz + 404 fora do tenant + `settings.manage`.
- [ ] **T2** 🧠 Schema + migration:
  - `deliveryProofSettingContractorOverrides` (tabela nova).
  - FK `(company_id, tax_id) → delivery_clients` em `delivery_proof_setting_overrides`, com backfill
    de `delivery_clients` para override órfão.
  - `db:generate`, `db:check`, `make migration-test` com um banco que tenha override órfão de
    propósito (fixture do teste de integração).
  - Gate: `test/database-migration/schema-snapshot.contract.ts` + `make migration-test`.
- [ ] **T3** `resolve-with-overrides.policy.ts` (RF-D1) + `resolveDeliveryProofSettings` estendido
      (adicionar select de `emitterTaxId` em `drizzle-current-driver-trip.repository.ts:395-415`,
      resolver via `findContractorByTaxId` — evidence.md T0.3) + repositório
      (`listOverrides`/`replaceOverrides` para contratante) + rotas
      `delivery-proof-contractor-overrides`.
      Gates: contrato, integração, typecheck, lint.
- [ ] **T4** Plugar RF-C3 nos dois call sites de `evidence.md` T0.1
      (`drizzle-current-driver-trip.repository.ts:835-844` e `:328`).
      Gate: contrato do snapshot do motorista (`GET /me/trips/current`) com override de contratante
      aplicado.

## Fase 2 — Vocabulário de ocorrência (RF-B5) e exceções (RF-B, reaproveita RF-D1)

> 🤖 Modelo: `sonnet` (T5 é 🧠 — migration mexe em dado gravado de viagens reais)

- [ ] **T5** 🧠 RF-B5, contratos antes + schema/migration:
  - Confirmar rótulo exato de cada `DRIVER_OCCURRENCE_KINDS` (`driverTrip.locale.json` ou
    equivalente) antes de escrever o `INSERT` — não traduzir de cabeça.
  - `company_occurrence_types` ganha `flow` (`document | stop`, default `document`).
  - Migration insere 5 linhas por empresa (`flow: 'stop'`, `attachmentMode: 'optional'`, nomes
    confirmados acima).
  - `trip_stop_occurrences` ganha `occurrence_type_id` (FK, nullable), backfill por
    `(company_id, kind)`, `kind` preservado.
  - `make migration-test` com fixture de empresa que já tem `trip_stop_occurrences` gravada.
- [ ] **T6** Contratos antes: `resolve-with-overrides.policy` para ocorrência com as 4 combinações
      (reaproveitando o de T3 — não reescrever); as duas tabelas de override novas.
- [ ] **T7** Schema + migration das tabelas de override: `companyOccurrenceTypeContractorOverrides`,
      `companyOccurrenceTypeRecipientOverrides` (sem backfill — granularidade nova; roda **depois**
      de T5, para os 5 tipos de `flow: stop` já poderem receber exceção). Gate: `make migration-test`.
- [ ] **T8** Use case + rota `GET`/`PUT /company-settings/occurrence-types/:id/attachment-overrides` + campo `flow` no `PUT`/criação de tipo (`save-occurrence-type.use-case.ts`).
      Gate: contrato, integração, typecheck, lint.
- [ ] **T9** Plugar a resolução de 3 camadas em `list-field-occurrence-types.use-case.ts:35-47`
      (evidence.md T0.2 — único ponto, cobre motorista e escritório de uma vez).
      Gate: contrato do ponto que o app do motorista lê.

## Fase 3 — Painel: telas de configuração (RF-C4, RF-B4, RF-B5)

> 🤖 Modelo: `sonnet`

- [ ] **T10** `TripDeliveryProofSettingsPanel`: rótulo "Por destinatário" na seção existente + seção
      nova "Por contratante" (busca em `contractors`, mesmos 5 selects de modo). Gate: `test` do painel.
- [ ] **T11** `OccurrenceTypeCatalogPanel`: campo `flow` no formulário de cada tipo (ao lado de
      `attachmentMode`) + seção "Exceções" por tipo, colapsável, duas listas
      (contratante/destinatário). Gate: `test` do painel.
- [ ] **T12** Revisão de design das telas (web.md §15): print em 375 px e desktop, comparado com os
      vizinhos (outros selects/listas do mesmo painel).

## Fase 3b — Painel: tela de verificação (RF-E)

> 🤖 Modelo: `sonnet`. Depende de T3/T8 (lê os overrides que essas tasks gravam); não depende da
> Fase 4.

- [ ] **T13** Contrato antes: `GET /company-settings/settings-resolution` com as 4 combinações de
      P4/P6 (nenhum override, só contratante, só destinatário, os dois).
- [ ] **T14** Rota + composição pura (`resolveWithOverrides` de T6, sem reescrever a regra) +
      tela/aba nova no painel (busca por contratante e por destinatário, tabela de resultado só
      leitura). Gates: contrato, typecheck, lint, `test` do painel.
- [ ] **T15** Revisão de design (web.md §15): print da tela de verificação com um resultado
      preenchido (não a tela vazia).

## Fase 4 — App do motorista: extração + gate de entrega (RF-A1–A4)

> 🤖 Modelo: `opus` 🧠 — cruza o componente mais testado do app (30+ contratos), risco de regressão
> alto; validar a extração (T16) sozinha, com os testes de hoje verdes, antes de somar qualquer
> comportamento novo.

- [x] **T16** 🧠 Extrair `ProofCaptureFields` de `DeliveryProofSection`
      (`DriverStopCard.component.tsx`) — refatoração pura, sem mudar comportamento. Gate: `test`/`check`
      da app do motorista **idêntico** ao de antes da extração (nenhum contrato muda de verde para
      vermelho nem o contrário).
- [x] **T17** Contratos antes, vistos falhar (RF-A, os 3 casos do `spec.md`: nada obrigatório /
      obrigatório trava / lançamento tardio também trava).
- [x] **T18** `PreDeliveryProofGate` + `DocumentRow` decidindo entre botão de sempre e o gate, a
      partir de `resolveProofFormPlan`/`listMissingProofFields` já existentes. Gate: `check` da app +
      `smoke` (porta 53112/53200, os specs de `driver-app.smoke.spec.ts`).
- [x] **T19** Snapshot do motorista carrega os campos já resolvidos em 3 camadas (depende de T4/T9) —
      conferir que nenhuma lógica de precedência foi duplicada no app.
- [x] **T20** Revisão de design do formulário de captura pré-entrega: print em 375 px, comparado com
      a versão pós-entrega (mesmo componente, os dois têm de ser visualmente idênticos por construção).

## Fase 4b — App do motorista: botão único de ocorrência (RF-A5, D1, RF-B5)

> 🤖 Modelo: `opus` 🧠. Depende de T5/T9 (o catálogo já precisa ter `flow` e os 5 tipos semeados) e
> de T16 (`ProofCaptureFields` já extraído).

- [x] **T21** Contratos antes, vistos falhar:
  - lista única mostra tipos `flow: document` e `flow: stop` juntos, cada um com `attachmentMode`;
  - tipo `required` sem foto não habilita "Registrar"; habilita ao capturar, sem esperar upload (P5
    do spec.md);
  - confirmar chama `handleDocumentOccurrence` (`flow: document`) ou `reportStopOccurrence`
    (`flow: stop`, agora com `occurrenceTypeId` em vez de `kind`) — nunca os dois, nunca nenhum.
- [x] **T22** `OccurrenceRegistrationPanel` (ou nome equivalente): substitui o painel inline de
      `onDocumentOccurrence` (`DriverStopCard.component.tsx:832-889`) e
      `DriverStopOccurrenceForm.component.tsx`/`useStopOccurrenceForm.hook.ts` por um componente só,
      reaproveitando `ProofCaptureFields` (T16), lendo a lista única de `GET
/me/trips/current/occurrence-types` e roteando por `flow`. Gate: `check` da app + `smoke`.
      ⚠️ Feito como `DriverOccurrenceRegistrationForm` sem `ProofCaptureFields` (captura do
      canhoto — ver `evidence.md` Fase 4b), com a rota de parada do backend fechada antes (D2).
      Commits `a6092990b`, `e0a73b41b`, `83449e0d9`, `8b705e800`.
- [x] **T23** Revisão de design do componente único: print em 375 px mostrando um tipo `required`
      (com a captura de foto) e um tipo `off`/`optional` (sem ela), lado a lado na mesma lista.

## Fase 5 — Legado `/minha-viagem` (mesma correção, RF-A e RF-A5)

> 🤖 Modelo: `sonnet`

- [ ] **T24** Confirmar com o usuário, antes de tocar em código, se `VITE_DRIVER_APP_URL` já está
      ligada em produção no momento da execução — se sim, esta fase é dispensável (o legado já não serve
      ninguém) e vira nota no `evidence.md`, não código.
- [ ] **T25** Se ainda necessário: mesma extração/gate/unificação por cópia de valor
      (`apps/frontend-transportada/src/modules/driver-trip/`). Gate: `test` do painel.

## Fase 6 — Evidência final

> 🤖 Modelo: `sonnet`

- [ ] **T26** `evidence.md`: números de cada gate (contrato/integração/migration/smoke), as duas
      decisões de rollback documentadas (linhas de `delivery_clients` e de `company_occurrence_types`
      dos backfills não são desfeitas), e o resultado de T24.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/218-o-motorista-nao-escapa-do-comprovante/ (leia
spec.md, plan.md, tasks.md e evidence.md antes de começar — a Fase 0 já rodou, não repita). Uma
task por vez, na ordem do tasks.md. Fases 1 e 2 podem correr em paralelo entre si; Fase 3 depende de
T3/T5/T8; Fase 3b depende de T3/T8; Fase 4 depende de Fases 1 e 2 fechadas (T19 depende de T4/T9);
Fase 4b depende de T5/T9/T16.
Modelos: Fase 1 → executor model=sonnet (T2 🧠) · Fase 2 → executor model=sonnet (T5 🧠, migration
em dado gravado — validar contra fixture de empresa com trip_stop_occurrences antes de aplicar) ·
Fase 3 e 3b → executor model=sonnet · Fase 4 e 4b → opus (T16 é o ponto de maior risco de
regressão — parar e confirmar os testes de hoje continuam verdes antes de seguir) · Fase 5 →
executor model=sonnet, só depois de confirmar com o usuário (T24) · revisão final →
code-reviewer model=opus.
Cada task fecha com os gates listados nela + commit isolado. Pare e pergunte antes de: aplicar
qualquer migration em staging/produção, decidir se a Fase 5 é necessária (T24), e qualquer
divergência entre o que uma task encontrar e o que o plan.md supõe.
```
