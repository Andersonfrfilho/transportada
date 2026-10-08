# Plano — Spec 256

## Contexto

- Na 253 o PDF sai por `GET /v1/trip-document-report/proofs-pdf`
  (`trip-document-report.routes.ts`), montado por `trip-proof-pdf.gateway.ts` com `bufferPages: true` e
  `Buffer.concat`, e embrulhado em stream de um chunk só. Teto 200
  (`TRIP_PROOF_REPORT_MAX_DOCUMENTS` em `trip-report.constant.ts`).
- A rota é GET porque `TRIP_FIELD_READ_POLICY` usa `anyPermission`, que o roteador só aceita em GET;
  por isso os ids viajam na URL (≤ 100).
- O worker (`apps/worker-transportada`) consome RabbitMQ com outbox relay, **não** tem `pdfkit` e não
  tem upload por stream no gateway de storage da API (`nfe-storage-gateway.ts:66-77` só tem `put` de
  buffer). Molde assíncrono: spec 237 (cargo-preview) — API grava trabalho + outbox na mesma transação,
  worker consome, `Idempotency-Key`, URL assinada (`createSignedDownload`, 5 min), purga por retenção
  (`cargo-preview-retention`).
- Nenhuma app importa código-fonte de outra: layout e desenho do PDF precisam **existir no worker**.

## Desenho

```
Painel ──POST /v1/trip-proof-exports (filtros, Idempotency-Key)──► API
                                                  │ valida, resolve ids (≤ 1000), grava job + outbox
                                                  ▼
                                    RabbitMQ (fila trip-proof-export)
                                                  ▼
Painel ◄── GET :id a cada 2 s ──── API ◄── progresso ── Worker
   │                                                      │ passe 1: mede imagens e páginas
   │ GET :id/download-url (5 min)                         │ passe 2: desenha em fluxo → arquivo temporário
   └────────────────► bucket privado ◄── upload ──────────┘ (rodapé por página, cancelamento entre blocos)
```

1. **Dados** (API, migration aditiva): tabela `trip_proof_exports` (`id`, `company_id`,
   `requested_by`, `idempotency_key`, `request_hash`, `status` VARCHAR, `document_ids` jsonb,
   `can_read_financials`, `total_blocks`, `rendered_blocks`, `unavailable_blocks`, `total_pages`,
   `object_id` (→ `stored_objects`), `failure_code`, `cancel_requested_at`, `heartbeat_at`,
   `created_at`, `expires_at`). Índice único `(company_id, requested_by, idempotency_key)`. Sem ENUM
   nativo, PK UUID. Colunas de dimensão da imagem (largura, altura, orientação) no canhoto, aditivas e
   anuláveis, preenchidas no upload e de forma preguiçosa pelo trabalho (decisão 🧠).
2. **API** (`apps/api-transportada/src/trips/`): `trip-proof-export.schema.ts` (Zod),
   `create-trip-proof-export.use-case.ts` (idempotência, teto, limites de abertos, outbox),
   `get-trip-proof-export`, `list-trip-proof-exports`, `cancel-trip-proof-export` e
   `get-trip-proof-export-download-url` (todos filtrando por `requested_by`; 404 para não-dono),
   rotas em `trip-proof-export.routes.ts`, erros em `trip.error.ts`. Permissão `trip.proof-export`
   (realm versionado) no `POST`; leituras sob a mesma permissão. Rate limit 10/300 s no `POST` e
   120/300 s nas leituras.
3. **Worker** (`apps/worker-transportada/src/trip-proof-export/`): consumidor com `prefetch 1`,
   `trip-proof-page.layout.ts` e `trip-proof-pdf.renderer.ts` copiados por valor da API, leitura das
   informações por consulta própria (`company_id` + `canReadFinancials` do trabalho), `pdfkit` sem
   `bufferPages`, dois passes, arquivo temporário e upload do bucket por fluxo/multipart (ou, se o
   storage não aceitar, upload em partes — ver Fase 0). Progresso a cada 25 blocos ou 2 s; cancelamento
   checado entre blocos; 3 tentativas por imagem e depois "Imagem indisponível". Purga em
   `trip-proof-export-retention` (a cada hora; 24 h; presos > 30 min viram `failed`).
4. **Front** (`modules/trip/`): `tripProofExport.service.ts`, `useTripProofExport.hook.ts` (TanStack
   Query: mutation + polling de 2 s enquanto não terminal), `TripProofExportPanel.component.tsx`
   (progresso `aria-live`, cancelar, baixar) e `TripProofExportList.component.tsx` (recentes). O botão
   da 253 passa a criar o trabalho; download por navegação direta à URL assinada.
5. **Aposentadoria** (RF12): quando a 256 chegar à produção, sai `GET .../proofs-pdf` e tudo o que só
   ele usa. Registrar no `docs/ai-context/api-transportada.md`.

## Um PDF só: o que isso exige

- O arquivo cresce com o número de fotos. `pdfkit` embute JPEG como está (sem reamostrar), então 1000
  fotos de câmera de celular podem passar de 1 GB. **Fase 0 mede** (tamanho médio e p95 das fotos em
  staging, tamanho do PDF de 100/500/1000 canhotos, pico de memória do worker). Se passar do alvo
  (**≤ 200 MB**), a decisão 🧠 é reamostrar no passe 2 (largura útil ~ 1600 px) com biblioteca
  compatível com Bun, ou baixar o teto. Isso define o teto final (1000 → 500 ou → 2000).
- Upload de arquivo grande: o gateway atual só tem `put` de buffer. Se o storage S3-compatível aceitar
  multipart, usar; senão, aumentar o gateway **no worker** (não na API) com upload em partes.

## Riscos

- **Paridade de layout** API ↔ worker enquanto o GET existir: mitigada por contrato que compara
  páginas/posições de um conjunto fixo de blocos nas duas implementações; some com o RF12.
- **Dado pessoal na fila/trabalho**: o trabalho guarda só ids; o worker lê tudo por `company_id`.
- **Worker preso**: `prefetch 1`, `heartbeat_at` e tempo máximo; a purga marca `failed`.
- **Teto de abertos** evita um usuário esgotar o worker: 2 por usuário, 5 por empresa.
- **Cancelamento** entre blocos: no pior caso termina o bloco atual (≤ 1 imagem).
- **Permissão nova no realm**: alteração versionada em `realm/`; exige passar pelo processo de deploy
  do Keycloak (parar e perguntar antes de aplicar).

## Contrato HTTP

`POST /v1/trip-proof-exports` · header `Idempotency-Key` · body `{ filters }` (mesmos campos da 253:
`documentIdIn`, `tripIdIn`, `statusIn`, `vehicleIdIn`, `driverIdIn`, `createdFrom`, `createdUntil`,
`proofPendingEq`, `search`, `contractorIdIn`, `recipientCityIn`, `recipientStateIn`, `valueOperator`,
`valueAmount`, `documentStatusIn`) → 202 `{ data: { id, status, totalBlocks } }`.
`GET /v1/trip-proof-exports/:id` · `GET /v1/trip-proof-exports` · `GET /v1/trip-proof-exports/:id/download-url`
→ `{ data: { url, expiresAt } }` · `DELETE /v1/trip-proof-exports/:id` → 204.
Envelope `{ data }` / `{ error: { code, message } }`. Esta API não tem OpenAPI: sem Scalar.

## Decisões 🧠 que as demais tasks herdam

1. Permissão `trip.proof-export` e quais papéis a recebem.
2. O trabalho persiste só ids + `canReadFinancials`.
3. Colunas de dimensão no canhoto e política de preenchimento.
4. Layout/desenho copiados por valor no worker, com contrato de paridade.
5. Dono do trabalho é a pessoa (BOLA), não a empresa.
6. Estratégia de tamanho do arquivo único (reamostrar × teto) e de upload (multipart × partes) — saem
   da Fase 0 e viram ADR.
