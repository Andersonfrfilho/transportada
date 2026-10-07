# Plan — Feature 249

## Contexto (a conferir na T0.1 contra `origin/staging`)

`A` = `apps/api-transportada`, `P` = `apps/frontend-transportada`, `D` = `apps/frontend-driver`.

- A trava única: `isCrewSwappable` e `checkDefineCrew` em `A/src/trips/domain/trip-state.policy.ts`
  (~340-390). `allowed-actions` usa a mesma função: `trip-allowed-actions.policy.ts` (~159-172).
- A troca de hoje: `updateCrew` em `A/src/trips/application/trip.use-case.ts` (~280) e
  `A/src/trips/infrastructure/drizzle-trip.repository.ts` (~313): `DELETE` + `INSERT` em
  `trip_drivers`, e `clearPlannedRoute` se o veículo mudou — **nunca chamar na transferência**.
- Elegibilidade: `resolveTripCrewForCreation` (`trip-crew.service.ts`), `trip.policy.ts:76-122`.
- Molde do histórico: `trip_status_events` (`A/src/database/trip.schema.ts:~501`),
  `recordTripStatusChange`, `trip-timeline-merge.service.ts`.
- Molde de permissão e auditoria: `POST /trips/:id/close` (`trip.routes.ts`, `TRIP_CLOSE_PATH`),
  `trip.report-on-behalf`, `audit_logs` como `office.trip.close`.
- Custo: `readTripValuation` (`read-trip-valuation.use-case.ts:242`), parcelas `kind: 'driver'` e
  `'helper'` em `TripValuation.costParcels`.
- MDF-e: `mdfe_manifests.status = 'authorized'`, `mdfe_manifest_drivers`.
- Painel: `TripCrewDialog`, `TripReasonDialog` (molde do motivo), `TripHeaderActions` (~254),
  `useTripWorkspace.hook.ts` (~976), `tripAllowedActions.validation.ts`, `tripClient.service.ts`.
- App: `D/src/modules/driver-trip/shared/tripReassignment.service.ts`, `rejectionCauseLabel.service.ts`.

## Desenho

1. **Domínio**: nova ação `transferCrew` em `trip-state.policy.ts`, **separada** de `defineCrew`
   (a janela antiga e o botão antigo não mudam). Função `isCrewTransferable(status)` única, lida pela
   máquina de estados e por `allowed-actions`. Resultado sempre `unchanged` em status (não há
   transição).
2. **Persistência**: migration `trip_crew_events` (+ `rollback.sql` + `snapshot.json`), índice
   `(company_id, trip_id, created_at)`, sem ENUM nativo, `channel` e `role` em `varchar`.
3. **Repositório**: `transferCrew` abre transação, `FOR NO KEY UPDATE`, reconfere janela e
   `TRIP_CREW_UNCHANGED`, troca `trip_drivers`, mede o custo depois (🧠 T1.1 decide como
   `readTripValuation` roda dentro da transação), grava o evento e devolve o detalhe. Não toca em
   `trips` além de `updated_at`.
4. **Use case**: checagem prévia, resolução de tripulação, leitura do custo **antes**, chamada ao
   repositório, `audit_logs`. Permissão `trip.report-on-behalf` na rota.
5. **Painel**: `TripCrewTransferDialog` (multi-select de motoristas e ajudantes, **sem** veículo,
   campo de motivo obrigatório, resumo "quem sai → quem entra"), botão no cabeçalho por
   `allowed-actions`, toast/resumo pós-troca com `costDifference` e aviso de MDF-e, evento na linha
   do tempo. Locales pt-BR e en.
6. **App do motorista**: texto do aviso de reatribuição e do rótulo de recusa cobrem a viagem na
   rua; nenhuma tela nova.
7. **Docs**: spec/ADR curta (decisão de valor e MDF-e), `docs/ai-context/*`, e corrigir "a tripulação
   é fixa desde a criação" em `A/CLAUDE.md` e `docs/ai-context/api-transportada.md:~2019`.

## Riscos e mitigação

| Risco                                                       | Mitigação                                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Clear de rota por engano                                    | Rota nova não recebe `vehicleId`; teste prova rota, pedágio e ETA intactos |
| Custo antes/depois divergente por leitura fora da transação | 🧠 T1.1; teste de integração com diárias diferentes                        |
| MDF-e fica com o condutor antigo                            | Aviso + `mdfe_driver_divergence` no evento; spec seguinte                  |
| Separador transferindo                                      | Permissão `trip.report-on-behalf`; `separator-role.contract.test.ts`       |
| Motorista novo trava a viagem em curso                      | Teste de integração: novo motorista lê `/me/trips/current` e segue         |
| Lista de testes do `package.json`                           | Teste novo entra na lista explícita da app                                 |
