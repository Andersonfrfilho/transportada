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

## T4 e T6

- Linha recolhida, barra de totais e as duas telas da porta da tabela de Notas: receita e lucro em
  `--color-ready`, despesa e prejuízo em `--color-alert`.
- Verde: `trip` 627, `suggestion-valuation` 18 (a marca de conta incompleta ao lado do lucro continua
  exigida), `routing` 63. Tipos limpos.
- Servido no ar, conferido pelo Vite: `.ledgerRevenue dd { color: var(--color-ready) }`.
