# Tasks

> 🤖 Modelo: `sonnet` (T201 é 🧠 — a migration e os CHECKs valem revisão com `opus` antes)

## Fase 1 — Frontend tolerante (publica sozinha, antes da API)

> 🤖 Modelo: `sonnet`

- [ ] T101 Contrato: validador aceita resposta **com** e **sem** `products` — `test/trip/occurrence-products-tolerance.contract.ts` (CA07)
- [ ] T102 `products` em `TRIP_OCCURRENCE_OPTIONAL_KEYS` + guard tolerante — `trip.constant.ts`, `tripResponse.validation.ts` (RF6)
- [ ] T103 Publicar a Fase 1 em staging e confirmar o bundle servido antes de abrir a Fase 2

## Fase 2 — Banco e API

> 🤖 Modelo: `sonnet` — T201 é 🧠

- [ ] T201 🧠 Migration aditiva: `quantity`, `quantity_unit` e os CHECKs; `allows_multiple_items` — `trip.schema.ts` (RF1, RF2, RF3, CA01, CA03)
- [ ] T202 Contrato + `occurrence-item-quantity.policy.ts` — par casado, zero/negativo, unidade desconhecida, listas desalinhadas (RF4, CA04, CA05)
- [ ] T203 Parse do multipart com as quantidades alinhadas — `occurrence.schema.ts` (RF4, CA05)
- [ ] T204 Persistência das duas colunas — `drizzle-occurrence-product.repository.ts` (CA02)
- [ ] T205 `422` quando o tipo não aceita vários itens — `register-trip-occurrence.use-case.ts` (RF8, CA08)
- [ ] T206 `products` na resposta de registro e na leitura — rotas e queries de ocorrência (RF5, CA06)
- [ ] T207 Interruptor no cadastro de tipos — `save-occurrence-type.use-case.ts` e schema (RF9, CA10)
- [ ] T208 Integração exercitando o banco (duas colunas preenchidas e as duas nulas) — `test/integration/*.integration.ts` (CA02)

## Fase 3 — Telas

> 🤖 Modelo: `sonnet`

- [ ] T301 Campo de quantidade por item marcado + seletor de unidade — `TripOccurrences.component.tsx`, locales (RF7, RF10, CA09)
- [ ] T302 Envio das quantidades — `tripClient.service.ts` (RF7)
- [ ] T303 Seleção única quando o tipo não aceita vários — `TripOccurrences.component.tsx` (RF8)
- [ ] T304 Interruptor no cadastro de tipos — `TripOccurrenceNotifications.component.tsx`, locales (RF9)
- [ ] T305 Quantidade na leitura da ocorrência; item sem contagem sem número (P3)

## Fase 4 — Fechamento

- [ ] T401 Gates: `bun run lint`, `bun run typecheck`, contratos da API, integração, testes do frontend, `make migration-test`
- [ ] T402 Revisão de design e usabilidade do campo de quantidade, com print (web.md §15)
- [ ] T403 Evidência consolidada em `evidence.md` e publicação da Fase 2/3

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos
arquivos. Marque como concluída apenas após registrar evidência.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/166-quantidade-do-item-na-ocorrencia/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md — a Fase 1 publica
sozinha antes da Fase 2, porque API à frente do bundle quebra a tela.
Modelos: Fases 1 a 3 → executor model=sonnet · T201 🧠 → opus (validar a migration com architect
antes) · revisão final → code-reviewer model=opus.
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy em produção, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
