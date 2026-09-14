# Tasks — 128

> 🤖 Modelo: `sonnet`

- [x] **T1 — Contrato antes do código.** `api-transportada/test/trip-valuation/driver-route-tie.contract.ts`,
      registrado em `test/trip-valuation.contract.test.ts`: o empate usa o maior valor em toda
      rotação/inversão do catálogo **e** dos preços; preço comparado como dinheiro; empate de valor →
      menor código; faixa sem preço é dita; nenhuma com preço → lacuna da 123 nomeando as zonas;
      aviso fora de `hasGaps`; a matriz só vence sozinha e é identificada pela família; viagem sem
      empate não muda. _Verificação:_ vermelho antes (módulo `trip-driver-tie.policy` inexistente).
- [x] **T2 — Domínio.** Política de zona, `chooseTiedZone`, detalhe da parcela, vocabulário.
- [x] **T3 — Consulta.** `resolveCrew` + `priceTiedCrewMember`.
- [x] **T4 — Contratos antigos.** 127 (`driver-route-vote`, `driver-zone`), 124
      (`driver-zone-table-price`) e o de aviso do frontend reescritos com a razão.
- [x] **T5 — Rótulos.** `DRIVER_ROUTE_TIE_HIGHEST_RATE` nas quatro tabelas.
- [x] **T6 — Medição.** Antes (`1ecd4779`) × depois nas 32 viagens e nas 20 com motorista.
- [x] **T7 — Gate.** Suítes afetadas, `bun run typecheck`, `make check`.
