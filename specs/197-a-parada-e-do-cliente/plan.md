# Plano — Spec 197

## Contexto e premissas

Leitura feita em 25/09/2026 sobre `work/driver-app`. As premissas abaixo são conferidas na T0.1, antes
de qualquer código. Se alguma divergir, a execução para.

1. **Um só criador de parada.** `trip_stops` só recebe `INSERT` em `createStop`
   (`drizzle-trip-stop-reconciliation.support.ts:25-38`), chamado por `reconcileStopOnLink`. Os
   chamadores são quatro:
   - vínculo simples (`drizzle-trip.repository.ts:415`);
   - lote (`:510`);
   - revisão (`trip-document-review-link.support.ts:77`);
   - desvio de endereço (`drizzle-delivery-address-override.repository.ts:179`).

   A evidência da T205 da 153 (`specs/153-rota-escolhida-e-mapa-unico/evidence.md:1425-1460`) lista os
   mesmos pontos de escrita.

2. **Vincular é aceito em `draft`, `route_planned`, `separating`, `loading` e `loaded`, e recusado
   depois do despacho** (`checkTripAcceptsLinkage`, `trip-state.policy.ts:128-134`). A D9 distingue as
   duas primeiras fases das três seguintes.
3. **Locks.**
   - O vínculo trava `trips` com `FOR UPDATE` (`drizzle-trip.repository.ts:395`, `:467`).
   - O desvio de endereço trava só a linha de `trip_documents`
     (`drizzle-delivery-address-override.repository.ts:145`), não `trips`.
   - O desvio lê as precondições, status incluso, fora da transação
     (`override-delivery-address.use-case.ts:80`).
4. **O `address_key` é a chave do lugar em todo o sistema.** É a PK de `geocoded_addresses`
   (`geocoding.schema.ts:21-32`) e é lido por:
   - `trip-stop-coordinates.support.ts:27`;
   - o worker (`drizzle-route-optimization.repository.ts:490-501`);
   - `trip-fiscal-readiness.query.ts:138` (`count(distinct split_part(…))`, que não muda).

   O espelho de `trip_stops` no worker é `apps/worker-transportada/src/database/routing.schema.ts:125`.

5. **Fatos de campo pendurados na parada:**
   - `arrived_at` e `completed_at`;
   - `trip_stop_events` e `trip_stop_occurrences`, com FK `ON DELETE CASCADE` (`trip.schema.ts:~1036-1042`,
     `~1203-1209`) — apagar a parada apagaria o fato;
   - `trip_stop_location_suggestions` (195, FK `(company_id, stop_id)`);
   - `trip_stop_schedules`, sem FK (`delivery-client.schema.ts:283-309`), com `delivery_client_id` que
     nunca é escrito (`drizzle-trip-stop-schedule.repository.ts:63-92`);
   - `trip_delivery_proofs`, via `trip_stop_events`.

   As FKs de `trip_documents.stop_id` são `restrict` (`trip.schema.ts:704-714`).

6. **A 192 não está implementada.** Não há `stop_order_version`, `trip_stop_order_events` nem
   `stop-order` em `src`. Se ela estiver em `origin/staging` quando a 197 começar, a D9 e o comando sobem
   a versão pela `writeStopOrder` dela.
7. **O painel recusa chave desconhecida na parada** (`tripGuards.validation.ts:64-69`,
   `trip.constant.ts:234-253`). O app do motorista ignora (`driverTripResponse.validation.ts:133-151`).
8. **O ETA se desloca pelo atraso na chegada** (`report-stop-arrival.use-case.ts:154-167` →
   `resolveEtaShiftMilliseconds`, `eta-anchor.policy.ts:21-34` → `shiftPendingStops`,
   `drizzle-driver-field-report.repository.ts:282-305`).
9. **Comando na imagem de produção.** Só `src/cli/*` entra no `build` (`package.json:11`) e no
   `dist` da imagem (`Dockerfile:28-50`, `:34-35`). O precedente é `import-package-box-catalog.ts`
   (spec 162).
10. **O logger não redige campos por nome** (`src/logging/safe-logger.service.ts` só repassa; a única
    máscara é a de telefone, `phone-mask.policy.ts`). A proteção de `recipientKey` é não passá-lo ao
    logger, e isso é vigiado por contrato (CA09).

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`) — passo 1 (leituras)

| Arquivo                                                                                                                                          | Mudança                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/trips/infrastructure/nfe-destination-address.support.ts:64-96`, `:102-136`                                                                  | `leftJoin` próprio para o papel `recipient` (`taxId`, `legalName`, `tradeName`). O `innerJoin` com endereço fica para o destino físico.                                                                                                                                                                                             |
| `src/trips/domain/nfe-destination-choice.policy.ts:54-90`                                                                                        | `recipientName` sai do `dest`. `NfeDestinationChoice` ganha `recipient: StopRecipientIdentity \| null`.                                                                                                                                                                                                                             |
| `src/trips/infrastructure/drizzle-trip.repository.ts:1187-1214`                                                                                  | `recipientNamesOf(stopId)` ao lado de `labelOf`, sobre o mesmo `stopAddresses`.                                                                                                                                                                                                                                                     |
| `src/trips/application/trip.port.ts:155`, `src/trips/infrastructure/trip.mapper.ts:67`                                                           | `TripStopDetail.recipientNames`.                                                                                                                                                                                                                                                                                                    |
| `src/trips/infrastructure/trip-cargo-layout-input.support.ts:73`                                                                                 | `clientName` = nomes do `dest` da parada, juntados por " · ".                                                                                                                                                                                                                                                                       |
| `src/trips/domain/cargo-layout-label.policy.ts:84-87`                                                                                            | O `unplaced` ganha `clientName` (D14): com `documentId`, o `dest` da nota (o `UnplacedBox` do pacote é `{ count, documentId?, label, reason }`, `cargo-placement.policy.ts:155-164`); sem ele, a parada única do `label` ou as irmãs juntadas por " · ". Nunca pelo `label` quando há `documentId`, porque ele é igual entre irmãs. |
| `src/trips/application/find-current-driver-trip.use-case.ts:63-76`, `src/trips/infrastructure/drizzle-current-driver-trip.repository.ts:661-790` | `recipientNames` e `sameAddressStopIds`. `listDocuments` (`:687-735`) seleciona `tradeName` além de `legalName` (`:696`). ⚠️ Outra sessão corrige coordenadas neste arquivo: rebase antes.                                                                                                                                          |

### API — passo 3 (vínculo, ETA e comando)

| Arquivo                                                                                                                                                                                                                                            | Mudança                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/trips/domain/stop-recipient-key.ts` (novo)                                                                                                                                                                                                    | `buildStopRecipientKey`, `canonicalizeRecipientName`, `STOP_RECIPIENT_KEY_VERSION`. SHA-256 via `node:crypto`.                                                                                                                                                                                 |
| `src/trips/domain/trip-stop-key.ts` (novo)                                                                                                                                                                                                         | `buildTripStopKey` → `${addressKey}#${recipientKey}`, só em memória. `addressKeyOfTripStopKey` para o ranking da prévia: corta no **último** `#` (`normalizeAddressNumber` aceita `12#B`, `stop-address-key.ts:37-42`) e devolve `documento:${id}` inteiro.                                    |
| `src/trips/domain/sibling-eta.policy.ts` (novo)                                                                                                                                                                                                    | `resolveSiblingEtas({ placeEta, serviceSeconds[] })`, pura, usada pela API (composer, vínculo, comando).                                                                                                                                                                                       |
| `src/trips/domain/stop-address-key.ts:5-9`                                                                                                                                                                                                         | Comentário: a chave é do lugar; a parada é lugar + cliente (ADR-0082).                                                                                                                                                                                                                         |
| `src/trips/application/reconcile-trip-stops.use-case.ts`                                                                                                                                                                                           | Input com `recipient` e `tripStatus`. Port com `findStopByKey`, `findLegacyStopForRecipient` (D17), `assignRecipientKey` e `insertStopAfterSiblings` (D9, só `draft`/`route_planned`). `reconcileStopOnUnlink` não muda.                                                                       |
| `src/trips/infrastructure/drizzle-trip-stop-reconciliation.support.ts`                                                                                                                                                                             | Implementação do port. `insertStopAfterSiblings` estaciona as sequências seguintes com o offset de `writeStopOrder` (`drizzle-trip-route.repository.ts:370-389`) e reescreve. `INSERT` em SAVEPOINT; em `23505` no índice novo, volta ao SAVEPOINT, relê e loga `warn trip_stop_key_conflict`. |
| `src/trips/infrastructure/drizzle-trip.repository.ts:739-765`                                                                                                                                                                                      | `reconcileLinkedDocumentStop` passa a identidade do `dest` e o status travado.                                                                                                                                                                                                                 |
| `src/trips/infrastructure/drizzle-delivery-address-override.repository.ts:145`, `:179`                                                                                                                                                             | Hoje só trava `trip_documents` (`:145`). Passa a travar `trips` com o mesmo `FOR UPDATE` do vínculo antes de reconciliar, relê o status sob o lock (as precondições de `override-delivery-address.use-case.ts:80` são lidas fora) e passa a identidade.                                        |
| `src/trips/domain/cargo-preview.policy.ts:31-40`, `:48-59`, `:101`; `trip-cargo-preview.query.ts:74`; `trip-valuation.query.ts:161-164`; `trip-occupancy.support.ts:63`; `weight-concentration.policy.ts:14`; `preview-trip-cargo.use-case.ts:172` | Agrupamento por `buildTripStopKey`. `orderStopKeys` ranqueia pelo prefixo `addressKey` e desempata as irmãs pelo primeiro vínculo. O fallback `documento:${id}` fica.                                                                                                                          |
| `src/routing/infrastructure/trip-composer.adapter.ts:125-165`                                                                                                                                                                                      | Endereço → lista de paradas (D15). ETA de irmã pela `resolveSiblingEtas` (D13): (k−1) × tempo de parada padrão, uma por parada criada, `unknown` incluso.                                                                                                                                      |
| `src/trips/infrastructure/trip-status-event.persistence.ts` (`recordTripStatusChange`)                                                                                                                                                             | `recordTripStatusChange` zera `recipient_key` em `completed`/`cancelled` (D22), na mesma transação.                                                                                                                                                                                            |
| `src/trips/application/report-stop-arrival.use-case.ts:154-167`                                                                                                                                                                                    | `shiftPendingStopsByDelay` não roda quando outra parada da viagem com o mesmo `address_key` tem `arrived_at` e não tem `completed_at` (D13, CA10b). A consulta das irmãs roda na mesma transação.                                                                                              |
| `src/trips/infrastructure/trip-route-toll-freezer.factory.ts` (novo)                                                                                                                                                                               | `createTripRouteTollFreezer({ database, environment })`, extraído da closure de `main.ts:1921+`, com `requestCargoLayoutForTrip` e o lease. O `main` e o comando usam a mesma função.                                                                                                          |
| `src/routing/infrastructure/drizzle-route-suggestion.repository.ts`                                                                                                                                                                                | Escritor novo `markTripSuggestionsStale({ companyId, tripId })`, que passa só `queued`/`ready` a `stale`. Hoje nada escreve `stale`.                                                                                                                                                           |
| `src/cli/split-stops-by-recipient.ts`, `src/cli/unsplit-stops.ts` (novos)                                                                                                                                                                          | Entradas finas. O trabalho fica em `src/trips/application/split-stops-by-recipient.use-case.ts` e `unsplit-stops-by-recipient.use-case.ts` (novos) e em `src/trips/infrastructure/drizzle-stop-split.repository.ts` (novo).                                                                    |
| `package.json`                                                                                                                                                                                                                                     | `build` ganha `./src/cli/split-stops-by-recipient.ts ./src/cli/unsplit-stops.ts`. Testes novos nas listas `test` e `test:integration`.                                                                                                                                                         |
| `src/database/trip.schema.ts:546-630`                                                                                                                                                                                                              | `recipientKey`, CHECK, unique parcial e comentário da ADR-0082. Tabela `tripStopSplitRuns`.                                                                                                                                                                                                    |

### Worker (`apps/worker-transportada`) — passo 3

| Arquivo                                                                       | Mudança                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/routing/domain/place-grouping.policy.ts` (novo)                          | `groupStopsByPlace(stops)` → pontos do solver (peso somado, tempo de parada somado, `stopIds` em ordem de sequência). `expandPlaceSolution(order)` → paradas contíguas, 0 m / 0 s depois da primeira, ETA da irmã pela D13. |
| `src/routing/domain/stop-recipient-key.ts` (cópia por valor)                  | Só a canonicalização da identidade, para contar clientes no pool (RF14). Contrato de paridade no molde de `pool-address-key.ts`.                                                                                            |
| `src/routing/infrastructure/drizzle-route-optimization.repository.ts:488-560` | Usa o agrupamento (D10, RF13).                                                                                                                                                                                              |
| `:339-356`                                                                    | O `UPDATE` que grava `ready` ganha a guarda `where status in ('queued', 'running')`, para não ressuscitar sugestão vencida.                                                                                                 |
| `:873-903`, `:950-961`                                                        | Pool: tempo de parada do lugar = padrão × clientes distintos (RF14), `unknown` contando como um.                                                                                                                            |
| `src/database/routing.schema.ts:125`                                          | Não muda. O worker não lê `recipient_key`.                                                                                                                                                                                  |

### App do motorista (`apps/frontend-driver`) — passo 2

- `shared/driverTrip.types.ts:47-62` e `shared/driverTripResponse.validation.ts:133-151`: os dois campos.
- `shared/driverStopSiblings.service.ts` (novo, puro): resolve as sequências das irmãs e o texto do chip.
- `components/DriverStopCard.component.tsx:230-275` (cabeçalho do acordeão, depois de `8ba3e4b17` e
  `9ec97d683`): título, linha de endereço e chip. `:959`: prévia da ocorrência.
- `components/DriverLoadSheet.component.tsx:95-98`: romaneio.
- `locales/driverTrip.locale.json` e `.en`: `sameAddress_one`, `sameAddress_other` e `moreRecipients`.

### Painel (`apps/frontend-transportada`) — T0.2 e passo 2

- `shared/trip.constant.ts:234-241` (T0.2, primeiro push).
- `shared/trip.types.ts:370-391`; `components/TripStopList.component.tsx:310`, `:327`, `:335`.
- `components/TripRouteMap.component.tsx:98`, `:285`, `:307-308`.
- Caixa de fora: `components/TripCargoLayers.component.tsx`, `TripReviewQueue.component.tsx` e
  `shared/cargoPrintSummary.service.ts`.
- `locales/trip.locale.json:1347-1384` e `.en`.
- Módulo antigo `src/modules/driver-trip` (rota `/minha-viagem` de transição): só a tolerância do
  validador.

## Contratos/API/eventos

Todos aditivos. Nenhum campo sai.

```ts
// GET /trips/:id → data.stops[]
{ ...stopAtual, recipientNames: string[] } // [] quando nenhuma nota da parada tem dest com nome
// GET /trips/:id → data.cargoLayout.placement.unplaced[]
{ ...itemAtual, clientName: string }

// GET /me/trips/current → data.trips[].stops[]
{ ...stopAtual, recipientNames: string[], sameAddressStopIds: string[] }
```

- `recipientNames` são distintos, na ordem do primeiro vínculo: nome fantasia do `dest` ou, sem ele, a
  razão social.
- Nenhum evento novo.
- O comando não é rota HTTP:

  ```text
  railway ssh --service api -- bun apps/api-transportada/dist/cli/split-stops-by-recipient.js [--apply] [--company <uuid>]
  railway ssh --service api -- bun apps/api-transportada/dist/cli/unsplit-stops.js --run <runId>
  ```

## Dados, migration e rollback

Migration `drizzle/<timestamp>_trip_stop_recipient_key/`, uma só:

```sql
ALTER TABLE "trip_stops" ADD COLUMN "recipient_key" text;
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_recipient_key_check" CHECK (
  "recipient_key" IS NULL
  OR "recipient_key" = 'unknown'
  OR "recipient_key" ~ '^(doc|name):[0-9a-f]{64}$'
);
CREATE UNIQUE INDEX "trip_stops_company_trip_place_recipient_unique"
  ON "trip_stops" ("company_id", "trip_id", "address_key", "recipient_key")
  WHERE "recipient_key" IS NOT NULL;

CREATE TABLE "trip_stop_split_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_id" uuid NOT NULL REFERENCES "companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "trip_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "previous_stop_order" uuid[] NOT NULL,
  "moves" jsonb NOT NULL,           -- [{ documentId, fromStopId, toStopId }]
  "created_stop_ids" uuid[] NOT NULL,
  "keyed_stop_ids" uuid[] NOT NULL, -- paradas que só ganharam a chave (D16 a)
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "reverted_at" timestamptz,
  FOREIGN KEY ("company_id", "trip_id") REFERENCES "trips" ("company_id", "id") ON DELETE CASCADE,
  UNIQUE ("company_id", "trip_id", "run_id")
);
```

- **Aditiva.** Nenhuma coluna existente muda de tipo ou de nulidade, e a migration não reescreve dado.
  O backfill é o comando. A chave depende de `normalizeTaxId` e da canonicalização do nome, e
  reescrevê-las em SQL seria a "quarta grafia" que `drizzle-trip.repository.ts:1187-1191` já registra
  como defeito.
- **`rollback.sql`** aborta com `RAISE EXCEPTION` se existir linha em `trip_stop_split_runs` com
  `reverted_at IS NULL AND cardinality(created_stop_ids) > 0` **cuja viagem ainda esteja em `draft` ou
  `route_planned`**. Viagem que já avançou não bloqueia: o `unsplit` também a recusaria, e as paradas
  criadas viraram paradas antigas válidas. O molde é
  `20260805030010_trip_backfill_existing_manifests`. Sem essa linha, derruba o índice, o CHECK, a coluna
  e a tabela.
  - Paradas criadas pelo vínculo novo depois do deploy continuam válidas sem a coluna: viram paradas
    antigas no mesmo endereço, e o código anterior (`findStopByAddressKey` com `limit 1`) as aceita.
  - Isso fica escrito no cabeçalho do `rollback.sql`.
- `snapshot.json` gerado. `db:generate` devolve `no_changes`. Fecha com `make migration-test`.
- **Retenção.** `trip_stop_split_runs` guarda só ids e segue a viagem (cascade). `recipient_key` zera
  quando a viagem conclui ou é cancelada (D22).

## Segurança e tenant

**LGPD.**

- O documento do destinatário já está em claro em `nfe_participants.tax_id` (`nfe.schema.ts:368`),
  `delivery_clients.tax_id` e `client_delivery_addresses.client_tax_id` (084), no mesmo banco. A 197
  **não cria cópia do documento**.
- `recipient_key` é **pseudônimo fraco**. O `companyId` no texto hasheado é **separador de domínio,
  não sal**: impede que a mesma coluna case o mesmo cliente entre empresas, mas um CPF (~10⁹ valores)
  se reverte por enumeração em segundos para quem tem o banco. A coluna é **dado pessoal** e recebe o
  tratamento de `nfe_participants` (backup, acesso).
- **Por que o hash e não o documento canônico em claro**, como `client_delivery_addresses.client_tax_id`
  (084): a chave da parada não precisa ser lida por gente nem casada fora do servidor. O hash impede que
  a coluna vaze o documento em dump parcial, em planilha exportada ou em olho humano. Também
  impossibilita usar a coluna para buscar cliente, e isso é desejado.
- **HMAC com chave nova no ambiente** foi rejeitado na ADR-0082: protegeria só contra quem tem
  `trip_stops` sem as outras tabelas, custa variável nova no Railway, e a rotação partiria as paradas
  abertas.
- **A chave não sai do servidor.** Não há redação por campo no logger (premissa 10). A proteção é não
  passar `recipientKey` ao logger, nem a resposta, nem a fila:
  - contrato estático em `src/trips` e `src/cli`;
  - varredura dos corpos e logs (CA09).
- **Retenção:** a chave zera na conclusão ou no cancelamento (D22).
- Registro em `docs/SECURITY.md`.

**Nome do cliente** no app e no painel: o motorista e o escritório já veem `recipientName` por nota
(`drizzle-current-driver-trip.repository.ts:696`). Não há exposição nova.

**Tenant.**

- Toda consulta nova filtra `company_id`.
- `sameAddressStopIds` só olha paradas da mesma viagem.
- Contrato negativo em `test/trip-schema/tenant-safety.contract.ts` para as leituras novas.
- Integração do comando com duas empresas: uma nunca parte viagem de outra, e `--company` filtra.
- O comando loga só ids e contagens.

## Idempotência e concorrência

- **Vínculo e desvio.**
  - Todo caminho trava `trips` com `FOR UPDATE` antes de reconciliar. O desvio, que hoje trava só
    `trip_documents`, passa a travar `trips` e a reler o status sob o lock. Assim a corrida na mesma
    viagem deixa de existir.
  - O unique parcial é a invariante. O `INSERT` em SAVEPOINT relê em `23505` como defesa: é o sinal de
    um caminho novo que esqueceu o lock, e loga `warn`.
- **Comando.**
  - Uma transação por viagem, com o mesmo lock.
  - Status e fatos são reconferidos **depois** do lock.
  - Idempotente pela própria chave: parada com chave não é partida de novo, e grupo que já tem parada
    com chave recebe as notas em vez de criar outra.
- **Unsplit.**
  - Mesma transação e lock.
  - `SELECT … FROM trip_stops WHERE id = ANY(created) FOR UPDATE` antes de checar fatos.
  - Recusa conforme a RF12.
- **Efeitos depois da escrita** (comando e unsplit): o recongelamento da rota e o pedido da planta
  (pela `createTripRouteTollFreezer`, a mesma do `main`) e o vencimento das sugestões (só
  `queued`/`ready`) rodam depois do commit. Falha em um deles é `warn`, e a próxima leitura
  lazy da planta cobre.

## Observabilidade

- Log `info` do comando por viagem: `tripId`, `runId`, `keyed`, `split`, `created`, `movedDocuments`,
  `skippedReason`. Sem nome, sem documento, sem chave.
- Log `warn trip_stop_key_conflict` (só `tripId`) quando o unique pega corrida.
- Log `warn` quando o recongelamento pós-split falha.
- Nenhuma métrica nova.

## Estratégia de testes

**API.** Contratos, com o entrypoint de cada suíte:

- `test/trip-stops/recipient-key.contract.ts` (RF4), `reconcile-recipient.contract.ts` (D9, D17 com port
  falso), `sibling-eta.contract.ts` (D13), `preview-parity.contract.ts` (CA14, ordem inclusa) e
  `route-sibling-leg.contract.ts` (CA13) → entrypoint `test/trip-stops.contract.test.ts`.
- Formato de `GET /me/trips/current` com os campos novos → `test/driver-trip/current-trip.contract.ts`
  (entrypoint `test/driver-trip.contract.test.ts`).
- Formato de `GET /trips/:id` e da caixa de fora (duas irmãs, cada uma com uma caixa de fora, com e sem
  `documentId`) → a suíte de detalhe da área `trip-http` (entrypoint
  `test/trip-http.contract.test.ts`).
- Varredura do CA09 e contrato estático de logger → `test/trip-stops/recipient-key-exposure.contract.ts`.
- `trip-composer` com irmãs → caso novo em `test/integration/multi-vehicle-suggestion.integration.ts`,
  que já está na lista `test:integration`.
- Tenant: `test/trip-schema/tenant-safety.contract.ts` (entrypoint `test/trip-schema.contract.test.ts`).

**API.** Integração (Postgres). Cada arquivo novo entra **à mão** na lista `test:integration` do
`package.json`:

- `test/integration/trip-stop-recipient.integration.ts`: CA01–CA08, CA06b, CA10, CA10b, CA12, CA21;
- `test/integration/stop-split-command.integration.ts`: CA15, CA16–CA16e.

**API.** Migration: `test/database-migration/trip-stop-recipient-key.assertion.ts`, chamado de
`test/database-migration/database-migration.integration.ts` (CA17). O aceite é por `make migration-test`.

**API.** Os **dois** comandos de teste.

**Worker.**

- Contratos `test/routing/place-grouping.contract.ts` e `stop-recipient-key-parity.contract.ts` →
  entrypoint `test/routing.contract.test.ts`.
- Integração da sugestão com irmãs em `test/route-optimization-siblings.integration.test.ts` (na raiz de
  `test/`, no molde de `geocoded-route-optimization.integration.test.ts`), na lista `test:integration` do worker, rodada com
  `bun --env-file=../../.env.test run test:integration` de dentro de `apps/worker-transportada`.

**App do motorista.**

- Contratos de `driverStopSiblings.service.ts`, da validação aditiva e do cartão (texto) → entrypoint
  `test/driver-trip.contract.test.ts`.
- Smoke em `driver-app.smoke.spec.ts`.
- As fixtures com `label` ganham `recipientNames`.

**Painel.**

- Contrato do validador, `TripStopList` (texto), `resolveMarkerOffsets` com duas paradas no mesmo ponto
  e caixa de fora → entrypoint `test/trip.contract.test.ts`.
- `spec-181-prints.smoke.spec.ts:67-71`, cujo título muda.

## Riscos

| Risco                                                                                                                                                                       | Mitigação                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mais blocos de descarga no baú (114/118). Duas lojas no mesmo portão viram duas fronteiras de ordem, e "mais tardia não em cima da mais cedo" pode custar caixas desenhadas | T7.4 mede com a fixture de `test/cargo-volume/cargo-layout.contract.ts:21` (três paradas na ordem de entrega), duplicando o cliente de uma parada: volume desenhado antes e depois no `evidence.md`. Perda > 5%: parar e perguntar. |
| ETA inflado por irmã com o mesmo ETA                                                                                                                                        | D13 e CA10.                                                                                                                                                                                                                         |
| Divergência entre prévia e vínculo, em agrupamento ou em ordem                                                                                                              | Contrato de paridade do CA14, com `stopOrder` por `addressKey`.                                                                                                                                                                     |
| Parada antiga misturada convivendo com parada nova do mesmo endereço, na viagem em separação                                                                                | D17 reaproveita a antiga para o cliente que já está nela. O comando lista o que ficou. As viagens acabam em dias.                                                                                                                   |
| Despacho automático passa a travar por agendamento que antes se escondia                                                                                                    | É correção. A T8.3 avisa o usuário no relatório de publicação.                                                                                                                                                                      |
| Renumerar a sequência no vínculo muda o hash da planta e a ordem do painel                                                                                                  | Só em `draft`/`route_planned` (D9), onde isso já acontece a cada vínculo (153 D6 recalcula a rota).                                                                                                                                 |
| Hash do CPF é enumerável                                                                                                                                                    | Registrado como pseudônimo fraco e dado pessoal. Não sai do servidor e zera na conclusão.                                                                                                                                           |
| 192, 193, 195, 201 e a correção de coordenadas editam os mesmos arquivos (`DriverStopCard`, `drizzle-current-driver-trip.repository.ts`, `TripStopList`, `writeStopOrder`)  | T0.1 confere `origin/staging`. A que entrar depois faz rebase e reconfere os contratos da outra.                                                                                                                                    |
