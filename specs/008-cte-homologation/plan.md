# Plano técnico — Homologação CT-e

## Contexto e premissas

- A feature `007-cte-batch` já entrega lotes, itens, eventos, submissão
  idempotente e UI de acompanhamento.
- A feature `004-company-fiscal-settings` fornece certificado, ambiente fiscal,
  série e numeração tenant-scoped.
- A feature `005-nfe-xml-import` fornece storage create-only, outbox,
  processed messages e workers idempotentes.
- A integração fiscal deve continuar encapsulada por gateway interno, dependendo
  apenas dos exports públicos de `@adatechnology/fiscal-provider`.

## Arquitetura e arquivos afetados

Bounded contexts previstos:

- `apps/api-transportada/src/cte-issuance/`
  - `domain/`
  - `application/`
  - `infrastructure/`
  - `presentation/`
- `apps/worker-transportada/src/cte-issuance/`
  - consumer de emissão;
  - gateway fiscal Ada;
  - persistência de attempts e documents;
  - integração com outbox/backoff.
- `apps/frontend-transportada/src/modules/cte-batch/`
  - extensão de timeline e status por item;
  - ação de reprocessamento quando permitido;
  - download seguro via URL temporária.
- Banco:
  - tabelas de tentativas CT-e;
  - documentos fiscais CT-e;
  - eventos de emissão por item;
  - registros de idempotência/reprocessamento.

## Contratos/API/eventos

APIs HTTP previstas:

- `POST /cte-batches/:id/issue`
- `POST /cte-batches/:id/items/:itemId/reprocess`
- `GET /cte-batches/:id/items/:itemId/issuance`
- `GET /cte-batches/:id/items/:itemId/documents`
- `POST /cte-fiscal/test-connection`

Eventos internos previstos:

- `cte.batch.issue.requested`
- `cte.item.issue.requested`
- `cte.item.issue.succeeded`
- `cte.item.issue.rejected`
- `cte.item.issue.failed`
- `cte.item.issue.retry-scheduled`
- `cte.item.reprocess.requested`

Contratos internos:

```ts
interface CteFiscalGateway {
  issue(input: IssueCteCommand): Promise<CteIssueOutcome>
  cancel(input: CancelCteCommand): Promise<CteCancelOutcome>
  testConnection(input: FiscalConnectionCommand): Promise<FiscalConnectionOutcome>
}
```

O contrato acima é interno da aplicação. A implementação adapta
`createFiscalProvider({ model: "cte", ... })`, `emit`, `cancel` e
`testConnection` conforme os tipos públicos instalados.

## Dados, migration e rollback

Tabelas propostas:

- `cte_issuance_attempts`
  - tenant, lote, item, tentativa, status, fingerprint, idempotency key,
    reservation id, erro classificado e correlation id.
- `cte_fiscal_documents`
  - tenant, item, chave CT-e, protocolo, ambiente, série, número, storage key,
    hash e metadados seguros.
- `cte_issuance_events`
  - eventos append-only por tentativa/item.
- `cte_retry_schedules`
  - backoff persistido, próxima execução e limite de tentativas, caso o worker
    atual não cubra esse recorte para CT-e.

Rollback:

- migration aditiva;
- rollback manual remove consumers/rotas primeiro, depois índices e tabelas
  novas na ordem inversa das FKs;
- documentos finais em storage não são removidos automaticamente por rollback;
- reconciliador deve preservar objetos finais e apenas limpar staging expirado.

## Segurança e tenant

- `companyId` sempre vem do contexto autenticado ou da mensagem criada pela API
  a partir desse contexto.
- Certificado A1 é aberto somente em memória no worker e nunca registrado.
- Request/response fiscal persistem versões sanitizadas, com XML completo apenas
  em object storage create-only.
- IDs cross-tenant e inexistentes retornam ausência segura.
- Permissões previstas:
  - `cte.submit` para solicitar emissão;
  - `cte.manage` para reprocessar e administrar lote;
  - `cte.read` ou permissão equivalente futura para consulta/download seguro.

## Idempotência e concorrência

- Reserva de número fiscal ocorre antes da chamada ao gateway e é vinculada ao
  item por transação.
- Tentativas usam fingerprint canônico do comando fiscal sanitizado.
- `processed_messages` impede reentrega de RabbitMQ de repetir efeito externo.
- A combinação `companyId + batchItemId + attemptKind + fingerprint` evita
  duplicidade lógica.
- Item autorizado é terminal para reprocessamento.
- Falha após emissão e antes de persistir storage entra em estado de reconciliação
  para não emitir novamente sem checar evidência já existente.

## Observabilidade

- Métricas por status: requested, in-flight, authorized, rejected, retried,
  failed, dlq.
- Logs com `companyId`, `batchId`, `itemId`, `attemptId`, `messageId` e
  `correlationId`, sem XML, senha, PFX, token ou certificado.
- Health/readiness do worker inclui dependências de DB, RabbitMQ, storage e
  gateway fiscal em modo degradado.
- Eventos append-only alimentam timeline no frontend.

## Estratégia de testes

- Contracts do gateway fiscal com fake provider e tipos públicos instalados.
- Contracts de schema/constraints para attempts, documents, idempotência,
  estado terminal e tenant.
- Contracts de aplicação para emissão, rejeição, retry, replay e reprocessamento.
- Contracts HTTP para RBAC antes do body, no-store, DTO strict e anti-enumeração.
- Contracts worker para ack após commit, redelivery, backoff e DLQ.
- Smoke frontend 375/768/1280 cobrindo autorização, rejeição, retry e usuário sem
  permissão.
- Gate final: `bun install --frozen-lockfile`, `make check`,
  `make migration-test`, smoke local gerenciado e revisão Sol.

## Riscos

- CT-e homologação real depende de certificado, UF e estabilidade da SEFAZ.
- Timeout com status desconhecido exige estratégia conservadora para evitar
  duplicidade fiscal.
- DACTE permanece fora até confirmar export público ou definir gerador próprio.
- Particularidades de CFOP, tomador, ICMS e UF podem exigir subtasks adicionais
  antes de produção.
- Storage indisponível após autorização exige estado de reconciliação bem testado.
