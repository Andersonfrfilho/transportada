# Tasks

⚠️ **Meça antes de codificar em cima.** As premissas do `plan.md` vêm de mapeamento por leitura,
não de medição. A task que herdar uma afirmação confere primeiro: schema real de
`login_identifiers`, versão instalada do módulo, forma do payload de `onMessageReceived` na versão
que sobe.

## Fase 0 — Fundação

> 🤖 Modelo: `sonnet`

- [ ] **T001** Subir `@adatechnology/meta-whatsapp-module` (+ `-contracts`, `-provider`) para a linha
      0.2.0 e adaptar `meta-whatsapp-migration.service.ts:46` a `{ db, migrate }` —
      `apps/api-transportada/package.json`, `src/database/meta-whatsapp-migration.service.ts` —
      `make check` verde e `make migration-test` verde, sem mudança de comportamento

## Fase 1 — Quem fala (D1, D2)

> 🤖 Modelo: `opus` 🧠 — o telefone vira credencial

- [ ] **T002** 🧠 Contrato vermelho da canonicalização E.164 e de `maskPhone` —
      `test/whatsapp-commands/whatsapp-phone.contract.ts` + entrypoint + `package.json`
- [ ] **T003** 🧠 Migration `verified_at` + índice único parcial **global** em `login_identifiers`
      (`value` onde `kind='phone'` e verificado — a tabela não tem `company_id`), com rollback — `drizzle/`, `src/database/login-identifier.schema.ts`
      — `make migration-test`
- [ ] **T004** 🧠 Verificação por código: rotas `/me/whatsapp-phone/*`, código de uso único com
      digest e `timingSafeEqual`, envio pelo template da 062 T005 —
      `src/whatsapp-commands/{application,presentation}/` — contrato de 204 invariável, expiração e
      5 tentativas
- [ ] **T005** 🧠 `resolveWhatsAppActor`: telefone verificado → membership ativa → permissões, com
      resposta neutra única para os quatro casos de recusa — `application/resolve-whatsapp-actor.use-case.ts`
      — contrato dos quatro casos + `tenant-safety.contract.ts`

## Fase 2 — O despachante e o menu

> 🤖 Modelo: `sonnet` (T006 é 🧠 — onde mensagem vira execução)

- [ ] **T006** 🧠 `WhatsAppCommandDriver` no hook `onMessageReceived` do resolver por empresa: resolve o
      ator, roda `flows.interpreter`, envia `fallbackMessage`, handoff na segunda recusa, teto de
      30/10 min por número — `application/whatsapp-command-driver.service.ts`,
      `src/whatsapp/application/meta-whatsapp-module.resolver.ts` — integração com Graph API fake
- [ ] **T007** Política de menu (botão ≤3 com emoji, lista 4–10, paginação >10, teto de 20/24
      caracteres) e validação na publicação do grafo — `domain/whatsapp-menu.policy.ts` — contrato
- [ ] **T008** Grafo em código + comando de republicação versionada; o menu raiz é filtrado por
      permissão — `infrastructure/whatsapp-flow-graph.seed.ts`, `scripts/` — contrato de
      republicação que sobe versão e não sobrescreve

## Fase 3 — Emissão por seleção (D3–D6)

> 🤖 Modelo: `opus` 🧠 — regra fiscal e efeito irreversível

- [ ] **T009** 🧠 Migration `output_document` + `nfse_emission_profile_id` em `cte_emission_profiles`
      com CHECK de coerência e FK composta; formulário do perfil no painel ganha os dois campos —
      `drizzle/`, `cte-profiles/`, `frontend-transportada/src/modules/cte-profiles/` —
      `make migration-test`, contrato de schema
- [ ] **T010** 🧠 `classifyDocumentOutput` (cte · nfse · blocked · no_profile) em
      `cte-profiles/domain/`, com `municipal_service_policy='block'` vencendo; `documentOutput` na
      listagem de notas — contrato de classificação + paridade listagem × bot
- [ ] **T011** 🧠 `whatsapp_command_requests` + `_documents` (migration, schema, repositório, cópia
      no worker) — contrato de tenant
- [ ] **T012** 🧠 Prévia: critérios da D4 (faixa por emitente e série, viagem, data, remetente),
      volumetria, congelamento com `preview_sha256`, expiração de 15 min —
      `application/preview-document-selection.use-case.ts` + FlowActions — integração do AC3
- [ ] **T013** 🧠 Confirmação: recalcula e compara hash; cria lotes de CT-e por perfil e NFS-e por
      (perfil, tomador) pelos use-cases existentes, com a chave de idempotência derivada do pedido;
      pergunta o `period` com "Pular" — `application/confirm-document-selection.use-case.ts` —
      integração dos AC4 e AC5
- [ ] **T014** 🧠 Liquidação no worker: todos os documentos em estado final → uma fatura por tomador
      só com os autorizados → resumo ao número; timeout de 2h para pendentes —
      `apps/worker-transportada/src/whatsapp-command-settlement/` — integração do AC6

## Fase 4 — Entrega e ocorrência (D7)

> 🤖 Modelo: `sonnet`

- [ ] **T015** FlowActions do motorista: viagem atual → Entregar / Devolver (motivo em lista) /
      Ocorrência (catálogo `delivery`) pelos use-cases do PWA — `register-driver-flow-actions.ts` —
      E2E do AC7
- [ ] **T016** FlowActions do operador: viagem em lista → ações que
      `checkTripAcceptsDocumentWork` aceita no estado → ocorrência `separation` —
      `register-operator-trip-flow-actions.ts` — contrato estado → ações oferecidas, espelhando
      `test/trip/state-gates.contract.ts`

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet`; revisão final `opus`

- [ ] **T017** Tela "WhatsApp" no perfil do usuário (verificar e desvincular o número) —
      `frontend-transportada/src/modules/identity/` — contratos de design system existentes verdes
- [ ] **T018** `docs/SECURITY.md` (teto por número, achado do rate limit redatado), CLAUDE.md (seção
      do módulo), ADR-0063 "O telefone vira credencial só verificado" — docs
- [ ] **T019** Prova de ponta em `evidence.md`: conversa real em staging com os 9 critérios de aceite,
      um por um

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos arquivos. Marque como
concluída apenas após registrar evidência.

## Ordem

```
T001 ─> T002 ─> T003 ─> T004 ─> T005 ─> T006 ─> T007 ─> T008 ─┬─> T009 ─> T010 ─> T011 ─> T012 ─> T013 ─> T014 ─┐
                                                              └─> T015 ─> T016 ──────────────────────────────────┴─> T017 ─> T018 ─> T019
```

**A Fase 4 é entregável antes da Fase 3**: entrega e ocorrência não dependem da regra fiscal nova e
fecham a T011 da 062 sozinhas.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/144-o-comando-chega-pelo-whatsapp/ (leia spec.md,
plan.md e tasks.md antes de começar; leia também specs/062-o-whatsapp-ja-esta-modelado/). Crie o
worktree com `make worktree NAME=spec-144`. Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 → executor model=sonnet · Fase 1 (T002–T005 🧠) → opus, validar com architect antes
de T003 · Fase 2 → executor model=sonnet, T006 🧠 → opus · Fase 3 (T009–T014 🧠) → opus, critic
revisa T010 e T013 antes de implementar · Fase 4 → executor model=sonnet · Fase 5 → executor
model=sonnet · revisão final → code-reviewer model=opus + security-reviewer.
Cada task fecha com bun run typecheck + testes da app + make check + commit isolado, evidência em
evidence.md. Teste novo entra na lista explícita do package.json.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION], enviar
mensagem real por WhatsApp fora de staging, e qualquer mudança no pacote @adatechnology (é outro
repositório, com changeset).
```
