## worker-transportada

RabbitMQ via `@adatechnology/rabbitmq-provider` — **sem BullMQ/Redis**. Topologias em
`src/messaging/`, cada trilho com main/retry/dead: `nfe-import.v1`, `nfe-distribution.v1`,
`cte-issuance.v1`, `aggregate-attachment.v1` (+ `synthetic.v1`, proibido em production). Padrão de nome:
`${QUEUE_PREFIX}.<rota>.v1.{main,retry,dead}.{exchange,queue}`.

Envelopes Zod versionados (`*-envelope.schema.ts`), backoff por política, idempotência via tabela
`processed_messages`, outbox relay (polling 1s, lease 30s) sobre `processing_outbox` e
`cte_issuance_outbox`.

Entrypoint `src/main.ts` → `startWorkerRuntime`. Cada consumer é `start*Consumer` em `src/runtime/`,
recebe `{config, logger, provider}` e devolve `{cancel()}`; a lógica fica em `src/<contexto>/application/`.
Dependências injetáveis via `WorkerRuntimeDependencies` — é assim que os contract tests substituem
RabbitMQ e banco.

**As rotinas agendadas são um registro, e ele é parcial de propósito.** `startJobRunConsumer` recebe
`routines: JobRoutineRegistry` (`Partial<Record<ScheduledJob, JobRoutine>>`) e o consumidor reivindica
a linha de `job_executions`, corre a rotina e a encerra; job sem rotina registrada pousa em
`job_run_routine_missing` e fecha como `unexpected_error`. Hoje quatro estão registradas:

- `nfe.distribution.pull`, em `src/nfe-distribution-pull/` — ela **não** fala com a SEFAZ: seleciona
  empresa elegível e enfileira `source: 'distribution'` na `processing_outbox`, e daí em diante é o
  relay e o consumidor de `nfe-distribution.v1` que já existiam.
- `nfse.status.pull`, em `src/nfse-status-pull/` — aqui a rotina **processa**: consulta a prefeitura
  por nota pendente, arquiva XML e PDF no bucket na autorização e grava a rejeição com código e
  mensagem. Dentro de uma app não há fronteira que justifique cópia, então ela **importa** o cliente
  da Nota RP, o serviço de credencial e o schema de `nfse-issuance/` em vez de duplicá-los como o
  cron precisava fazer — o AAD continua sendo o mesmo
  `transportada:nfse-credential:v1:${companyId}:${credentialId}` que selou. O aviso de rejeição
  ainda **não** sai: a porta `notifier` é opcional e segue sem adaptador — `notification.schedules.run`
  já mora aqui, mas quem varre NFS-e rejeitada é o trilho `notification.v1`, não esta rotina. Sem
  `NFSE_PROVIDER_BASE_URL` a rotina não morre — cada nota é adiada como `provider_not_configured`, e
  o segredo nem chega a ser aberto.
- `notification.schedules.run`, em `src/notification-schedules/` — varre fatura a vencer e roda os
  dois schedules de `@adatechnology/notification-module`. Schedule que cai **não** derruba o
  seguinte, e a causa é tipada, nunca adivinhada por mensagem: `queue_unreachable` vem de
  `createGuardedNotificationQueue` (decorador sobre o `enqueue` da fila do módulo) e
  `template_missing` do código `NOTIFICATION_TEMPLATE_NOT_FOUND`; qualquer outra é
  `unexpected_error`. ⚠️ Aqui a **falha domina** o trabalho feito, ao contrário de `nfse.status.pull`:
  ciclo que avisou metade das faturas precisa dizer isso, porque a outra metade não tem segunda
  janela antes do vencimento.
- `fuel.price.pull`, em `src/fuel-price-pull/` — baixa o resumo semanal da ANP (XLSX lido por código
  nosso, ZIP + `inflateRawSync`, sem dependência nova — ADR-0033) e a tarifa homologada da ANEEL, e
  grava `fuel_price_references` e a tarifa por UF. A semana da ANP vai de domingo a sábado e **dá
  nome ao arquivo**, então a URL é derivada da última semana **completa** — a que contém hoje ainda
  não foi publicada e devolve 404. Reexecutar a mesma semana não duplica linha: a chave natural
  `(product, state, week_ending_on)` é a idempotência do ciclo. As duas metades correm na mesma
  execução e **falham em separado**, mas a linha fecha como falha se qualquer uma cair: meia série
  gravada é tela com preço sem dizer que está incompleta. Não há advisory lock — quem serializa é a
  linha de `job_executions`, com o unique de execução aberta e o lease. É a única rotina que roda
  sem chaveiro, sem bucket e sem tenant: a planilha é dado público de mercado. Sem `ANP_BASE_URL` e
  `ANEEL_BASE_URL` a rotina **não é registrada** e a janela dela pousa em `job_run_routine_missing`;
  declarar **uma só** derruba o boot.

⚠️ O worker passou a ter `FISCAL_ENVIRONMENT` (`homologation` | `production`, **padrão
`production`**), e quem o lê é só a reconciliação de NFS-e, para casar a linha de
`nfse_provider_credentials`. Instalação de homologação **declara a variável**: esquecê-la faz a
reconciliação procurar credencial de produção e não achar nota alguma. A distribuição de NF-e segue
sem ela — lá o ambiente é o de `company_fiscal_profiles`, por empresa.

⚠️ **A trava contra o `cStat 656` é `nfe_distribution_cursors.next_allowed_at`, por
`(company_id, environment)` — nunca a cadência do agendador.** A NT 2014.002 §3.11.4 bloqueia o
**CNPJ** por uma hora em consumo indevido, e quem sabe quando a janela reabre é a última resposta da
SEFAZ. Com batida de cinco minutos, onze de cada doze janelas são recusadas por `cooldown_active`
antes de qualquer chamada. O ambiente é o de `company_fiscal_profiles.environment`, por empresa: o
envelope de `job-run.v1` não carrega ambiente e o `FISCAL_ENVIRONMENT` do worker é da NFS-e, então a
junção do cursor é escopada pelo perfil — ler o do outro ambiente devolveria a espera errada. A distribuição
assina com o certificado de **CT-e** (`NFE_DISTRIBUTION_CERTIFICATE_PURPOSE` em
`src/shared/nfe-distribution.constant.ts`): quem pré-filtra a empresa e quem abre o envelope olham a
mesma linha de `digital_certificates`, senão a empresa é aprovada pelo certificado de MDF-e e falha ao
assinar.

**O anexo do agregado é lido em `worker_thread`, e só ele.** O trilho `aggregate-attachment.v1`
(relay próprio sobre `aggregate_attachment_outbox`) baixa o objeto do bucket e roda o pdf.js numa
thread — dentro do event loop do worker ele pararia CT-e, MDF-e e NFS-e junto, o que seria trocar de
vítima, não consertar (ADR-0053). Três coisas medidas que não se deduzem do código:

- `prefetch` é **1** neste consumidor, não o do resto do worker: cada mensagem sobe uma thread com
  pdf.js dentro, e uma rajada de anexos vinda de gente anônima viraria dezenas de parses
  concorrentes.
- `new Worker(url)` é **caminho de arquivo de verdade** — o runtime não reescreve `.js` para `.ts`
  como faz com `import`. A extensão sai do próprio `import.meta.url`, e `pdf-extraction.worker.ts` é
  entrypoint do `bun build`; `test/build-entrypoints.contract.test.ts` cobre `*.worker.ts` pelo mesmo
  motivo que cobre `*.main.ts`.
- O pdf.js **escreve avisos no console**, e do worker eles caíam no stdout do processo — que é log. O
  canal é silenciado dentro da thread antes do parse.

**Quem escolhe o mecanismo é a assinatura do arquivo; quem escolhe o mapa é o documento** (spec 071).
`document-extraction.gateway.ts` é o único lugar que decide: PDF (`%PDF`) vai para a `worker_thread`
com pdf.js, imagem (`PNG`/`JPEG`) vai para o `tesseract-server` — que é rede, e rede não é o motivo
da thread. Dentro do PDF, o mapa sai do **título** do documento, nunca do tipo que o cliente anônimo
declarou: o gate `type !== 'ccmei'` caiu, senão o mesmo CCMEI deixaria de ser lido só por chegar
como `company_document`.

⚠️ **A CNH-e cai no ramo do PDF e não reconhece nada** — ela é imagem embrulhada em PDF pelo invólucro
do Serpro (medido: ~400 caracteres de texto legal e nenhum campo), e o `tesseract-server` não lê PDF.
Isso é o resultado **correto**, não uma falha: quem chega pelo OCR é a CNH fotografada. No OCR o mapa
é escolhido pelo **tipo declarado**, ao contrário do PDF — não há classificador de documento numa
foto, e inventar um seria adivinhação. Fora da CNH, grava `null`.

⚠️ O que o OCR lê **nunca volta ao formulário do candidato**: ele já enviou e foi embora, e
preenchimento assíncrono seria prometer o que não se entrega. Vai para `extracted_fields`, que o
operador confere na fila de revisão — `ATTACHMENT_FIELD_LABEL` cobre CNH e CRLV, e um contrato por
texto de fonte impede `extractCnhFields` de voltar para a landing "para adiantar". Sem
`AGGREGATE_DOCUMENT_OCR_URL` (nova no worker, mesma da API) o ramo de imagem grava ausência em vez de
falhar: serviço que não existe não pode reciclar mensagem para sempre.

Os tipos de anexo passaram a seis: `address_proof` e `company_document` entraram no CHECK, no Zod, na
cópia do envelope do worker e nos rótulos do painel; **`ccmei` fica** — linha já gravada não se
reescreve, senão o operador perde o rótulo sob o qual aprovou o anexo.

Leitura que não reconhece nada grava `null` e fecha: é resultado, não falha. Objeto apagado entre o
`201` e a leitura fecha sem escrever. Só falha de parse e de banco recicla.

⚠️ O schema Drizzle das tabelas consumidas é **duplicado por cópia** no worker — quatorze arquivos em
`src/database/` (`processing`, `cte-issuance-execution`, `mdfe-issuance-execution`,
`nfse-issuance-execution`, `nfe`, `identity`, `invitation-delivery`, `password-reset-delivery`,
`billing`, `company-distribution-settings`, `job-execution`, `energy-tariff`, `fuel-reference`, `aggregate-attachment`), e
outras oito no cron. Mudou tabela na API? confira as cópias — migrations só rodam na API.
