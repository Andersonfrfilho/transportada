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

## G003 — Worker (2026-09-03, T020)

Commit `2afd7d89`. Quatro chaves `TRIP_OCCURRENCE_*` (unexpected_charge, long_wait, dock_closed,
appointment_required) no `NOTIFICATION_CATALOG` (inbox + email); `other` sem chave de propósito.
Disparo pelo `StopOccurrenceNotifierPort` opcional em `reportStopOccurrence`, publicando no trilho
`notification.v1` (API enfileira, worker renderiza); destinatário = quem despachou; dedupe
`templateKey:occurrenceId`. Paridade api/worker por contrato. API 4114 e worker 885 testes verdes.
⚠️ Instalação já semeada precisa rodar `db:seed:notification-templates` para os quatro textos.

## G004 — Shell (2026-09-03, T030)

Commit `8886d2fc`. Navegação Viagem·Perfil (bottom bar, alvos ≥44px), header com marca + empresa
(`useInstallationBrand`) + avatar de iniciais (foto real depende de rota que o papel de campo não
alcança — comentado no header), barra de progresso por parada (`driverTripProgress.service.ts`,
`role="progressbar"`, pulso só sem `prefers-reduced-motion`). Frontend 2484 testes verdes.

## G005 — Fila offline (2026-09-03, T040–T041)

Commits `f30125aa` + fix do preview (`occurredAt`). IndexedDB v2 com store `event-attachments`;
teto declarado `ATTACHMENT_QUEUE_LIMIT` (30 anexos / 50 MiB) recusado ANTES de qualquer descarte;
drenagem única (`drainQueueWithAttachments`): rede mantém, rejeição grava `rejectionCause` legível e
sai da drenagem automática. Tela `DriverEventQueue` (entrada pelo Perfil e pelo banner): tipo, hora,
anexos, status, "Enviar agora" por evento e "Enviar todos". Frontend 2498 testes verdes.

## G006 — Entrega (2026-09-03, T050–T053 + painel do escritório)

Commits `efa0222d` (campo) e `11e36ace` (painel). Distância haversine com "X,X km" e ausência sem
posição/coordenada; assinatura em canvas com tela inteira (`requestFullscreen` +
`screen.orientation.lock('landscape')`, fallback iOS por CSS `rotate(90deg)`, sem suporte cai para
foto) entrando na mesma fila com `kind: 'signature'` + `receiverName`; recorte do comprovante no
aparelho (limiar de luminância, 4 cantos ajustáveis, "usar sem recorte", alças em
`var(--control-height)`); campos do comprovante dirigidos por `stop.deliveryProof` do snapshot
(`off` não renderiza, `required` bloqueia com erro por campo, documento canonicalizado sem
`inputMode` numérico). Painel "Comprovante" na tela de Viagens (placement + permissão + fábrica da
ADR-0057 + exceções por CNPJ). Frontend 2533 testes verdes, typecheck limpo.

## G007..G008

(pendente)
