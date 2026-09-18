# Spec 158 — Tarefas

| fase | tasks  | modelo recomendado               | fallback se der 429 |
| ---- | ------ | -------------------------------- | ------------------- |
| 0    | T1 🧠  | `opus` (validar com `architect`) | `fable`             |
| 1    | T2     | `sonnet`                         | `opus`              |
| 2    | T3, T4 | `sonnet`                         | `opus`              |
| 3    | T5, T6 | `sonnet`                         | `opus`              |
| 4    | T7, T8 | `sonnet`                         | `opus`              |
| 5    | T9     | `opus`                           | `fable`             |
| 6    | T10    | `opus` (`designer`)              | `fable`             |
| 7    | T11    | `haiku`                          | `sonnet`            |

Cada task fecha com typecheck (`bun run typecheck`), lint (`bun run lint`), os testes da app
alterada, o arquivo de teste novo listado no `package.json` da app, a evidência em `evidence.md` e um
commit isolado. A integração da API roda com `bun --env-file=../../.env.test test --timeout 120000`,
de dentro de `apps/api-transportada`: sem o `.env.test` ela pula, e pular não é passar. O
contrato/aceite vem **antes** da implementação em toda task de código.

## Fase 0 — Decisão de dados

> 🤖 Modelo: `opus` (validar com `architect`)

- [ ] **T1 🧠 — ADR-0068 e inventário.** (1) Listar os 14 `update(trips)` de
      `src/trips/infrastructure/` e marcar quais mudam `status`, com o canal/ator que cada um tem à
      mão. (2) Medir em produção (só leitura, com aprovação) quantas linhas de `trip_document_events`
      vieram do WhatsApp do operador — se não der para distinguir, registrar isso. (3) ADR-0068:
      `trip_status_events` (D1), canal `backoffice` (D2) e a escolha (a) ou (b) do D3 com o número
      medido. Atualizar `specs/156-.../evidence.md` apontando o aceite 2 para esta spec.

## Fase 1 — Migration

> 🤖 Modelo: `sonnet`

- [ ] **T2 — `trip_status_events` e `backoffice`** (RF1, aceite 10). Schema Drizzle, migration SQL
      aditiva com down que falha alto se houver `backoffice` gravado, `make migration-test`. Contrato
      de schema (FKs compostas, check `office ⇒ on_behalf`, índice). Backfill do D3 só se a ADR
      escolheu (a).

## Fase 2 — Gravação

> 🤖 Modelo: `sonnet`

- [ ] **T3 — Toda troca de `trips.status` grava o evento** (RF2, RF3, aceites 1, 2, 9).
      `trip-status-event.persistence.ts`; start-route do motorista e do escritório, chegada, e os
      demais escritores da lista da T1, na mesma transação e só com `changed=true`. Contrato
      estático do aceite 9 **antes**.
- [ ] **T4 — Fluxo manual com canal** (RF4, aceite 4). `backoffice` pela web, `whatsapp` pelo
      operador, em `trip_document_events` e `trip_status_events`. Integração conferindo o canal.

## Fase 3 — Leitura

> 🤖 Modelo: `sonnet`

- [ ] **T5 — `trip-timeline.query.ts`** (D5, D6, aceites 3, 5, 7, 8). Uma função por fonte, junções
      de ator/motorista no molde do feed, `mergeTripTimeline` com cursor. Contrato estático de tenant
      estendido a este arquivo; unitário do merge (empate e cursor); integração com 250 eventos e
      medição de p95.
- [ ] **T6 — Caso de uso e rota `GET /trips/:id/timeline`** (D4, aceites 5, 6). Zod de `cursor`/
      `limit`, 404 para outra empresa, `TRIP_FIELD_READ_POLICY`, ligação em `main.ts`. Atualizar
      `finance-read.contract.ts` e `separator-role.contract.test.ts`. Documentação da rota
      (OpenAPI/Scalar, se a app já gera).

## Fase 4 — Tela

> 🤖 Modelo: `sonnet`

- [ ] **T7 — Tipos, validador, cliente e frase de autoria** (D7, aceite 8). `tripTimelineFromApi`,
      `readTripTimeline`, `useTripTimeline` (cursor), `fieldAuthorship.service.ts` com `backoffice`,
      "canal não registrado", "pelo sistema" e "usuário removido"; `TripOccurrences` migrado para a
      função única.
- [ ] **T8 — `TripTimeline` no detalhe da viagem** (RF6). Carregando, vazio, erro, "carregar mais",
      filtro pela nota aberta; `occurredAt` e "registrado em" quando houver `recordedAt`. Decidir
      entre as classes órfãs `.timeline*` de `trip.module.css` e um módulo próprio — a outra saída é
      apagada. Smoke Playwright. Print desktop e celular.

## Fase 5 — Revisão

> 🤖 Modelo: `opus`

- [ ] **T9 — Revisão final**: `code-reviewer` + `security-reviewer` (BOLA em `/trips/:id/timeline`,
      campos proibidos, PII em log) e auditoria do code-standart §15 (N+1, índices). Atualizar
      `apps/api-transportada/CLAUDE.md`, `apps/frontend-transportada/CLAUDE.md` e
      `docs/spec/domain-model.md` (`trip_status_events`, `backoffice`).

## Fase 6 — Design e usabilidade

> 🤖 Modelo: `opus` (agente `designer`)

- [ ] **T10 — Revisão de design e usabilidade** (web.md §15): a seção comparada com os vizinhos da
      tela da viagem (primitivo `shadcn/ui`, contraste do texto de autoria — achado da T9 da spec 156
      —, claro/escuro); leitura de uma viagem de 50 notas no celular (375 px); rótulos no vocabulário
      do escritório. Prints ao usuário.

## Fase 7 — Registro

> 🤖 Modelo: `haiku`

- [ ] **T11 — Registrar o defeito fora do escopo**: entrega repetida do motorista sobre nota já
      baixada grava evento novo (`report-document-delivery.use-case.ts:313-318`) — item em
      `specs/PERGUNTAS-ABERTAS.md` ou `docs/SECURITY.md`/backlog equivalente, com data.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/158-linha-do-tempo-da-viagem/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: T1 🧠 → opus, validado por architect antes de seguir · Fases 1–4 (T2–T8) → executor
model=sonnet · T9 revisão final → code-reviewer + security-reviewer model=opus ·
T10 → designer model=opus, com prints ao usuário · T11 → executor model=haiku.
Cada task fecha com typecheck + lint + testes da app (integração da API com
--env-file=../../.env.test) + teste novo listado no package.json + commit isolado, evidência em
evidence.md.
Pare e pergunte antes de: consulta a produção (T1), deploy em produção, migration destrutiva,
qualquer [NEEDS CLARIFICATION].
```
