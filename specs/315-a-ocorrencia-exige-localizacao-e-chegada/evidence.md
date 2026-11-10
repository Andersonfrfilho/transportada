# Evidência — Feature 315

## Etapa 1 — API (T2, T2b, T3, T4, T5)

- **T2/T2b — migration** `20261110180900_occurrence_location_arrival`: aplicada e revertida à mão em Postgres 16 descartável.
  Tipo existente fica `off`/nulo; `arrival_time_mode = 'required'` com espera mínima é recusado pela CHECK
  (`company_occurrence_types_min_wait_check`); o rollback recusa rodar com tipo configurado e, sem ele, derruba as três colunas.
  Contrato estático: `test/database-migration/occurrence-location-arrival.static.contract.ts`.
- **T3/T4 — cobrança no servidor:** `test/trip-occurrence/stop-occurrence-requirements.contract.ts` (localização, foto,
  observação, horário obrigatório/opcional/desligado, parada já chegada descarta o horário, janela do horário, espera mínima com
  `availableAt`, escritório sem a trava e com a hora da chegada obrigatória, espera mínima × horário digitado no `PUT`).
- **T5 — leitura e escrita do tipo:** `PUT/GET /company-settings/occurrence-types` e a lista de tipos do motorista levam
  `locationMode`, `arrivalTimeMode` e `minWaitAfterArrivalMinutes`; a rota do motorista e a do escritório aceitam `arrivedAt` e
  devolvem `arrivalRecorded`.
- `bun --env-file=../../.env.test test` na API: 14.722+ passam. `tsc --noEmit` e `eslint` limpos nos arquivos tocados.

## Desvios da spec original, já refletidos em `spec.md`

- D6: reaproveita a janela da chegada informada do escritório (`ARRIVED_AT_IN_FUTURE`, `ARRIVED_AT_BEFORE_DISPATCH`), sem código novo.
- D7: foto e observação só no canal do motorista.
- D8: os campos novos não entram em `resolveOccurrenceRequirements` (não há exceção por CNPJ para eles).

## Pendente

- T0/T1 (medição de tipos de parada com foto/observação obrigatórias, em staging e produção) — script em `tmp/ops/`.
- Teste de integração com banco da ocorrência de parada com chegada informada (`test/integration`), T4.
- T6–T11.
