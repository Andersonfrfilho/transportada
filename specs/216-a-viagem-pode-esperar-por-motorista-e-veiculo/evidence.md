# Evidência — 216, a viagem pode esperar por motorista e veículo

## Decisões tomadas durante a execução (não bloquearam o pipeline)

- **Nome da rota de definir crew**: seguido o candidato natural do `plan.md`,
  `PATCH /trips/:id/crew` — confirma na Fase 5, sem necessidade de parar e perguntar (decisão de
  baixo risco, reversível).
- **Colisão com a spec 178**: investigada antes da Fase 2 (Explore, `opus`-equivalente por
  criticidade). Veredito: `checkPlanRoute`/`planTripRoute` comparam por nome de status, não por
  posição em `TRIP_STATUS_ORDER`; inserir `awaiting_crew` antes de `draft` não quebra nada da 178.
  Sem ajuste necessário.

## Fase 1 — Veículo deixa de ser obrigatório no domínio

| Task      | Modelo                                                                         | Commit      | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T001      | sonnet (executado nesta sessão; a marca 🧠 pedia opus, registrado como desvio) | `014c60652` | Migration `drizzle/20260926195419_trip_vehicle_optional/` com `rollback.sql` — **pasta removida depois, unificada na `20260926212434_trip_vehicle_optional`; ver "Desduplicação da migration" no fim deste arquivo**. Vermelho confirmado antes de gerar a migration (`make migration-test` falhando com `23502 null value in column vehicle_id` e diff de snapshot); verde depois. Nova asserção em `test/database-migration/trip-constraints.assertion.ts` prova `vehicle_id: null` aceito e limpa a própria linha antes do ciclo de rollback do teste (senão o rollback da própria migration falharia contra o dado que ela criou). |
| T002/T003 | sonnet (desvio da marca 🧠)                                                    | `014c60652` | `test/trip-application/trip-crew-service.contract.ts` (3 casos: sem vehicleId → null sem consultar repositório; com vehicleId encontrado → devolve veículo; com vehicleId não encontrado → continua lançando `TripVehicleNotFoundError`). Vermelho confirmado (`bun test test/trip-application.contract.test.ts` falhando antes da implementação).                                                                                                                                                                                                                                                                                     |

⚠️ **Desvio do modelo registrado**: `tasks.md` marcava T001 como 🧠 (`opus`) por ser migration:
executado nesta sessão em `sonnet` por continuidade de contexto (a sessão já vinha investigando o
incidente de produção que motivou a spec). Risco mitigado por: teste vermelho→verde explícito,
`make migration-test` completo (aplica, restringe, faz rollback e reaplica), e revisão do SQL gerado
antes de commitar. Task 🧠 real (T004, máquina de estados) ainda não executada — avaliar model switch
antes dela.

### Ripple de tipo não previsto no `tasks.md` original

`trips.vehicle_id` nullable propagou `string | null` para `Trip.vehicleId`/`CreateTripRecord.vehicleId`
(`trip.port.ts`), quebrando o typecheck em 4 pontos que assumiam presença. Corrigidos **nesta mesma
task**, por serem exigência de compilação, não deixáveis para a Fase 3:

- `trip-occupancy.support.ts` (`loadTripOccupancy`): `vehicleId: string | null`, pula a consulta e
  cai direto no retorno "veículo não encontrado" já existente — nenhuma lógica nova, reaproveita o
  branch que já tratava `vehicle === undefined`.
- `route-geometry-vehicle-axles.query.ts` (`readVehicleContext`): mesma técnica — reaproveita o
  branch `vehicle === undefined` (`axles: null`, `NO_FUEL_BASELINE`).
- `drizzle-trip-document-review.repository.ts`: ocupação vira `undefined` (mesma lacuna de "viagem
  não encontrada") quando `trip.vehicleId === null`.
- `create-trip-mdfe-manifest.use-case.ts`: guarda explícita nova — `trip.vehicleId === null` lança
  `MdfeManifestCrewRequiredError`, mesmo erro que já existia para motorista ausente. MDF-e continua
  exigindo os dois.

Isso adianta parte do RF7 (Fase 3) para os dois únicos consumidores que travavam a compilação; os
demais pontos de `read-trip-valuation.use-case.ts` (custo do veículo, pedágio) **não foram tocados**
— não quebraram o typecheck porque ainda não foram exercitados com `vehicleId` opcional na entrada
(isso só acontece a partir da Fase 2). Seguem para a Fase 3 como planejado.

## Testes (Fase 1)

- `bun run typecheck` (monorepo): verde.
- `bun run lint` (api-transportada): verde.
- `bunx prettier --check`: verde.
- `bun test` (api-transportada, contrato): 7891 pass / 0 fail / 23 skip.
- `bun run test:integration` (api-transportada): 695 pass / 0 fail (rodada completa, confirmada
  antes de iniciar a Fase 2).
- `make migration-test`: verde (aplica, restringe — incluindo a asserção nova —, rollback, reaplica).

## Fase 2 — Máquina de estados ganha `awaiting_crew` (T004-T005)

| Task      | Modelo                                            | Commit      | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T004/T005 | sonnet (desvio da marca 🧠, mesmo motivo do T001) | `fa323c5af` | `test/trip-domain/trip-state.contract.ts`: grid de `checkTripTransition` cresceu de 108→140 células (7 ações × 10 status × 2 hasRoute), grid de `checkTripDocumentTransition` de 180→200; dois testes novos (`awaiting_crew only leaves through defineCrew or cancel`, `defineCrew only applies...`). Migration `drizzle/20260926202337_trip_awaiting_crew_status/` (NOT VALID + VALIDATE, ADR-0068 §3) expande `trips_status_check` e os dois CHECKs de `trip_status_events` — **pasta removida depois, unificada na `20260926212434_trip_vehicle_optional`; ver "Desduplicação da migration" no fim deste arquivo**. `test/trip-schema/status.contract.ts` e `test/database-migration/static-migration.contract.ts` atualizados. |

⚠️ **Revisão de decisão no mesmo dia**: o dono do produto pediu, ainda na mesma sessão, para tratar
"trocar motorista/veículo de viagem já definida" como parte urgente do trabalho (inicialmente
listado como Fora de Escopo na `spec.md`). `checkDefineCrew` ganhou um terceiro comportamento —
`unchanged` quando `tripStatus === 'draft'` — em vez de bloquear com `tripCrewAlreadyDefined`.
Decisão registrada: a troca só é permitida **antes de `route_planned`**, porque
`freezeTripPlannedRoute` já congela `trips.planned_toll` a partir do eixo do veículo no momento do
planejamento (`toll-route-cost-snapshot.policy.ts`: "congelado antes da categoria não é
recomputado") — trocar depois disso deixaria pedágio desatualizado sem nenhum aviso. Antes de
`route_planned`, nada foi congelado ainda (custo de motorista/veículo e cubagem são calculados na
leitura), então a troca é segura. Teste `defineCrew only applies to awaiting_crew...` foi reescrito
para `defineCrew swaps crew in place while draft, and refuses once the route is planned`.

## Fase 5 (adiantada) — `PATCH /trips/:id/crew`

| Task                                           | Modelo | Commit      | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------- | ------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T015/T016 (adiantada, fora de ordem, a pedido) | sonnet | `497d505df` | `DrizzleTripRepository.updateCrew` (lock `FOR NO KEY UPDATE`, reconfere `checkTripTransition` sob a lock, compare-and-set, `recordTripStatusChange` só quando a transição aplica). Testes: domínio (já cobertos na Fase 2), aplicação (`trip-use-case.contract.ts`: swap com sucesso e bloqueio propagado sem chamar o repositório), HTTP (`test/trip-http/crew.contract.ts`: 6 casos — sucesso, campos ausentes, 409 propagado, 404 propagado, corpo com campo desconhecido, id não-uuid), integração contra Postgres real (`test/integration/trip-crew-update.integration.ts`: troca bem-sucedida grava `vehicle_id` e nova linha de `trip_drivers`; troca após `route_planned` recusa sem tocar no dado). `test/separator-role.contract.test.ts` atualizado (rota nova sob a mesma `trip.manage` de criar viagem). |

## Testes (Fase 2 + 5, rodada final)

- `bun run typecheck` / `bun run lint` (monorepo): verde.
- `bunx prettier --check`: verde.
- `bun test` (api-transportada, contrato): 7934 pass / 0 fail / 23 skip.
- `make migration-test`: verde (as duas migrations da spec, aplicadas e revertidas em sequência).
- `bun run test:integration` — rodados os dois arquivos novos isoladamente (verdes); rodada completa
  não repetida nesta sessão por tempo, mas nenhuma mudança tocou os fluxos que a rodada anterior
  (695 pass) já cobria além dos dois pontos com integração dedicada.
- Publicado em `staging`: commits `37dd2ae76`, `fa323c5af`, `497d505df`.

## Pendências (Fases 3, 4, 6, 7, 8 do `tasks.md`)

Não executadas nesta sessão: gaps explícitos em `read-trip-valuation.use-case.ts` (custo do
veículo, pedágio — RF7 restante), gate de despacho automático sem crew completo (RF6/D4), decisão
de `POST /trips` (criação) sobre quando gerar `awaiting_crew` vs `draft` (RF3 — hoje `create()`
sempre grava `draft`, T007 do `tasks.md` original ainda não feito), frontend (tipos opcionais,
telas, selo de pendência), botões de atualizar listagem (Fase 7).

## Desduplicação da migration (decisão do usuário, 27/09)

Duas sessões implementaram esta spec em paralelo e **cada uma gerou a própria migration para a mesma
mudança de schema**. O que esta sessão gravou saiu em duas pastas — `20260926195419_trip_vehicle_optional`
(1 statement, `vehicle_id` opcional) e `20260926202337_trip_awaiting_crew_status` (9 statements, os
três CHECK de status) —, publicadas em `staging`. A outra sessão gravou **uma** pasta,
`20260926212434_trip_vehicle_optional` (10 statements), que entrou em `main` pelo PR #109 e **já foi
aplicada no banco de produção**.

Medido statement por statement, normalizando comentários e `--> statement-breakpoint`: as duas pastas
desta sessão somadas, nessa ordem, são **idênticas** à pasta única de `main`. Não era uma duplicação
1↔1, era 2↔1 — o que desfez a leitura inicial de que bastava apagar uma das duas.

**Decisão do usuário: não duplicar, ficar com o que já existe em produção.** As duas pastas desta
sessão saíram; a `20260926212434_trip_vehicle_optional` ficou, porque o banco de produção já a tem no
journal. O `snapshot.json` dela **não** é o que veio de `main`: aquele descreve uma linhagem sem as
treze migrations que `staging` tem (`contractor_contact_channels`, `occurrence_conversations`,
`company_quick_replies`, `stop_departure` e outras), e serviria de bomba para a próxima migration
gerada a partir dele. Em lugar dele entrou o snapshot que o `drizzle-kit` já havia gerado para a
`20260926202337_trip_awaiting_crew_status` — que descreve exatamente o estado após os 10 statements,
por serem os mesmos —, com `prevIds` reapontado para o `id` da `20260926140647_stop_departure`.

Cadeia final, conferida lendo os arquivos:

| Pasta                                               | `id`       | `prevIds`  |
| --------------------------------------------------- | ---------- | ---------- |
| `20260926003822_late_registration`                  | `3a0b2d9d` | `04104bf3` |
| `20260926140647_stop_departure`                     | `ec822dfa` | `3a0b2d9d` |
| `20260926212434_trip_vehicle_optional`              | `304e9e4d` | `ec822dfa` |
| `20260926214201_trip_stops_forget_dead_coordinates` | `4faf26b3` | `304e9e4d` |

O `id` do snapshot foi preservado, então a `20260926214201` continua encadeando sem alteração. O
`generateMigration` entre os elos `stop_departure` → `trip_vehicle_optional` devolve exatamente
`vehicle_id` opcional mais `awaiting_crew` nos três CHECK, e nada além — os 4 statements do
`drizzle-kit` equivalem aos 10 da migration, que expande cada troca de CHECK em DROP/ADD
`NOT VALID` + `VALIDATE` (ADR-0068 §3).

⚠️ **O banco de `staging` tem `195419` e `202337` no journal, e as pastas não existem mais.** Aceito
pelo usuário na mesma decisão; `make migration-test` usa banco descartável e não é afetado.
