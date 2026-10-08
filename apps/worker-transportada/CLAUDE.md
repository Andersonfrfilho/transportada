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
- **O feriado municipal fecha só a parada da cidade dele no roteirizador** — a janela do cliente é resolvida por
  `(cidade da parada, CNPJ)` (`drizzle-pool-window.query.ts`), nunca com os feriados de todo o roteiro. Detalhe:
  docs/ai-context § "O feriado municipal no roteirizador vale só para a parada da cidade dele".
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

- **A prévia da carga é lida e vinculada aqui** (spec 237, ADR-0094 §8) — trilho `cargo-preview.v1`,
  prefetch 1. A leitura roda numa `worker_thread` terminada em 10 s (`PREVIEW_PARSE_TIMEOUT`; o Bun
  ignora `resourceLimits`, o teto de memória são os tetos do leitor); reentrega de prévia já `processing`
  não relê; o vínculo tem 5 s por prévia e `statement_timeout` de 30 s; o objeto é achado pela linha,
  nunca pela mensagem, e acima de 960 KiB nem é baixado (revisão de segurança, ADR-0094 §8). O leitor e a política de vínculo da API estão em `src/cargo-receiving/domain/` por
  **cópia por valor idêntica** (contrato de paridade byte a byte): mudou lá, copie aqui. O vínculo toma a
  trava advisory do contratante (a mesma da API) e grava só o que mudou; item decidido pelo operador
  nunca é relido. **Toda nota nova pede a reavaliação** em `writeDocumentChildren`, num `SAVEPOINT` que
  nunca derruba nem espera a importação, coalescida e adiada 30 s. Detalhe: docs/ai-context § "A prévia
  da carga é lida e vinculada aqui".

- **A prévia também chega por e-mail encaminhado** (spec 237 T4.6/T4.7a/T4.7c/T4.7d, ADR-0094 §10) — ramo `previewIntake`
  (`src/cargo-preview-email/`) dentro de `contractor-mail-inbound.v1`, consultado **só quando nenhuma conversa casa**
  (**a conversa vence** se o e-mail traz os dois endereços); só entra a mensagem que casa o token de um perfil (hash em
  `contractor_receiving_profiles`, espaço distinto do das conversas), o resto segue o trilho da 143/183. Encaminhador e
  remetente original em listas **separadas** do perfil; DKIM só do encaminhador (o do contratante se perde:
  `docs/SECURITY.md`, 2026-10-06) e **`l=` nunca alinha** (vale para a conversa também). **O cabeçalho do MIME é medido
  antes de qualquer `dkimVerify`** (`mime-header-bounds.policy.ts`, regra de linha da `mailauth`: 64 KiB a seção, 2 KiB
  por campo que identifica — `from`, `sender`, `reply-to`, `return-path`, soma dos repetidos —, 8 KiB por destinatário e 16 KiB na
  soma deles, 8 KiB os outros, 8 `DKIM-Signature` e 3 `ARC-*`; nome de campo com espaço exótico antes do `:` recusa; o
  `addressparser` é quadrático e a `mailauth` faz um hasher por assinatura) — na conversa a mensagem hostil vira DKIM
  `absent`, sem anexos; a mensagem anexada que a prévia abre passa pela mesma barreira, e **a conversa não deixa o PostalMime
  abrir a `message/rfc822` aninhada** (`inbound-mail-parts.service.ts`): mais de 1000 linhas `--` recusa
  (`mime-part-bounds.policy.ts`) e as aninhadas abertas dividem um orçamento de 5. **O DKIM tem prazo de 15 s**
  (`DKIM_VERIFICATION_DEADLINE_MS`; estourou = `unverifiable`) e **o `From` do MIME tem de ser o `headerFrom` que a
  `mailauth` alinhou** (`verifyWithHeaderFrom`; divergência = `FORWARDER_FROM_MISMATCH`: o leitor de remetente exige o
  endereço literal no fim do valor, as aspas não escondem um segundo `<…>`). Janela por contratante com dois contadores
  pelo relógio do banco: 20 autenticados fecham download e DKIM (rastro `RATE_LIMITED`) — **autenticado é o que o
  encaminhador prova**: as seis recusas anteriores à lista do remetente original (`PREVIEW_EMAIL_UNPROVEN_REJECTIONS`) não
  contam, mesmo gravadas `aligned`; 100 recusas só param de **gravar** — a checagem barata continua e o encaminhador
  legítimo não fica trancado. DKIM sem veredito repete a entrega (só de assinatura **alinhada**; `d=` alheio com DNS mudo é
  `not_aligned`) e só a última grava `FORWARDER_DKIM_UNVERIFIABLE`; **a conversa só grava `aligned` com o `From` assinado
  igual ao remetente gravado** (`conversation-sender-identity.policy.ts`); o MIME da mensagem é de quem a registrou (reentrega descarta só a
  planilha da tentativa). Anexo com o teto e o critério do upload; recusa vira linha em `cargo_preview_email_intakes`
  (só código), sem corpo nem eco. O token do endereço é **gerado pela API** (T4.6b, 26 base32 de `getRandomValues`) com a mesma política de hash
  deste ramo — `test/cargo-preview-email/parity.contract.ts` cobra o padrão, o propósito e a expressão do hash dos dois lados. A criação da prévia é **cópia por valor** do upload da API
  (`preview-upload-file.policy.ts`, paridade nos dois sentidos). A planilha nunca é aberta aqui. Detalhe:
  docs/ai-context § "A prévia por e-mail encaminhado".

- **A retenção da planilha é rotina daqui** (spec 237 T4.8, ADR-0094 §11) — `cargo-preview.retention.apply`, diária:
  90 dias depois de a prévia (`ready`/`failed`) ficar **sem item em aberto**, apaga do bucket a planilha e o MIME
  bruto do e-mail encaminhado, marca `stored_objects` como `deleted` (nunca apaga a linha, nunca anula
  `raw_object_id`) e anula `recipient_name`, `address`, `neighborhood`, `postal_code` dos itens. O marcador é o
  evento `retention_applied` (sem coluna nova); uma transação por prévia, bytes **antes** de qualquer escrita,
  trava do contratante sem esperar. Prévia com item em aberto nunca é tocada. `CARGO_PREVIEW_RETENTION_DAYS` é
  cópia byte a byte da API. Detalhe: docs/ai-context § "A retenção de 90 dias dos dados da planilha".

## O expurgo de posição (spec 196, ADR-0081)

`trip.location.purge` (`trip-location-purge/`) varre **as cinco tabelas** de evento com ponto, uma por vez e
com teto de lotes por tabela, apaga `latitude`, `longitude`, `accuracy_meters` e `captured_at` pelo prazo da empresa e
marca `location_state = 'expired'`, preservando o evento; os pings ao vivo têm corte próprio (36 h) e **rodam sempre**. ⚠️ Quem liga o expurgo das
cinco tabelas é a **empresa, na tela** (spec 239): o worker lê `company_location_retention_settings` a cada ciclo, num
`UPDATE` único com `CROSS JOIN LATERAL` por tabela, e cada empresa vale pelo próprio prazo (30–90 dias) depois da
carência de 24 h. Sem linha ou desligada, nada é apagado; não existe variável de ambiente (`TRIP_LOCATION_PURGE_ENABLED`
saiu e, se sobrar no Railway, é ignorada). O log conta linhas por tabela e `companies`, nunca coordenada, evento ou pessoa. Detalhe:
docs/ai-context/worker-transportada.md § "O expurgo de posição".
