# Tasks — Feature 179

Uma task por vez. Cada uma fecha com typecheck + lint + teste da app tocada + commit isolado, e
evidência em `evidence.md`.

⚠️ **23/09 — desfeita a duplicação com as specs 164 e 161** (`duplicacao.md`). As tasks antigas
T204/T205/T206 recriavam devolução ao barracão (já resolvida pela spec 164,
`redelivery_policy`/`returned_to_warehouse`) e miniatura (já entregue pela spec 161,
`trip_document_occurrence_attachments.thumbnail_object_id`). Foram removidas daqui, e a coluna
`returns_to_depot` saiu do banco. O que sobra desta spec é só a exigência de comprovante e o upload
direto ao storage.

## Fase 1 — O tipo declara a exigência ✅ concluída

> 🤖 Modelo: `sonnet`

- **T101** ✅ Teste de contrato: `company_occurrence_types` aceita `attachmentMode`, e o valor
  omitido vira `off`. (CA07, CA08)
- **T102** ✅ Migration aditiva: coluna `attachment_mode varchar(16) not null default 'off'` com
  CHECK `in ('off','optional','required')`, mais `rollback.sql` com chave própria e `GET
DIAGNOSTICS ROW_COUNT`. `make migration-test` verde.
- **T103** ✅ Schema, repositório e use-case de salvar tipo passam a ler e gravar o campo. (CA01)

## Fase 2 — A API aceita e exige

> 🤖 Modelo: `sonnet` (T203 é 🧠 — o parecer do `architect` está em `architecture-review.md`)

- **T200** ✅ A rota de ocorrência do motorista ganha **chave de idempotência**, que hoje ela não
  tinha — `/deliver` e `/return` já liam a chave, esta não. (RF9)
- **T201** ✅ Teste de contrato: emitir URL assinada de upload valida tipo (imagem ou PDF) e
  tamanho, e a rota da ocorrência recusa objeto que não existe, não é da empresa ou não veio desta
  viagem. (RF2a, RF2b)
- **T202** ✅ Upload direto ao storage por URL assinada de vida curta: rota que emite a URL e
  conferência do objeto ao confirmar (`confirm-occurrence-upload.use-case.ts`), gravando em
  `stored_objects` — a mesma tabela que o multipart do escritório já usa, sem tabela paralela de
  anexo. A rota da ocorrência **continua JSON** — o arquivo não passa pela API (RF2).
- **T203** ✅ `register-driver-occurrence.use-case.ts` recusa tipo `required` sem anexo ou sem
  `note`, com dois erros de domínio próprios e códigos estáveis em `trip.error.ts`
  (`TRIP_OCCURRENCE_ATTACHMENT_REQUIRED`/`TRIP_OCCURRENCE_NOTE_REQUIRED` — este repositório não tem
  `shared/errors/codes.ts`, o padrão real é classe `ApiError` por erro em `domain/trip.error.ts`, e
  T203 seguiu ele). Ao gravar, resolve o upload confirmado (`resolveOccurrenceUploadAttachment`) e
  passa o id resolvido para `saveDocumentOccurrence`, que grava em
  `trip_document_occurrences.attachment_object_id` — **não** em
  `trip_document_occurrence_attachments`. Essa tabela é do galpão (`stage = 'separation'`, spec 161);
  `attach-occurrence-photo.use-case.ts` recusa qualquer ocorrência que não seja dessa etapa, e o
  comentário de `trip.schema.ts` já registra que a coluna direta "continua servindo a ocorrência de
  rua" e que a tabela nova "nunca é escrita por aquele canal". A coluna direta já é o caminho que o
  escritório lê (CA06, `listDocumentOccurrenceAttachmentLocations` cai para ela quando não há linha
  na tabela nova) e já tinha FK provada contra Postgres real
  (`trip-occurrence-attachment.integration.ts`). Detalhe completo em `evidence.md`. A escrita
  continua **única**, dentro do `unitOfWork.execute` + `withFieldReport` que a T200 já tinha montado
  — não precisou de unit of work nova. (CA02, CA03, RF3)

## Fase 3 — O motorista tira a foto

> 🤖 Modelo: `sonnet`

- **T301** Teste de contrato da tela: tipo `required` sem foto ou sem motivo não habilita o envio, e
  a mensagem diz qual dos dois falta. (CA04)
- **T302** Captura da imagem na tela de ocorrência, com o caminho de galeria quando a câmera é
  negada, e os mesmos limites de tamanho e tipo do comprovante de entrega.
- **T303** A fila offline carrega a imagem junto do corpo; a tela distingue "na fila" de "enviado".
  Smoke cobrindo o caminho sem sinal. (CA05, RF5)

## Fase 4 — O painel e o fechamento

> 🤖 Modelo: `sonnet` (T402 é 🧠 — revisão de design com print)

- **T401** O editor de tipos de ocorrência oferece a marca de comprovante obrigatório, em pt-BR e
  en. (CA01, RF10)
- **T402** 🧠 Revisão de design e usabilidade com print, em 375px e no desktop (web.md §15). (CA09)

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/179-a-recusa-sai-com-foto/ (leia spec.md, plan.md,
tasks.md e duplicacao.md antes de começar — a devolução ao barracão e a miniatura são das specs 164
e 161, não desta). Uma task por vez, na ordem do tasks.md, a partir de T203 (Fase 1 e T200-T202 já
concluídas).
Modelos: Fase 2 (T203) → executor model=sonnet, valida com architect em opus antes de escrever
código · Fase 3 → executor model=sonnet · Fase 4 → executor model=sonnet, T402 🧠 revisão de design
com print · revisão final → code-reviewer model=opus.
Teste de contrato antes da implementação. Cada task fecha com typecheck + lint + teste da app
tocada + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION].
```
