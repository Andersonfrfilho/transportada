# 065 — O caminhão sai antes do documento · tasks

> 🤖 Modelo: `sonnet` para o mecânico; T007, T010 e T012 são 🧠 (`opus`) — portão fiscal,
> autenticação entre serviços e classificação de documento decidem o que a SEFAZ vê.

Uma task por vez, cada uma com evidência executada em `evidence.md`.

| Task     | O que                                                                                | Requisito | Estado                  |
| -------- | ------------------------------------------------------------------------------------ | --------- | ----------------------- |
| T001     | ADR-0046 revisando a ADR-0023, e a regra escrita no `fiscal-integration.md`          | —         | ✅                      |
| T002     | O portão aceita `dispatched · in_transit · completed` (`isTripDispatched`)           | 1         | ✅                      |
| T003     | `resolveFiscalDocumentKind` — módulo puro, com o município de origem já comparável   | 2         | ✅                      |
| T004     | A prontidão classifica por nota, com `nfse_expected` e `city_unknown`                | 3         | ✅                      |
| T005     | `not_applicable` na prontidão e na coluna derivada da viagem                         | 4         | ✅                      |
| T006     | `trips.requires_mdfe` anulável, com motivo para o `false` e recusa do `true` vazio   | 4b        | ✅                      |
| T007 🧠  | A prontidão distingue "sem lote ainda" de "com lote e faltando documento"            | 5         | ✅                      |
| T008     | O romaneio: `GET /me/trips/current` carrega chave, série, volumes, peso e valor      | 6, 6b     | ✅                      |
| T009     | O romaneio impresso, com o aviso de não-fiscal acima de tudo e sem imitar DANFE      | 6c, P3    | ✅ (impressão do navegador, não PDF gerado) |
| T010 🧠  | Service account: papel de realm, empresa no pedido validada contra a membership      | 10        | ✅                      |
| T011     | O gatilho: a autorização do CT-e chama a rota automática, e a falha não volta à fila | 10        | ✅                      |
| T012 🧠  | Sinal de vínculo com viagem na listagem de notas e na composição do lote             | 6d        | ✅                      |
| T013     | "Gerar os CT-e desta viagem" a partir do romaneio, com trilha de quem disparou       | 6e        | ✅                      |
| T014     | `destinationCityCodes` nos filtros da regra de frete                                 | 7         | ✅                      |
| T015     | Avaliação prevista da viagem, `estimated` versus `measured`                          | 8         | ✅                      |
| T016     | DAMDFE do manifesto vivo substituindo o romaneio na viagem do motorista              | 9         | ❌ **não entrou**       |
| T017     | Notificação de "ficou pronta", "emitido" e "não consegui emitir, e o motivo"         | 11        | ❌ **não entrou**       |
| T018     | E2E do barracão ao manifesto, com carga mista                                        | —         | ❌ **não entrou**       |

Os três abertos estão descritos em `evidence.md`, com o que cada um custa a quem opera hoje.
