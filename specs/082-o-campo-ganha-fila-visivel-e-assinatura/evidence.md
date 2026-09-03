# Evidência — spec 082

## G001 — Spec (2026-09-03)

- spec.md, plan.md, tasks.md escritos a partir dos mockups aprovados
  (https://claude.ai/code/artifact/a23964a6-b2c3-41f9-8c5b-4c120b134a5b) e do levantamento do
  módulo `driver-trip` existente (spec 057).
- ADR-0057 (comprovante configurável + envelope do documento) e ADR-0058 (dispatch pelo motorista)
  registrados.
- Decisões do dono do produto em 2026-09-03: documento configurável pelo painel (geral/por CNPJ);
  motorista inicia trajeto; sem lista/histórico de viagens — só a corrente.

## G002 — API (2026-09-03, T010–T014)

Contratos escritos antes da implementação (vermelhos confirmados na primeira rodada) e verdes ao
final:

- `test/trip-schema/delivery-proof-settings-tenant-safety.contract.ts` — FKs de tenant nas duas
  tabelas novas, unique `(company_id, tax_id)` da exceção e default de fábrica
  `receiver_document = 'off'`. (A task nomeava `test/trips-schema/`; o diretório do repo é
  `test/trip-schema/`, e a convenção do repo venceu.)
- `test/trip-delivery-proof/receiver-document.contract.ts` — máscara (`***.938.570-**`), resolução
  geral+override, `off` recusa documento, `required` exige na assinatura (e não na foto), envelope
  selado com AAD por `proofId` e nada em claro na linha persistida.
- `test/trip-delivery-proof/receiver-document-logging.contract.ts` — contrato negativo de log por
  texto de fonte (nenhuma chamada de logger nos seams do documento; leitura sem `decrypt`).
- `test/driver-trip/dispatch.contract.ts` — vínculo alheio → 403 `TRIP_NOT_OF_DRIVER` sem tocar a
  transição; vínculo próprio repassa ao mesmo `dispatchTrip` do escritório.
- `test/integration/me-trip.integration.ts` estendida — viagem `route_planned` visível no snapshot,
  dispatch do motorista congela 1 snapshot, repetido → `unchanged` (sem segundo snapshot), outro
  vínculo → 403, `draft` → 409 `STATE_TRANSITION_NOT_ALLOWED`.

Entregas:

- T011 — migration `drizzle/20260903182455_delivery_proof_settings/` (aditiva) +
  `rollback.sql` com remoção guardada da linha do journal: `company_delivery_proof_settings`,
  `delivery_proof_setting_overrides` (CHECKs `required|optional|off`, `tax_id` CPF/CNPJ
  alfanumérico, unique por empresa) e as duas colunas
  `receiver_document_envelope`/`receiver_document_masked` em `trip_delivery_proofs` com CHECK de
  meia-escrita. ⚠️ O `db:generate` re-emitiu SQL de migrations recentes sem snapshot (drift do
  gerador); o `migration.sql` foi aparado à mão para conter só o delta desta spec.
- T012 — `GET/PUT /company-settings/delivery-proof` e `.../overrides` (`settings.manage`, escopo
  company) em `trips/presentation/delivery-proof-settings.routes.ts`; settings resolvidos
  (geral+override pelo CNPJ do destinatário) entram por parada (`stop.deliveryProof`) no snapshot
  de `GET /me/trips/current`.
- T013 — `proof` aceita `receiverDocument` condicionado à configuração resolvida
  (`resolveProofFieldSettings` no repositório), envelope A256GCM com AAD
  `transportada:delivery-proof:v1:${companyId}:${proofId}`
  (`delivery-proof-document-secret.service.ts`), máscara persistida ao lado e devolvida em toda
  leitura (`readDeliveryProofs.receiverDocument`); valor em claro sem coluna e sem log.
- T014 — `POST /me/trips/current/dispatch` (`trip.report`, corpo `{tripId}`),
  `dispatch-driver-trip.use-case.ts` reusa `dispatchTrip` (mesmo snapshot e idempotência), vínculo
  provado por `isTripOfDriver` no mesmo repositório de `/me/trips/current`; `route_planned` entrou
  em `ACTIVE_TRIP_STATUSES` do snapshot (ADR-0058, "Iniciar trajeto").

Comandos e resultados:

- `bun run --cwd apps/api-transportada test` → 4129 pass, 0 fail (156 arquivos).
- `bun run typecheck` (raiz do worktree, 6 apps) → verde.
- `make migration-test` → 91 pass, 0 fail (migration + rollback em Postgres descartável).
- `DRIZZLE_TEST_DATABASE_URL=$DATABASE_URL bun test ./apps/api-transportada/test/integration/me-trip.integration.ts`
  → 6 pass, 0 fail.
- `bun run db:check` → "Everything's fine"; `bun run format:check` e `bun run lint` → verdes.

## G003..G008

(pendente)
