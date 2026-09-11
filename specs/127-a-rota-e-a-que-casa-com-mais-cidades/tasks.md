# Tasks — 127

> 🤖 Modelo: `sonnet`

- [x] **T1 — Contrato antes do código.** `driver-route-vote.contract.ts`: a rota com mais cidades
      vence em toda rotação/inversão do catálogo; a cidade em duas rotas vota nas duas; a faixa é a
      mais alta da rota vencedora; parada fora dela não puxa faixa; empate vira lacuna com as zonas
      nomeadas; `sequence` não desempata rota; cobertura não altera zona, preço nem origem; a consulta
      não produz mais `driverZoneNotCovered` nem `routeSource: 'estimated'`. _Verificação:_ vermelho
      antes (13 falhas).
- [x] **T2 — Domínio.** Catálogo em lista, voto, faixa, empate; `DRIVER_ROUTE_AMBIGUOUS`;
      `tiedZones` no detalhe da parcela; lembrete sem mudar origem.
- [x] **T3 — Consulta.** `resolveCrew` precifica a zona escolhida e acende o lembrete pela cobertura.
- [x] **T4 — Contratos antigos.** 086, 123, 124 e o fixture do razão reescritos com a razão.
- [x] **T5 — Rótulos.** `DRIVER_ROUTE_AMBIGUOUS` nas quatro tabelas.
- [x] **T6 — Medição.** Antes × depois nas 32 viagens da base local.
- [x] **T7 — Gate.** Suítes afetadas, `bun run typecheck`, `make check`.
