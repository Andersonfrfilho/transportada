# Spec 157 — Tarefas

| fase | tasks                                                                | modelo recomendado       | fallback se der 429 |
| ---- | -------------------------------------------------------------------- | ------------------------ | ------------------- |
| 0    | T1 🧠 (ADR)                                                          | `opus`                   | `fable`             |
| 1    | T2, T3 (domínio puro)                                                | `sonnet`                 | `opus`              |
| 2    | T4 (migration + settings), T5 (`/proof`), T6 (`/deliver` + snapshot) | `sonnet`                 | `opus`              |
| 2    | T7 🧠 (consulta da nota)                                             | `opus`                   | `fable`             |
| 3    | T8 (rotas da frota)                                                  | `sonnet`                 | `opus`              |
| 4    | T9 (PWA), T10 (escritório)                                           | `sonnet`                 | `opus`              |
| 5    | T11 (revisão)                                                        | `opus` (`code-reviewer`) | `fable`             |
| 6    | T12 (design e usabilidade)                                           | `opus` (`designer`)      | `fable`             |

Cada task fecha com `bun run typecheck`, `bun run lint`, os testes da app alterada (arquivo novo listado
no `package.json`), evidência em `evidence.md` e commit isolado. Integração da API:
`bun --env-file=../../.env.test test --timeout 120000` de dentro de `apps/api-transportada` — sem o
`.env.test` ela pula, e pular não é passar. Contrato antes da implementação.

## Fase 0

- [x] **T1 🧠 ADR-0068** — "A foto obrigatória do motorista não recusa a entrega, pesa na nota".
      Registra a decisão do usuário, a exceção ao 422 da ADR-0067 para o canal do motorista, RF5/RF6/RF8,
      e que foto sem posição conta como longe. Aceite: arquivo em `docs/adr/`, ADR-0057 e ADR-0067 citadas.

## Fase 1 — domínio

- [x] **T2** `classifyProofPunctuality` em `trips/domain/delivery-proof-punctuality.policy.ts` +
      `test/trip-delivery-proof/punctuality.contract.ts`. Aceite: casos 3 e 4 da spec, limite do
      `capturedAt` (futuro e antes da entrega), parada sem coordenada, sem referência nenhuma,
      `not_required`.
- [x] **T3** `computeDriverScore` em `fleet/domain/driver-score.policy.ts` + contrato. Aceite: caso 5 da
      spec, mínimo 0, `null` sem histórico, penalidade única por entrega, configuração atual para ausência.

## Fase 2 — persistência e portas do motorista

- [x] **T4** Migration aditiva (`bun run db:generate`, `rollback.sql` escrito), schemas Drizzle, settings
      com cinco campos (schema Zod, repositório, rota). Aceite: `make migration-test`; contrato de settings
      com defaults e faixas.
- [x] **T5** `/proof` aceita posição, classifica, grava, responde `punctuality`. Aceite: contratos em
      `test/driver-trip/delivery-proof.contract.ts` (casos 3/4, 400 de par incompleto, `attachmentKey`
      repetida não reclassifica, foto substituída leva a nova pontualidade) + integração em
      `me-trip.integration.ts`.
- [x] **T6** `/deliver` devolve `proofPending`; snapshot com `proofPending` por documento (`score` fica
      para a T7 — porta definida, sem implementação falsa). Aceite: casos 1/2; teste `:310` da
      `office-field-delivery` ampliado.
- [x] **T7 🧠** `DrizzleDriverScoreRepository` (uma consulta, sem N+1) + integração com o caso 5 contra
      Postgres real, contrato negativo de tenant e `EXPLAIN`.

## Fase 3 — frota

- [x] **T8** `score` em `GET /fleet/drivers`; `GET /fleet/drivers/:id/score`. Aceite: caso 6, rota no
      OpenAPI.

## Fase 4 — telas

- [x] **T9** PWA: tipos/validação, aviso no card, página de pendentes, posição + `capturedAt` no anexo,
      anexo na fila sem `deliver` pendente, nota do motorista. Aceite: caso 8 em
      `test/driver-trip/offline-attachments.contract.ts`, contratos de view.
- [x] **T10** Escritório: `DriverScoreBadge`, ordenação no seletor, penalidades na ficha, campos no
      painel de configuração. Aceite: caso 7 em contratos de serviço puro.

## Fase 5–6

- [x] **T11** Revisão (`code-reviewer`, `security-reviewer` para posição/tenant) + auditoria §15.
- [x] **T12** Revisão de design e usabilidade com print das telas (seletor, ficha, card, pendentes).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/157-a-foto-obrigatoria-pesa-na-nota-do-motorista/
(leia spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: T1 🧠 → opus · Fase 1–2 → executor model=sonnet · T7 🧠 → opus (validar com architect) ·
Fase 3–4 → executor model=sonnet · T11 → code-reviewer model=opus · T12 → designer model=opus.
Cada task fecha com typecheck + lint + testes (integração com .env.test) + commit isolado, evidência em
evidence.md. Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
