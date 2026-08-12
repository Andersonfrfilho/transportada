# Plano técnico

## Contexto e premissas

O trilho de emissão fiscal assíncrono já existe duas vezes — CT-e e MDF-e — e o desenho é o mesmo nos
dois: use-case grava tentativa, payload congelado, evento e linha de outbox **numa transação**; o
relay reivindica por lease e publica; o consumidor chama o gateway externo e faz write-back guardado
por status. A NFS-e é o terceiro trilho e não inventa desenho: copia o do MDF-e.

O cálculo do valor também já existe e é puro: `composeCharge` recebe base, componentes e snapshot da
regra de frete e devolve o total mais o detalhamento. Ele não conhece CT-e. A NFS-e o chama direto.

Três coisas são genuinamente novas: (1) o "provider" é uma API HTTP municipal, não um SDK SEFAZ;
(2) a autorização é assíncrona do lado do provedor, o que exige um estado `pending_authorization` e
reconciliação — CT-e e MDF-e não têm isso; (3) chega **PDF**, e hoje nenhum trilho arquiva PDF.

Premissas a confirmar antes da Fase B, com o token real em `GET /dados-cadastrais`: se a numeração de
RPS é da Nota RP ou do emitente, e quais CNAEs/atividades a inscrição municipal permite.

## Arquitetura e arquivos afetados

**API** (`apps/api-transportada/src/`)

- `database/nfse.schema.ts` (novo) + export no barrel `database/database.schema.ts`
- `database/storage.schema.ts` — `'nfse_document'` em `STORAGE_OBJECT_PURPOSES` e no `check`
- `nfse-profiles/` — perfil e credencial, 4 camadas
- `nfse-invoices/` — prévia, criação, listagem, cancelamento, download, 4 camadas
- `identity/domain/authorization.policy.ts` — `nfse.manage`, `nfse.issue`, `nfse.cancel`, `nfse.read`
- `cte-batches/domain/cte-batch-eligibility.policy.ts` — razão de bloqueio recíproca
- `main.ts` — repositórios, use-cases e rotas
- reuso sem alteração: `cte-profiles/domain/charge-composition.service.ts`,
  `freight-calculations/domain/freight-calculation-engine.service.ts`,
  `billing/infrastructure/invoice-document-archive.gateway.ts` (molde do download assinado)

**Worker** (`apps/worker-transportada/src/`)

- `messaging/nfse-rabbitmq-topology.ts`, `messaging/nfse-processing-envelope.schema.ts`
- `database/nfse-issuance-execution.schema.ts` + linhas novas em `database/processing.schema.ts`
- `nfse-issuance/{domain,application,infrastructure}/`
- `runtime/nfse-issuance-consumer.service.ts`, fiação em `main.ts`
- reuso sem alteração: `outbox/application/outbox-relay-loop.service.ts`,
  `storage/infrastructure/nfe-storage-gateway.ts`

**Cron** (`apps/cron-transportada/src/`)

- `nfse-status-pull/` + entrada em `job-registry.ts` e em `config/environment.schema.ts`

**Frontend** (`apps/frontend-transportada/src/`)

- `modules/nfse-invoice/` (novo), gatilho em `modules/nfe-workspace/components/NfeDocumentTable.component.tsx`,
  navegação em `main.tsx`, aba em `modules/company-settings/`

## Contratos, API e eventos

| Método  | Rota                                                     | Permissão            |
| ------- | -------------------------------------------------------- | -------------------- |
| POST    | `/nfse-service-invoices/preview`                         | `nfse.manage`        |
| POST    | `/nfse-service-invoices`                                 | `nfse.manage`        |
| GET     | `/nfse-service-invoices` · `/:id` · `/:id/documents`     | `nfse.read`          |
| POST    | `/nfse-service-invoices/:id/cancel`                      | `nfse.cancel`        |
| GET     | `/nfse-service-invoices/:id/xml` · `/:id/pdf`            | `nfse.read`          |
| GET/PUT | `/nfse-emission-profiles` · `/nfse-provider-credentials` | `settings.manage`    |
| POST    | `/public/nfse-callbacks/:token`                          | anônima, token opaco |

Eventos: `transportada.nfse.invoice.issue.requested` e `.cancel.requested`, envelope
`nfseProcessingEnvelopeV1Schema` (`z.strictObject`, `version: z.literal(1)`), trilho
`${QUEUE_PREFIX}.nfse-issuance.v1.{main,retry,dead}.{exchange,queue}`.

## Dados, migration e rollback

Uma migration aditiva, `<ts>_nfse_service_invoices`, criando as onze tabelas e alterando o check de
`stored_objects.purpose` (`DROP CONSTRAINT … , ADD CONSTRAINT …` no mesmo `ALTER TABLE`, precedente
`billing_invoice_events_name_check`). `rollback.sql` ao lado, guardado por `name` + `hash` com
`deleted_migrations <> 1`, sem `CASCADE`, drops em ordem reversa de dependência.

Chaves que sustentam as regras:

- `nfse_service_invoice_documents`: índice parcial único em `cancelled_at is null` — é o que impede a
  mesma NF-e em duas NFS-e ativas e o que libera a nota no cancelamento.
- `nfse_issuance_outbox`: índice `(company_id, published_at, next_attempt_at, created_at)` — é o que
  o `claimDueEntries` do relay percorre.
- Toda FK entre tabelas do módulo é composta por `(company_id, id)`.

## Segurança e tenant

- `companyId` sempre do contexto autenticado; a rota anônima de callback **não** tem contexto e por
  isso não escreve nada de negócio — só antecipa `next_status_check_at` da linha cujo token bateu,
  comparado com `timingSafeEqual` sobre `callback_token_sha256`, resposta 204 invariável.
- Token da Nota RP em `secret_envelope` (ADR-0004), AAD
  `transportada:nfse-credential:v1:${companyId}:${credentialId}`, plaintext zerado no `finally`.
- Nenhum log carrega token, payload fiscal ou dado do tomador; o gateway loga `code@path` de erro de
  parse, no molde do `deadLetterUndecodableMessage` do MDF-e.
- XML e PDF em bucket privado, entrega por URL assinada de vida curta.

## Idempotência e concorrência

Quatro camadas, todas já existentes no MDF-e: `idempotency-key` + fingerprint no request;
`nfse_processed_messages` `(company_id, consumer_name, event_id)` no consumidor; `UPDATE … WHERE
status IN <não-liquidados> RETURNING id` no write-back; `FOR UPDATE SKIP LOCKED` + lease no relay.
A reconciliação acrescenta a quinta: `onConflictDoNothing` no arquivamento, porque a consulta pode
rodar duas vezes sobre a mesma nota autorizada.

## Observabilidade

Eventos em `nfse_issuance_events` cobrindo `issue_requested`, `in_flight`, `accepted`,
`authorized`, `rejected`, `retry_scheduled`, `cancelled`, `failed`. Log estruturado com
`correlationId` em toda transição. Nota em `pending_authorization` há mais de N ciclos vira evento
`reconciliation_required` — o mesmo nome que o MDF-e usa quando o XML não veio.

## Estratégia de testes

Contrato antes da implementação, em toda task. Suítes novas na lista literal do `package.json` de
cada app. As que travam regressão de verdade:

- `nfse-schema/tenant-safety` — FK composta, ausência de coluna de segredo, timestamps UTC
- `nfse-description` — truncagem na fronteira da lista, variável desconhecida
- `nfse-selection` — agrupamento por tomador e bloqueio recíproco com CT-e
- `nota-rp-v2-client` — **HTTP 200 com `success:false` é falha**; `fetch` falso
- `nfse-outbox-relay`, `nfse-issuance-consumer`, `nfse-issuance-write-back` — moldes do MDF-e
- paridade de valor: a mesma seleção pela prévia de CT-e e pela de NFS-e dá o mesmo total

## Riscos

| Risco                                         | Mitigação                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Teto da `Discriminacao` na v2 não documentado | `description_max_length` no perfil, default 2000, com truncagem segura; medir com o token real antes de emitir em volume |
| v2 descontinuada quando RP migrar             | adaptador atrás da porta; reconferir `GET /api/v3/empresa/listar` antes da Fase E                                        |
| Numeração de RPS pelo emitente                | confirmar em `/dados-cadastrais` antes da Fase B; se for, entra escopo `nfse` em `fiscal_sequences`                      |
| Drift entre schema da API e cópia do worker   | as duas cópias na mesma task, sempre                                                                                     |
| PDF é caminho novo no storage                 | mime e purpose próprios, cobertos por contrato de schema                                                                 |
