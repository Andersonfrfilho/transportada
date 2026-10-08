# Tasks — 257

> 🤖 Modelo: Fase 1 `sonnet` (T1.1 é 🧠 → validar o desenho de D5/D10 com `opus`/`architect` antes) · Fase 2 `haiku`
> (T2.2 → `sonnet`: diálogo novo) · Fase 3 `haiku`.
> Cada task: teste de contrato/aceite **antes**, typecheck + testes, commit isolado, evidência em `evidence.md`.

## Fase 0 — Conferência (`haiku`)

- [ ] T0.1 `ls specs | grep -iE "vinc|link|cancel"`; reler 102, 249 e ADR-0043 §2 contra o código. Aceite: nota em `evidence.md`.

## Fase 1 — API (`sonnet`)

- [x] T1.1 🧠 Desacoplar `TRIP_STATUSES_BEFORE_DISPATCH` de `checkTripAcceptsLinkage` (D10) e provar com teste que o vínculo comum continua `409` na rua e a rota congelada não é limpa. Aceite: contrato verde.
- [x] T1.2 Migration + schema `trip_document_link_events` + rollback. Aceite: `make migration-test`.
- [x] T1.3 Persistência (D4–D7, D9): teste de integração — nota entra `loaded`; parada aberta reaproveitada, parada fechada gera nova; rota/snapshot intactos; já vinculada → `skipped`; janela perdida sob lock → 409. Aceite: `test:integration` (com `--env-file`).
- [x] T1.4 Use case + rota + schema + permissão + `allowed-actions` + auditoria. Aceite: contrato 201/400/403/404/409 + rota presente no OpenAPI.
- [x] T1.5 Timeline `documents_added`. Aceite: contrato de paridade da timeline.
- [ ] T1.6 D8: integração — viagem cancelada a partir de qualquer status e com motivos distintos libera as notas e elas entram na viagem socorrista. Aceite: `test:integration`.

## Fase 2 — Painel (`haiku`; publicar **antes** da API)

- [ ] T2.1 Kind `documents_added` em `tripTimelineMap`/validação, tolerante a kind desconhecido.
- [ ] T2.2 (`sonnet`) `TripLinkDocumentsAfterDispatchDialog` + ação em `tripAllowedActions` + cliente + aviso fiscal. Aceite: contrato + smoke.

## Fase 3 — Documentação e fechamento (`haiku`)

- [ ] T3.1 ADR-0043 §2, `docs/ai-context/api-transportada.md`, `apps/api-transportada/CLAUDE.md`.
- [ ] T3.2 `make check` + `make migration-test`; `evidence.md`. **Deploy: aprovação humana.**

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/257-a-viagem-na-rua-recebe-notas/ (leia spec.md, plan.md e tasks.md
antes de começar; molde: spec 249). Uma task por vez, na ordem do tasks.md, no worktree
../transportada-wt/spec-257 (branch work/spec-257).
MODELO: use SÓ o modelo da sessão atual. NÃO troque de modelo, NÃO use subagente com model= diferente,
NÃO peça /model. Ignore a tabela de modelos por fase do tasks.md.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
