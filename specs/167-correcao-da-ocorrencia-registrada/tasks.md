# Tasks

> 🤖 Modelo: `sonnet` (T201 é 🧠 — a migration e o CHECK do cancelamento valem revisão com `opus`)

## Fase 1 — Frontend tolerante (publica sozinha, antes da API)

- [x] T101 Contrato: o guard aceita a ocorrência **com** e **sem** `corrections`/`cancellation` — `test/trip/occurrence-history-tolerance.contract.ts` (CA10)
- [x] T102 As duas chaves em `TRIP_OCCURRENCE_OPTIONAL_KEYS` + guards — `trip.constant.ts`, `trip.types.ts`, `tripResponse.validation.ts` (RF9)
- [ ] T103 Publicar a Fase 1 e confirmar o bundle servido antes de abrir a Fase 2

## Fase 2 — Banco e domínio

- [x] T201 🧠 Migration: `trip_document_occurrence_corrections` + as três colunas de cancelamento com CHECK casado (RF1, CA01)
- [x] T202 Contrato + `occurrence-correction.policy.ts` — o que conta como mudança, normalização de ordem e de decimal (RF5, CA03)
- [x] T203 Contrato + `occurrence-cancellation.policy.ts` — motivo vazio, teto de 500, estados que recusam (RF6, CA07)

## Fase 3 — Aplicação e rotas

- [x] T301 `correct-occurrence-items.use-case.ts`, reusando a política de itens da 166 — nunca reescrevendo (RF2, RF3, CA02, CA04, CA05)
- [x] T302 Leitura da tratativa **dentro** da transação da escrita, e o `409` (RF4, RF8, CA06)
- [x] T303 `cancel-occurrence.use-case.ts` + o `409` de já cancelada (RF6, CA07)
- [ ] T304 Ocorrência cancelada fora de contagem, listagem de ativas, e-mail e tratativa (RF7, CA08)
- [x] T305 As duas rotas com `trip.manage` e `Idempotency-Key` (RF10)
- [x] T306 `corrections[]` e `cancellation` na leitura (RF9, CA09)
- [ ] T307 Os dois eventos na linha do tempo (RF11, CA11)
- [ ] T308 Aviso de correção pela porta de hoje, sem derrubar a escrita (RF14, CA13, CA14)
- [x] T309 Integração contra Postgres: linha da correção, cancelamento, ocorrência cancelada fora da contagem (CA02, CA08)

## Fase 4 — Telas

- [x] T401 Botão "Corrigir" reabrindo o formulário com o conjunto atual (RF12, CA12)
- [x] T402 Diálogo de cancelamento com motivo obrigatório (RF12, RF13)
- [ ] T403 Histórico na leitura: o que era e o que passou a ser, com autor e hora (P2)
- [x] T404 Ocorrência cancelada marcada na lista, com motivo (RF7)

## Fase 5 — Fechamento

- [ ] T501 Gates: lint, typecheck, contratos, integração, `make migration-test`, testes do frontend
- [x] T502 Revisão de design e usabilidade dos botões e do diálogo, com print (web.md §15)
- [ ] T503 Gerar a migration **por último**, rebase em `origin/staging`, `db:generate` até `no_changes`, evidência e publicação

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos
arquivos. Marque como concluída apenas após registrar evidência.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/167-correcao-da-ocorrencia-registrada/ (leia
spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md — a Fase 1
publica sozinha antes da Fase 2, porque API à frente do bundle quebra a tela.
Modelos: Fases 1 a 4 → executor model=sonnet · T201 🧠 → opus (validar a migration com architect
antes) · revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy em produção, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
