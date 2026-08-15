# 034 — Evidências

Uma seção por task, com o comando rodado e o resultado. Task sem evidência aqui não está fechada.

## T001 — módulo instalado e migrations no passo manual

Versões instaladas divergem do que a task pediu, por indisponibilidade no registry:

- `@adatechnology/module-http` — `0.1.0-rc.1`; a `rc.2` pedida não existe publicada.
- `@adatechnology/notification-module` — `0.1.0-rc.3`, não `rc.2`. A `rc.2` não sobe nesta API: o
  migrator do drizzle 1.x recusa o layout antigo de `meta/_journal.json` e o pacote ainda o trazia
  (`We detected that you have old drizzle-kit migration folders`). A correção foi feita no pacote
  (`adatechnology-packages`, commits `99a5327` + `c902afe`) e publicada pelo pipeline.

O rollback mora em `apps/api-transportada/drizzle-notification/rollback.sql`, e não em `drizzle/`,
porque `test/database-migration/static-migration.contract.ts` fixa a lista exata de diretórios de
migration da aplicação — um diretório a mais reprova. A tabela de controle do módulo é
`drizzle.notification_migrations`: o migrator troca o nome da tabela, não o schema.

```
$ DRIZZLE_TEST_DATABASE_URL=$DATABASE_URL bun run --cwd apps/api-transportada db:test
 44 pass
 0 fail
 552 expect() calls
Ran 44 tests across 3 files.
```

```
$ bun run --cwd apps/api-transportada db:migrate
$ select table_name from information_schema.tables where table_schema='notification'
deliveries,devices,notifications,preferences,suppressions,templates
```

`bun run lint` e `bun run typecheck` (raiz, quatro apps) sem achados.

## T002 — composition root, destinatário e chave de supressão

O `recipientResolver` (`src/notification/infrastructure/identity-recipient.resolver.ts`) junta
`identity_user_profiles` a `user_company_memberships`: o perfil não tem empresa, quem tem é o
vínculo. Pedir o mesmo `userId` pelo contexto de outra empresa devolve "não existe", e não o
contato da pessoa. Contato de canal diferente de e-mail sai como `phone`, nunca como `email`.

`NOTIFICATION_SUPPRESSION_HMAC_KEY` entrou em `cryptographic-configuration.schema.ts`, no mesmo
regime das demais: 32 bytes em base64 canônico, obrigatória, e recusada se repetir material do
keyring ou da chave de idempotência. Ausente, o boot cai com `CryptographicConfigurationError` — a
supressão que não casa deixaria o e-mail voltar para quem já recusou.

O driver de e-mail é o `createSmtpEmailProvider` do worker, sobre os mesmos `EMAIL_FROM`/`SMTP_URL`
(ADR-0031). Sem os dois, o módulo sobe com `features.email: false` em vez de dar por enviado o que
não saiu daqui.

```
$ bun run --cwd apps/api-transportada test
 2406 pass
 12 skip
 0 fail
Ran 2418 tests across 98 files.

$ DRIZZLE_TEST_DATABASE_URL=$DATABASE_URL bun run --cwd apps/api-transportada db:test
 49 pass
 0 fail
 557 expect() calls

$ make config   # exit 0 — o gate agora exige NOTIFICATION_SUPPRESSION_HMAC_KEY no .env
$ bun run typecheck && bun run lint   # raiz, quatro apps, sem achados
```

⚠️ **Deploy (T002):** a variável é obrigatória. Staging e production não sobem sem ela — precisa ser
gerada por ambiente (distinta das outras chaves) e cadastrada no Railway antes do próximo deploy da
API. Está no runbook (`docs/ops/backup-emergencia.md`) e no contrato
`test/deploy/secrets.contract.ts`.

## T003 — a conexão de stream sobrevive ao heartbeat

Subir `IDLE_TIMEOUT_SECONDS` de 10 para 60 não bastaria: `server.timeout(request, seconds)` vale
**por requisição** e vence o `idleTimeout` global do `Bun.serve`, e o handler já chamava
`server.timeout(request, REQUEST_TIMEOUT_SECONDS)` no começo de toda requisição. O stream morreria
nos mesmos 10 segundos, calado, com o cliente reconectando em loop. A rédea é solta no fim de
`executeRequest`, e só para resposta `text/event-stream`; requisição comum continua em 10s.

O contrato (`test/server/sse-timeout.contract.ts`) observa as chamadas de `timeout()` por um espião
do `RequestTimeoutPort`, em vez de manter um socket vivo por 26 segundos — a suíte não paga meio
minuto para provar o que a sequência de chamadas já prova. Ele fixa três coisas: que
`IDLE_TIMEOUT_SECONDS` é maior que o `DEFAULT_SSE_HEARTBEAT_SECONDS` (25) exportado pelo módulo, que
resposta JSON recebe só `REQUEST_TIMEOUT_SECONDS`, e que resposta de stream termina em
`IDLE_TIMEOUT_SECONDS`.

```
$ bun test test/sse-timeout.contract.test.ts
 3 pass
 0 fail

$ bun run --cwd apps/api-transportada test
 2412 pass
 12 skip
 0 fail
Ran 2424 tests across 99 files.

$ bun run typecheck && bun run lint   # raiz, quatro apps, sem achados
```

## T004 — rotas do módulo sob `/v1`

`createModuleFetchRouter` entra no `createRouter` como `moduleRouter`, e a delegação acontece
**antes** do `authentication.authenticate` da aplicação. Não é detalhe: o módulo tem rota de escopo
`public` (o webhook de recibo, que se protege por assinatura sobre o `rawBody`), e autenticar aqui
daria 401 no que é público por contrato. Os dois conjuntos de caminho são disjuntos pelo prefixo
`/v1`, que nenhuma rota da aplicação usa — o módulo é superfície de terceiro e versiona no ritmo
dele.

O `authResolver` (`notification-auth.resolver.ts`) é o mesmo caminho de sempre: token pelo
`authentication`, empresa pelo `tenantContext`. Token recusado vira identidade não resolvida (401 no
módulo, sem distinguir ausente de expirado). Falta de vínculo **não** vira 401: o `ApiError` 403 é
traduzido para a forma que o filtro do `module-http` reconhece (`statusCode`/`code`/`message`), senão
"não tem acesso a esta empresa" chegaria ao cliente como "não se identificou".

As rotas do módulo também alimentam o `allowedMethods`, que é a fonte do preflight — rota nova ganha
CORS por existir, sem lista paralela. O formato do segmento dinâmico ali é `raw`, e não
`canonicalUuid`, porque `:driver` do webhook não é UUID.

Sem `webhookSecret` o próprio módulo não publica a rota de recibo: o caminho responde **404, não
401**. Ele fica assim até o T005, que traz assinatura, janela de timestamp e nonce — publicar antes
seria aceitar qualquer corpo como recibo.

⚠️ As rotas de template têm escopo `admin` no módulo e `requiredScopes` vazio, o que o `module-http`
lê como "qualquer escopo do host": hoje qualquer usuário com vínculo ativo lista e cria template. O
`createNotificationRoutes` não expõe como restringir isso. Registrado para o T008, que é quando o
catálogo passa a ter dono.

```
$ bun test ./test/notification-http.contract.test.ts
 8 pass
 0 fail

$ bun run --cwd apps/api-transportada test
 2420 pass
 12 skip
 0 fail
Ran 2432 tests across 100 files.

$ bun run typecheck && bun run lint   # raiz, quatro apps, sem achados
```

## T005 — webhook de recibo: assinatura, janela e nonce

A rota só é publicada com `NOTIFICATION_WEBHOOK_SECRET` no ambiente — variável **opcional**, ao
contrário da chave de supressão: instalação sem provedor de recibo sobe normalmente e o caminho
responde 404. A assinatura é HMAC-SHA256 sobre o timestamp **e** o corpo cru (`rawBody`), nessa
ordem, comparada em tempo constante pelo módulo; fora da janela de 300s o recibo é recusado com 401,
sem chegar ao caso de uso.

O achado que decidiu o desenho: a proteção contra replay do módulo só roda **se o módulo tiver um
`cache`** (`providers.cache`). Sem ele o `claimNotificationWebhookDelivery` nem é chamado, e o
replay passa — em silêncio, com 204, indistinguível do caminho correto. O contrato fixa os dois
lados: com cache, a repetição da mesma assinatura não chega duas vezes ao caso de uso; sem cache,
chega — é este teste que documenta por que o provider existe.

O cache é de processo (`in-memory-notification-cache.provider.ts`), e a escolha vem da distribuição:
uma instalação por transportadora, um processo de API (ADR-0021). A expiração é a da **primeira**
reivindicação — renovar a cada tentativa deixaria um atacante manter a chave viva repetindo o
replay. ⚠️ Com mais de uma réplica a proteção passa a valer por réplica, e aí isto vira adaptador
sobre armazenamento compartilhado; é a mesma ressalva que o módulo faz para o notificador em
processo. O pior caso de reinício é aceitar de novo um recibo dos últimos 5 minutos, e recibo é
idempotente no módulo.

Recibo duplicado responde **200**, não 4xx: é o módulo dizendo ao provedor "já recebi", para ele não
entrar em loop de reentrega.

```
$ bun test ./test/notification-webhook.contract.test.ts
 9 pass
 0 fail

$ bun run --cwd apps/api-transportada test
 2432 pass
 12 skip
 0 fail
Ran 2444 tests across 101 files.

$ bun run typecheck && bun run lint   # raiz, quatro apps, sem achados
```

⚠️ **Deploy (T005):** `NOTIFICATION_WEBHOOK_SECRET` precisa ser cadastrada no Railway (distinta por
ambiente) quando houver provedor entregando recibo. Sem ela nada quebra — a rota simplesmente não
existe.

## T010 · T011 — o módulo aparece na tela

Antecipados fora da ordem da spec, a pedido: até aqui nada de notificações era visível no produto.

`@adatechnology/notification-ui` e `@adatechnology/notification-client` pinados em `0.1.0-rc.2` no
`apps/frontend-transportada`. O `NotificationProvider` envolve o `ApplicationShell` em `src/main.tsx`
com o cliente de `notification/shared/notificationClient.service.ts` — `baseUrl` de
`getIdentityEnvironment().apiBaseUrl + '/v1'` e o Bearer buscado **a cada chamada**, nunca capturado
no boot, porque o token do Keycloak rotaciona.

O tema é `notification.module.css`, e a descoberta que ele registra: as variáveis que o hospedeiro
preenche são as **curtas** (`--adn-surface`, `--adn-text`, `--adn-muted`, `--adn-accent`,
`--adn-danger`, `--adn-border`, `--adn-radius-md`, `--adn-space-2..4`). As `--adn-color-*` o pacote
redeclara nas classes dele (`.adn-bell`, `.adn-list`, …), abaixo do nosso tema na cascata — escrever
nelas não pegaria, e o valor de fábrica é claro: seria texto quase branco sobre fundo branco no meio
do nosso tema escuro, buraco que só aparece na tela, nunca no build. O contrato
`test/design-system/notification-theme.contract.ts` extrai a lista de `var(--adn-x, fallback)` do
CSS do pacote e falha se alguma ficar sem valor nosso; mais dois testes proíbem hexadecimal, `px` e
valor que não venha de `var(--…)`.

Sino no cabeçalho (`application-user-area`), rota `/notificacoes` com `NotificationsWorkspace`,
textos acentuados em `notification.locale.json` (e o `.en.`). A entrada `notification` fica **fora**
dos grupos do menu lateral: a porta é o sino; ela existe em `WORKSPACE_NAVIGATION_ITEMS` só para o
título da tela sair certo. Ícone novo `workspace-notification` no design system — `<svg>` cru é
proibido. O shell entrou em `SHELL_RULES` do contrato de largura.

```
$ bun run --cwd apps/frontend-transportada test
 1122 pass
 0 fail
Ran 1122 tests across 17 files.

$ bun run --cwd apps/frontend-transportada typecheck   # sem achados
$ bun run --cwd apps/frontend-transportada lint        # sem achados
$ bun run --cwd apps/frontend-transportada build       # ✓ built, PWA 11 entries
```

⚠️ A caixa abre **vazia**: nada dispara notificação ainda (T006–T009). A tela e o sino estão de pé e
falam com a API; conteúdo real depende da fila e dos gatilhos de produto.

## T006 — a fila de entregas sai da memória

Contrato antes da implementação: `apps/api-transportada/test/notification/queue.contract.ts`
(12 testes) fixa o nome das três trilhas
(`${QUEUE_PREFIX}.notification.v1.{main,retry,dead}.{exchange,queue}`), que o prefixo vem do
ambiente, que o corpo publicado tem **só as cinco referências** do `NotificationJob` — nada de
endereço ou conteúdo —, que `messageId`/`correlationId` carregam entrega e notificação, e as
disposições: sucesso → `ack`, exceção → `retry`, payload que não é job → erro no `decode`, isto é,
fila morta.

Duas decisões que valem registro:

- **O atraso não é obedecido, e isso é dito em voz alta.** Sem o plugin
  `rabbitmq-delayed-message-exchange` o broker entrega o `x-delay` na hora. O adaptador publica o
  cabeçalho e **loga `notification.queue.delay_not_supported`** — agendamento silenciosamente virado
  em entrega imediata é o mesmo modo de falha do cache do T005: falha aberta, e sem ruído.
- **A conexão é preguiçosa.** `bootstrap()` é síncrono e abrir canal não é; o
  `createLazyRabbitMqNotificationQueue` abre na primeira entrega e memoriza a promessa, então duas
  entregas simultâneas não abrem dois canais e fechar sem nunca ter entregado não conecta.

Configuração: `RABBITMQ_URL` + `QUEUE_PREFIX` entram no env da API como **par** (`messaging`) — meia
configuração viraria trilha com nome de outro ambiente. Ausentes, a API sobe, loga
`notification.queue.not_configured` e o módulo cai na fila em memória dele.

⚠️ A API não tinha broker: ela produz por outbox (`processing_outbox`, `cte_issuance_outbox`) e o
relay do worker publica. Aqui o módulo publica direto, então existe uma janela de perda entre a
transação dele e o `publish` (queda no meio = entrega que ninguém retoma). A varredura do T007 é o
caminho de recuperação previsto; se ela não cobrir, a alternativa é levar a entrega para o outbox.

```bash
bun test ./test/notification-queue.contract.test.ts   # 12 pass / 0 fail
bun run --cwd apps/api-transportada typecheck         # limpo
bun run --cwd apps/api-transportada lint              # limpo
bun run --cwd apps/api-transportada test              # 2450 pass / 12 skip / 0 fail (102 arquivos)
```

## T007 — o worker consome a fila e o cron roda as rotinas

O módulo agora tem as duas metades que faltavam. **No worker**, `startNotificationConsumer` liga o
`createNotificationWorker` do próprio pacote — quem conhece a máquina de estados da entrega é ele; a
app só entrega o transporte (`createRabbitMqNotificationQueue` sobre o mesmo trilho que a API
publica) e o ciclo de vida do processo. O `stop()` entra na lista de consumidores do
`WorkerShutdown`, então o desligamento devolve a entrega em voo para a fila em vez de deixá-la presa
em `queued`. **No cron**, o job novo `notification.schedules.run` roda `createNotificationSchedules`
— despachar o que venceu, expirar, purgar retenção — uma vez por janela.

Decisões:

- **A mesma instância de fila vai para o módulo e para o worker dele.** Duas seriam dois canais, e
  um `close` que fecha só metade.
- **O cron roda todas as rotinas, ignorando o `cronExpression` que elas declaram.** O processo é
  one-shot e quem agenda é o CronJob lá fora; as três são idempotentes. Uma rotina que quebra é
  contada como falha e **não interrompe** as outras — a purga não depende do despacho, e a próxima
  janela só vem daqui a uma cadência inteira.
- **Sem driver de canal no cron.** Ele só agenda; um canal configurado ali faria o mesmo e-mail sair
  por dois processos.
- **`NOTIFICATION_SUPPRESSION_HMAC_KEY` passa a ser obrigatória no worker e no job de notificação do
  cron**, com a mesma recusa de reuso da chave de envelope que a API já fazia. Chave diferente da que
  a API usou para gravar produz HMAC que não casa com nada — e o e-mail volta a sair para quem já
  recusou. Falha no boot, não na primeira entrega. ⚠️ Precisa ser configurada no Railway (staging e
  produção) **também nesses dois serviços**, com o mesmo valor da API.

⚠️ Três cópias por valor novas, e nenhuma app importa código da outra: a rota/topologia da fila e o
adaptador (`worker/src/messaging/`, `cron/src/notification-schedules/infrastructure/`), o resolvedor
de destinatário e a tabela `identity_user_profiles`. Nome de trilha que divirja produz duas filas que
nunca se encontram e entrega que some sem erro — o que guarda a paridade é
`worker/test/notification/queue-topology.contract.ts` contra
`api/test/notification/queue.contract.ts`.

O contrato pedido pela task é comportamento do módulo e só vale contra Postgres de verdade — fora do
banco, dedupe e supressão seriam encenação, porque quem garante é o índice único e a tabela de
supressão:

```bash
# dedupeKey repetida devolve a mesma notificação e enfileira uma entrega só;
# `invalid_target` suprime o endereço e o envio seguinte nem chega ao driver
DRIZZLE_TEST_DATABASE_URL=… bun test ./test/notification-delivery-behaviour.contract.test.ts  # 2 pass / 0 fail

bun test ./test/notification.contract.test.ts               # worker — 11 pass / 0 fail
bun test ./test/notification-schedules.contract.test.ts     # cron — 11 pass / 0 fail
bun run --cwd apps/api-transportada test                    # 2450 pass / 0 fail
bun run --cwd apps/worker-transportada test                 # 441 pass / 0 fail
bun run --cwd apps/cron-transportada test                   # 138 pass / 0 fail
bun run lint && bun run typecheck                           # limpos nas quatro apps
```

## T008 — o catálogo de assuntos, canais e templates

O módulo aceita `category` e `templateKey` como string livre. String livre erra em silêncio: o
disparo grava a notificação, a renderização não acha template e a entrega morre sem ninguém ver.
O catálogo em `src/notification/domain/notification-catalog.constant.ts` fecha esse vocabulário.

Quatro decisões:

1. **Quatro categorias** (`billing`, `cte-batch`, `identity`, `nfse`) — é por categoria que o
   destinatário liga e desliga canal na tela de preferências, então ela é vocabulário de produto,
   não de módulo. `identity` já existe no catálogo de categorias sem template próprio: convite e
   recuperação de senha continuam saindo pelo trilho antigo do worker.
2. **Dois canais** (`inbox`, `email`). O módulo conhece push, WhatsApp e SMS; nenhum tem driver
   configurado aqui, e oferecê-los na tela prometeria entrega que não sai.
3. **A chave do template é prefixada pela categoria** (`cte-batch.issuance-failed`) e é identidade
   de negócio: renomear quebra template já publicado no banco.
4. **Os marcadores são declarados na entrada** e o contrato compara nos dois sentidos com o que o
   texto usa. Marcador não declarado renderiza string vazia — o e-mail sai com "o lote falhou" e
   nada falha.

A semente é derivada do catálogo (`buildNotificationTemplateSeeds`), nunca escrita à mão, e o
`upsert` é idempotente por `(key, channel, locale)`: rodar a cada subida devolve o texto do
código, e é assim que um template antigo no banco não sobrevive à atualização.

⚠️ **Passo novo de deploy:** `bun run --cwd apps/api-transportada db:seed:notification-templates`,
ao lado de `db:migrate` e `db:provision` — nunca no startup do servidor. Ambiente sem
`PROVISION_COMPANY_ID` sai calado (`{"templates":"skipped"}`).

```
bun run --cwd apps/api-transportada test    → 2456 pass · 14 skip · 0 fail
bun run --cwd apps/api-transportada lint    → limpo
bunx tsc --noEmit (api)                     → limpo
```

## T009 — os três disparos ligados

Cada aviso tem **um destinatário: o dono do agregado**, não a empresa inteira. O lote guarda
`operator_user_id`, a fatura guarda `actor_user_id` e a tentativa de NFS-e guarda o ator no
`nfse_issuance_outbox`. Leque para todo mundo seria caixa de entrada de ninguém, e a chave de
deduplicação do módulo é única **por empresa** — o primeiro membro consumiria a chave e os demais
ficariam sem aviso.

Três decisões que valem por si:

1. **A chave sai do agregado, nunca do relógio.** `cte-batch.issuance-failed:${batchId}`,
   `billing.invoice-due:${invoiceId}` e `nfse.invoice-rejected:${attemptId}` — reentrega da mesma
   mensagem e ciclo seguinte do cron não viram segundo aviso. A de NFS-e é da **tentativa** porque
   reemitir e ser recusado de novo é fato novo.
2. **O aviso do lote sai depois do commit.** `synchronizeBatchStatus` passou a devolver o status
   novo quando ele muda; as duas transações do write-back propagam esse retorno e o repositório
   chama `onBatchSettled` **fora** da transação, só quando o lote fechou em `error`. Notificar de
   dentro é avisar de algo que o banco ainda pode desfazer.
3. **Falha ao notificar não derruba o processamento fiscal.** O CT-e já foi liquidado quando o
   disparo acontece: `createNotificationTrigger` engole a exceção como `notification_trigger_failed`.

O notificador de NFS-e é **dependência opcional** do caso de uso: o deploy de NFS-e sobe sem broker
nem chave de supressão, e a reconciliação não pode depender do aviso para existir. Sem
`notificationSchedules` configurado o job roda igual e calado.

⚠️ Cópias por valor novas, guardadas por contrato: catálogo reduzido no worker e no cron
(`notification.constant.ts` / `notification-schedules.constant.ts`), `cte_batches.name` e
`operator_user_id` na cópia do worker, `billing_invoices` e `nfse_issuance_outbox` no cron.

```
bun run --cwd apps/worker-transportada test  → 445 pass · 0 fail
bun run --cwd apps/worker-transportada lint  → limpo
bunx tsc --noEmit (worker)                   → limpo
bun run --cwd apps/cron-transportada test    → 148 pass · 0 fail
bun run --cwd apps/cron-transportada lint    → limpo
bunx tsc --noEmit (cron)                     → limpo
```

## T012 — tela de preferências

`/notificacoes/preferencias` é **sub-rota do mesmo workspace**, não item de menu: quem chega vem do
link da inbox (`settingsHref`), e a porta de entrada continua sendo o sino. `NOTIFICATION_SETTINGS_HREF`
é declarada uma vez em `notificationCatalog.constant.ts` — a navegação manual de `src/main.tsx` casa
por esse valor, e a inbox aponta para ele; duas cópias do caminho dariam link que não abre nada.

O catálogo da tela (`inbox`/`email`; `cte-batch`, `nfse`, `billing`, `identity`) é **cópia por valor**
do catálogo da API. Canal a mais promete entrega que não sai; assunto a menos esconde o desligamento
de um aviso que existe. `test/notification/settings-catalog.contract.ts` lê o arquivo da API e falha
quando divergem — inclusive exigindo rótulo nos dois idiomas para cada id.

```
bun run --cwd apps/frontend-transportada test       → 1152 pass · 0 fail (18 arquivos)
bun run --cwd apps/frontend-transportada typecheck  → limpo
bun run --cwd apps/frontend-transportada lint       → limpo
bun run --cwd apps/frontend-transportada build      → ok (PWA, 12 entradas)
```

## T013 — portões de fechamento

```
make check                 → format:check falha em 4 docs de spec de outra feature (035, 037);
                             o restante do portão foi rodado direto:
bun run lint (4 apps)      → limpo
bun run typecheck (4 apps) → limpo
bun run test  api          → 2456 pass · 0 fail (104 arquivos)
bun run test  worker       → 445 pass · 0 fail
bun run test  cron         → 148 pass · 0 fail
bun run test  frontend     → 1152 pass · 0 fail
bun run build (4 apps)     → ok
make migration-test        → 64 pass · 0 fail (migration + rollback em Postgres descartável)
make worker-integration    → 39 pass · 0 fail (RabbitMQ, MinIO e Postgres reais)
```

**Varredura de log.** Os quatro únicos pontos que logam no caminho de notificação —
`notification_trigger_failed` (worker e cron), `notification_schedule_failed` e
`billing_invoice_due_swept` — carregam id, contagem, `templateKey`, `dedupeKey` e razão de erro.
Nenhum endereço de destinatário aparece em nenhum nível. O endereço só existe dentro de
`identity-recipient.resolver.ts`, que o devolve ao módulo para a entrega e não o registra; a política
de disparo referencia a pessoa por `recipientUserId` e nada mais. Os payloads dos três avisos levam
`batchName`, `failedCount`, `dueDate`, `invoiceNumber` e `rejectionReason` — nenhum dado pessoal.

⏳ **Pendente:** as três telas lidas em staging com dado real. Depende do deploy, que sai pelo
pipeline do GitHub, e de `NOTIFICATION_SUPPRESSION_HMAC_KEY` configurada nos três serviços
(API, worker e cron), mais o passo de seed dos templates no pipeline. Enquanto isso T013 fica aberta.

### Passos de deploy que faltavam

O seed dos templates entrou no **pre-deploy da API**, depois do provisionamento: a Railway aceita um
`preDeployCommand` só, e a empresa precisa existir para o template pertencer a alguém. Ambiente sem
`COMPANY_ID` declarado reporta `templates: 'skipped'` e sobe igual. O contrato do grafo de imports
pegou na hora que a imagem de runtime não copiava `src/notification` — o `COPY` foi acrescentado, e
sem ele o deploy quebraria só dentro do contêiner, com `Cannot find module`.

O trilho agendado ganhou serviço próprio: `deploy/cron-notifications/railway.json`
(`CRON_JOB=notification.schedules.run`, de hora em hora) e o passo correspondente no `deploy.yml`,
ao lado de `cron` e `cron-nfse`.

### Furo achado ao configurar o deploy

`notificationSchedules` só era resolvido quando `CRON_JOB` era o job de rotinas — o job de NFS-e,
que também avisa (rejeição da prefeitura, T009), recebia `undefined` e nunca construía o notificador.
A rejeição morria no banco e ninguém era avisado, sem nada falhar. Agora o trilho é resolvido para os
dois jobs: obrigatório no dono, **opcional** no de NFS-e — nenhuma das três variáveis declarada, sobe
calado; qualquer uma declarada, as três são exigidas, porque chave sem broker publicaria em lugar
nenhum. `test/notification-schedules/environment.contract.ts` cobre os três ramos.

```
bun run --cwd apps/cron-transportada test → 151 pass · 0 fail
```

### O deploy de produção reprovou: o schema `notification` não era migrado

Primeiro deploy em produção (run 31854307989, 15/08 00:46) terminou `deploy=failure` com a API em
`FAILED`. A imagem construiu inteira; quem morreu foi o `preDeployCommand`:

```
PostgresError: relation "notification.templates" does not exist
  code: 42P01 · routine: parserOpenTable
  query: select "version" from "notification"."templates" where ...
```

Causa: `pre-deploy.service.ts` chamava `runDatabaseMigrations` — só as migrations de `drizzle/` — e
logo em seguida semeava os templates. A criação do schema `notification`, que tem tabela de controle
própria e viaja dentro do pacote, só existia dentro do `if (import.meta.main)` de
`database-migration.service.ts`, que o `preDeployCommand` **não** executa. Os dois passos nunca
tinham rodado juntos fora do teste.

O estrago foi contido porque a ordem do pre-deploy é `migrate → provision → seed`: as 64 migrations
da aplicação aplicaram (`drizzle.__drizzle_migrations` = 64), o seed reprovou depois, e a Railway
manteve o contêiner anterior servindo — produção seguiu no ar o tempo todo (`/health/ready` = `ok`),
com o banco à frente do código.

Correção: `runAllDatabaseMigrations` passa a ser o único ponto que sabe o que "migrar" significa —
`drizzle/` e depois o schema do pacote — e tanto o passo manual quanto o pre-deploy o chamam.

Contrato antes da correção, e ele falhava:

```
test/database-migration/pre-deploy.contract.ts
  · o passo de migration do pre-deploy cria o schema de notificação  (Postgres real)
  · o entrypoint migra pelo passo que inclui o schema de notificação (estrutural)

antes:  SyntaxError: Export named 'runAllDatabaseMigrations' not found
depois: make migration-test → 70 pass · 0 fail
        bun run check       → exit 0 (format · lint · typecheck · test · build)
```
