## worker-transportada

Histórico completo e narrativas: `docs/ai-context/worker-transportada.md`.

RabbitMQ via `@adatechnology/rabbitmq-provider` — **sem BullMQ/Redis**. Topologias em
`src/messaging/`, cada trilho com main/retry/dead: `nfe-import.v1`, `nfe-distribution.v1`,
`cte-issuance.v1`, `aggregate-attachment.v1` (+ `synthetic.v1`, proibido em production). Padrão de
nome: `${QUEUE_PREFIX}.<rota>.v1.{main,retry,dead}.{exchange,queue}`.

Envelopes Zod versionados (`*-envelope.schema.ts`), backoff por política, idempotência via tabela
`processed_messages`, outbox relay (polling 1s, lease 30s) sobre `processing_outbox` e
`cte_issuance_outbox`.

Entrypoint `src/main.ts` → `startWorkerRuntime`. Cada consumer é `start*Consumer` em
`src/runtime/`, recebe `{config, logger, provider}` e devolve `{cancel()}`; a lógica fica em
`src/<contexto>/application/`. Dependências injetáveis via `WorkerRuntimeDependencies` — é assim que
os contract tests substituem RabbitMQ e banco.

**As rotinas agendadas são um registro, e ele é parcial de propósito.** `startJobRunConsumer` recebe
`routines: JobRoutineRegistry` (`Partial<Record<ScheduledJob, JobRoutine>>`); job sem rotina
registrada pousa em `job_run_routine_missing` e fecha como `unexpected_error`. Quatro registradas
hoje: `nfe.distribution.pull`, `nfse.status.pull`, `notification.schedules.run`, `fuel.price.pull` —
comportamento e invariantes de cada uma: detalhe em `docs/ai-context/worker-transportada.md` §
"rotinas agendadas".

## Invariantes que valem antes de editar

- **Trava contra `cStat 656` é `nfe_distribution_cursors.next_allowed_at`, por
  `(company_id, environment)` — nunca a cadência do agendador.** A distribuição assina com o
  certificado de **CT-e** (`NFE_DISTRIBUTION_CERTIFICATE_PURPOSE`); detalhe: docs/ai-context
  § "cStat 656".
- **O anexo do agregado é lido em `worker_thread`, e só ele** (ADR-0053) — `pdf.js` numa thread
  separada, `prefetch: 1` só nesse consumidor, `new Worker(url)` exige caminho de arquivo de
  verdade (`*.worker.ts` é entrypoint do `bun build`, coberto em
  `test/build-entrypoints.contract.test.ts`). Detalhe: docs/ai-context § "anexo do agregado".
- **Quem escolhe o mecanismo é a assinatura do arquivo; quem escolhe o mapa é o documento**
  (spec 071) — `document-extraction.gateway.ts` decide PDF (`%PDF`, `worker_thread`+pdf.js) vs
  imagem (`PNG`/`JPEG`, `tesseract-server`); dentro do PDF o mapa de campos vem do **título** do
  documento, nunca do tipo declarado pelo cliente. No OCR (imagem) é o inverso — o mapa vem do tipo
  declarado. Detalhe, inclusive o caso da CNH-e: docs/ai-context § "mecanismo e mapa".
- **OCR nunca volta ao formulário do candidato** — grava em `extracted_fields`, revisado pelo
  operador. Leitura que não reconhece nada grava `null` e fecha (resultado, não falha); só falha de
  parse e de banco recicla mensagem.
- **Schema Drizzle das tabelas consumidas é duplicado por cópia** no worker (quatorze arquivos em
  `src/database/`) e no cron (mais oito). Mudou tabela na API? confira as cópias — migrations só
  rodam na API.
- `FISCAL_ENVIRONMENT` (`homologation`|`production`, padrão `production`) só é lido pela
  reconciliação de NFS-e; a distribuição de NF-e usa o ambiente por empresa
  (`company_fiscal_profiles`).
