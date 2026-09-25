# Evidence — Feature 182

## Fase 1 — A máquina libera a baixa antes do despacho (RF3)

- `test/trip-domain/trip-state.contract.ts` atualizado (TDD): rodado antes da mudança de produção,
  1 falha (`delivers from loaded in any non-terminal state...`, `TRIP_NOT_DISPATCHED` recebido em
  vez de `applied`). Depois de `trip-state.policy.ts` (`checkTripAcceptsDocumentWork`):

  ```
  bun test ./test/trip-domain.contract.test.ts
  253 pass / 0 fail / 1160 expect() calls
  ```

- Commit `e1bbcbcb0` — `feat(trip): a baixa de entrega não espera o despacho (spec 182 RF3)`.

## Fase 2 — A lista de ações acompanha a máquina (RF1, RF2)

- `test/trip-allowed-actions/policy.contract.ts` atualizado (TDD): 2 falhas antes da mudança de
  produção (ocorrência de parada em `route_planned`/`separating`/`loading` vazia; `fieldOccurrence`
  ausente nesses mesmos estados). Depois de `trip-allowed-actions.policy.ts`
  (`resolveStopActions`/`resolveFieldDocumentActions`):

  ```
  bun test ./test/trip-allowed-actions.contract.test.ts
  22 pass / 0 fail / 39 expect() calls
  ```

- Suíte de contrato inteira da API, para confirmar ausência de regressão (achou 1 teste
  pré-existente que precisou de atualização — `A1: o finance não recebe ação do barracão`, corrigido
  na mesma fase):

  ```
  bun --env-file=../../.env.test test --timeout 120000
  7286 pass / 23 skip / 0 fail / 24453 expect() calls / 183 files
  ```

- Commit `1e8bdfbc6` — `feat(trip): a ocorrência de parada e da nota não esperam a viagem sair (spec 182 RF1/RF2)`.

## Fase 3 — Prova contra Postgres (CA03, CA05)

- Novo teste em `test/integration/trip-field-office.integration.ts`: `field-delivery` com a viagem
  seedada em `loading` (sem `seedDispatchSnapshot`), `POST .../field-delivery` responde 201, grava
  `separationStatus = 'delivered'` e `delivered_at` com o valor informado. Achado durante a task:
  `trips.status` **permanece `loading`** depois da baixa antecipada — `deriveTripStatus`/
  `advanceTripFromSettledDocuments` só promovem a viagem a `on_delivery_route`/`completed` a partir
  de `isTripDispatched`; o teste assertivamente cobre isso (não é regressão, é o comportamento real
  do sistema com a mudança de RF3 — documentado em `apps/api-transportada/CLAUDE.md`).
  `test/fixtures/trip-field-office-database.fixture.ts::seedTrip` teve o parâmetro `status` ampliado
  de `'in_transit'` literal para `TripStatus` (era usado só com `'in_transit'` em todo o repo).

  ```
  bun --env-file=../../.env.test run test:integration -- -t "spec 182 RF3"
  1 pass / 615 filtered out / 0 fail / 5 expect() calls
  ```

- Suíte de integração completa (contra o Postgres do `.env.test`, que respondeu sem precisar de
  Postgres nativo à parte — nenhum I/O error observado): pedida em primeiro plano; o comando passou
  do teto de 600s da ferramenta de shell e foi movido para background pelo próprio harness (não por
  escolha desta execução) — acompanhado até o fim, sem prosseguir para o commit da Fase 3 antes do
  resultado:

  ```
  bun --env-file=../../.env.test run test:integration
  609 pass / 7 skip / 0 fail / 3573 expect() calls / 616 tests / 111 files [872.53s]
  ```

  Inclui a prova de RF3 acima. Nenhuma falha, nenhuma regressão.

- Commit `e1153ad66` — `test(trip): prova contra Postgres que a baixa antes do despacho grava (spec 182)`.

## Fase 4 — Revisão

- Nenhum arquivo de frontend foi tocado (`apps/frontend-transportada/**` sem diff) — `TripStopList`,
  `TripHeaderActions`, `TripDetail` e `tripFieldActions.service.ts` já são 100% server-driven:
  `resolveFieldActionCapabilities`/`canOfferStopFieldAction`/`selectFieldActionableDocumentIds` só
  leem `allowedActions.documents`/`.stops` (`GET /trips/:id/allowed-actions`), sem duplicar regra de
  estado no cliente. Confirmado por leitura de
  `apps/frontend-transportada/src/modules/trip/shared/tripFieldActions.service.ts`,
  `.../shared/tripAllowedActions.validation.ts`, `.../components/TripStopList.component.tsx` e
  `.../components/TripDetail.component.tsx`. Consequência: **não há print de revisão de design
  (web.md §15) a produzir** — a tarefa não tocou interface, e não há stack local (Docker/Keycloak)
  logada nesta sessão para abrir a tela e provar visualmente. Pendência explícita: se o usuário
  quiser a confirmação visual, é preciso subir `make dev` com dados de viagem em `loading` e
  autenticação — fora do escopo executado aqui.
- `apps/api-transportada/CLAUDE.md` atualizado (bloco "O escritório dá baixa em nome do motorista")
  com o novo comportamento de RF1/RF2/RF3.

## Gates finais (raiz)

```
bun run typecheck   → limpo (0 erros, 6 apps)
bun run lint        → limpo (0 erros/warnings, 6 apps, --max-warnings=0)
```

```
bunx prettier --write specs/182-a-ocorrencia-nao-espera-a-viagem-sair/*.md
→ evidence.md e spec.md e tasks.md sem alteração (já formatados); plan.md reformatado (8ms)
```

## Pendências abertas

- Print de revisão de design (CA07, web.md §15): não produzido — sem alteração de frontend e sem
  stack local logada nesta sessão. Ver nota da Fase 4.
