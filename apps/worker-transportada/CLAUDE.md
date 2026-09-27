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
registrada pousa em `job_run_routine_missing` e fecha como `unexpected_error`. A lista de quem está
registrado é o objeto `routines:` de `src/main.ts` — não se conta aqui, porque envelhece; parte
delas só entra quando a instalação declara a configuração (`geocoding.refine`,
`identity.document.backfill`, `fuel.price.pull`). Comportamento e invariantes de cada uma: detalhe
em `docs/ai-context/worker-transportada.md` § "rotinas agendadas".

## Invariantes que valem antes de editar

- **E-mail sai só daqui** (16/09/2026). Convite, recuperação de senha e notificação passam por
  `createWorkerEmailDriver` (`notification/infrastructure/email-driver.factory.ts`): com
  `RESEND_API_KEY` vai pela API HTTPS do Resend; sem ela, pelo `SMTP_URL` (Mailpit local).
  `EMAIL_FROM` exige um transporte e vice-versa. A API não guarda credencial de e-mail — só
  `EMAIL_CHANNEL_ENABLED`, que anuncia o canal no fan-out. Falha de entrega loga `errorCode`/`outcome`
  do provedor (`readDeliveryFailure`), nunca a mensagem: em produção o SMTP falhava com o log dizendo
  só o canal.
- **Status de nota só muda pela política `nfe-document-status-transition.policy.ts`, com lock por `(company_id, access_key)`, nunca rebaixa** — `cancelled` e `denied` são terminais. Eventos `110111`/`110112` com `cStat` em `{135, 136, 155}` cancelam — **só vindos da distribuição** (evento de upload é gravado, mas não muda status, D21); resumo `cSitNFe '2'` cancela, `'3'` denega apenas de `unsigned`. O lock é `pg_advisory_xact_lock(hashtextextended('nfe-document-status:<empresa>:<chave>', 0))`, tomado antes de toda leitura/escrita de status ou evento da chave. `updated_at` só se move quando o status muda (UPDATE retorna 1 linha). Detalhe: spec 149 (D1–D9, D14–D18), `t3-parecer-architect.md` (A1–A7).
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
- **A planta do baú é calculada aqui** (ADR-0063, spec 145) — consumidor `CargoLayoutConsumer`
  reclama pedidos por hash, executa `@adatechnology/cargo-placement` em `new Worker()` com orçamento
  `CARGO_LAYOUT_TIME_BUDGET_MS` (padrão 120s, escada 120/240/480 em retry), prefetch 1, schema estrito
  da coluna `input` que **deve** acompanhar `StoredCargoLayoutInput` da API (campo novo na API sem
  sync vira `failed` no decode Zod). Tabela `trip_cargo_layouts`, outbox `trip_cargo_layout_outbox`,
  reivindicação nula/hash superado → ack; lease em `updated_at` para recuperar `running` órfão. Detalhe:
  docs/ai-context § "A planta sai do event loop", ADR-0063 §1–7, spec 145 T7–T9.
- **Sem origem configurada, o barracão do solver é o endereço fiscal da empresa** (spec 097 D7):
  `resolveDepotOrigin` é cópia por valor da API com contrato de paridade, e a fila do
  `geocoding.backfill` inclui `company_fiscal_profiles`. Detalhe: docs/ai-context § "O barracão sem
  configuração".
- **A importação grava `nfe_package_boxes.carton_gtin`** (fiscal-provider 0.3.2): `cEAN` vence,
  `cEANTrib` só com o `cEAN` ausente, dígito GS1 conferido e DUN-14 reduzido a GTIN-13 por
  `carton-gtin.policy.ts` — cópia por valor de `reduceToGtin13` da API, com contrato de paridade.
  Inválido ou "SEM GTIN" fica nulo; linha existente só ganha GTIN onde é nulo, nunca troca o
  gravado nem a medição. Caixas antigas: `backfill:nfe-package-box-gtin` (dry-run padrão,
  `--confirm` grava, `--company-id=` restringe); no contêiner, o mesmo arquivo em
  `dist/nfe-imports/`.
- `FISCAL_ENVIRONMENT` (`homologation`|`production`, padrão `production`) só é lido pela
  reconciliação de NFS-e; a distribuição de NF-e usa o ambiente por empresa
  (`company_fiscal_profiles`).
- **O e-mail à contratante sai num único envio com todos os destinatários no `to`, nunca
  `toAddresses[0]`** — teto `CONTRACTOR_MAIL_MAX_RECIPIENTS = 50`, cópia por valor da API com
  contrato de paridade (spec 150 T302). Detalhe: docs/ai-context § "O e-mail à contratante sai para
  todos os destinatários".
- **A limpeza do limitador de taxa (`rate_limit_windows`) é rotina daqui, não da API nem do cron**
  (spec 150 T406) — `rate-limit.window.purge` apaga janela com mais de 48 h. Detalhe: docs/ai-context
  § "A limpeza do limitador de taxa é rotina do worker".
- **A conversa da ocorrência (spec 183) tem três partes aqui:**
  - **E-mail recebido vira mensagem da conversa**, com os anexos conferidos pelos bytes: até 5, sem
    a parte `inline`, MIME até 25 MB. O objeto sobe antes da transação e é descartado quando ela
    falha. O `From` e o `dkim_result` são gravados como chegaram; **quem decide a identidade é a
    leitura da API**, e só com DKIM alinhado (T903, S2).
  - **O e-mail enviado leva os anexos da conversa.** Anexo sumido, apagado (`status = 'deleted'`) ou
    com sha256 divergente é falha permanente, **nunca envio sem o arquivo** (T903, F1).
  - **O pedido de upload vencido sai do bucket e fecha como `expired`.** É a mesma unidade da spec
    179, com `skip locked`.
  - A política de anexo e a de status são cópias por valor da API, com contrato de paridade.
  - Detalhe: docs/ai-context § "A ocorrência tem duas conversas".
