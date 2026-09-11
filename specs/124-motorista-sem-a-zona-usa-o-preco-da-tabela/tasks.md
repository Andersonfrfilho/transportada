# Tasks — 124

> 🤖 Modelo: `sonnet` (a decisão aviso × lacuna, D2, é 🧠 e está na spec)

- [x] **T1 — Contrato antes do código.** `driver-zone-table-price.contract.ts` (API): a zona recusada
      leva o id; preço da tabela conta `estimated` com o aviso nomeando a célula; dois condutores
      somam e o aviso nomeia quem não cobre; sem preço nem na tabela continua ausente; coberto sai
      medido; aviso vence o assalariado; aviso não marca `hasGaps`; só a lacuna nova é aviso; a
      consulta pede o preço da zona recusada. _Verificação:_ vermelho antes (`ADVISORY_GAPS` não
      existia).
- [x] **T2 — Domínio.** `DRIVER_ZONE_PRICED_FROM_TABLE`, `ADVISORY_GAPS`, `isAdvisoryGap`;
      `hasGaps` ignora aviso; `regionId` no ramo "não cobre"; `routeSource` no `TripCrewMember`.
- [x] **T3 — Consulta.** `resolveCrew` pede à tabela o preço também da zona recusada.
- [x] **T4 — Tela.** `valuation-ledger-advisory.contract.ts` (frontend) antes; o razão mostra o
      valor **e** o aviso na linha, e imprime a marca de estimado ao lado de toda projeção.
- [x] **T5 — Rótulos.** pt-BR acentuado e en nas quatro tabelas.
- [x] **T6 — Medição.** Conta rodada nas viagens reais da base local, antes × depois.
- [x] **T7 — Gate.** testes das suítes afetadas, `bun run typecheck`, `make check` no fim das três.
