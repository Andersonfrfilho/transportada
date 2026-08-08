# Evidências — 029 Lançamento em produção

Uma seção por task, preenchida no fechamento dela. Task sem evidência aqui não está concluída.

## Levantamento inicial (07/08/2026)

`railway status --json`, projeto `62de4c69-216a-4335-93a0-4942c6a95c54`:

```text
staging     Postgres  Postgres-q0RQ  api  cron  keycloak  rabbitmq  transportada-frontend  worker
production  Postgres-FDoz  Postgres-Hqfu
```

Ambos os Postgres em `ghcr.io/railwayapp-templates/postgres-ssl:18`, com volume, sem TCP proxy
(`railway variables` não devolve variável `*_PROXY_*` em nenhum dos quatro).

```text
$ git rev-list --count main..staging   → 82
$ git rev-list --count staging..main   → 0
$ git diff --name-only main..staging -- 'apps/api-transportada/drizzle/*.sql' | wc -l → 18 (9 migrations)
```

Busca por observabilidade no repositório: `rg -i "sentry|drain|otel|opentelemetry"` → nenhum
resultado. `@adatechnology/logger@0.0.1` não expõe redação (`src/` tem `logger.ts`, `context.ts`,
`middleware.ts`, `trace-stack.ts`, `types.ts` — nenhum redator).

## Fase A — O que sai do processo

- [x] T001 — `adatechnology-packages/packages/backend/logger/src/redact.test.ts`, 20 casos em 6
      blocos: denylist por nome de chave (primeiro nível, variação de caixa/separador/camelCase,
      aninhamento em array, chave extra por configuração), varredura por forma (CPF cru e
      formatado, CNPJ cru e formatado, e-mail, telefone com e sem DDI, mensagem além do meta),
      chave de acesso (máscara, CNPJ do emitente não escapa, duas chaves continuam distintas),
      teste negativo (12 campos opacos/enum/contagem/duração/diagnóstico intactos, número de
      negócio, tipos primitivos), estruturas hostis (ciclo, profundidade 40 com corte no padrão,
      `maxDepth` configurado, 6 valores exóticos sem exceção) e custo.

      Falha esperada antes da implementação, pelo motivo certo:

      ```text
      $ bun test src/redact.test.ts
      error: Cannot find module './redact' from '.../src/redact.test.ts'
      0 pass · 1 fail · 1 error
      ```

- [x] T002 — `src/redact.ts` + export em `src/index.ts` (`redact`, `redactMeta`,
      `DEFAULT_REDACTED_KEYS`, `RedactOptions`).

      Camada 1: 25 tokens normalizados (NFD sem diacrítico, minúsculo, sem separador), casando por
      igualdade **ou sufixo** — `clienteCpf` cai, `enderecoId` não. Camada 2: 9 padrões aplicados
      em ordem fixa, e a ordem é o contrato — a chave de acesso é consumida antes de CNPJ e CPF,
      senão o CNPJ do emitente no meio dos 44 dígitos seria comido pelo padrão curto. Chave de
      acesso vira `****` + 6 últimos (`****012347`). Número inteiro de 11/14/44 dígitos também é
      varrido; qualquer outro volta como número. Ciclo → `[CIRCULAR]` (guarda por caminho, não
      global — objeto repetido em ramos irmãos não é falso positivo), profundidade → `[TRUNCATED]`
      com teto padrão 8. `Error` vira `{name, message, stack}` redigidos, `bigint` vira string
      (senão o `JSON.stringify` do logger lança).

      ```text
      $ bun test src/redact.test.ts
      20 pass · 0 fail · 65 expect() calls  [149ms]

      $ bun run check            # tsc --noEmit
      (sem saída)

      $ bun test                 # pacote inteiro, redact + logger
      29 pass · 0 fail · 89 expect() calls
      ```

      Custo medido no próprio contrato: 10.000 redações de um `meta` típico (6 campos, um objeto
      aninhado, uma string com CPF e e-mail) abaixo do teto de 2s.

- [x] T003 — `src/http-transport.ts` (`HttpTransport`) + wiring no `Logger.write` (`src/logger.ts`) + `logger.flush()`/`logger.stop()` novos. Export de `HttpTransport`/`HttpTransportConfig`
      no `index.ts`.

      Teste do transporte primeiro (`src/http-transport.test.ts`, servidor Bun.serve fake),
      falhando pelo motivo certo antes da implementação:

      ```text
      $ bun test src/http-transport.test.ts
      error: Cannot find module './http-transport' from '.../src/http-transport.test.ts'
      0 pass · 1 fail · 1 error
      ```

      9 casos: `sinkUrl` vazio desliga (`enqueue`/`flush` viram no-op sem lançar), NDJSON (uma
      linha por entrada, `content-type: application/x-ndjson`), batch automático ao cruzar
      `batchSize`, request nunca maior que `batchSize` mesmo com fila maior (drenagem em vários
      lotes numa só chamada de `flush()`), fila com teto (o mais antigo cai quando lota,
      confirmado pelos índices que sobrevivem), descarte silencioso (resposta 5xx e host
      inexistente não lançam, fila volta a aceitar depois), `stop()` idempotente.

      Design que evitou um teste frágil por corrida: `flush()` guarda uma única promise de
      drenagem em andamento (`flushPromise`) — quem chama `flush()` enquanto uma já roda recebe a
      **mesma** promise em vez de um no-op prematuro, e o laço interno drena tudo que for
      enfileirado durante a espera. Assim `await logger.flush()` espera o esvaziamento real, sem
      `sleep` arbitrário no teste nem nos consumidores.

      Redação ligada no `Logger.write`, antes de todo destino (console, arquivo, transporte) —
      novo bloco em `src/logger.test.ts`: `logger.info` com CPF e e-mail no `meta` não aparece no
      console capturado nem no corpo recebido pelo servidor fake; `companyId` sobrevive nos dois.
      Segundo caso: sem `sinkUrl` configurado, `logger.flush()` resolve sem lançar.

      ```text
      $ bun test src/http-transport.test.ts
      9 pass · 0 fail · 16 expect() calls  [27ms]

      $ bun run check             # tsc --noEmit
      (sem saída)

      $ bun test                  # pacote inteiro: redact + http-transport + logger
      40 pass · 0 fail · 113 expect() calls  [164ms]
      ```

      Commit `4e2bc1f` (T001+T002) e o desta task em `adatechnology-packages`, isolados do
      trabalho não relacionado em `notification-module`/`fiscal-provider` presente no working
      tree.

- [x] T004 — Changeset `.changeset/redactor-logger-http-sink.md` (`minor`) commitado isolado
      (`41492a0`, só esse arquivo — `notification-module`/`fiscal-provider` alheios ficaram de
      fora), rebase sobre `origin/main` (só um commit `chore(release): version packages` do bot à
      frente) e push. `publish.yml` (run `31234400514`) verde: `Build all packages` →
      `Version packages` → `Commit version bump` → `Publish packages` → as duas etapas de
      manutenção de pacotes legados.

      Achado durante a task: `adatechnology-packages` está em **modo pre-release do changesets**
      (`.changeset/pre.json`, `mode: "pre"`, `tag: "rc"`), aberto para outro trabalho já pendente
      (`notification-module`, `catalog-module` etc. — changesets deles já existiam antes desta
      task). Isso é repo-wide: qualquer publish nesse estado sai como prerelease. Resultado real —

      ```text
      $ npm view @adatechnology/logger dist-tags --json
      { "latest": "0.0.1", "rc": "0.1.0-rc.0" }
      ```

      `@adatechnology/logger` saiu como `0.1.0-rc.0` na tag `rc`, não `0.1.0` estável na `latest`.
      Sair do modo pre-release resolveria isso, mas forçaria o release de tudo mais que está
      pendente nesse modo — decisão que pertence ao outro workstream, fora do escopo desta task.
      Decisão tomada com o usuário: instalar a versão exata `0.1.0-rc.0` agora (não um range
      `^0.1.0`, que não resolveria prerelease), e registrar aqui a pendência de normalizar para
      `^0.1.0` quando o modo pre-release do repo de packages sair.

      Dependência subida nas três apps (`api-transportada`, `worker-transportada`,
      `cron-transportada`), `bun install` regerou o lockfile:

      ```text
      $ grep 'adatechnology/logger@' bun.lock
      "@adatechnology/logger": ["@adatechnology/logger@0.1.0-rc.0", ...]

      $ bun run typecheck   # api, worker, cron, frontend
      (sem saída — as 4 apps limpas)
      ```

      **Pendência aberta:** trocar `0.1.0-rc.0` por `^0.1.0` nas três apps quando
      `adatechnology-packages` sair do modo pre-release e `0.1.0` publicar na tag `latest`.

- [x] T005 — `src/observability/sentry.service.ts` nas três apps (`@sentry/bun@10.69.0`),
      `createErrorTracker` com `SentryClientPort` injetável — o contract test nunca fala com a rede.
      Sem DSN (ausente ou em branco) `init` não é chamado: `enabled: false`, captura e dreno viram
      no-op. Com DSN: `sendDefaultPii: false`, `tracesSampleRate: 0`, `beforeSend` mandando o
      **evento inteiro** ao `redactMeta` da T002 — não só `extra`/`contexts`/`breadcrumbs`/`request`,
      porque `message` e `exception.values[].value` vazam tanto quanto.

      Dois furos concretos que a denylist padrão do redator não pega sozinha, achados lendo o
      `isDeniedKey` publicado e fechados por `extraKeys: ['cookies', 'ip_address']`:
      `'cookies'.endsWith('cookie')` é **false** (o `s` quebra o casamento por sufixo), e
      `ip_address` normaliza para `ipaddress`, que não está entre as 25 chaves padrão. Os dois são
      campos que o próprio SDK preenche.

      ```text
      $ bun test ./test/observability.contract.test.ts   # apps/cron-transportada
      10 pass · 0 fail · 27 expect() calls  [165ms]
      $ bun test ./test/observability.contract.test.ts   # apps/worker-transportada
      10 pass · 0 fail · 27 expect() calls  [118ms]
      $ bun test ./test/observability.contract.test.ts   # apps/api-transportada
      17 pass · 0 fail · 38 expect() calls  [151ms]
      ```

      O teste de redação monta um evento hostil com PII em todo lugar que o SDK sabe preencher
      (CPF na `message`, CNPJ+e-mail no `exception.values[].value`, telefone no `breadcrumbs`,
      chave de acesso no `contexts` e no `extra`, cookie de sessão e `Authorization` no `request`,
      `ip_address` no `user`) e afirma sobre o JSON do que sai: nenhuma das oito formas sobrevive,
      e `companyId`, `correlationId`, `event_id` e o `type` da exceção **sobrevivem** — sem eles o
      issue chega irrastreável. Os lookarounds de dígito do redator (`(?<!\d)…(?!\d)`) são o motivo
      de o hex de 32 do `event_id` e os UUIDs passarem intactos.

      `flush` não é opcional e virou contrato: o cron é one-shot (`process.exit` logo após o
      ciclo) e worker/API saem no SIGTERM — sem drenar, o último evento morre na fila do SDK.
      Cron dreno no `finally` do ciclo; worker como último `closeable` do desligamento gracioso;
      API no `createShutdownHandler`, depois do `database.close()`.

      **Escopo ampliado com motivo:** a API converte toda falha em resposta em
      `request-handler.service.ts`, então as integrações padrão do SDK (exceção não capturada)
      nunca veriam um 500 — a evidência exigida pela T009 ("provocar uma exceção … o issue no
      GlitchTip") seria inalcançável sem isso. `captureError` foi passado por
      `response.service` → `request-handler.service` → `server.service` → `main.ts`, e só o erro
      desconhecido chega ao rastreio: `ApiError` de domínio é resposta esperada, não incidente.
      Os três testes do funil de 500 cobrem exatamente isso.

      **Antecipação da T006 com motivo:** `SENTRY_DSN`/`SENTRY_ENVIRONMENT` entraram nos três
      schemas de env aqui, porque a fiação no `main.ts` não existe sem eles. Vazio é o padrão e
      significa desligado; preenchido e torto derruba o boot (`URL.canParse`). `SENTRY_ENVIRONMENT`
      ausente cai no `APP_ENV`. Sobra para a T006: `LOG_SINK_URL` e o `.env.example`.

      Gates das três apps depois da mudança:

      ```text
      cron    typecheck ok · lint ok · 58 pass · 0 fail
      worker  typecheck ok · lint ok · 285 pass · 0 fail
      api     typecheck ok · lint ok · 1897 pass · 3 skip · 0 fail  (81 arquivos)
      ```

- [x] T006 — `LOG_SINK_URL` nas três apps e as três variáveis declaradas no `.env.example`.

      Teste antes: `test/observability/environment.contract.ts` na API (novo arquivo, 8 casos,
      importado pelo entrypoint `test/observability.contract.test.ts`) e os casos equivalentes
      dentro do `test/environment.contract.test.ts` que cron e worker já tinham — é onde os casos
      de `SENTRY_DSN` moram, e separar teria duplicado a fixture de ambiente inteira. Vermelho
      confirmado em cada app antes da implementação (cron 9 pass/2 fail, worker 9 pass/2 fail,
      api 18 pass/2 fail).

      `optionalUrl` (que a T005 criou para `SENTRY_DSN`) passou a servir também o `LOG_SINK_URL`
      — validador único por app, não dois iguais. Na API ele recebe o nome da variável para a
      mensagem continuar específica.

      Um defeito que só o `.env.example` revelou: `SENTRY_ENVIRONMENT` era
      `z.string().trim().min(1).optional()`, então a variável **declarada e vazia** derrubava o
      boot — exatamente a forma como o `.env.example` precisa escrevê-la. Um caso novo por app
      (`SENTRY_ENVIRONMENT declarado e vazio cai no APP_ENV`) foi para o vermelho, e a correção é
      o helper `optionalText()`: vazio é ausência, e ausência cai no `APP_ENV`.

      O `sinkUrl` chega ao `createLogger` das três apps por spread condicional
      (`exactOptionalPropertyTypes`), e o `flush()`/`stop()` do logger entrou no desligamento:
      no `finally` do ciclo do cron (processo one-shot — o que ficou na fila some com ele), no
      último `closeable` do worker e no `drainObservability` da API. Só os tipos de **runtime**
      do logger foram alargados; `CronLogger`/`WorkerLogger`/`ApiLogger`, que todo consumidor
      implementa, seguem estreitos — `flush` não é contrato de quem loga.

      O contrato do `.env.example` ganhou uma asserção: as três chaves de observabilidade
      existem e são vazias. Variável que só existe no schema não é descoberta por quem preenche
      o ambiente.

      Gates das três apps:

      ```text
      cron    typecheck ok · lint ok · format ok ·   62 pass · 0 fail
      worker  typecheck ok · lint ok · format ok ·  289 pass · 0 fail
      api     typecheck ok · lint ok · format ok · 1902 pass · 3 skip · 0 fail
      ```

- [x] T007 — Projeto Railway `transportada-ops`.

      Tudo pelo CLI (`railway 4.58.0`), rodando de um diretório de rascunho e **nunca** da raiz do
      repositório: `railway init` grava o vínculo no diretório atual, e rodar na raiz trocaria o
      vínculo do projeto `transportada` pelo de ops.

      ```text
      $ railway init --name transportada-ops --workspace "AdA Technology 🔬" --json
      {"id":"c44c24a3-ee5f-49e6-84a1-cfd7ff6960db","name":"transportada-ops"}
      ```

      **Buckets** — região `sjc` (US West), a mesma costa em que o projeto principal roda. A
      região não sai do `railway status`; saiu do manifesto do último deploy da API
      (`meta.serviceManifest.deploy.multiRegionConfig.sfo.numReplicas=1` → `sfo`), e `sjc` é a
      opção de bucket correspondente.

      ```text
      $ railway bucket create transportada-afr-fernandes-logs           --region sjc
      $ railway bucket create transportada-afr-fernandes-backups        --region sjc
      $ railway bucket create transportada-afr-fernandes-fiscal-mirror  --region sjc
      transportada-afr-fernandes-logs           (…-logs-h3wyay)
      transportada-afr-fernandes-backups        (…-backups-edanch)
      transportada-afr-fernandes-fiscal-mirror  (…-fiscal-mirror-wush1)
      ```

      O nome real tem sufixo — o `BACKUP_S3_BUCKET`, o `LOG_ARCHIVE_S3_BUCKET` e o
      `FISCAL_MIRROR_S3_BUCKET` recebem o nome com sufixo, não o nome pedido. Endpoint
      `https://t3.storageapi.dev`, região `auto`, `virtual-host`.

      **Desvio 4 — os buckets nasceram `transportada-*` e foram recriados como
      `transportada-afr-fernandes-*`.** TransportAdA é o produto e AFR Fernandes é a instalação;
      pelo ADR-0021 cada transportadora é um deploy próprio, e o projeto de ops passou a ser um
      por cliente também — logs, exceções e backup de duas transportadoras no mesmo painel e no
      mesmo bucket seria misturar tenant e bucket, que é proibido.

      `railway bucket rename` **não serve** para isso: ele troca só o rótulo do Railway. Depois de
      renomear, `railway bucket credentials` ainda devolvia `bucketName: transportada-logs-wa7x5ti`
      — o nome real é fixo na criação. Por isso foram apagados e recriados, com 0 objetos dentro.
      Custo em código: nenhum. Nem `deploy/backup/backup.sh`, nem `deploy/vector/vector.yaml`, nem
      `bucket-mirror.yml` trazem nome de bucket literal — todos leem de variável.

      Recriar invalidou as duas provas anteriores, então as duas foram refeitas contra os buckets
      novos. `ls` em bucket vazio prova pouco, então cada um levou um ciclo inteiro de escrita:

      ```text
      OK  transportada-afr-fernandes-logs-h3wyay           escreveu, listou, apagou
      OK  transportada-afr-fernandes-backups-edanch        escreveu, listou, apagou
      OK  transportada-afr-fernandes-fiscal-mirror-wush1   escreveu, listou, apagou
      ```

      E o escopo da credencial, que é o que a task pede, foi provado pelo **negativo** — a
      credencial do bucket de logs contra o bucket de backups:

      ```text
      credencial de logs -> bucket transportada-afr-fernandes-backups-edanch
      An error occurred (AccessDenied) when calling the ListObjectsV2 operation: Access Denied.
      ```

      **Os três painéis**, cada um com volume próprio (`/data`, `/app/data`,
      `/var/lib/postgresql/data`), pelo domínio público:

      ```text
      uptime-kuma-production-457d     HTTP 200 · .../setup-database · <title>Uptime Kuma</title>
      glitchtip-web-production-3d80   HTTP 200 · /                  · <title>GlitchTip</title>
      openobserve-production-0484     HTTP 200 · /web/              · <title>OpenObserve</title>
      ```

      **Desvio 1 — o template do GlitchTip.** O `tasks.md` nomeia `glitchtip-sentry-alternative`.
      Esse template é de terceiro, **não verificado, 0 deploys, sem health score**. Existe o
      oficial, publicado pelo próprio GlitchTip: `glitchtip`, verificado, 87 deploys, health 100.
      Subir um template anônimo de 0 deploys para o serviço que vai guardar exceção de production
      é pior em todos os eixos, e foi o oficial que subiu.

      **Senha própria em cada painel (regra §2), gerada e nunca impressa.** `openssl rand` num
      subshell, entregue ao Railway por `railway variable set --stdin` — o valor não passa pelo
      terminal, pelo log nem pelo meu contexto. Quem precisar dele lê a variável no dashboard.

      O OpenObserve recusou a primeira senha e **isso é evidência, não tropeço** — prova que a
      senha não é a do template:

      ```text
      panicked at src/jobs/src/job/mod.rs:323:13:
      ZO_ROOT_USER_PASSWORD is too weak: Password must be 8-128 characters and contain at least
      one lowercase letter, one uppercase letter, one digit, and one special character.
      ```

      Com uma senha dentro da política, o painel sobe e autentica de verdade:

      ```text
      /api/organizations   HTTP 200  {"data":[{"identifier":"default","user_email":"…@live.com"…
      /config              HTTP 200  {"version":"v0.92.0"…
      /healthz             HTTP 200  {"status":"ok"}
      senha errada         HTTP 401
      ```

      **Desvio 2 — configuração quebrada no template do GlitchTip.** O serviço nasceu com
      `AWS_S3_ENDPOINT_URL = }}` (sobra de interpolação do template), `AWS_STORAGE_BUCKET_NAME`
      vazio e `DEFAULT_FILE_STORAGE` apontando para o backend S3. Qualquer upload quebraria, e um
      default quebrado é `A02 Security Misconfiguration`. As cinco variáveis foram removidas — o
      GlitchTip volta ao storage de arquivo do Django, e nada no nosso uso sobe arquivo.

      **Desvio 3 — `ALLOWED_HOSTS` curinga.** O boot avisava
      `ALLOWED_HOSTS is the wildcard default`. Restringir ao domínio público **derrubou o
      healthcheck**: o deploy ficou 8 minutos em `DEPLOYING` com a réplica `RUNNING`, porque a
      sonda do Railway chega com `Host: healthcheck.railway.app` e o Django respondia
      `DisallowedHost`. Com o host da sonda na lista, o deploy fecha e o aviso some:

      ```text
      ALLOWED_HOSTS = glitchtip-web-production-3d80.up.railway.app,glitchtip-web.railway.internal,
                      healthcheck.railway.app,localhost
      raiz    HTTP 200
      health  HTTP 200
      avisos de "ALLOWED_HOSTS is the wildcard" no deploy atual: 0
      ```

      **Primeira conta do GlitchTip sem abrir registro.** `ENABLE_USER_REGISTRATION=False` é o
      certo num painel com domínio público, e ligar o registro "só um minutinho" seria abrir
      cadastro aberto na internet. O superusuário foi criado por dentro do contêiner
      (`railway ssh` → `manage.py createsuperuser --noinput`), com a senha definida depois via
      `manage.py shell` lendo `os.environ` — `has_usable_password(): True`. O registro nunca foi
      aberto.

      **O que falta e é manual:** o Uptime Kuma está no `/setup-database`, o assistente de
      primeira execução. Enquanto ele não for concluído, **qualquer um que chegar primeiro na URL
      cria o admin** — é a janela que a §2 detesta, e é a tarefa a fazer agora, antes da T025. A
      senha do admin é escolhida ali; o Uptime Kuma não tem variável de bootstrap.

- [x] T008 — `deploy/vector/{Dockerfile,vector.yaml,railway.json}`.

      Teste antes: `test/deploy/vector.contract.ts` (8 casos, entrypoint
      `test/deploy.contract.test.ts`, registrado no `package.json` da API). Mora na suíte da API
      pelo mesmo motivo que o contrato do `.env.example` mora: é onde um teste de nível de
      repositório já roda num gate. Vermelho de 0 pass/8 fail antes dos arquivos existirem.

      O que o contrato prende, e por quê:

      - `address: '[::]:9000'` — private networking da Railway só resolve AAAA. Escutar em IPv4 é
        subir um serviço que nunca recebe nada, e o sintoma seria "log sumiu", não "serviço caiu".
      - `decoding.codec: json` + `framing.newline_delimited` — é o NDJSON que o `HttpTransport`
        do logger emite.
      - Sink `archive` (`aws_s3`): gzip, NDJSON, `key_prefix: logs/%Y/%m/%d/`. Partição por dia
        para o `aws s3 ls` de uma data ser barato e a retenção poder ser por prefixo.
      - Sink `search` (`http` → OpenObserve) com `buffer.when_full: drop_newest` e
        `healthcheck.enabled: false`. A busca é conveniência, o arquivo é a obrigação: painel
        fora do ar não pode encher o buffer e fazer contrapressão no caminho do bucket.
      - Nenhum sink órfão — todo destino consome a fonte `apps`.
      - Nenhuma credencial literal: a varredura exige que todo `access_key_id`, `secret_access_key`,
        `token`, `password`, `uri`, `bucket`, `endpoint` e `region` venha por `${...}`.
      - Imagem pinada por digest, não por tag móvel (o plano dizia `latest-alpine`; o padrão do
        `deploy/keycloak/Dockerfile` é digest, e é o que vale).

      `OPENOBSERVE_TOKEN` guarda o header Basic já montado (base64 de `usuário:token`), que é como
      o próprio OpenObserve entrega na tela de ingestão — uma variável em vez de duas, como o plano
      previa.

      Validação com o binário oficial (`vector 0.57.0`, baixado do GitHub releases; o Docker Hub
      pediu autenticação):

      ```text
      $ vector validate --no-environment deploy/vector/vector.yaml
      √ Loaded ["deploy/vector/vector.yaml"]
      √ Transforms configuration
      --------------------------------------
                                   Validated
      ```

      E o intake provado de verdade, com a **mesma** source do arquivo real (derivada dele por
      script, só trocando o sink por arquivo local e a porta, já ocupada nesta máquina):

      ```text
      $ curl -X POST http://[::1]:19000 --data-binary '<2 linhas NDJSON>'
      intake HTTP 200
      {"companyId":"c3d4","correlationId":"a1b2","level":"info","message":"cte_issued","path":"/","source_type":"http_server","timestamp":"..."}
      {"correlationId":"a1b2","level":"error","message":"boom","path":"/","source_type":"http_server","timestamp":"..."}
      ```

      Duas linhas viraram dois eventos com os campos intactos — o `correlationId` que a T009 vai
      usar para achar a linha no OpenObserve chega inteiro.

      Gates: `format:check` ok · `lint` ok · `typecheck` ok · api 1910 pass · 3 skip · 0 fail.

- [ ] T009 —

## Fase B — Sobrevivência do dado

- [x] T010 — Serviço `backup`: `deploy/backup/{Dockerfile,backup.sh,railway.json}`.

      Contrato antes: `apps/api-transportada/test/deploy/backup.contract.ts` (12 casos) entrou no
      entrypoint `test/deploy.contract.test.ts` e foi visto vermelho — `8 pass / 12 fail`, os 8
      sendo os do `vector`. Depois do script: `20 pass / 0 fail`.

      **O ciclo rodou de verdade** contra o `compose.yaml` do repositório, sem bucket remoto no
      caminho: Postgres local para os dois bancos (o do Keycloak simulado por um segundo banco no
      mesmo servidor) e MinIO local como destino S3.

      ```text
      {"level":"info","event":"backup_dump_completed","database":"app","object":"db-backups/daily/backup-2026-08-08T121605Z-app.dump.enc"}
      {"level":"info","event":"backup_dump_completed","database":"keycloak","object":"db-backups/daily/backup-2026-08-08T121605Z-keycloak.dump.enc"}
      {"level":"info","event":"backup_cycle_completed","stamp":"2026-08-08T121605Z","retention":"daily"}
      ```

      Bucket depois do ciclo — quatro objetos e o manifesto, nenhum dump em claro:

      ```text
      db-backups/daily/backup-2026-08-08T121605Z-app.dump.enc
      db-backups/daily/backup-2026-08-08T121605Z-app.dump.enc.sha256
      db-backups/daily/backup-2026-08-08T121605Z-keycloak.dump.enc
      db-backups/daily/backup-2026-08-08T121605Z-keycloak.dump.enc.sha256
      db-backups/manifest.jsonl
      ```

      Manifesto (linha da aplicação):

      ```json
      {"stamp":"2026-08-08T121605Z","database":"app","object":"db-backups/daily/backup-2026-08-08T121605Z-app.dump.enc","retention":"daily","sizeBytes":746880,"sha256":"edee37e2…f5a12","tableCount":70,"lastMigration":"20260806161903_cte_fiscal_number_advanced_event"}
      ```

      **O backup foi restaurado**, que é o que separa arquivo de backup: baixado do bucket,
      `sha256sum -c` ok, decifrado, `pg_restore` num banco descartável, e a comparação com o
      manifesto bateu exata — `tableCount` 70 e o mesmo `lastMigration`.

      ```text
      backup-2026-08-08T121605Z-app.dump.enc: OK
      $ psql t010_restore -tAc 'select count(*) … base tables'          → 70
      $ psql t010_restore -tAc 'select max(name) from drizzle.__drizzle_migrations'
        20260806161903_cte_fiscal_number_advanced_event
      ```

      **Falha provocada** (URL do Keycloak apontando para banco inexistente): saída 1,
      `backup_cycle_failed` com o `step` que o runbook manda ler, e **nenhum ping** no heartbeat.

      ```text
      codigo de saida=1
      {"level":"error","event":"backup_cycle_failed","step":"dump_keycloak","line":86}
      --- hits --- nenhum ping
      ```

      Esse teste pegou um defeito real: com `set -euo pipefail` o ciclo morria **calado**, porque o
      trap de `ERR` não é herdado pelas funções sem `-E`. O `step` que o `docs/ops/backup-emergencia.md`
      manda ler saía vazio. Corrigido para `set -Eeuo pipefail`, e o contrato passou a exigir as
      duas coisas juntas.

      **Retenção provada** com objetos semeados: o diário de 2026-01-01 (>30 d) e o semanal de
      2025-12-01 (>90 d) foram apagados; o semanal de 2026-06-01 (dentro de 90 d) ficou.

      ```text
      {"event":"backup_object_expired","key":"db-backups/daily/backup-2026-01-01T000000Z-app.dump.enc"}
      {"event":"backup_object_expired","key":"db-backups/weekly/backup-2025-12-01T000000Z-app.dump.enc"}
      ```

      Decisões que divergem do plano, e por quê:

      - **`curl --aws-sigv4` no lugar da AWS CLI.** Fala S3 nativamente desde a 7.75 e evita
        arrastar Python para uma imagem que roda cinco minutos por dia. A credencial entra por
        `--config -` (stdin), não por argv, para não aparecer num `ps` do contêiner.
      - **O corte da retenção vem do Postgres.** A imagem é alpine e o `date` do busybox não faz
        aritmética relativa; o banco que acabou de ser dumpado faz, e o resultado é idêntico em
        macOS e em alpine — foi o que permitiu rodar o teste local sem adaptação.
      - **Imagem pinada por digest** (`postgres:18-alpine@sha256:9a8afca5…`), como o
        `deploy/keycloak/Dockerfile` já fazia.

      Ficou explícito, para a T012: o job mensal escolhe o backup pela **última linha do
      manifesto**, não pelo objeto mais recente do bucket — um ciclo que falhou depois do upload da
      aplicação e antes do Keycloak deixa `.enc` órfão sem linha no manifesto, e é o manifesto que
      diz o que é um backup completo.

      Gates: `prettier --check` ok · `lint` ok · `typecheck` ok · api 1922 pass · 3 skip · 0 fail.

- [x] T011 — Espelho do bucket fiscal: `.github/workflows/bucket-mirror.yml`.

      Contrato antes: `apps/api-transportada/test/deploy/bucket-mirror.contract.ts` (6 casos) entrou
      no entrypoint `test/deploy.contract.test.ts` e foi visto vermelho — `20 pass / 6 fail`, os 20
      sendo `vector` e `backup`. Depois do workflow: `26 pass / 0 fail`.

      **O workflow rodou de verdade**, não uma cópia à mão: os três blocos `run:` foram extraídos do
      arquivo versionado com `Bun.YAML.parse` e executados contra o MinIO local, origem
      (`t011-source`, 3 objetos) e espelho (`t011-mirror`, 1 já espelhado + 1 órfão de propósito).

      ```text
      === ciclo 1 ===
      origem: 3 · espelho: 2 · a copiar: 2
      objetos espelhados: 2
      ::warning::1 objetos existem no espelho e não na origem — XML autorizado é imutável, investigar.

      === ciclo 2 ===
      origem: 3 · espelho: 4 · a copiar: 0
      objetos espelhados: 0
      ```

      O segundo ciclo copiou zero: a comparação por chave é o que torna o job idempotente, e é o que
      mantém o custo de egress preso ao que mudou, não ao tamanho do bucket.

      Espelho depois dos dois ciclos — o órfão continua lá, que é o comportamento pedido pela D6:

      ```text
      2026/07/orfao.xml     52   ← só existe no espelho, preservado
      2026/08/cte-1.xml     56
      2026/08/nfe-1.xml     56
      2026/08/nfe-2.xml     56
      ```

      Conteúdo conferido byte a byte nos dois objetos copiados — a cópia atravessa o runner por pipe,
      então o hash é a prova de que ela não corrompe:

      ```text
      f51eb8c9…52d4  espelho 2026/08/nfe-2.xml
      f51eb8c9…52d4  origem  2026/08/nfe-2.xml
      d57211b2…aa7a  espelho 2026/08/cte-1.xml
      d57211b2…aa7a  origem  2026/08/cte-1.xml
      ```

      Um defeito pego no caminho: o `wc -l` do macOS acolchoa o número com espaços e o resumo saía
      `origem:        3`. Corrigido com `tr -d ' '` nas quatro contagens.

      Decisão que diverge do plano, e por quê:

      - **Comparação explícita no lugar de `aws s3 sync`.** Origem e espelho vivem em projetos
        Railway diferentes, com credencial própria: um `sync` entre os dois só existiria com uma
        credencial única, que teria de escrever na origem — exatamente o que este espelho não pode
        ter. Cada lado roda no seu subshell exportando só a sua credencial, e `--delete` deixa de ser
        um argumento que alguém pode passar para virar uma operação que o job não sabe fazer.

      Limite do que foi provado localmente: o MinIO local tem um usuário só, então a **separação de
      escopo** das credenciais (leitura na origem, escrita no espelho) é estrutural no workflow mas
      só passa a ser imposta pelo storage quando os buckets e as chaves da T007 existirem.

      Gates: `prettier --check` ok · `lint` ok · `typecheck` ok · api 1928 pass · 3 skip · 0 fail.

- [x] T012 — Teste mensal de restore: `.github/workflows/restore-test.yml`.

      Contrato antes: `apps/api-transportada/test/deploy/restore-test.contract.ts` (10 casos) entrou
      no entrypoint `test/deploy.contract.test.ts` e foi visto vermelho — `26 pass / 10 fail`.
      Depois do workflow: `36 pass / 0 fail`.

      **O workflow rodou de verdade**, os quatro blocos `run:` extraídos do arquivo versionado com
      `Bun.YAML.parse` e executados contra um ciclo de backup produzido na hora pelo
      `deploy/backup/backup.sh` — mesmo script da T010, Postgres do `compose.yaml` e MinIO local.

      ```text
      === passo 0: guarda ===
      === passo 1: baixar ===
      ciclo escolhido: 2026-08-08T123333Z
      === passo 2: restaurar ===
      backup-2026-08-08T123333Z-app.dump.enc: OK
      app: 70 tabelas · lastMigration '20260806161903_cte_fiscal_number_advanced_event' — confere com o manifesto
      backup-2026-08-08T123333Z-keycloak.dump.enc: OK
      keycloak: 2 tabelas · lastMigration '' — confere com o manifesto
      === passo 3: heartbeat ===
      heartbeat recebido: /restore
      ```

      O ciclo restaurado é o dos **dois** bancos. O `lastMigration` vazio do Keycloak não é um caso
      não tratado: o banco dele não tem `drizzle.__drizzle_migrations`, o backup grava string vazia e
      o restore compara vazio com vazio — mesma comparação para os dois, sem exceção no código.

      **As três recusas foram provocadas**, porque um teste de restore que só sabe passar não é
      teste:

      ```text
      ::error::alvo 'db.production.internal' não é o contêiner efêmero — este job nunca escreve em banco real.
      codigo de saida=1

      ::error::o ciclo 2026-08-08T123333Z tem 1 linha(s) no manifesto, e um ciclo completo tem 2.
      codigo de saida=1

      ::error::app: restaurou 70 tabelas e o manifesto diz 71.
      codigo de saida=1
      ```

      A segunda é a que justifica escolher pela **última linha do manifesto** e não pelo objeto mais
      novo do bucket: um ciclo que morreu entre o upload da aplicação e o do Keycloak deixa `.enc`
      órfão sem linha, e restaurar esse órfão diria "verde" sobre um backup pela metade.

      O que o ensaio **não** prova, e quem prova: o pulo do heartbeat quando o restore falha é do
      `if: success()` do runner, não do script. Quem guarda isso é o contrato, que exige
      `if: success()` no último passo e proíbe qualquer menção a `RESTORE_HEARTBEAT_URL` nos
      anteriores.

      Decisões e limites:

      - **O cliente do Postgres é o do contêiner de serviço** (`docker exec` via
        `job.services.postgres.id`), não o do runner. Cliente mais velho que o dump recusa o arquivo,
        e o runner não acompanha a versão do servidor — casar as duas no mesmo contêiner tira essa
        variável do caminho.
      - **Ensaio local sem `postgres:18`.** O `docker pull postgres:18` pede autenticação no Docker
        Hub neste ambiente; o ensaio trocou o prefixo `docker exec <contêiner>` pelos binários do
        host (18.4) contra o Postgres 17.10 do compose, mantendo o resto do bloco intacto. A versão
        casada continua garantida por construção no workflow e coberta pelo contrato.
      - **Senha fixa no serviço de Postgres.** O contêiner nasce e morre com o job, sem porta
        publicada, e é justamente o alvo descartável que a guarda do primeiro passo exige — não é
        credencial de painel, que é o que a regra de segurança §2 trata.
      - Nenhum secret de escrita em production entra no job: o contrato falha se `RAILWAY_TOKEN`,
        `APP_DATABASE_URL` ou `KEYCLOAK_DATABASE_URL` aparecerem no arquivo.

      Gates: `prettier --check` ok · `lint` ok · `typecheck` ok · api 1938 pass · 3 skip · 0 fail.

- [ ] T013 — **RTO medido:** _(preencher)_
- [ ] T014 —

## Fase C — O portão humano

- [x] T015 — GitHub Environment `production` e `staging`.

      Os dois ambientes já existiam e **já tinham `RAILWAY_TOKEN`** — o que faltava era o portão.

      ```text
      $ gh api repos/Andersonfrfilho/transportada/environments/production/secrets --jq '.secrets[].name'
      RAILWAY_TOKEN
      $ gh api repos/Andersonfrfilho/transportada/environments/staging/secrets --jq '.secrets[].name'
      RAILWAY_TOKEN
      ```

      **O revisor obrigatório não entrou, e não é erro de configuração — é o plano do GitHub.** O
      repositório é privado num plano Free, e a API recusa a regra:

      ```text
      $ gh api --method PUT .../environments/production -f reviewers='[{"type":"User","id":…}]'
      HTTP 422 — Failed to create the environment protection rule. Please ensure the billing plan
      supports the required reviewers protection rule.
      ```

      Foi uma tentativa só, como combinado: sem insistir e sem contornar. **Enquanto o plano não
      mudar, a aprovação humana da T021 é o merge do PR, não o botão do Environment** — quem
      aprova é a pessoa que clica em "Merge", com a `main` protegida pela T016 no caminho.

      O que o plano Free **aceitou** foi a política de branch por ambiente, que fecha o buraco mais
      grosseiro: um deploy de `production` disparado de uma branch qualquer.

      ```text
      $ gh api .../environments/production/deployment-branch-policies --jq '[.branch_policies[].name]|join(",")'
      main
      $ gh api .../environments/staging/deployment-branch-policies --jq '[.branch_policies[].name]|join(",")'
      staging
      ```

      Fecha as pendências 2 e 3 de `docs/spec/railway.md` no que depende de configuração; a
      pendência do revisor fica registrada aqui e volta no dia em que o repositório virar público
      ou o plano virar Team.

- [x] T016 — Proteção de `main`.

      ```text
      $ gh api repos/Andersonfrfilho/transportada/branches/main/protection --jq '{…}'
      {"pr_obrigatorio":true,"aprovacoes":0,"checks":["gate / quality","gate / integration"],
       "strict":true,"admins":true,"force_push":false,"delecao":false,"linear":true}
      ```

      Ao contrário do revisor do Environment, a proteção clássica de branch **passou** no plano
      Free: `PUT /branches/main/protection` respondeu 200 e o `GET` devolve o estado acima.

      `aprovacoes: 0` é decisão, não descuido. Com `required_approving_review_count: 1` num
      repositório de uma pessoa só, ninguém consegue aprovar o próprio PR e a `main` fica
      **impossível de mergear** — o portão viraria um bloqueio. O que a D8 pede é o que está
      valendo: PR obrigatório (`pr_obrigatorio: true` sem push direto), CI verde e atualizado
      (`strict: true` sobre os dois jobs do `ci.yml`), sem force push, sem deleção, histórico
      linear, e `enforce_admins: true` para que o dono também passe pelo caminho.

      Os nomes dos checks (`gate / quality`, `gate / integration`) saíram dos check-runs reais do
      último commit da `main`, não de leitura do YAML — nome de check errado numa proteção
      `strict` trava tudo para sempre esperando um job que nunca reporta.

      Ressalva honesta: `git push --dry-run origin staging:main` respondeu `ok main`. **Isso não
      contradiz a proteção** — o `--dry-run` não envia o pack e por isso não aciona o
      `pre-receive` do servidor, que é onde a regra é aplicada. A prova do bloqueio é o estado
      lido pela API acima; a recusa aparece na primeira tentativa real, e não vale gastar um push
      de verdade para vê-la.

- [ ] T017 —

## Fase D — Subir production

- [ ] T018 — **Custo mensal projetado do stack de ops:** _(preencher)_
- [ ] T019 —
- [ ] T020 —
- [ ] T021 —
- [ ] T022 —
- [ ] T023 —

## Fase E — Prova de vida

- [ ] T024 —
- [ ] T025 —
- [ ] T026 —
- [ ] T027 —
- [ ] T028 —
