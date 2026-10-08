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
