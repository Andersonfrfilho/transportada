# Plano técnico — 265

## Contexto e premissas

Segue o trilho já usado em 070 (`aggregate-attachment.v1`) e 264 (`conversation-audio-transcription`):
a API grava o objeto e o evento de outbox na mesma transação; o relay publica no RabbitMQ; o worker
consome e processa. Premissas a conferir antes da T001: onde o corpo da rota do comprovante é lido
(`request-handler.service.ts`, `assertRequestSize`) e como o upload multipart chega ao
`attach-delivery-proof.use-case.ts`.

## Arquitetura e arquivos afetados

- **API** (`apps/api-transportada`): teto de corpo por rota em `api.constant.ts` +
  `request-handler.service.ts`; `attach-delivery-proof.use-case.ts` (variante `original`);
  `delivery-proof.policy.ts` (`PROOF_ORIGINAL_MAX_BYTES`); schema/migration das colunas de estado;
  repositório `drizzle-` com outbox na mesma transação; rotas de leitura expõem o estado.
- **Worker** (`apps/worker-transportada`): trilho novo `delivery-proof-processing` (processor, porta
  do leitor de objeto, `worker_thread` de redução, política de retry) e o `canhoto-read` passando a ler
  o original quando existir.
- **Driver** (`apps/frontend-driver`): orçamento de tempo em `proofPhotoReduction.service.ts`, envio da
  `variant`, estado "processando" em `proofUploadStatus.service.ts` e `ProofUploadStatus.component.tsx`.
- **Painel** (`apps/frontend-transportada`): estado do comprovante na viagem e na conferência.
- Nenhuma app importa código de outra; os tipos do contrato são copiados por valor (ADR-0075 §7).

## Contratos/API/eventos

- `POST /me/trips/current/documents/:documentId/proof`: multipart ganha o campo `variant`; resposta
  ganha `processingState`.
- Evento `delivery-proof-processing.v1`: `{ companyId, proofId, attachmentKey, variant, objectKey }`.
- Rota do robô para o worker gravar a versão leve e o estado (permissão própria, como
  `trip.canhoto-auto-review`).
- Publicar em etapas (ADR-0081 §9): painel tolerante ao estado novo → API → worker → app do motorista.

## Dados, migration e rollback

Colunas aditivas anuláveis em `trip_delivery_proofs`: `processing_state`, `original_object_id`,
`processing_error`. Rollback: o app volta a enviar só `reduced`; colunas ficam sem uso. Sem DROP.

## Segurança e tenant

`companyId` do contexto; MIME pelo conteúdo (magic bytes), não pelo cabeçalho; limite de pixels na
decodificação; original em bucket privado, URL assinada só no painel; nada de EXIF em log.

## Idempotência e concorrência

Chave do anexo no evento; o worker é no-op se o estado já é `ready`; reentrega do RabbitMQ segura.

## Observabilidade

Log `delivery_proof_processing` com `variant`, `originalBytes`, `reducedBytes`, `durationMs`,
`outcome`; reaproveita o diagnóstico 254 para o lado do aparelho (modelo incluído, PR #209).

## Estratégia de testes

Contrato antes da implementação (regra do repo): teto por rota na API; processor do worker com
imagem fixture grande; app com redução estourando o orçamento. Integração com Postgres para o
outbox na mesma transação. Smoke Playwright do estado "processando". Cada arquivo novo entra na lista
explícita do `package.json` da app.

## Riscos

- Original de 5-12 MB por foto aumenta storage e dados móveis; mitigado por retenção e por só subir
  quando a redução estourou.
- Decodificação de imagem grande no worker consome memória; mitigado por `worker_thread` e limite de
  pixels.
- Janela em que o painel vê o comprovante sem a versão leve; mitigado pelo estado `processing`.
