# Plano técnico — Feature 224 (revisão 1)

## Contexto e premissas

- `kind = 'cargo'` já existe (184, `20260924142302_delivery_proof_cargo_kind`), fora do índice único
  parcial `trip_delivery_proofs_company_event_kind_unique`. Os dois upserts
  (`drizzle-delivery-proof.repository.ts:342-354` e `drizzle-driver-field-report.repository.ts:686-699`)
  repetem o predicado em `targetWhere`.
- Hoje só o escritório grava `cargo`, com teto de 5 contado sem trava
  (`office-delivery-proof.service.ts:137-141`).
- O comprovante não tem retenção. O único corte é o de posição, aos 90 dias.
- `listDeliveryProofs` (`delivery-proof-read.support.ts:68-122`) não filtra `kind`, lápide nem
  `stored_objects.status`.
- `actor_user_id` não tem FK (`trip.schema.ts:1454`). `removed_by_user_id` segue o mesmo molde, então
  não existe `ON DELETE` que brigue com o CHECK de remoção.
- Não existe OpenAPI no repositório, nem `shared/errors/codes.ts`: os códigos ficam em
  `trips/domain/trip.error.ts` e `trip-field-office.error.ts`.
- CORS: `BODYLESS_METHODS` (`GET`, `DELETE`, `HEAD`) libera só `Authorization`
  (`api-transportada/src/http/cors.service.ts:20-21,74`). Qualquer outro header num `DELETE` faz o
  preflight falhar, o `fetch` lançar e a drenagem parar como se fosse `OFFLINE`.
- App do motorista:
  - `request()` aceita `'GET' | 'PATCH' | 'POST' | 'PUT'` (`driverTripClient.service.ts:650-662`);
  - a CSP tem `img-src 'self' blob: <API>` (`contentSecurityPolicy.service.ts:66`);
  - o `8f01f00e8` trouxe `ProofImageLightbox.component.tsx`, `removeQueuedAttachmentByKey`
    (`offlineAttachments.service.ts:194`) e a `attachmentKey` gerada em `attach()`;
  - a 212 trouxe `proofPhotoReduction.service.ts` (2000 px, ~900 KiB, teto de 960 KiB),
    `proofPhotoRecovery.service.ts` e `pendingReduction`;
  - a régua da ocorrência mora em `occurrencePhotoImage.service.ts` (1600 px, ~400 KiB) e
    `notDelivered.service.ts:28` (512 KiB).

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

| Arquivo                                                         | Mudança                                                                                                                                                                                              |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/database/trip.schema.ts`                                   | `removedAt`, `removedByUserId`; CHECKs `…_removal_check` e `…_cargo_attachment_key_check`; índices `…_cargo_attachment_key_unique` e `…_cargo_active_idx`                                            |
| `src/database/storage.schema.ts`                                | purpose `delivery_proof_cargo`                                                                                                                                                                       |
| `drizzle/<ts>_delivery_proof_cargo_driver/`                     | `migration.sql`, `rollback.sql` e `snapshot.json`, escritos à mão por causa do trigger                                                                                                               |
| `src/trips/domain/delivery-event.constant.ts`                   | `DRIVER_PROOF_KINDS` com `cargo`; `DRIVER_CARGO_PHOTO_LIMIT = 4`; `TRIP_DELIVERY_PROOF_CARGO_LIMIT` (5) fica como o teto do escritório                                                               |
| `src/trips/domain/delivery-proof.policy.ts`                     | `DRIVER_CARGO_PHOTO_MAX_BYTES = 512 * 1024`; `resolveCargoPhotoRetentionUntil`, que reusa `OCCURRENCE_ATTACHMENT_RETENTION_YEARS`                                                                    |
| `src/trips/application/driver-cargo-proof.service.ts` (novo)    | ramo `cargo` do motorista: chave obrigatória, releitura pela chave, pré-contagem, assinatura de bytes, descarte de recebedor e posição, `runWithStoredObjectCleanup`                                 |
| `src/trips/application/attach-delivery-proof.use-case.ts`       | desvia `cargo` para o serviço acima **antes** da classificação                                                                                                                                       |
| `src/trips/application/list-driver-proofs.use-case.ts`          | novo: `createListDriverProofsUseCase` (RF2)                                                                                                                                                          |
| `src/trips/application/read-driver-proof-content.use-case.ts`   | novo: `createReadDriverProofContentUseCase` (RF3)                                                                                                                                                    |
| `src/trips/application/remove-driver-cargo-proof.use-case.ts`   | novo: `createRemoveDriverCargoProofUseCase` (RF4): transação, depois `deleteObject`                                                                                                                  |
| `src/trips/application/office-delivery-proof.service.ts`        | contagem por canal; purpose e retenção novos                                                                                                                                                         |
| `src/trips/infrastructure/drizzle-delivery-proof.repository.ts` | `insertCargoProof` (23505 → relê; 23514 → relê e, sem linha, traduz pelo nome da constraint), `countActiveCargoProofs`, `findCargoProofByAttachmentKey`, `markCargoProofRemoved`, `listDriverProofs` |
| `src/trips/infrastructure/delivery-proof-read.support.ts`       | `removed_at is null` e `stored_objects.status <> 'deleted'`; devolve `channel`                                                                                                                       |
| `src/trips/presentation/delivery-proof.schema.ts`               | `isProofKind` aceita `cargo`                                                                                                                                                                         |
| `src/trips/presentation/me-driver-proof.routes.ts` (novo)       | os dois `GET` e o `DELETE`, registrados no roteador com `trip.report` e o rate limit da `POST .../proof`                                                                                             |

### Worker (`apps/worker-transportada`)

- `TRIP_OCCURRENCE_ATTACHMENT_STORAGE_PURPOSES` ganha `delivery_proof_cargo`. O nome da constante
  fica, porque renomear mexeria em sete arquivos sem ganho.
- A unidade do expurgo apaga o objeto e marca `stored_objects` como `deleted`. A linha do comprovante
  fica, apontando para o objeto `deleted` (FK `restrict`). A T2.5 confere isso.

### App do motorista (`apps/frontend-driver`)

| Arquivo                                                                   | Mudança                                                                                                                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shared/offlineAttachments.service.ts`                                    | `kind` com `cargo`; `canAcceptCargoPhoto` (D6); drenagem em duas passagens (M6); `applyAttachmentReceiverFields` e `detectReceiverDrift` pulam `cargo` (D7)        |
| `shared/cargoPhotoQueue.constant.ts` (novo)                               | `CARGO_QUEUE_MAX_COUNT`, `CARGO_QUEUE_RESERVE_COUNT`, `CARGO_QUEUE_RESERVE_BYTES`, `DRIVER_CARGO_PHOTO_LIMIT`                                                      |
| `shared/proofPhotoReduction.service.ts` e `proofPhotoRecovery.service.ts` | régua e teto por `kind`: `cargo` usa a da ocorrência e 512 KiB                                                                                                     |
| `shared/driverTripClient.service.ts`                                      | `request()` aceita `'DELETE'`, e o `DELETE` sai sem `idempotency-key`; `listDriverProofs`, `readDriverProofContent`, `removeCargoProof`; `attachProof` com `cargo` |
| `shared/driverTripResponse.validation.ts`                                 | `driverProofListFromApi`, tolerante: item estranho sai sozinho                                                                                                     |
| `hooks/useDriverTrip.hook.ts` e a fila de eventos                         | evento `cargoPhotoRemoval` → `DELETE`; nada de GPS para `cargo`                                                                                                    |
| `hooks/useDriverProofImages.hook.ts` (novo)                               | junta fila e servidor por `attachmentKey`, desconta as remoções na fila, baixa os bytes (RF3) para `blob:` e revoga as URLs                                        |
| `components/CargoPhotoGallery.component.tsx` + `.module.css` (novos)      | miniaturas, "Adicionar foto", "Anexar", "Ver", "Remover", confirmação e "N de 4"                                                                                   |
| `DriverStopCard.component.tsx` (`DeliveryProofSection`)                   | monta a galeria; "Ver" e "Substituir" no canhoto e na assinatura enviados, pelo `ProofImageLightbox`                                                               |
| `driverTrip.locale.json` e `driverTrip.en.locale.json`                    | textos novos                                                                                                                                                       |

### Painel (`apps/frontend-transportada`)

- Fase 0: `channel` em `DELIVERY_PROOF_OPTIONAL_KEYS` e `isOneOf` em `isDeliveryProof`.
- Fase 5: `deliveryProof.service.ts` e `TripDeliveryProof.component.tsx`, com o rótulo e a origem.

## Contratos/API/eventos

```text
POST /me/trips/current/documents/:documentId/proof           (multipart, existente)
  kind=cargo  file≤512KiB  attachmentKey obrigatória (≤128)
  201 { id, punctuality: 'not_required' }        (também no reenvio e na lápide)
  400 attachmentKey ausente
  422 TRIP_DELIVERY_PROOF_CARGO_LIMIT | _TOO_LARGE | _UNSUPPORTED_TYPE
  404 TRIP_DOCUMENT_NOT_REACHABLE

GET /me/trips/current/documents/:documentId/proofs
  200 { data: { items: [{ id, kind, attachmentKey, createdAt }],
                cargo: { used, limit: 4 } } }
  404 TRIP_DOCUMENT_NOT_REACHABLE

GET /me/trips/current/documents/:documentId/proofs/:proofId/content
  200 bytes  Content-Type: image/*  Cache-Control: private, no-store
  404 TRIP_DOCUMENT_NOT_REACHABLE | proof de outro motorista, removida ou objeto deleted

DELETE /me/trips/current/documents/:documentId/proof/cargo/:attachmentKey
  só Authorization (sem Idempotency-Key, sem Content-Type)
  204 removeu | já removida | chave inexistente | de outro motorista
  404 TRIP_DOCUMENT_NOT_REACHABLE

GET /trips/:id/documents/:documentId/proof                    (painel, existente)
  item ganha channel: 'driver_app' | 'office' | 'whatsapp'
  sem lápide e sem objeto deleted
```

- O `404` do `content` para foto alheia não é oráculo: a lista (RF2) só devolve ids do próprio
  motorista, e o id é UUID.
- Auditoria: `audit_logs` com a ação `driver.trip.delivery-proof.cargo.remove`, o alvo `proofId`, o
  ator, o IP e a hora. Grava na transação do `UPDATE`, só quando `removed_at` sai de `null`.

## Dados, migration e rollback

Uma migration aditiva, 🧠 `opus`, escrita à mão com `snapshot.json`:

1. `trip_delivery_proofs.removed_at timestamptz null` e `removed_by_user_id uuid null`, sem FK (molde
   de `actor_user_id`).
2. CHECK `trip_delivery_proofs_removal_check`:
   `(removed_at is null) = (removed_by_user_id is null) and (removed_at is null or (kind = 'cargo' and channel = 'driver_app'))`.
3. CHECK `trip_delivery_proofs_cargo_attachment_key_check`:
   `kind <> 'cargo' or attachment_key <> ''`, `NOT VALID`. Vale para as linhas novas. As antigas da
   184 não são validadas: o escritório já manda a chave, mas isso não foi provado em produção.
4. Pré-checagem, que aborta se existir `cargo` com a mesma `(company_id, stop_event_id,
attachment_key)` não vazia. Depois, `CREATE UNIQUE INDEX
trip_delivery_proofs_cargo_attachment_key_unique … where kind = 'cargo' and attachment_key <> ''`.
5. `CREATE INDEX trip_delivery_proofs_cargo_active_idx (company_id, stop_event_id, channel) where
kind = 'cargo' and removed_at is null`.
6. Função `trip_delivery_proofs_enforce_cargo_rules()` (`plpgsql`, `VOLATILE`) com dois triggers:
   - `BEFORE INSERT … WHEN (NEW.kind = 'cargo')`, em três comandos na ordem da D3:
     `PERFORM pg_advisory_xact_lock(hashtextextended(NEW.stop_event_id::text, 211))`; `IF EXISTS`
     pela chave → `RETURN NEW`; `SELECT count(*) INTO …` das ativas do canal; acima de 4
     (`driver_app`) ou 5 (outros) → `RAISE EXCEPTION … USING ERRCODE = '23514', CONSTRAINT =
'trip_delivery_proofs_cargo_limit'`;
   - `BEFORE UPDATE OF removed_at`: recusa voltar a `null`
     (`CONSTRAINT = 'trip_delivery_proofs_removal_one_way'`).

   A premissa é `READ COMMITTED` (o padrão da API). Sob `REPEATABLE READ` a contagem leria o snapshot
   do começo da transação. Um contrato confere que nenhuma transação do caminho muda o isolamento.

7. `stored_objects_purpose_check` com `delivery_proof_cargo`: `DROP`, `ADD … NOT VALID` e
   `VALIDATE CONSTRAINT` em comandos separados, para não segurar trava forte durante a varredura.

**Rollback** (`BEGIN`/`COMMIT`): aborta sem apagar nada se existir lápide ou objeto
`delivery_proof_cargo`. Fora isso, desfaz de 7 a 1 e apaga a entrada do journal, exigindo exatamente
uma linha (molde da 184).

**Correção para frente.** O rollback só serve antes do primeiro uso. Depois dele, qualquer ajuste
(teto, trigger, CHECK) é migration nova, aditiva, que troca a função com `CREATE OR REPLACE` e mantém
a lápide. Nunca se volta a coluna.

O assert da migration (`database-migration/delivery-proof-cargo-driver.assertion.ts`) roda só em
`make migration-test`. Por isso ele entra vermelho **antes** da T1.3, e é esse gate que o torna
verde. Depois do rebase, `db:generate` tem de dar `no_changes`, porque a 194 também tem migration
nessa tabela.

## Segurança e tenant

- `companyId` e o motorista vêm do token. A nota é resolvida pelo mesmo `findDeliveryEventId` da
  `POST .../proof`, e toda consulta filtra `company_id`.
- O bucket continua privado, e o aparelho nunca lê dele. A chave do objeto não leva dado pessoal.
- A assinatura de bytes é conferida no servidor.
- LGPD: 5 anos de retenção, remoção pelo autor com os bytes apagados, nenhuma posição gravada. Isso
  vai para o `docs/SECURITY.md`, junto com o risco aceito da ADR-0089.
- CORS: o `DELETE` não pede header novo. Um contrato do preflight prova isso.

## Idempotência e concorrência

- `POST cargo`: a chave tem índice único. 23505 → relê e devolve. 23514 → relê pela chave primeiro,
  e só sem linha vira 422.
- Teto: trava consultiva por evento dentro do trigger, e contagem em comando separado.
- `DELETE`: `UPDATE … set removed_at = now() where removed_at is null returning id, object_id`. Zero
  linhas → 204, sem auditoria e sem I/O de storage.
- Aparelho: o grupo espera o próprio evento de entrega. O `cargoPhotoRemoval` é evento, criado só
  depois do envio ou durante ele.

## Observabilidade

- Log estruturado com `traceId`, `proofId` e `outcome` (`created`, `replayed`, `limit`, `removed`,
  `noop`, `storage_delete_deferred`). Nunca nome, posição ou bytes.
- O expurgo registra os objetos `delivery_proof_cargo` que apagou por ciclo.

## Estratégia de testes

Na API, de dentro de `apps/api-transportada`, **os dois comandos**:

```bash
bun --env-file=../../.env.test test --timeout 120000   # contrato
bun --env-file=../../.env.test run test:integration    # integração — obrigatório nas Fases 1 e 2
```

- Contrato: o entrypoint novo `test/trip-delivery-proof-cargo.contract.test.ts` importa as suítes
  `test/trip-delivery-proof-cargo/*.contract.ts` e entra **à mão** no script `test`. O preflight do
  `DELETE` vai na suíte de CORS que já existe.
- Integração: `test/integration/delivery-proof-cargo-driver.integration.ts`, que entra **à mão** no
  `test:integration`. A regressão da nota vai em `driver-score.integration.ts` e
  `me-trip.integration.ts`.
- Migration: o assert novo em `database-migration.integration.ts`, rodado por
  `make migration-test`.
- Worker: a suíte `test/trip-occurrence-attachment-purge/`.
- App do motorista: `test/driver-trip/cargo-photo-queue.contract.ts`,
  `cargo-photo-gallery.contract.ts` e `driver-trip-client-delete.contract.ts`, todas em
  `test/driver-trip.contract.test.ts`. O smoke vai em `test/driver-app.smoke.spec.ts`.
- Painel: a suíte de `tripResponse.validation`.

## Riscos

- **R1 — `DeliveryProofSection` com vários donos** (193, 206, 207 e `8f01f00e8`). A galeria vai em
  componente próprio, e a T4.0 confere o `git log`.
- **R2 — Migration concorrente** (194 Fase 4). Quem chegar depois regenera, e `db:generate` tem de
  dar `no_changes`.
- **R3 — Teto em dois lugares.** Um contrato lê o SQL.
- **R4 — Lápide aponta para objeto `deleted`.** Toda leitura filtra `removed_at` e `status`, e só a
  deduplicação por chave vê a lápide.
- **R5 — Prova apagada pelo interessado.** É o risco aceito pelo usuário (ADR-0089). A auditoria
  mostra quem removeu e quando.
- **R6 — O legado `/minha-viagem`** não ganha a galeria.

## Perguntas registradas (não bloqueiam)

- **Q1** Resolvida pela spec 212: o canhoto é reduzido no aparelho, com teto de 960 KiB.
- **Q2** A posição da seção (abaixo de "Quem recebeu") é mostrada no Preview da T4.4 para o usuário
  confirmar.
- **Q3** Os números da reserva da fila (8, 10 e 20 MiB) são de partida.
