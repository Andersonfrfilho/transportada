# Tasks — 123

> 🤖 Modelo: `sonnet`

- [x] **T1 — Contrato antes do código.** `driver-rate-gap.contract.ts` afirmando: zona+classe saem
      as duas; o detalhe encolhe e nunca inventa; com dois condutores o dono da lacuna é nomeado;
      a conta é intocada. Registrado no entrypoint `trip-valuation.contract.test.ts`.
      _Verificação:_ `bun test ./test/trip-valuation.contract.test.ts` — vermelho antes.
- [x] **T2 — As duas lacunas novas.** `DRIVER_ZONE_NOT_COVERED` e `DRIVER_RATE_MISSING_FOR_CLASS`
      em `VALUATION_GAPS`, com o motivo de cada uma escrito ao lado.
- [x] **T3 — A zona recusada sobe.** Variante nova em `TripDriverZone`; os dois testes da 086 que
      afirmavam o vocabulário antigo atualizados para o novo.
- [x] **T4 — O detalhe.** `driverName` no `TripCrewMember`, `buildRateDetail`, e a escolha entre
      condutores sem preço (cidade vence; depois, quem tem o que dizer).
- [x] **T5 — A consulta.** `fleetDrivers.name` nas duas leituras de tripulação, zona no ramo de
      lacuna, e a lacuna escolhida conforme a classe tenha ou não coluna na planilha.
- [x] **T6 — Rótulos.** pt-BR acentuado e en nas quatro tabelas.
- [x] **T7 — Medição.** Teste diferencial contra as 20 tripulações reais: 0 valores alterados.
- [x] **T8 — Gate.** `bun test`, `bun run typecheck`, `make check`.
