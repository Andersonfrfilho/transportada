# Plano técnico

## Contexto e premissas

O que já existe, medido no código — nada aqui precisa ser construído de novo:

| Peça                   | Onde                                                                                                                               | O que faz                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Veredito do canhoto    | `apps/api-transportada/src/trips/domain/canhoto-review-decision.policy.ts`                                                         | `resolveManualCanhotoReview` e `resolveAutomaticCanhotoReview`. **Toda** a regra da 220 mora aqui.               |
| Rota da conferência    | `.../presentation/canhoto-review.routes.ts`                                                                                        | `PATCH /trips/:id/documents/:documentId/proof/review`, `trip.manage`, aceita `approve` / `reject` / `automatic`. |
| Caso de uso            | `.../application/review-canhoto-proof.use-case.ts` + `canhoto-review.port.ts`                                                      | trava por `companyId`, aplica, grava trilha, relê a view.                                                        |
| Leitura do comprovante | `.../application/read-delivery-proof.use-case.ts`                                                                                  | `GET /trips/:id/documents/:documentId/proof`, `fleet.read`, já devolve miniatura e URL assinadas.                |
| Maço da viagem         | `apps/frontend-transportada/src/modules/trip/hooks/useTripDocumentSelection.hook.ts` + `components/TripStateActions.component.tsx` | seleção, ações em lote, aviso de exclusão, falha parcial que remarca só o que falhou.                            |
| Botão de uma nota      | `components/ProofReviewActions.component.tsx`                                                                                      | "Aprovar canhoto" / "Recusar canhoto" no painel aberto.                                                          |
| Leitura no navegador   | `shared/canhotoIdentification.service.ts`, `shared/canhotoReview.service.ts`, `hooks/useCanhotoReview.hook.ts`                     | zxing + Tesseract, chave de acesso Code-128 com DV mód. 11 e modelo 55.                                          |
| Rotina agendada        | `apps/cron-transportada/src/shared/job-catalog.constant.ts` (+ 3 cópias), `apps/worker-transportada/src/trip-location-purge/**`    | cron publica, worker consome em lotes com teto e `isStopRequested()`.                                            |
| Worker chamando a API  | `apps/worker-transportada/src/mdfe-auto-issue/infrastructure/automatic-manifest-api.gateway.ts`                                    | `client_credentials` + `x-company-id`, token em cache com margem.                                                |
| Escopo da automação    | `apps/api-transportada/src/identity/domain/authorization.policy.ts` (`automation`)                                                 | hoje `['mdfe.auto-issue', 'whatsapp.settle']` — ADR-0047 §4, uma permissão por automação.                        |

Premissa que sustenta o Grupo B: **o veredito não sai do servidor.** O worker é mais um leitor —
como o navegador é hoje — e não ganha o direito de aprovar. É o que mantém a 220 RF26 invariante
mesmo com um canal novo.

Premissa que sustenta o Grupo A: a conferência continua sendo humana. O diálogo existe para a
pessoa **ver** o canhoto; o lote é o atalho do clique, não da conferência. Daí a RF-A8.

## Arquitetura e arquivos afetados

### Grupo A — maço (API)

- `read-delivery-proof.use-case.ts`: `readDeliveryProofsByTrip` ao lado do que existe, com
  `documentIds?` e teto. A porta ganha `findByTrip`; o Drizzle filtra por `companyId` + `tripId`.
- `trip.routes.ts`: `GET /trips/:id/delivery-proofs`, `TRIP_FIELD_READ_POLICY` (o mesmo
  `fleet.read` da rota de uma nota). Serialização igual à existente **mais** `documentId`.
- ⚠️ As URLs assinadas saem por comprovante. Com quarenta comprovantes são quarenta assinaturas —
  HMAC local, sem rede, mas a task mede: se a assinatura chamar o storage, a rota passa a assinar
  só a miniatura e o original vira sob demanda.

### Grupo A — maço (frontend)

- `queries/useTripDeliveryProofs.query.ts` (novo): consulta por **viagem**, chaveada
  `[...tripKey, 'delivery-proofs-batch']`, `enabled` só com `trip.manage` **e** seleção não vazia —
  o detalhe da viagem não passa a buscar comprovante de graça.
- `shared/canhotoBatchSelection.service.ts` (novo, puro): da seleção + comprovantes, devolve
  `eligible` (canhoto `pending`), `excluded` (contagem) e os itens do diálogo. É a função que os
  contratos exercitam; o componente só desenha.
- `components/TripCanhotoBatchDialog.component.tsx` (novo): grid de itens (miniatura via
  `ProofImage`, número/série, leitura automática quando houver, caixa), rótulo com a contagem,
  resultado parcial.
- `components/TripStateActions.component.tsx`: mais um botão, no mesmo molde de
  `batchFieldDelivery` — `canhotoBatchSelection.length > 0` manda, e o aviso de exclusão usa a
  contagem já calculada.
- `hooks/useTripWorkspace.hook.ts`: `approveCanhotoBatch` percorre `canhotoReviewProof` (já no
  `tripClient.service.ts:1183`) e devolve `{ approved, failed, conflicted }`.
- `locales/trip.locale.json`: chaves novas sob `stateActions.batchCanhoto*` e
  `deliveryProof.canhotoBatch.*`.

### Grupo B — rotina (cron + worker + API)

- Catálogo: `trip.canhoto.read` nas **quatro** cópias (`apps/cron-transportada`,
  `apps/worker-transportada`, `apps/api-transportada` em `src/shared/job-catalog.constant.ts`, e
  `apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts`), com
  `failureOutcomes: ['object_unavailable', 'unsupported_media', 'too_large', 'decode_timeout', 'api_unreachable']`
  e `minimumIntervalSeconds: JOB_TICK_INTERVAL_SECONDS` (300 s — o canhoto chega durante o dia e a
  fila precisa estar curta quando o escritório abre; o teto por ciclo é o que segura o custo).
- `apps/worker-transportada/src/canhoto-read/` (novo), no molde de `trip-location-purge`:
  - `domain/canhoto-read.constant.ts` — teto de lote, teto de ciclo, teto de bytes, orçamento de ms.
  - `domain/canhoto-barcode.policy.ts` — chave de acesso: formato, DV mód. 11, modelo 55, e o
    casamento contra as notas da viagem. **Cópia por valor** de
    `canhotoIdentification.service.ts` (apps não importam código umas das outras), com contrato
    próprio sobre as mesmas chaves do fixture do frontend.
  - `infrastructure/canhoto-image-decoder.ts` — bytes → `{ width, height, luminance }`.
  - `infrastructure/canhoto-barcode.worker.ts` — `worker_thread` (ADR-0053).
  - `infrastructure/drizzle-pending-canhoto.query.ts` — comprovantes pendentes com `tripId`,
    `documentId`, `companyId`, `objectId` e as notas da viagem com chave de acesso. O caminho de
    junção, conferido no schema: `trip_delivery_proofs.stop_event_id` →
    `trip_stop_events.trip_document_id` → `trip_documents.{trip_id, nfe_document_id}` →
    `nfe_documents.{access_key, number, series}`. ⚠️ `trip_documents.nfe_document_id` é anulável —
    é a nota sem NF-e, que nunca aprova automático porque não há número para comparar.
  - `infrastructure/canhoto-review-api.gateway.ts` — `client_credentials` + `x-company-id`, decalque
    de `automatic-manifest-api.gateway.ts`.
  - `application/canhoto-read.routine.ts` — o laço com teto e `isStopRequested()`.
- `apps/api-transportada/src/trips/presentation/canhoto-review.routes.ts`: rota
  `PATCH .../proof/review/automatic`, política `{ permission: '<automação>', scope: 'company' }`,
  mesmo corpo do ramo `automatic` de hoje e **mesmo** caso de uso. A rota de gente continua
  aceitando `automatic` (o navegador não muda).
- `apps/api-transportada/src/identity/domain/authorization.policy.ts`: a permissão nova entra no
  vocabulário e **só** no papel `automation`.
- `realm/transportada-local-realm.json`: nada a mudar — a conta de serviço já tem
  `transportada-service` e o escopo vem da membership sintética.

## Contratos/API/eventos

```http
GET /trips/:id/delivery-proofs?documentIds=<uuid>,<uuid>   # fleet.read
200 { "data": [ { "documentId": "...", "id": "...", "kind": "photo",
                  "canhotoReview": "pending", "canhotoReadNumber": "12345",
                  "canhotoReadSource": "ocr", "thumbnailUrl": "...", "downloadUrl": "..." } ] }
```

```http
PATCH /trips/:id/documents/:documentId/proof/review        # trip.manage (gente, inalterada)
{ "action": "approve" }
{ "action": "reject", "reason": "illegible" }
{ "action": "automatic", "readDocumentId": "...", "readNumber": "...", "readSeries": "...", "readSource": "barcode" }

PATCH /trips/:id/documents/:documentId/proof/review/automatic   # permissão da automação (robô)
{ "readDocumentId": "...", "readNumber": "...", "readSeries": "...", "readSource": "barcode" }
```

A rota do robô **não** aceita `action`: o `.strict()` recusa, e o canal fica impossível de usar para
aprovar à mão. Resposta igual à da rota de gente (`CanhotoReviewView`).

Evento: `trip.canhoto.read` no envelope de job run que já existe. Nenhum evento de domínio novo.

## Dados, migration e rollback

Nenhuma coluna nova. **Uma** migration, e ela é obrigatória: `job_executions_job_check` e
`job_schedules_job_check` listam os nomes de rotina, então `trip.canhoto.read` só existe depois de
recriar as duas CHECK — o molde exato está em
`drizzle/20260915233000_rate_limit_windows/migration.sql` (DROP → ADD ... NOT VALID → VALIDATE),
seguido do `INSERT INTO "job_schedules"` da linha nova. `rollback.sql` desfaz na ordem inversa:
apaga a linha e volta as CHECK sem o nome novo. `make migration-test` fecha a task.

A mesma migration leva o **índice parcial da varredura**. `trip_delivery_proofs` tem três índices e
nenhum deles cobre `canhoto_review` (conferido no schema): sem o índice, a rotina faz varredura
sequencial na tabela que a execução de campo escreve o dia inteiro, de cinco em cinco minutos.

```sql
CREATE INDEX "trip_delivery_proofs_canhoto_pending_idx"
  ON "trip_delivery_proofs" ("company_id", "created_at")
  WHERE "kind" = 'photo' AND "canhoto_review" = 'pending' AND "canhoto_read_source" IS NULL;
```

Parcial de propósito: ele é do tamanho da fila, e **encolhe sozinho** conforme a rotina drena — o
índice desaparece quando não há o que ler, que é o estado normal.

## Segurança e tenant

- `companyId` sempre do contexto; o robô manda `x-company-id` e a API o valida contra a membership
  sintética (ADR-0047 §3) — nada de empresa derivada de payload.
- Permissão nova **só** no papel `automation`. O robô não ganha `trip.manage`: não separa, não
  carrega, não cancela, não aprova nem recusa à mão.
- `security.md` §1: nenhum byte de imagem, nome de recebedor, documento do recebedor ou número de
  nota em log. O ciclo loga `proofId`, `documentId`, `tripId`, `companyId` e contagens.
- Trilha: o ramo automático não grava `canhoto_review_by_user_id` (a política já crava `null`); a
  trilha da rotina é a do job execution, não auditoria de pessoa.
- Diálogo do maço: as URLs assinadas são de vida curta e não são guardadas em `localStorage`.

## Idempotência e concorrência

- **Rotina**: o filtro `canhoto_read_source IS NULL` é a idempotência — o que foi lido sai da
  varredura. Reenvio da mesma leitura cai em `unchanged` (220 RF27) e não gera trilha nova.
- **Veredito humano vence**: `resolveAutomaticCanhotoReview` devolve `unchanged` sobre origem
  `manual`. A rotina pode rodar durante a conferência sem risco de sobrescrever.
- **Maço**: aprovar é `PATCH` idempotente; repetir o mesmo veredito humano é `unchanged`, e trocar
  um veredito humano é 409 — que a tela trata como "já resolvido", não como falha (RF-A7).
- **Concorrência de lote**: as chamadas do lote vão em sequência, não em `Promise.all` — uma falha
  não pode descartar o resultado das outras (`code-standart.md` §15).
- A travessia do banco continua por `lockCanhotoProof` (`SELECT ... FOR UPDATE` por empresa + ids).

## Observabilidade

- Ciclo da rotina: `scanned`, `read`, `approved`, `pending`, e um contador por `failureOutcome`.
- Máscara de log do §11 do `code-standart.md`, com `source` da rotina.
- Sentry só no imprevisto — falha contada não é exceção.
- O diálogo do maço reporta o resultado parcial na tela (`{{failed}} de {{total}}`), no molde de
  `stateActions.batchReturnPartialFailure`.

## Estratégia de testes

Teste de aceite/contrato **antes** da implementação, em toda task.

- **API contrato** (`apps/api-transportada/test/`): a rota em lote (CA01), a rota do robô aceitando
  a permissão da automação e recusando token de gente e vice-versa (CA13), e o `.strict()` que
  recusa `action` no corpo do robô.
- **API integração** (`test/integration/*.integration.ts`, rodada com
  `bun --env-file=../../.env.test run test:integration`): leitura em lote sobre viagem semeada, e o
  caminho automático gravando veredito, leitura e trilha (CA10, CA11, CA12).
- **Worker contrato**: chave de acesso (formato, DV, modelo, casamento) sobre as **mesmas** chaves
  do `test/fixtures/canhotoBarcodeFrame.fixture.ts` do frontend; decodificação sobre um PNG
  sintético commitado (barra gerada no teste, sem foto real, sem PII); laço com teto, falha contada
  e `isStopRequested()` (CA14).
- **Cron/worker/API/frontend**: paridade do catálogo nos quatro `job-catalog` contracts.
- **Frontend contrato**: `canhotoBatchSelection.service.ts` (CA02–CA06, CA09) e o cliente do lote
  (CA07, CA08).
- **Log**: contrato que o ciclo não emite nome, documento nem bytes (CA15).
- ⚠️ Todo arquivo de teste novo entra na **lista explícita** do `package.json` da app.

## Riscos

1. **Decodificar imagem no servidor é dependência nova** (RNF4). Hoje nenhum app de backend decodifica
   imagem — `aggregate-attachment` manda imagem para um serviço de OCR por HTTP de propósito. A
   task de spike mede JPEG/PNG/WebP em Bun e no runtime do Railway antes de qualquer `bun add`. Se
   nenhuma opção fechar, o plano B é a leitura seguir no navegador disparada pelo diálogo do maço —
   e isso volta como pergunta ao usuário, não como decisão silenciosa.
2. **Custo por ciclo.** Quarenta fotos de canhoto por ciclo é CPU e banda. Teto de lote, teto de
   bytes e orçamento de ms existem para que o pior caso seja "ficou para o próximo ciclo".
3. **Cópia por valor da régua da chave de acesso** entre frontend e worker. O repositório já aceita
   a cópia (o catálogo de jobs é cópia em quatro apps), mas ela só é segura com o contrato sobre as
   mesmas chaves nos dois lados.
4. **Aprovar sem olhar.** O diálogo mitiga, a RF-A8 impede aprovar o que não apareceu, e a recusa
   continua sendo um a um. Se o uso mostrar que a pessoa aprova às cegas, o caminho é reduzir o teto
   de itens por diálogo — não remover a conferência.
5. **`main.ts` do worker e `TripStateActions`/`trip.locale.json` são arquivos disputados** por
   outras sessões: `git fetch && git rebase origin/staging` antes de abrir cada fase que os toca.
