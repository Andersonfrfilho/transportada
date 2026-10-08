# Evidência — 257

## T0.1 / T1.1

- Spec 102 (cancelar libera) e 249 (molde) conferidas contra o código: `markCancelled` é o único caminho de cancelamento e libera tudo com `delivered_at is null`.
- `TRIP_STATUSES_BEFORE_DISPATCH` deixou de derivar de `checkTripAcceptsLinkage`; `checkTripAcceptsLinkageAfterDispatch` é a janela D1.
- `bun test ./test/trip-domain.contract.test.ts` → 518 pass / 0 fail; `bun run typecheck` limpo.

## T1.2

- Migration `20261008161749_trip_document_link_events`: tabela append-only (trigger `55000`), checks de canal, motivo (1–500), forma do JSON e `documents_without_cte >= 0`; `rollback.sql` recusa rodar com linhas e remove a linha do journal.
- Lista de migrations (`static-migration.contract.ts`) e de tabelas (`support.ts`) atualizadas.
- `make migration-test` → 158 pass / 0 fail; `bun run typecheck` limpo.

## T1.3

- `applyTripDocumentLinkAfterDispatch` (lock `FOR NO KEY UPDATE`, janela D1 sob o lock, nota `loaded` com `separated_at`/`loaded_at`, parada aberta reaproveitada ou nova ao fim sem ETA, evento de documento, `trip_document_link_events`, auditoria `office.trip.documents-added`, sinalização fiscal D7).
- `test/integration/trip-document-link-after-dispatch.integration.ts` (8 testes, na lista `test:integration`): entra `loaded`; parada aberta reaproveitada; fechada gera nova; viagem congelada intacta (`readTripFreeze`); `already_linked` pulada; janela perdida → 409 sem gravar; histórico + auditoria sem o motivo no `metadata`; trigger append-only; contagem sem CT-e.
- `bun --env-file=../../.env.test test ./test/integration/trip-document-link-after-dispatch.integration.ts` → 8 pass / 0 fail; `bun run typecheck` limpo.

## T1.4

- Caso de uso `linkDocumentsAfterDispatch` (pré-checagem da janela + repositório; canal `backoffice` posto pelo caso de uso), schema estrito (`nfeDocumentIds` 1–300 uuid, `reason` 1–500 aparado), rota `POST /v1/trips/:id/documents/after-dispatch` (201, `OFFICE_REPORT_POLICY`), fiação em `main.ts`; ação `linkDocumentsAfterDispatch` em `TRIP_ACTION` e em `allowed-actions` (oferecida a quem dá baixa em nome do motorista, só na janela da rua).
- Gravação fecha as revisões pendentes da nota (`closePendingReviewsOnLink`); nota inexistente/de outra empresa → FK → `TripDocumentNotFoundError` (404) via `runGuarded`.
- Contrato novo `test/trip-http/documents-after-dispatch.contract.ts` (201 com recorte exato, 400 com todos os erros, 403 separador/leitor, 404 viagem e nota, 409 por motivo, id não-uuid), janela no `trip-state.contract.ts`, rota nas listas de `finance-read` e `separator-role`; grade de transição 160 → 180; `allowed-actions` atualizados.
- `bun run typecheck` limpo; `bun --env-file=../../.env.test test --timeout 120000` → 10998 pass / 0 fail.

## T1.5

- Kind `documents_added` na linha do tempo (`TRIP_TIMELINE_KINDS`, prioridade 8, tipo `TripTimelineDocumentsAdded`), lido de `trip_document_link_events` por `trip-timeline-documents-added.query.ts`, filtrado por `companyId` e `tripId`, e entrando no merge por cursor. Sem ponto de localização (`NO_EVENT_LOCATION`); não carrega dinheiro, então a redação não muda.
- Contratos: vocabulário (kind, prioridade, chaves de `documentsAdded`), merge e isolamento por empresa/viagem da query nova; o teste de 196 T4.2 passou de 3 para 4 fontes sem ponto.
- `bun run typecheck` limpo; `bun --env-file=../../.env.test test --timeout 120000` → 11000 pass / 0 fail.
- Integração dos consumidores da timeline reexecutada à parte: `trip-crew-transfer-timeline.integration.ts` 4 pass / 0 fail; `event-location-stamp.integration.ts` 23 pass / 0 fail. A corrida completa de integração (iniciada com o código ainda em edição) acusou falhas nesses dois arquivos; ambos passam isolados, e a suíte completa é reexecutada no fechamento da T1.6.

## T1.6

- `test/integration/trip-cancel-releases-notes.integration.ts` (9 testes, na lista `test:integration`): cancelada a partir de `draft`, `route_planned`, `separating`, `loading`, `dispatched`, `in_transit` e `on_delivery_route` libera as duas notas e a linha permanece; nota já entregue não é liberada; a nota liberada entra na viagem socorrista que já saiu (`linkDocumentsAfterDispatch`, sem `skipped`).
- D8 confirmado como já verdadeiro: nenhuma mudança em `markCancelled`.
- `bun run typecheck` limpo; `bun --env-file=../../.env.test run test:integration` completo → 1310 pass / 0 fail / 8 skip (inclui os dois arquivos que a corrida anterior, feita com o código em edição, acusara; passam).

## T2.1

- Painel: kind `documents_added` (ícone `document`, tom neutro, fora do mapa), chave `documentsAdded` com chave exata (obrigatória só nesse kind, recusada nos outros), resumo com contagem, motivo e avisos de CT-e/MDF-e, textos pt-BR/en. Kind desconhecido segue descartado.
- `test/trip/timeline-documents-added.contract.ts` (novo, registrado em `trip.contract.test.ts`); asserções dos contratos 249 e 228 ajustadas para o novo último kind.
- `bun run typecheck` limpo; `bun run test` → 7677 pass / 0 fail.

## T2.2

- Painel: ação `linkDocumentsAfterDispatch` em `allowed-actions`, `client.linkDocumentsAfterDispatch` (`POST /trips/:id/documents/after-dispatch`, resposta de chave exata), `TripLinkDocumentsAfterDispatchDialog` (busca de notas, motivo obrigatório, aviso de que o roteiro não muda), resultado com notas puladas e alertas de CT-e/MDF-e, botão no cabeçalho atrás de `trip.report-on-behalf` + ação servida, textos pt-BR/en.
- `test/trip/document-link-after-dispatch.contract.ts` (novo, em `trip.contract.test.ts`): ação conhecida/filtrada, botão, resposta exata, corpo e caminho do cliente, bloqueios, chave de erro, resultado e paridade de locales.
- Smoke Playwright **não** adicionado nesta task: a cobertura é de contrato; fica registrado como lacuna.
- `bun run typecheck` limpo; `bun run test` → 7688 pass / 0 fail.

## T3.1

- ADR-0043 §2 ganhou a exceção; `docs/ai-context/api-transportada.md` ganhou a seção da spec 257; `apps/api-transportada/CLAUDE.md` aponta a rota e a tabela. Só documentação.

## T3.2

- `make check` (format, lint, typecheck, test, build) → exit 0; o lint pegou uma variável sem uso no contrato novo, corrigida.
- `make migration-test` → exit 0, 158 pass / 0 fail.
- Deploy **não** feito: pede aprovação humana, e o painel sai antes da API.
