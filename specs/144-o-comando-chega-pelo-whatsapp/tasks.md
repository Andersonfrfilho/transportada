# Tasks

⚠️ **Meça antes de codificar em cima.** As premissas do `plan.md` vêm de mapeamento por leitura,
não de medição. A task que herdar uma afirmação confere primeiro: schema real de
`login_identifiers`, versão instalada do módulo, forma do payload de `onMessageReceived` na versão
que sobe.

## Fase 0 — Fundação

> 🤖 Modelo: `sonnet`

- [x] **T001** ~~Subir `meta-whatsapp-*` para a linha 0.2.0~~ → **fica na 0.1.0**. A 0.2.x/0.3.0
      publica migrations no formato por journal, que o `drizzle-orm` 1.0.0-rc.4 recusa; e a 0.1.0 já
      expõe tudo o que esta spec usa (`registerFlowAction`, `FlowActionHandler`,
      `MetaWhatsAppHooks.onMessageReceived`, `FlowInterpreter`, `sendInteractiveList`/`Buttons`).
      Upgrade vira dívida no pacote, fora desta spec — ver `evidence.md` § T001

## Fase 1 — Quem fala (D1, D2)

> 🤖 Modelo: `opus` 🧠 — o telefone vira credencial

Desenho validado pelo architect em 2026-09-11, **com ajustes A1–A7** (`evidence.md` § Fase 1). O
principal: o vínculo **não** vai para `login_identifiers`, que é projeção apagada a cada gravação da
ficha.

- [x] **T002** 🧠 `toWhatsAppPhone(raw)` (canônico `55`+DDD+número ou `undefined`) e
      `isSameWhatsAppPhone(a, b)` (equivalência do nono dígito) em
      `src/whatsapp-commands/domain/whatsapp-phone.policy.ts`, mais **cópia por valor** no worker com
      contrato de paridade; `maskPhone` (`****1234`) **no módulo de logging**, porque não existe hoje —
      contrato vermelho antes: com/sem 55, `+55`, máscara, 10/11/12/13 dígitos, lixo
- [x] **T003** 🧠 Migrations `user_whatsapp_phones` e `whatsapp_phone_verification_requests`
      (`plan.md` § Dados), schema, repositório e cópia no worker; rollback ao lado —
      `make migration-test` + `tenant-safety.contract.ts`
- [x] **T005** 🧠 Extrair `resolveCompanyForUser({ userId, companyId, channel })` de
      `TenantContextService` (reusa `findActiveByUserAndCompany` + `resolveCompanyPermissions`;
      `resolveCompany` passa a delegar) e montar `resolveWhatsAppActor`: número verificado e dentro
      dos 90 dias → usuário → membership ativa na empresa do canal → `AuthenticatedContext`. Os quatro
      casos de recusa têm a mesma saída — contrato dos quatro casos + os contratos atuais de
      `tenant-context` verdes

A T004 (verificação) passa a ser **de entrada** (A3) e depende do despachante, então foi para a
Fase 2, logo depois da T006.

## Fase 2 — O despachante e o menu

> 🤖 Modelo: `sonnet` (T006 é 🧠 — onde mensagem vira execução)

- [x] **T006** 🧠 `WhatsAppCommandDriver` no hook `onMessageReceived` do resolver por empresa: resolve o
      ator, roda `flows.interpreter`, envia `fallbackMessage`, handoff na segunda recusa, teto de
      30/10 min por número — `application/whatsapp-command-driver.service.ts`,
      `src/whatsapp/application/meta-whatsapp-module.resolver.ts` — integração com Graph API fake
- [x] **T004** 🧠 Verificação de entrada, primeira `FlowAction` do despachante: o painel pede o
      código (`POST /me/whatsapp-phone/verification`, autenticado, devolve código e número da
      empresa), e a mensagem que o traz confirma **só** se o `from` casar com o número declarado;
      comparação `timingSafeEqual` sobre digest, 10 min, 5 tentativas;
      `DELETE /me/whatsapp-phone` e `DELETE /company-users/:id/whatsapp-phone` (`users.manage`, só
      desfaz); trilha em `audit_logs` — contrato do `from` divergente, do código vencido e da colisão
      com número já verificado por outro usuário (mesmo 400 genérico)
- [x] **T007** Política de menu (botão ≤3 com emoji, lista 4–10, paginação >10, teto de 20/24
      caracteres) e validação na publicação do grafo — `domain/whatsapp-menu.policy.ts` — contrato
- [x] **T005b** 🧠 Correções da revisão de segurança de 2026-09-11 (`evidence.md` § Revisão de
      segurança), **antes de qualquer FlowAction de negócio**: service account e contexto de canal
      recusados pela `MembershipAuthorizationPolicy` e pelo resolve do ator (A1); contrato que trava
      a política às rotas `/me/*` de uma allowlist por extenso (M2); vínculo vencido libera o número
      na mesma transação da verificação, com trilha (M1); desvinculação por suspensão com trilha
      (M3); unicidade e chave do limitador por `phone_key` sem o nono dígito (B3, M4); teto de 5
      pedidos por 10 min no POST de verificação (B4); resposta de sucesso nomeia a conta (B2);
      `docs/SECURITY.md` com os tetos por processo, o código na inbox e o usuário desativado no
      Keycloak (M4, B1, B6) — um contrato vermelho por achado
- [x] **T008** Grafo em código + comando de republicação versionada; o menu raiz é filtrado por
      permissão — `infrastructure/whatsapp-flow-graph.constant.ts`,
      `scripts/whatsapp-flow-publish.ts`, histórico append-only `whatsapp_flow_graph_versions`
      (`evidence.md` § T008) — contrato de republicação que sobe versão e não sobrescreve

## Fase 3 — Emissão por seleção (D3–D6)

> 🤖 Modelo: `opus` 🧠 — regra fiscal e efeito irreversível

Revisada pelo critic em 2026-09-11: T010 **aprovada com ajustes**, T013 **reprovada** e reescrita
abaixo (`evidence.md` § Fase 3). Decisão do usuário no mesmo dia: **o bot fatura só CT-e**.

- [x] **T009** 🧠 Migration em `cte_emission_profiles`: `output_document` (`cte`|`nfse`, padrão `cte`),
      `nfse_emission_profile_id` com FK composta `(company_id, nfse_emission_profile_id) →
nfse_emission_profiles(company_id, id)` **on delete restrict**, e três CHECKs —
      `..._output_document_check`, `..._nfse_profile_check` (`(output_document='nfse') =
(nfse_emission_profile_id is not null)`), `..._output_municipal_check` (`output_document='cte'
or municipal_service_policy='allow'`); `PUT` recusa apontar para perfil NFS-e não `active`.
      Formulário do perfil: os dois campos, e em `nfse` **esconde** taker, regra de frete, CFOP e
      ICMS (vale o perfil NFS-e) — `make migration-test`, contrato de schema
- [x] **T010** 🧠 `classifyDocumentOutput` em `cte-profiles/domain/document-output.policy.ts`,
      **derivada dos vereditos que a listagem já calcula** (`cteBlockReason` de `resolveDocumentBlock`,
      `nfseBlockReason` de `resolveNfseDocumentBlock`), nunca refazendo a elegibilidade: `cte` →
      `blocked(cteBlockReason)` ou `cte`; `nfse` → `blocked(nfseBlockReason)` ou `nfse`; sem perfil →
      `no_profile` com `noProfileReason` (`unmatched` · `ambiguous` · `not_cnpj`) por uma variante
      de `findEmissionProfile` que devolve o motivo (a atual segue igual). Perfil `manual` nunca
      classifica. Motivos novos: `CTE_BATCH_DOCUMENT_OUTPUT_NFSE` — **aplicado também na seleção do
      lote de CT-e e no `cteBlockReason` da listagem**, senão a tela emite CT-e da nota que o perfil
      manda para NFS-e — e `CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE` (status do perfil NFS-e no mesmo
      SELECT da página, sem N+1). `documentOutput` na listagem; o guard do frontend aceita a
      **ausência** do campo na primeira versão (API sobe primeiro) — contrato de classificação +
      paridade que roda os dois consumidores sobre as mesmas notas
- [ ] **T011** 🧠 `whatsapp_command_requests` (+ `due_date`, `period`, `grouping_mode`,
      `confirmed_at`, `settled_at`, `settlement_outcome`, `last_error_code`; status `previewed →
confirming → dispatched → settled | settled_partial`, mais `expired` e `superseded`) e
      `whatsapp_command_documents` como **diário de passos** (`group_key`, `idempotency_key`,
      `status` `pending|created|issued|failed`, `document_id` nulo até existir; unique
      `(request_id, document_kind, group_key)`), FK composta `(company_id, request_id)`, cópia no
      worker só das colunas lidas — contrato de tenant nas duas
- [ ] **T012** 🧠 Prévia: critérios da D4, volumetria, **vencimento da fatura** em lista (7/15/30
      dias) e `period` da NFS-e com "Pular", congelamento com `preview_sha256` sobre o JSON canônico
      de `[documentId, classificação, profileId, nfseProfileId?, takerTaxId, valor calculado]` +
      `period` + `dueDate` + versão de cada perfil usado; endereço do tomador e credencial da Nota RP
      ausentes são `blocked` **na prévia** — `application/preview-document-selection.use-case.ts` +
      FlowActions — integração do AC3
- [ ] **T013** 🧠 Confirmação **sem transação única** (cada use-case abre a sua): (1) confere
      `cte.manage`, `cte.submit`, `nfse.issue` pela membership; (2) recalcula o hash — divergiu →
      `superseded` e prévia nova; (3) transação curta `update … set status='confirming' where
status='previewed' and preview_sha256=$hash and expires_at>now() returning` + linhas `pending`
      do diário; (4) fora de transação, por grupo: CT-e = `cteBatches.create` (chave
      `whatsapp:${requestId}:cte:${profileId}`) → `cteIssuance.issue` (chave `…:cte-issue:…`);
      NFS-e = `nfseInvoices.create` por (perfil NFS-e, tomador) (chave
      `…:nfse:${nfseProfileId}:${takerTaxId}`); `name`/`period` saem **só** do pedido congelado
      (a digital de idempotência os inclui); erro de domínio marca o grupo `failed` e segue; (5)
      tudo final → `dispatched`. Pedido parado em `confirming` é retomado pelo mesmo use-case —
      `application/confirm-document-selection.use-case.ts` — integração dos AC4 e AC5 + retomada
- [ ] **T014** 🧠 Liquidação: policy pura de estado final (`whatsapp-command-settlement.policy.ts`:
      sucesso = `authorized`; falha = `rejected|failed|cancelled|discarded`; pendente = o resto,
      inclusive `reconciliation_required`), rotina `whatsapp.command.settle` no registro de
      `job-run.v1` do worker (a cada 5 min; retoma também os `confirming` parados). Todos finais ou 2h
      vencidas → worker chama `POST /whatsapp-command-requests/:id/settlement` (token de máquina,
      papel `automation`, permissão nova `whatsapp.settle`, molde de `mdfe-auto-issue`). A API
      **revalida** a membership de `actor_user_id` (ativa e com a permissão de faturar), fatura **só
      os CT-e `authorized`, um por tomador** (chave `whatsapp:${requestId}:billing:${takerTaxId}`,
      `dueDate` do pedido, `context.userId = actor_user_id`), grava no diário e marca
      `settled`/`settled_partial` com `where status='dispatched'`; resumo ao número de
      `user_whatsapp_phones`, com a NFS-e como "autorizada, sem fatura" —
      `apps/worker-transportada/src/whatsapp-command-settlement/` + rota na API — integração do AC6

## Fase 4 — Entrega e ocorrência (D7)

> 🤖 Modelo: `sonnet`

- [x] **T015** FlowActions do motorista: viagem atual → Entregar / Devolver (motivo em lista) /
      Ocorrência (catálogo `delivery`) pelos use-cases do PWA — `register-driver-flow-actions.ts` —
      E2E do AC7
- [x] **T016** FlowActions do operador: viagem em lista → ações que
      `checkTripAcceptsDocumentWork` aceita no estado → ocorrência `separation` —
      `register-operator-trip-flow-actions.ts` — contrato estado → ações oferecidas, espelhando
      `test/trip/state-gates.contract.ts`

## Fase 5 — Fechamento

> 🤖 Modelo: `sonnet`; revisão final `opus`

- [ ] **T017** Tela "WhatsApp" no perfil do usuário (verificar e desvincular o número) —
      `frontend-transportada/src/modules/identity/` — contratos de design system existentes verdes
- [ ] **T018** `docs/SECURITY.md` (teto por número, achado do rate limit redatado), CLAUDE.md (seção
      do módulo), ADR-0063 "O telefone vira credencial só verificado" e ADR-0064 "A fatura sai em nome de quem
      confirmou" (procuração do worker: token de máquina, `whatsapp.settle`, revalidação da
      membership — conceito novo no produto) — docs
- [ ] **T019** Prova de ponta em `evidence.md`: conversa real em staging com os 9 critérios de aceite,
      um por um

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos arquivos. Marque como
concluída apenas após registrar evidência.

## Ordem

```
T001 ─> T002 ─> T003 ─> T005 ─> T006 ─> T004 ─> T007 ─> T005b ─> T008 ─┬─> T009 ─> T010 ─> T011 ─> T012 ─> T013 ─> T014 ─┐
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
