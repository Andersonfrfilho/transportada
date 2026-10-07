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

**Política de transição de status do NF-e (spec 149, migrações H1/H1b, T2/T3):** a nota nasce `authorized` ou `unsigned` e só muda de status via evento fiscal ou resumo da distribuição. A política `nfe-document-status-transition.policy.ts` decide quais eventos aplicam: `tpEvento 110111`/`110112` com `cStat 135/136/155` → `cancelled`; resumo `cSitNFe 2` → `cancelled`, `3` → `denied` (só de `unsigned`). Dois trilhos (importação de XML e distribuição) executam a mudança sob lock `pg_advisory_xact_lock(hashtextextended('nfe-document-status:<empresa>:<chave>', 0))` para evitar corrida. `updated_at` só se move quando o status de fato muda. `cancelled` e `denied` são terminais — nada tira uma nota desses estados. Histórico gravado em `nfe_document_status_changes` com origem (`manual`|`automatic`), ator/solicitante, snapshot anterior/novo. Detalhe: spec 149 (D1–D9, D14–D18), `t3-parecer-architect.md` (A1–A7).

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

## O barracão sem configuração é o endereço da empresa (spec 097 D7, 2026-09-15)

`readContext` do roteirizador resolve a origem por `readDepotOriginAddressKey`
(`routing/infrastructure/drizzle-depot-origin.query.ts`) → `resolveDepotOrigin`
(`routing/domain/depot-origin.policy.ts`, cópia por valor da API, paridade em
`test/routing/depot-origin-parity.contract.ts`): configuração vence; sem ela, a chave
`city_ibge_code|CEP|número` de `company_fiscal_profiles`. A fila do `geocoding.backfill`
(`drizzle-pending-address.repository.ts`) inclui esses endereços — é por ela que o barracão ganha
coordenada, sem centroide de município. Sem coordenada, `depot` segue `null` (nada inventado).

## O feriado municipal no roteirizador é fixado por teste (spec 238 T1.2a, 2026-10-07)

`readPoolWindows` lê só `municipal_holidays.holiday_on = hoje (UTC)` das cidades das paradas, sem a cidade por
cliente, e `test/route-optimization-municipal-holiday.integration.test.ts` caracteriza isso contra Postgres
(inclusive o defeito de um feriado fechar o cliente de outra cidade no mesmo roteiro); data `yearly` (ano 2000) nunca casa.

## O e-mail à contratante sai para todos os destinatários, não só o primeiro (spec 150 T302)

Até aqui `send-contractor-mail-outbound-message.use-case.ts` só entregava a `toAddresses[0]` —
defeito conhecido, registrado no `plan.md` da spec 150. Corrigido: o `to` vira lista completa,
deduplicada em minúsculas, na ordem gravada; `resend-mail.gateway.ts` passa a aceitar `to: string[]`
e `html` opcional (`text` continua obrigatório), enviando os dois formatos quando há `html`
(`contractor_mail_messages.body_html`, gravado pela API — o worker nunca monta HTML, só repassa o que
achou em `findMessageById`). Endereço com `\r`, `\n`, `,`, `<` ou `>` é recusado **antes** de chamar a
rede (`ResendInvalidRecipientsError`), e a mensagem vai para `failed`.

**Decisão do architect**: um e-mail só, com todos os contatos no `to` — não um envio por contato. O
`Reply-To` sai da conversa, então a resposta de qualquer contato cai nela; os contatos se veem entre
si, aceitável porque são da mesma contratante. Serve também à spec 143 T015.

⚠️ **`CONTRACTOR_MAIL_MAX_RECIPIENTS = 50`** (`contractor-mail/domain/contractor-mail.constant.ts`)
é **cópia por valor da API** — teto medido na documentação do Resend (`POST /emails`, `to` até 50) —,
cobrada duas vezes: no Zod da rota da API (`contactIds.max(50)`) e de novo aqui no gateway, que
recusa sem chamar a rede. Contrato de paridade: `test/contractor-mail/max-recipients-parity.contract.ts`.
Mudou o teto de um lado, mude do outro — o contrato falha se as constantes divergirem.

A fila **continua levando só `{ messageId }`** (retrocompatível) — o corpo inteiro, incluindo
`body_html`, é relido do banco a cada mensagem. Mensagem antiga sem `body_html` sai só em texto puro,
e o `setup_test` não muda. O schema `contractor-mail.schema.ts` (cópia por valor, como toda tabela
consumida aqui) ganhou a coluna `bodyHtml`.

Detalhe completo (testes vermelho→verde, arquivos tocados): `specs/150-pedido-de-correcao-de-endereco/evidence.md` § T302.

## A limpeza do limitador de taxa é rotina do worker, não do cron (spec 150 T406)

O limitador de taxa da API com estado no Postgres (`rate_limit_windows`, escopo `contractor-mail`,
RF18) precisa apagar janela vencida em algum lugar — o cron só publica a batida agendada lendo
`job_schedules`, quem executa rotina é o worker. `rate-limit.window.purge`
(`minimumIntervalSeconds: 3_600`), no molde de `trip.cargo-layout.purge`: lotes de 1000 por `ctid`
com `for update skip locked`, teto de 100 lotes, parada no limite do lote. Corte:
`window_start < now − 48 h` — o worker não lê o env da API (`RATE_LIMIT_CONTRACTOR_MAIL_WINDOW_SECONDS`),
então usa a janela máxima que o schema de lá aceita (24 h) mais 24 h de folga. A linha de
`job_schedules` para a rotina nova nasce na própria migration aditiva (`20260915233000_rate_limit_windows`,
`INSERT` no fim). Schema `rate_limit_window.schema.ts` é cópia por valor, com contrato de paridade,
como toda tabela consumida aqui.

Detalhe completo: `specs/150-pedido-de-correcao-de-endereco/evidence.md` § T406.

## A ocorrência tem duas conversas (spec 183, 24–25/09/2026)

- **E-mail recebido vira mensagem da conversa (T702c1).**
  - O MIME bruto é gravado antes de qualquer interpretação, como na 143.
  - Os anexos (até 5, sem a parte `inline`) são conferidos pelos bytes e sobem antes da transação,
    e são descartados quando ela falha ou quando outra entrega já ligou a mensagem.
  - Aceito para depois (F10): se o 3º anexo falha ao subir, os dois primeiros ficam órfãos no
    bucket.
- **Pedido de upload vencido (T702c2).** É a mesma unidade da expiração da 179: `skip locked`, e
  para ao primeiro erro de storage.
- **E-mail enviado com anexo (T702e).**
  - O worker lê os anexos da mensagem e confere tamanho e sha256 antes de mandar ao Resend.
  - A revisão (F1) achou que o `list()` filtrava as linhas apagadas: o anexo expurgado entre o
    aceite e o envio sumia da lista, e o e-mail saía **sem o arquivo**, com status `sent`.
  - Agora o registro traz `available`, e anexo indisponível é falha permanente.

## A rotina lê o canhoto sem ninguém abrir a viagem (spec 222 Fase 6)

`trip.canhoto.read` é a quarta rotina agendada registrada no `JobRoutineRegistry` de `main.ts`. Ela
varredura comprovantes de canhoto pendentes, decodifica o código de barras de cada imagem em
`worker_thread` e reporta o que leu à API para aprovação automática. A decisão (se casou, se
recusou) fica na API, nunca no worker — a rotina é mais um leitor, como o navegador é hoje.

**A fila de pendentes** (`drizzle-canhoto-read-queue.repository.ts`) filtra `trip_delivery_proofs`
por: `kind = 'photo'`, `canhoto_review = 'pending'`, `canhoto_read_source IS NULL`,
`canhoto_read_attempted_at IS NULL`, empresa ativa, viagem **não** cancelada, nota **não** liberada.
Ordena por `created_at` (fila por antiguidade), respeita teto de lote. ⚠️ **Os três predicados saem
como literais SQL** (`sql\`canhoto_read_source IS NULL\``, não `eq(column, value)`) — o Postgres testa
implicação de predicado apenas sobre os `quals`da consulta em forma literal, e não prova que`canhoto_review = $1`implica`canhoto_review = 'pending'`. Com `eq()`a consulta fica paramétrica, o
plano vira genérico, e o índice parcial`trip_delivery_proofs_canhoto_pending_idx`é ignorado em
silêncio. EXPLAIN prova que o índice serve: a T6.3 fecha com a consulta real e a saída mostrando`Index Scan`sobre o índice, não`Seq Scan`. Sem isso a rotina varre sequencialmente a tabela que o
campo escreve o dia inteiro.

**A decodificação corre em `worker_thread`** com a imagem do bucket (até 8 MB, conferido **antes de
baixar** pelo tamanho gravado em `stored_objects`). Bytes de imagem nunca entram em log. Suporta JPEG,
PNG e WebP via `@jsquash`, com prazo por comprovante e por ciclo (`budgetMilliseconds`, respectivamente
2000 ms e 40000 ms). Falha de decode (`timeout`, `unsupported_media`, `too_large`) é resultado
contado, não exceção — um comprovante ruim não derruba o ciclo. Objeto ausente (`object_unavailable`)
idem. Bytes que não são imagem, ou imagem sem código de barras, devolvem `null`: não é falha, é o caso
comum do escritório, onde a foto foi tirada mas o código se despregou.

**A leitura que terminou sem código utilizável carimba a tentativa** (`canhoto_read_attempted_at`).
Sem esse carimbo, canhoto sem barra voltaria à fila de cinco em cinco minutos para sempre, sendo
decodificado sobre nada de novo. Falha de infraestrutura (objeto ausente, teto, timeout, API fora)
**não** grava a tentativa — merece o próximo ciclo, chance de o bucket voltar ou a foto ser
recuperada. Só `report_rejected` (400/404/409 da API) e `api_unauthorized` (401/403) também não
gravam, mas vão para o Sentry — é defeito nosso (corpo malformado) ou crachá rotacionado, e repetir
em silêncio esconderia os dois.

**O laço** (`canhoto-read.routine.ts`): lotes de 10 comprovantes, teto de 40 por ciclo (4 lotes);
`excludeProofIds` cresce a cada lote, de modo que falha de infraestrutura não volta no mesmo ciclo.
Lote curto encerra o laço (a fila secou). `isStopRequested()` é consultado antes de cada lote **e**
antes de cada comprovante. Um comprovante ruim não derruba os outros: o ciclo fecha `succeeded` com
contadores (`approved`, `pending`, e um por `failureOutcome`). Todos saem sempre, com zero quando não
houve.

**O gateway autenticado** (`canhoto-review-api.gateway.ts`) chama a rota do robô `PATCH
/trips/:tripId/documents/:documentId/proof/review/automatic` (Fase 3) com `client_credentials` do
worker + `x-company-id`. Token em cache com margem de 30 s, nunca chamado a cada comprovante. O
rotina reporta exatamente os quatro campos de leitura (`readDocumentId`, `readNumber`, `readSeries`,
`readSource`); `approved` e `pending` são contados a partir do `review` que o servidor devolveu,
nunca recalculado no worker. 401/403 descartam o token em cache. 400/404/409 contam como
`report_rejected` (defeito nosso ou canhoto já resolvido); 429/5xx/conexão recusada como
`api_unreachable` (fila segue intacta).

⚠️ O gateway não tem timeout de `fetch` — API pendurada poderia segurar um ciclo. Registrado,
não corrigido aqui. `canhoto_review_by_user_id` fica nulo no caminho automático (CHECK o exige),
e é no `audit_logs` que a identidade do serviço aparece como ator (ADR-0047 §6).

## O expurgo de posição (spec 196, D8)

`trip.location.purge` é um job só com **lista de tabelas**: `trip_stop_events`, `trip_delivery_proofs`,
`trip_status_events`, `trip_stop_occurrences`, `trip_document_occurrences`. Para cada uma, em lotes de 500
(`select id ... where latitude is not null and <tempo> < corte limit N`, depois `update ... where id in`), apaga as
quatro colunas e marca `location_state = 'expired'`. Uma tabela por vez (não segura a escrita do motorista), teto de
lotes e `exhausted` **por tabela**, falha isolada por tabela (`failedTables`). Os pings do rastro ao vivo têm corte
próprio (horas, ADR-0056). A coluna de tempo é a de cada tabela (`created_at`, e `recorded_at` em
`trip_status_events`), a mesma do índice parcial: `EXPLAIN` mostra `Index Scan` nos cinco índices
(`evidence.md` T7.3).

- ⚠️ **Desligado por padrão, e a empresa liga na tela** (spec 239): apagar coordenada é irreversível. A variável
  `TRIP_LOCATION_PURGE_ENABLED` **saiu** (se sobrar no Railway é ignorada). O worker lê
  `company_location_retention_settings` a cada ciclo: `CountEligibleCompanies` (no mesmo `now` dos redatores) e,
  com ao menos uma empresa ligada e com a carência vencida, um `UPDATE` único por tabela com
  `CROSS JOIN LATERAL`, cada linha comparada só com o prazo (`retention_days`, 30–90) **da própria empresa**.
  Sem empresa elegível o ciclo fecha `succeeded` e o log `trip_location_purge_disabled` diz que foi de
  propósito. O de 36 h dos pings do rastro ao vivo (`purgeStalePings`) roda sempre, antes da contagem.
  Tabela de configuração ausente (deploy fora de ordem): a contagem lança e o ciclo falha inteiro, nada apagado.
- O log do ciclo conta linhas por tabela. Nunca coordenada, evento ou pessoa.
- Um contrato da API reprova tabela com coluna `*latitude*` que não esteja na lista do worker nem na lista de
  exclusões com motivo.

## A prévia da carga é lida e vinculada aqui (spec 237 Fase 4a, ADR-0094 §7/§8)

Trilho `cargo-preview.v1` (main/retry/dead, retry 10 s × 5) com relay próprio sobre
`cargo_preview_outbox` e consumidor `startCargoPreviewConsumer` com **prefetch 1** (a leitura roda numa
`worker_thread` terminada em 10 s — revisão de segurança S1, abaixo). Duas mensagens:

- **`cargo-preview.process`** (gravada pela API no envio): `processCargoPreview` baixa o objeto (ausente
  = `PREVIEW_FILE_MISSING`), confere o sha256 (`PREVIEW_FILE_CORRUPTED`), lê com o perfil (mapa e aba;
  sem perfil ligado = `PREVIEW_NOT_ENABLED`) e grava os itens — linha boa `awaiting_xml`, linha recusada
  `invalid` com coluna e motivo — e o dia planejado (`RoutingDate` mais frequente). Erro do leitor é
  prévia `failed` com o código e **ack**; banco ou bucket fora do ar é **retry**. A prévia é travada
  `FOR UPDATE` e só a primeira entrega grava (reentrega é no-op). Estouro numérico no banco (22003)
  vira `CargoPreviewValueOutOfRangeError` no adaptador e prévia `failed` `PREVIEW_VALUE_OUT_OF_RANGE`;
  na **última tentativa** (`retryCount` = `maxRetries` da topologia) a prévia vira `failed`
  `PREVIEW_PROCESSING_ABANDONED` antes da fila morta — nunca fica `processing` para sempre. Gravar os
  itens vincula **todas** as prévias prontas do contratante, da mais antiga para a nova.
- **`cargo-preview.reevaluate`** (por contratante): `matchContractorPreviews` vincula de novo os itens em
  aberto **decididos pela máquina** (`awaiting_xml`/`suggested`/`ambiguous`, `matched_by` nulo ou
  `system`) das prévias prontas ainda na janela, da mais antiga para a mais nova.

**O vínculo** (`cargo-preview/infrastructure/cargo-preview-matching.writer.ts`) toma a trava advisory do
contratante (a mesma das ações do operador na API), lê as notas candidatas (`cargo-preview-candidate.query.ts`:
empresa, `authorized`, emitente = CNPJ do contratante em `nfe_participants`, `created_at` em
`[received_at − janela, min(agora, received_at + janela)]`, sem vínculo), extrai o `NroCarga` do
`additional_information` pelo padrão do perfil, roda `resolveCargoPreviewMatches` e grava **só o que
mudou** (`diffPreviewMatches`): vínculo novo é `insert` puro (o unique da nota desfaz tudo se algo
furou), evento por item mudado, pares roteiro ↔ carga **só pelos totais** (o par por votos vale só na
leitura em que nasceu; linha `votes` antiga não volta como conhecida), aliases aprendidos
(`onConflictDoNothing`; o conflito é contado e vai ao log `cargo_preview_alias_conflict`, nunca
sobrescreve). O contexto (perfil, prévias, aliases) é lido em `cargo-preview-matching-context.query.ts`.

**A reavaliação nasce na importação.** `writeDocumentChildren` (upload e distribuição) chama
`requestCargoPreviewReevaluation` num `SAVEPOINT` (molde de `delivery-registry.writer.ts`): grava um
pedido só se o emitente é contratante com perfil e prévia ligados e há prévia na fila ou pronta com item
em aberto dentro de `match_window_days`, só se não há pedido pendente dele **com mais de 10 s de folga**
(`clock_timestamp()`; o pedido prestes a sair pode ser lido antes de a importação comitar), e adiado
30 s — um lote de 300 XMLs vira um pedido (medido na integração). Sem unique, de propósito: o conflito esperaria a transação de outra importação.
Falha do pedido volta só o savepoint e vira o aviso `cargo_preview_reevaluation_request_failed`; a nota
entra. Importação e distribuição passaram a mandar o logger que já tinham a `writeDocumentChildren`.

**Cópia por valor:** o leitor e a política da API (21 arquivos de `cargo-receiving/domain/`) estão em
`src/cargo-receiving/domain/` **idênticos**, com `src/shared/api.error.ts` e `api.types.ts` mínimos para
os imports deles; `test/cargo-preview/domain-parity.contract.ts` compara byte a byte (e a lista, e a chave
da trava, e `shared/cargo-preview.constant.ts`). Mudou na API, copie aqui. `fast-xml-parser` entrou como
dependência do worker na mesma versão da API.

**Revisão de segurança da Fase 4a (2026-10-04).**

- **S1 — a leitura numa thread terminável.** `createThreadedCargoPreviewWorkbookReader`
  (`cargo-preview/infrastructure/threaded-cargo-preview-workbook.gateway.ts` + `cargo-preview-workbook.worker.ts`,
  molde do canhoto) roda parse + plano dos itens fora do event loop; passou de
  `CARGO_PREVIEW_READ_THREAD_CEILING_MS` (10 s), `terminate()` e `PREVIEW_PARSE_TIMEOUT` (resultado, ack).
  ⚠️ O Bun 1.3.14 **ignora** `resourceLimits` (medido): a opção vai passada (256 MiB), mas o teto real de
  memória são os tetos do leitor (8 MiB por aba, 512 células por linha, 120 mil no total). A dependência do
  caso de uso é `workbook: CargoPreviewWorkbookReaderPort` (em teste, `createInProcessCargoPreviewWorkbookReader`).
  Reentrega do broker (`redelivered`) de prévia já `processing` falha com `PREVIEW_PROCESSING_INTERRUPTED`
  sem reler — reler o que derrubou o processo é laço de queda; o reenvio do arquivo a reabre na API.
- **S2 — o vínculo tem prazo sob a trava.** `SET LOCAL statement_timeout` de 30 s na transação do vínculo
  e orçamento cooperativo de 5 s por prévia (`createMatchBudget`, `CargoPreviewMatchTimeoutError`): a prévia
  nova que estoura volta inteira (`storeParsed` desfaz) e fica `failed` `PREVIEW_MATCH_TIMEOUT` sem itens; a
  pronta que estoura numa reavaliação fica como estava e o log conta (`cargo_preview_match_timeout`).
- **S3 — o `NroCarga` pelo texto literal** do perfil (`arrival_reference_label`), gramática fechada em
  `load-reference.policy.ts`; nenhuma expressão do usuário roda aqui.
- **S6 — alias contrariado é apagado** (banco e lista da passada), nunca trocado.
- **S7 — o objeto pela linha.** A chave é `buildCargoPreviewObjectKey({ companyId, fileObjectId })` da linha
  (cópia da API, `cargo-preview-object.policy.ts`, paridade) no bucket do worker; a mensagem não decide. O
  leitor confere o `Content-Length` (`headObject`) e conta os bytes ao baixar: acima de 960 KiB, `failed`
  `PREVIEW_FILE_TOO_LARGE`.

⚠️ **`make worker-integration` reusa o banco `<db>_worker_integration`** e não o recria: em 2026-10-04 o
local estava com o diário de migrations divergente (`column "latitude" ... already exists`). Os passos do
alvo rodaram num banco novo de nome próprio (ver `specs/237-.../evidence.md`).

⚠️ **Dezenas de consultas concorrentes no pool do Bun SQL 1.3.14 podem travar para sempre** (2026-10-06,
`cargo-preview-corpus.integration.ts` estourou 120 s na CI, e o `afterAll` também). Com ~70+ cadeias de
`INSERT` num `Promise.all`, a fila às vezes para de andar com as 10 conexões **ociosas**
(`pg_stat_activity`: `idle`/`ClientRead`, nenhum lock, nada preso no banco); reproduzido sem Drizzle nem
código da aplicação, e a taxa sobe quando o Postgres tem pouca CPU (a CI). A fixture
`graph.seedDocuments` semeia em série; **não** abra uma cadeia por linha no pool. Dentro de uma transação
(conexão reservada, caso do `writeItemChanges`) o mesmo fan-out de 106 consultas não travou em 60 rodadas.

## A prévia por e-mail encaminhado (spec 237 Fase 4b, T4.6, T4.7a, T4.7c e T4.7d, ADR-0094 §10)

Ramo "prévia" **dentro** do trilho `contractor-mail-inbound.v1`: `recordContractorMailInboundMessage` procura
primeiro a **conversa** e só chama `previewIntake` (`cargo-preview-email/`) quando **nenhuma** thread casa
(T4.7a: a conversa vence — um e-mail com o endereço da prévia e o da conversa, no `To` ou no `Cc`, é resposta
da conversa e a prévia nem é consultada). `hasIntake` (por `provider_email_id`) é checado antes do Resend, para
**toda** mensagem. Só a que casa o token de **um** perfil decide; token desconhecido, ausente ou de dois perfis
devolve `not_a_preview` e a mensagem é descartada como `token_unknown`, como antes. Resultado do ramo:
`accepted`, `replayed_existing`, `rejected`, `rate_limited` ou `already_recorded`.

- **Token:** local-part de 26 base32 minúsculos no domínio de entrada, hash `sha256("transportada:cargo-preview-inbound:v1:" + token)`
  em `contractor_receiving_profiles.preview_inbound_token_hash` (distinto do hash de conversa; `+` recusado).
  O hash e a função `hashPreviewInboundToken` são os que a T4.6b vai copiar para a API (com paridade).
- **Barreiras, em ordem:** perfil pronto → encaminhador do provedor na `preview_forwarder_allowlist` **antes** de
  baixar → teto de e-mails **autenticados** da janela (T4.7c; só o download e o DKIM ficam atrás dele) → MIME até 2 MiB
  (`downloadRawEmail({ maxBytes })`, só número finito) → **cabeçalho medido** (`hasBoundedMimeHeaders`, abaixo) → DKIM
  do encaminhador `aligned`, com prazo → `From` do MIME **igual ao `headerFrom` da `mailauth`** (T4.7c,
  `FORWARDER_FROM_MISMATCH`) e na lista → remetente original (cabeçalho da mensagem anexada ou primeiro bloco
  encaminhado do texto) na `preview_sender_allowlist` → um anexo candidato (960 KiB, `PK\x03\x04`). Cada recusa grava
  `cargo_preview_email_intakes` com o código e para (salvo janela de não autenticados cheia: abaixo).
- **Janela de e-mails (T4.7a, T4.7c, T4.7d):** dois contadores por contratante em 300 s, medidos pelo **relógio do banco**
  (`recorded_at`, nunca `received_at`): os **autenticados** (teto 20) e as **recusas** (teto 100); o rastro `RATE_LIMITED`
  fica fora dos dois. **Autenticado é o que o encaminhador prova** (`countsAsAuthenticatedIntake`, e o mesmo no SQL de
  `countRecentIntakes`): `forwarder_dkim_result = 'aligned'` e o motivo fora de `PREVIEW_EMAIL_UNPROVEN_REJECTIONS`
  (`MIME_UNREADABLE`, `FORWARDER_FROM_MISMATCH`, `FORWARDER_NOT_ALLOWED`, `ORIGINAL_SENDER_MISSING | _AMBIGUOUS |
_NOT_ALLOWED`). Essas seis ficam gravadas com `aligned` (o dado é verdadeiro) mas contam nas recusas: o `d=` pode ser do
  atacante e uma resposta assinada pelo encaminhador, reenviada, vira `ORIGINAL_SENDER_MISSING/aligned` — contá-la
  trancaria o legítimo com 20 reenvios. **20 autenticados** fecham o download e o DKIM: o excesso é ignorado e grava **uma**
  linha `RATE_LIMITED` por contratante e janela (`recordRateLimited`, sob advisory própria). **100 recusas** só **param de
  gravar**: a recusa continua avaliada e devolvida (`rejected` com o código), sem linha nova e com o mesmo rastro único
  (`createPreviewEmailRejecter`, `isUnauthenticatedWindowFull`). Consequência assumida: nenhum contador fecha o download
  e o DKIM para quem só produz as seis recusas (`SECURITY.md`, pendência 10).
- **Cabeçalho medido antes do DKIM (T4.7a, T4.7c, T4.7d):** `contractor-mail/domain/mime-header-bounds.policy.ts` exige fim de
  cabeçalho (`\r\n\r\n` ou `\n\n`) dentro de 64 KiB e limita cada **campo desdobrado** — lido por
  `mime-header-fields.policy.ts` com a MESMA regra de linha da `mailauth` (`FIELD_START`; a linha que não abre campo
  soma no de cima; nome sem espaços antes do `:`, minúsculo) — em 2 KiB nos que identificam (`from`, `sender`,
  `reply-to`, `return-path`; a soma dos repetidos de mesmo nome também conta), **8 KiB por campo e 16 KiB na soma** nos
  destinatários (`to`, `cc`, `bcc`, `delivered-to`; T4.7d: 8 KiB cobrem ~125 endereços com nome; 150 em um campo só, 9,3 KiB, ainda recusa) e
  8 KiB nos outros; **linha cujo nome de campo tem espaço exótico antes do `:`** (`\f`, `\v`, NEL, NBSP, espaços Unicode,
  BOM; latin1 e UTF-8) **recusa** (`hasDivergentFieldName`: a `mailauth` junta `To\f:` ao campo de cima, o PostalMime o
  lê como `to`), e conta as assinaturas (8 `DKIM-Signature`; 3 `arc-seal`, 3 `arc-message-signature`, 3
  `arc-authentication-results`). O `addressparser` do nodemailer, que a `mailauth` usa, é quadrático (400 KB de
  `a,a,a…` travaram o laço por 58 s) e a `mailauth` faz um hasher de corpo por combinação (canon, hash, `l=`) e consulta
  o DNS em série. O pior cabeçalho que passa (identidade em 1,9 KiB, `to`+`cc` em 8 KiB) custa ≤ 150 ms somando `mailauth` e PostalMime. Na prévia:
  `MIME_UNREADABLE`, sem DKIM. **No trilho da conversa** (mesma função): a mensagem é gravada com DKIM `absent` (o que a
  `mailauth` devolve para MIME que não parseia) e **sem extrair anexos**; mensagem comum não muda. A mensagem anexada
  que a prévia abre (`parseLimited`) passa pela mesma barreira.
- **Partes e aninhadas (T4.7d):** `contractor-mail/domain/mime-part-bounds.policy.ts` conta as linhas que começam com
  `--` (as únicas que o PostalMime reconhece como fronteira) e recusa acima de `MIME_PART_LIMITS.maxBoundaryLines` (200),
  na conversa (`readInboundMailParts`: nenhuma parte e `skippedNestedMessages: 1`) e na prévia (`parseLimited` →
  `MIME_UNREADABLE`). As aninhadas **abertas** da conversa gastam um orçamento de `maxNestedMessages` (5) por mensagem,
  compartilhado entre os níveis; o resto conta como recusa. Medido: 5000 aninhadas 25,5 s → 4 ms; 20 000 partes 9 s →
  0 ms; o pior que passa (cinco aninhadas com `to`+`cc` de 8 KiB) ~370 ms.
- **Prazo do DKIM (T4.7c):** `createDkimVerifierGateway({ deadlineMs })`, padrão `DKIM_VERIFICATION_DEADLINE_MS` = 15 s
  para a verificação inteira; estourou = `unverifiable` (`headerFrom: []`), e o resolvedor recusa na hora dali em diante
  (o laço da `mailauth` acaba sem sair para a rede). O gateway tem duas portas: `verify` (só o alinhamento, a conversa) e
  `verifyWithHeaderFrom` (alinhamento **e** o `headerFrom` que a `mailauth` leu, a prévia).
- **DKIM sem veredito (`unverifiable`, DNS fora):** a entrega **repete**. O ramo lança
  `CargoPreviewEmailDkimUnverifiableError` (o consumidor devolve `retry`, log `reason: dkim_unverifiable`), sem gravar
  nada; só a **última** entrega (`retryCount >= maxRetries` da topologia, 3) grava `FORWARDER_DKIM_UNVERIFIABLE`. O
  consumidor repassa `delivery.isLastAttempt` ao ramo.
- **Só falha transitória de assinatura alinhada repete (T4.7d):** `isTransientFailure` exige `status.aligned` (a `mailauth` o
  calcula antes do DNS): `d=` alheio com DNS mudo é `not_aligned`. Mesma política da conversa. O prazo de 15 s ainda
  estoura em `unverifiable` com DNS lento (resta, pendência 10).
- **Identidade da conversa (T4.7d):** o trilho da conversa usa `verifyWithHeaderFrom` e
  `resolveConversationDkimResult` (`conversation-sender-identity.policy.ts`): `aligned` só se o `headerFrom` da `mailauth`
  é UM e igual ao remetente do `from` do Resend (sem distinguir caixa); senão grava `not_aligned` (a mensagem fica na
  conversa, sem o selo). A porta da conversa é `VerifyDkimHeaderFromPort`.
- **`l=` nunca alinha (T4.7a):** `dkim-alignment.policy.ts` ignora a assinatura com `canonBodyLengthLimited` (corpo só em
  parte coberto). A política é a do trilho 143/183 também: uma resposta cuja única assinatura alinhada tem `l=`
  passa a `not_aligned` e deixa de decidir a identidade.
- **Remetente original:** `mailbox-address.policy.ts` aceita só `endereço` ou `nome <endereço>` (sem `mailto:`; T4.7c:
  o endereço lido tem de estar **literalmente** no fim do valor original — as aspas só servem para achar o `<…>` —, e
  `Silva, João <a@x>` sem aspas é uma caixa só),
  desembrulha `Nome <a@x<mailto:a@x>>` e `Nome [mailto:a@x]` do Outlook (só quando repetem o mesmo endereço) e recusa
  mais de um `<`/`@` fora de aspas, comentário, grupo e nome codificado sem endereço real.
  `forwarded-original-sender.policy.ts` percorre os marcadores (Gmail, Thunderbird, Apple en/pt-BR, Outlook,
  `____`) até o primeiro bloco com `From`/`De`, desdobra o cabeçalho dobrado e trata mais de um `From` no bloco como
  `ambiguous`.
- **Leitura do MIME:** `parseForwardedEmail` usa PostalMime com `maxNestingDepth` 6, cabeçalhos 64 KiB e
  `forceRfc822Attachments`; abre a mensagem anexada **uma vez** (a de dentro dela nunca é aberta nem vira
  candidata), depois de ela passar pela barreira de cabeçalho. Ilegível devolve `undefined` → `MIME_UNREADABLE`.
  **A conversa lê o MIME do mesmo modo** (`occurrence-conversation/application/inbound-mail-parts.service.ts`): o
  PostalMime não abre a `message/rfc822` aninhada (`forceRfc822Attachments`; antes, 256 KiB de `To` aninhado travavam o
  laço por 40 s) — o worker a abre, depois da barreira e até 3 níveis, e os anexos de dentro entram na mesma posição;
  aninhada hostil ou funda demais conta como **uma** recusa em `skipped`.
- **Criação:** `createPreviewFromEmail` (`cargo-preview-email-create.writer.ts`, linhas em `…-rows.writer.ts`) é
  cópia por valor do `insertPreview` da API (`preview-upload-file.policy.ts`, cobrada por
  `test/cargo-preview-email/parity.contract.ts`, nos dois sentidos): toma a **mesma** advisory do upload, confere o
  registro da mensagem, o arquivo do contratante (reenvio → `replayed`, com o **status** da prévia existente, que
  **não** é reaberta), o teto de 5 abertas (registra `TOO_MANY_OPEN_PREVIEWS`) e grava prévia `source = 'email'` sem
  quem enviou, evento `uploaded` no canal `worker`, `cargo_preview_outbox` e o registro `accepted` com o MIME bruto
  (`stored_objects`, `contractor_mail_raw`). Os dois objetos sobem **antes** da transação. A planilha tem chave
  aleatória **desta tentativa**; o MIME tem a chave da mensagem e é de **quem a registrou**: em `already_recorded` a
  tentativa descarta só a planilha (e o MIME apenas quando nenhuma linha o referencia, `isRawKept = false`).
- **Log:** `inbound_email_preview_accepted` (ids, DKIM, `replay`, e `previewStatus` no reenvio),
  `inbound_email_preview_rejected` (código) e `inbound_email_preview_rate_limited`; nunca endereço, assunto,
  corpo ou cabeçalho. Sem resposta ao remetente.
- ⚠️ **A planilha nunca é aberta aqui:** os bytes entram na prévia e o trilho `cargo-preview.v1` a lê, com tetos e
  `worker_thread`. ⚠️ Teste de integração semeia em série (o pool do Bun SQL trava com cadeias concorrentes de
  INSERT). ⚠️ `bun test` de arquivo avulso: `./test/integration/cargo-preview-email-intake.integration.ts`.
- ⚠️ **Ordem de deploy:** `hasIntake` roda para toda mensagem de conversa, então o worker novo falha em **todo**
  e-mail de conversa se a migration `20261007040900_cargo_preview_email_intake` não existir. O `deploy.yml` já
  garante a ordem (`deploy-api` com `preDeployCommand` e `assert-migrations` antes de `deploy-worker`, que `needs:
deploy-api`); **reverter a API sem o worker** quebra o trilho de conversa até o worker voltar.
