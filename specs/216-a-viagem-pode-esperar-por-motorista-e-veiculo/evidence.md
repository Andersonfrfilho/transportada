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

| Task      | Modelo                                                                         | Commit      | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T001      | sonnet (executado nesta sessão; a marca 🧠 pedia opus, registrado como desvio) | `014c60652` | Migration `drizzle/20260926195419_trip_vehicle_optional/` com `rollback.sql`. Vermelho confirmado antes de gerar a migration (`make migration-test` falhando com `23502 null value in column vehicle_id` e diff de snapshot); verde depois. Nova asserção em `test/database-migration/trip-constraints.assertion.ts` prova `vehicle_id: null` aceito e limpa a própria linha antes do ciclo de rollback do teste (senão o rollback da própria migration falharia contra o dado que ela criou). |
| T002/T003 | sonnet (desvio da marca 🧠)                                                    | `014c60652` | `test/trip-application/trip-crew-service.contract.ts` (3 casos: sem vehicleId → null sem consultar repositório; com vehicleId encontrado → devolve veículo; com vehicleId não encontrado → continua lançando `TripVehicleNotFoundError`). Vermelho confirmado (`bun test test/trip-application.contract.test.ts` falhando antes da implementação).                                                                                                                                             |

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

## Testes

- `bun run typecheck` (monorepo): verde.
- `bun run lint` (api-transportada): verde.
- `bunx prettier --check`: verde.
- `bun test` (api-transportada, contrato): 7891 pass / 0 fail / 23 skip.
- `bun run test:integration` (api-transportada): em andamento no momento deste registro — resultado
  a confirmar antes de iniciar a Fase 2.
- `make migration-test`: verde (aplica, restringe — incluindo a asserção nova —, rollback, reaplica).
