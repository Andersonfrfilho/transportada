# Spec 111 — evidências

## T1

- Contrato `test/trip/proposal-stop-order.contract.ts`: 6 casos. Commit `9d7e1639`.

## T2

- Vermelho antes da implementação: `Export named 'MultiVehicleSuggestionStopNotInVehicleError' not
found` (a classe ainda não existia).
- Verde: 62 contratos de aplicação (+7), 22 HTTP (+2). `make check` EXIT=0. Commit `4aaae9e0`.

## T3 e T4

- Contratos `proposal-manual-order.contract.ts` (5) e o de convergência invertido (a D6 exigia que a
  proposta **não** tivesse setas).
