# Plano — 216, a viagem pode esperar por motorista e veículo

> Lê-se depois de `spec.md`. Aqui fica **como** fazer e **em que ordem**, com o que já existe medido
> contra o que falta — medição feita nesta sessão, direto no código, não estimativa.

## O que já existe (medido em 2026-09-26)

| Peça                                                | Onde                                                                                      | Serve à feature?                                                                                                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Crew vazio no domínio (`driverIds: []`)             | `resolveTripCrewForCreation`/`resolveTripCrew` (`trip-crew.service.ts`, `trip.policy.ts`) | **Sim, sem mudança** — já em produção via spec 081 (aceite de sugestão multi-veículo). Só falta a criação manual (`createTripSchema`) parar de barrar `driverIds: []`.                                             |
| `checkTripTransition`/`checkTripDocumentTransition` | `trip-state.policy.ts:246-355`                                                            | **Não leem crew hoje** — a máquina de estados não precisa ser reescrita, só ganhar uma entrada nova em `TRIP_STATUS_ORDER` (linha 74-83) e duas transições (`awaiting_crew → draft`, `awaiting_crew → cancelled`). |
| `resolveDispatchReadiness`/`tryAutoDispatchTrip`    | `dispatch-readiness.policy.ts:45`, `try-auto-dispatch-trip.use-case.ts:80`                | **Não verificam crew hoje** — gate novo precisa nascer aqui (RF6/D4), senão despacho automático ignora `awaiting_crew`.                                                                                            |
| `buildTripDriverCost`                               | `trip-driver-cost.policy.ts:72`                                                           | **Já trata crew vazia** — devolve parcela `missing`/gap. Não muda.                                                                                                                                                 |
| `trip_dispatch_snapshots`                           | `trip.schema.ts:849-907`                                                                  | **Não guarda motorista** — não afetado; o congelamento de crew é anterior (na criação/definição), não no despacho.                                                                                                 |
| CT-e                                                | `apps/api-transportada/src/cte-issuance/**`                                               | **Não depende de motorista/veículo** — não afetado.                                                                                                                                                                |
| MDF-e                                               | `create-trip-mdfe-manifest.use-case.ts:71,95`                                             | Já exige crew completo (`MdfeManifestCrewRequiredError`) — comportamento correto, não muda; reaproveitável como referência de "erro nomeado, não 500".                                                             |

## O que falta (a trava real)

| Peça                                                                      | Onde                                                                                                        | O que precisa mudar                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trips.vehicle_id` `NOT NULL`                                             | `database/trip.schema.ts:205`                                                                               | Migration aditiva: coluna vira nullable. Sem `DROP`/perda de dado — expansão pura.                                                                                                                                                                                                                                                        |
| `resolveTripVehicle` lança se `vehicle: null`                             | `trip.policy.ts:43-52`                                                                                      | Aceitar `null`, devolver estado explícito de "sem veículo" em vez de lançar `TripVehicleNotFoundError`.                                                                                                                                                                                                                                   |
| `createTripSchema` exige `driverIds.min(1)` e `vehicleId` obrigatório     | `trip-request.schema.ts:27-38`                                                                              | `driverIds` aceita array vazio (mín. 0); `vehicleId` vira opcional.                                                                                                                                                                                                                                                                       |
| `CreateTripInput`/`TripUseCase.create`                                    | `trip.use-case.ts:31-40,151-154`                                                                            | Tipos passam a aceitar `vehicleId?: string`; `create()` decide `awaiting_crew` (nem motorista nem veículo, ou só um dos dois) vs `draft` (os dois) pela presença dos dois.                                                                                                                                                                |
| Leitura de `trips.vehicleId` sem checar null                              | `trip-cargo-layout-input.support.ts:129-146,168-172`, `read-trip-valuation.use-case.ts:282,287-296,654,713` | Cada leitura passa a tratar `vehicleId: null` como gap explícito — cargo-placement já tem o conceito de `unavailable` (`cargo-layout-availability.policy.ts`); valuation/pedágio precisam de um gap equivalente (nome a definir na Fase 3, provavelmente algo como `VALUATION_GAPS.noVehicle`, no molde do `noTripDriver` que já existe). |
| Rota de definir crew pós-criação                                          | Não existe — busca em `trip.routes.ts` não encontrou `PATCH`/`PUT` de crew/veículo.                         | Nasce nova: `PATCH /trips/:id/crew` (nome final a confirmar na Fase 2), corpo `{ driverIds, vehicleId }`, só aceita em `awaiting_crew`, reaproveita `resolveTripCrewForCreation`/`resolveTripVehicleForCreation`.                                                                                                                         |
| Frontend: `trip.types.ts` tipa `driverName`/`vehicleId` como obrigatórios | `trip.types.ts:53,97,1162`                                                                                  | Viram opcionais; telas listadas abaixo tratam ausência.                                                                                                                                                                                                                                                                                   |
| Botões de atualizar (motoristas/veículos/notas)                           | Não existem — grep por "sync"/"sincroniz" em trips/fleet não achou nada equivalente.                        | Três botões novos (ícone + tooltip) na tela de detalhe, cada um chamando o refetch da query já existente daquela listagem (React Query ou equivalente já em uso no módulo — confirmar na Fase 4 qual client de dados o módulo trip usa hoje).                                                                                             |

### Telas de frontend afetadas pela mudança de tipo (levantamento desta sessão)

`TripTable`, `TripDetail`, `TripProposalRow`, `TripHeaderActions`, `FieldDeliveryWizard`/
`FieldDeliveryWizardHeader`, `TripRouteAssemblyDialog`, `TripOccurrenceTable`, `TripReviewEntry`,
`FieldOccurrenceDialog` — todas em `apps/frontend-transportada/src/modules/trip/`. Cada uma precisa
de revisão pontual (exibir "a definir" em vez de string vazia); não é uma reescrita.

## Ordem, e por que é essa

A trava física (`trips.vehicle_id NOT NULL`) tem que sair primeiro, porque toda mudança de tipo no
backend depende dela — e a migration é aditiva e sem risco de rollback complicado, então não há
motivo para adiar.

```
Fase 1  migration (vehicle_id nullable) + domínio (resolveTripVehicle aceita null)
Fase 2  criação (schema HTTP + use-case) decide awaiting_crew vs draft
Fase 3  gaps explícitos nos consumidores de vehicleId (cargo-placement, valuation/pedágio)
Fase 4  gate de despacho (D4) — nada despacha sem crew completo
Fase 5  rota de definir crew pós-criação (D5) — awaiting_crew → draft
Fase 6  frontend: tipos opcionais + telas afetadas + selo "tripulação pendente" (P3)
Fase 7  os três botões de atualizar (independente das fases 1-5 — pode andar em paralelo)
Fase 8  fechamento: migration-test, contratos de regressão (081, MDF-e, valuation, cargo-placement)
```

⚠️ **A Fase 3 é a que mais risco esconde.** `read-trip-valuation.use-case.ts` já tem comentário
próprio avisando que pedágio "precisa do eixo do veículo, que só se conhece depois de ler o
contexto" — ou seja, o código já sabe que vehicle é uma dependência tardia; a tarefa aqui é dar um
nome de gap explícito para "não tem veículo ainda", em vez de deixar a leitura de
`context.vehicle.axles` estourar. Antes de mexer, reler `trip-valuation.query.ts` inteiro (é o único
lugar, fora do módulo fleet, que hoje já faz join com `fleetDrivers` para outro fim) para não
duplicar padrão.

## Perguntas que ficam para o design (Fase 2/5)

1. Nome final da rota de definir crew: `PATCH /trips/:id/crew` é o candidato natural (mesmo
   substantivo que o código já usa, `crew`), mas confirmar contra o padrão de nomeação de rotas do
   módulo antes de fechar.
2. Qual client de dados o módulo `trip` do frontend usa para as listagens de motoristas/veículos/
   notas hoje (React Query? outro?) — decide como o botão de atualizar aciona o refetch sem
   reescrever a busca.
3. Confirmar contra a spec 178 (trocar a rota no rascunho) se alguma regra dela pressupõe crew já
   montada antes de aceitar edição de rota — ela roda sobre `draft`, que nesta spec continua exigindo
   crew completo, então a expectativa é zero colisão, mas fica registrado para conferir no código
   antes de implementar.
