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

- [x] T009 — Observabilidade ligada em staging, ponta a ponta.

      Serviço `vector` criado no projeto `transportada` / ambiente `staging`
      (`41720d1d-2ccb-47f1-8954-1faa522fc2b5`), `LOG_SINK_URL=http://vector.railway.internal:9000`
      nas três apps e um `SENTRY_DSN` por app (chaves públicas de escrita, nunca no repositório).

      **Duas correções que a T008 não podia ter previsto, as duas achadas em produção do serviço:**

      1. A 0.57.0 do Vector **desligou a interpolação de `${VAR}` por padrão**, e desligada ela é
         silenciosa: o literal `${LOG_ARCHIVE_S3_BUCKET}` vira nome de bucket e o único sintoma é um
         `dispatch failure` do smithy que não fala de variável nenhuma. Só o `VECTOR_LOG=debug`
         mostrou a causa (`bucket: Some("${LOG_ARCHIVE_S3_BUCKET}")`). Antes de arrumar, um caso
         novo no `vector.contract.ts` (37 pass / 1 fail); depois do
         `--dangerously-allow-env-var-interpolation` no `CMD`, 38 pass / 0 fail e
         `Healthcheck passed.` no serviço remoto. Commit isolado `3f9caa5`.

      2. O `plan.md` documentava o ingest do OpenObserve como `.../_json`. **Está errado**: `_json`
         só aceita um *array* JSON, e o sink do Vector envia NDJSON (`framing: newline_delimited`).
         O OpenObserve respondia `400 Bad Request` e o Vector descartava o lote inteiro
         (`Not retriable; dropping the request` · `component_events_dropped … count=3`). O endpoint
         que aceita NDJSON é o `_multi` — provado por `curl` (`successful:2, failed:0`) antes de
         trocar a variável. A linha do `plan.md` foi corrigida nesta task.

      **A exceção provocada.** Um 4xx de domínio não serve: `createErrorResponse` devolve cedo para
      `ApiError` e nem chama o `captureError` ("só o desconhecido interessa"). Foi preciso uma falha
      de verdade — o `Postgres` de staging foi reiniciado e, durante a janela, um `POST
      /user-activation` (rota anônima que consulta o banco) esperou o pool até estourar:

      ```text
      $ curl -m 90 -X POST …/user-activation -d '{"code":"…","password":"…"}'
      status=500 time=4.08
      {"error":{"code":"INTERNAL_ERROR","correlationId":"d3b925b5-2622-4f9e-9196-d1cf03a920d2", …}}
      ```

      O mesmo `correlationId` aparece nos três destinos:

      ```text
      # 1) OpenObserve — busca por meta_correlationid
      {"level":"ERROR","message":"http_request_failed","meta_correlationid":"d3b925b5-…",
       "meta_errorname":"DrizzleQueryError","meta_sqlstate":"ERR_POSTGRES_CONNECTION_TIMEOUT"}
      {"level":"INFO","message":"http_request_completed","meta_correlationid":"d3b925b5-…",
       "meta_pathname":"<unmatched>","meta_status":500}

      # 2) arquivo do bucket — logs/2026/08/08/*.log.gz, NDJSON gzip
      {"level":"ERROR","message":"http_request_failed","meta":{"correlationId":"d3b925b5-…",
       "errorName":"DrizzleQueryError","sqlState":"ERR_POSTGRES_CONNECTION_TIMEOUT"}, …}

      # 3) GlitchTip — org ada-technology, issue TRANSPORTADA-API-1
      DrizzleQueryError: Failed query: select "accepted_at", "attempt_count", … (8 eventos)
      tags: environment=staging · os.name=Alpine Linux · culprit drizzle-orm.pg-core.async:session
      ```

      O `correlationId` da resposta HTTP aparece 2× no payload do evento do GlitchTip — é o que
      amarra o issue de volta ao log e ao arquivo.

      **O log com PII de mentira.** Duas requisições carregando CPF `52998224725`, telefone
      `11987654321` e e-mail `fulano.detal@exemplo.invalid` em *query string*, no Bearer e no corpo
      JSON (correlationIds `8500729d-…` e `3e5a2d4f-…`). As duas linhas chegaram inteiras nos dois
      destinos, e o que chegou não tem nada disso — `pathname` vira `<unmatched>`, a query string
      não é logada, e o corpo nunca entra no log:

      ```text
      {"level":"INFO","message":"http_request_completed","meta":{"correlationId":"8500729d-…",
       "durationMs":0.48,"method":"GET","pathname":"<unmatched>","status":401}, …}
      ```

      **A prova de que nenhum dos três tem PII** — busca por cada termo, nos três, sem exceção:

      ```text
      # OpenObserve — match_all() sobre a stream transportada_staging inteira, 15:00 → agora
      52998224725                  -> hits=0
      11987654321                  -> hits=0
      fulano.detal@exemplo.invalid -> hits=0
      irrelevante (a senha enviada)-> hits=0

      # arquivo do bucket — 84 linhas de 5 objetos .log.gz, descomprimidas
      52998224725: 0 · 11987654321: 0 · fulano: 0 · exemplo.invalid: 0 · irrelevante: 0

      # GlitchTip — os 8 eventos do issue, JSON cru
      irrelevante: 0 · t009-excecao: 0 · 52998224725: 0 · 11987654321: 0 · fulano: 0
      ```

      Vale registrar o que **não** vazou por desenho e não por sorte: o `DrizzleQueryError` carrega a
      SQL, e a SQL da ativação tem a senha como parâmetro. Nem o log nem o GlitchTip trazem os
      parâmetros — `describeErrorForLog` emite só `errorName` e `sqlState`, e o `beforeSend` do SDK
      passou o resto pelo redator. A senha `irrelevante` não aparece em lugar nenhum dos três.

      Curiosidade sem consequência: o próprio scrubber do GlitchTip marca a tag `release` como
      `[EMAIL_REDACTED]` — `api-transportada@0.1.0` tem cara de e-mail para o regex dele.

      Staging voltou inteiro depois do teste: `/health/ready` → `{"database":"up","identity":"up",
      "migrations":"up","status":"ok"}`.

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

      **Defeito achado depois de fechar a task, no primeiro push para a `origin`.** O
      `job.services.postgres.id` estava no `env` do **job**, e o contexto `job` só existe dentro de
      `steps` — no `env` do job os contextos são `github`, `needs`, `strategy`, `matrix`, `vars`,
      `secrets` e `inputs`. Isso invalida o arquivo inteiro: o GitHub criou um run atribuído ao push
      mesmo o gatilho sendo só `schedule`, com `conclusion: failure`, **zero job** e o nome exibido
      como `.github/workflows/restore-test.yml` em vez de `Teste mensal de restore` — ele não
      conseguiu ler nem o `name:`.

      ```text
      $ gh run list --branch staging
      failure  push  .github/workflows/restore-test.yml  completed
      $ gh api …/runs/31263876628/jobs --jq '.jobs[]'
      (vazio)
      ```

      Nada local pegava isso, e é o ponto: o ensaio dos blocos `run:` roda o **corpo** dos passos, o
      `Bun.YAML.parse` só exige YAML válido, e disponibilidade de contexto é regra do servidor. Só
      existir na `origin` revelou. O `env` desceu para o único passo que usa a variável, e o contrato
      ganhou um caso que falha se `job.` reaparecer no `env` do job — visto vermelho antes
      (`36 pass / 1 fail`, "Received: POSTGRES_CONTAINER=${{ job.services.postgres.id }}") e verde
      depois (`37 pass / 0 fail`).

      Os outros dois workflows foram varridos pelo mesmo padrão e não têm nenhuma ocorrência.
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

- [x] T012a — **Uptime Kuma fora, Gatus no ar** ([ADR-0025](../../docs/adr/0025-gatus-over-uptime-kuma.md)).
      O motivo da troca é de duas linhas: o Uptime Kuma não faz login OIDC — e o mantenedor diz que
      não fará tão cedo —, então a única credencial possível seria uma senha local numa URL pública,
      exatamente o que a regra de segurança §2 proíbe; e monitor criado por clique não nasce junto
      com a instalação nova, que é o modelo de distribuição deste produto (ADR-0021).

      `deploy/gatus/` com Dockerfile (`ghcr.io/twin/gatus:v5.36.0`, digest fixo, `COPY` do
      `config.yaml` para `/config/`), `railway.json` apontando o Dockerfile e o `config.yaml` inteiro
      em `${VAR}` — nenhum segredo no repositório. Contrato `test/deploy/gatus.contract.ts`:
      **51 pass / 0 fail**, 184 expects.

      **Serviço no ar.** O `railway add --repo` devolve `Unauthorized` mesmo com `railway whoami`
      respondendo — o serviço saiu pela API GraphQL (`serviceCreate`), e o mesmo vale para o ponteiro
      de config-as-code, o volume `/data` e o domínio na porta 8080. Detalhe que custou um deploy: a
      **branch não é campo de `ServiceInstanceUpdateInput`**, ela vive em `serviceConnect`; e o
      primeiro deploy saiu com builder `RAILPACK` e `dockerfilePath: null` porque o commit ainda não
      estava na `origin` — a Railway constrói o que a `origin` tem, não o que o laptop tem. Depois do
      push, `builder: DOCKERFILE`, sha `49f1fe61…`, `SUCCESS`.

      **Login é o do Keycloak.** Client confidencial `gatus` no realm `transportada` de staging,
      criado por script que lê a credencial de bootstrap pela API do Railway e grava o segredo num
      arquivo `600` — o valor não passa por argv nem por terminal.

      ```text
      GET /oidc/login                  → 302  …/realms/transportada/protocol/openid-connect/auth?client_id=gatus…
      GET /api/v1/endpoints/statuses   → 401  (sem sessão)
      ```

      **Push autenticado, e escopado por monitor.** Os dois heartbeats viraram `POST` com o token em
      `Authorization: Bearer`:

      ```text
      POST …/endpoints/staging_backup/external?success=true   sem header        → 401
      POST …/endpoints/staging_backup/external?success=true   token do backup   → 200
      POST …/endpoints/staging_restore/external?success=true  token do backup   → 401
      ```

      A última linha é a que importa: o token de um monitor não escreve no outro. No `backup.sh` o
      par URL+token é fail-open (falta um dos dois → `backup_heartbeat_disabled` e o ciclo segue,
      porque o dado já está guardado e o alerta que sobra é a janela vencida); no `restore-test.yml` é
      fail-closed (sem push o job seria verde sem ninguém do outro lado).

      **Os quatro monitores verdes**, lidos pelo `badge.svg`, que é a única rota fora do OIDC e por
      isso a forma de conferir estado sem logar:

      ```text
      staging_backup     #40cc11
      staging_restore    #40cc11
      staging_api        #40cc11
      staging_frontend   #40cc11
      ```

      **Defeito achado aqui, e diagnosticado errado à primeira vista.** O primeiro push do backup
      devolveu `401` e derrubou o ciclo. A leitura óbvia — token trocado — foi descartada comparando
      os digests das três cópias (arquivo local, variável do serviço `backup`, variável do serviço
      `gatus`): idênticos, sem imprimir valor nenhum. A causa real é de deploy: **o serviço `backup`
      não tem origem em repositório** (`source: {repo: null, image: null}`, `commitHash: null`) — ele
      sobe por `railway up` do diretório local, então o commit `49f1fe6` não chegou nele e o contêiner
      seguia rodando o `backup.sh` antigo, que fazia `GET` anônimo. Depois do `railway up` +
      `deploymentInstanceExecutionCreate`, ciclo limpo, sem `backup_cycle_failed` e sem
      `backup_heartbeat_disabled`. Fica registrado porque a próxima pessoa vai tropeçar no mesmo:
      **editar `deploy/backup/` e só commitar não muda o que está rodando.**

      O serviço `Uptime Kuma` e o `uptime-kuma-volume` órfão foram apagados do projeto de ops — o
      volume não sai junto com o serviço, e ele nunca chegou a ter dado: o assistente de primeira
      execução jamais foi concluído.

      Duas pendências anotadas, nenhuma bloqueante: o serviço `gatus` acompanha a branch `staging` e
      precisa apontar para `main` quando a feature entrar; e o `GATUS_NTFY_TOPIC` é aleatório e existe
      só como variável na Railway — para receber alerta no celular é preciso lê-lo de lá e assinar o
      tópico no app do ntfy. Ele nunca foi impresso de propósito: tópico do ntfy é segredo, quem sabe
      o nome publica.

      Gates: `prettier --check` ok · `lint` ok · `typecheck` ok · api 1953 pass · 3 skip · 0 fail.

- [x] T013 — **RTO medido: 14 s** (staging, ciclo `2026-08-08T173759Z`). As três provas fechadas.

      **1. Execução verde em staging.** Serviço `backup` criado no projeto `transportada`, ambiente
      staging, apontado para `deploy/backup/railway.json` pelo ponteiro de config-as-code — que o
      CLI não sabe escrever e sai pela API (`serviceInstanceUpdate`, campo `railwayConfigFile`). O
      manifesto do deployment saiu com `cronSchedule "0 6 * * *"`, `restartPolicyType NEVER` e
      `dockerfilePath deploy/backup/Dockerfile`. As URLs dos dois bancos entram por referência
      (`${{Postgres.DATABASE_URL}}`, `${{Postgres-q0RQ.DATABASE_URL}}`): nenhuma senha atravessa o
      terminal e o tráfego fica na rede privada, como manda a regra de segurança §5.

      ```text
      backup_dump_started    app
      backup_dump_completed  app       db-backups/staging/daily/backup-2026-08-08T173759Z-app.dump.enc
      backup_dump_started    keycloak
      backup_dump_completed  keycloak  db-backups/staging/daily/backup-2026-08-08T173759Z-keycloak.dump.enc
      backup_cycle_completed
      backup_heartbeat_disabled (warn)
      ```

      `backup_heartbeat_disabled` é o caminho previsto para `BACKUP_HEARTBEAT_URL` ausente — avisa e
      segue, em vez de derrubar um ciclo que já guardou o dado. Objetos e manifesto no bucket:

      ```text
      808368  db-backups/staging/daily/backup-2026-08-08T173759Z-app.dump.enc
         105  …-app.dump.enc.sha256
      227296  db-backups/staging/daily/backup-2026-08-08T173759Z-keycloak.dump.enc
         110  …-keycloak.dump.enc.sha256
         598  db-backups/staging/manifest.jsonl
      ```

      **Defeito achado antes de production existir, e corrigido nesta task.** O caminho do objeto não
      levava o ambiente: staging e production dividiriam `db-backups/daily/` e a **mesma**
      `manifest.jsonl`. Como o teste mensal restaura a última linha do manifesto, bastava um ciclo de
      staging cair depois do de production para o job restaurar staging e declarar production
      provado — que é pior do que não testar. `BACKUP_ENVIRONMENT` virou variável obrigatória, o
      prefixo virou `db-backups/<ambiente>/` e cada ambiente ganhou o seu manifesto; no workflow
      mensal a variável tem guarda própria, porque vazia o caminho colapsa para
      `db-backups//manifest.jsonl`, que não é de ambiente nenhum. Contrato antes: `38 pass / 2 fail`;
      depois: `40 pass / 0 fail`. Os cinco objetos gravados antes da correção foram apagados do
      bucket — deixá-los criaria um `db-backups/manifest.jsonl` órfão fora do alcance da varredura de
      retenção, que só olha dentro do prefixo do ambiente.

      **`railway redeploy` não executa um serviço com `cronSchedule`.** O primeiro disparo saiu
      `SUCCESS` com **zero linha** de log de deployment: o redeploy publica a versão e espera a
      próxima janela. Quem executa agora é a mutation `deploymentInstanceExecutionCreate`, e foi ela
      que produziu o ciclo acima. O `docs/ops/backup-emergencia.md` afirmava o contrário no Caminho A
      — o runbook mandava, numa emergência, rodar um comando que não faz nada e ainda devolve
      "sucesso". Corrigido com a receita que foi executada, incluindo a leitura de log por deployment
      (`railway logs --service backup` devolve vazio; a mensagem vem no `--json`).

      **2. Restore manual cronometrado** — R1 e R2 do runbook, do primeiro `aws s3 cp` à conferência
      fechada, mais o `--clean --if-exists` da R3 ensaiado por cima dos bancos já povoados, que é o
      único trecho da R3 que não depende de tocar em ambiente real:

      ```text
      17:44:14  inicio
      17:44:24  download do ciclo 2026-08-08T173759Z
      17:44:24  R1 sha256 + decifra + pg_restore --list
      17:44:25  Postgres descartavel pronto
      17:44:26  restore de keycloak
      17:44:26  restore de app
      app: tabelas 71 (manifesto 71) · lastMigration '20260807223440_rntrc_registry_leading_zero' (manifesto idem)
      keycloak: tabelas 90 (manifesto 90) · lastMigration '' (manifesto '')
      companies=1 nfe_documents=301 cte_fiscal_documents=16 stored_objects=618 migrations=50
      17:44:28  R3 ensaiado (--clean --if-exists sobre banco povoado)
      RTO total: 13.4 s
      ```

      O número é pequeno porque o dump da staging é pequeno (790 KiB); o que ele mede de útil é que o
      roteiro fecha sem improviso, e que o RTO desta parte é ruído perto do tempo de **decidir**
      restaurar. Dois defeitos do runbook apareceram justamente por executá-lo:

      - **`-p 5433:5432` publica em `0.0.0.0`** um Postgres com senha `x` e uma cópia de production
        dentro. Virou `-p 127.0.0.1:55433:5432` — loopback, e numa porta que outro projeto não
        costuma já estar ocupando (5433 estava, neste laptop).
      - **A credencial de bucket da Railway é por bucket.** Provado: a credencial do bucket de
        backups recebe `AccessDenied` ao listar o de espelho. O `aws s3 sync` entre os dois buckets
        que a seção do espelho fiscal mandava rodar não pode funcionar — só um par de credenciais
        entra no comando. Trocado por sync em dois passos pelo disco, com o `rm -rf` no fim.

      Nomes de bucket também estavam errados no runbook (`transportada-backups`,
      `transportada-production`, `transportada-fiscal-mirror`); os reais são
      `transportada-afr-fernandes-*`, e o nome S3 leva um sufixo aleatório que só
      `railway bucket credentials` sabe. O runbook passou a tirar os dois de lá em vez de fixar.

      **3. Restore mensal verde.** O `restore-test.yml` foi disparado contra o bucket de verdade duas
      vezes. Na primeira (run 31270477746) os três passos que provam o restore passaram e o quarto
      falhou:

      ```text
      failure  Avisar o monitor que o restore fechou
      ::error::RESTORE_HEARTBEAT_URL vazio — sem push não existe monitor de restore.
      ```

      Vermelho correto: sem push monitor o job seria verde sem ninguém do outro lado. Faltava o
      destino, e o destino era a T012a. Com o Gatus no ar e os dois secrets no repositório, a segunda
      execução ([run 31279346681](https://github.com/Andersonfrfilho/transportada/actions/runs/31279346681))
      fechou inteira:

      ```text
      success  Recusar qualquer alvo que não seja o Postgres efêmero
      success  Baixar o backup apontado pela última linha do manifesto
      success  Conferir o hash, decifrar e restaurar os dois bancos
      success  Avisar o monitor que o restore fechou

      ciclo escolhido: 2026-08-08T173759Z
      app: 71 tabelas · lastMigration '20260807223440_rntrc_registry_leading_zero' — confere com o manifesto
      keycloak: 90 tabelas · lastMigration '' — confere com o manifesto
      ```

      O outro lado do push confirma: o badge de `staging_restore` no Gatus está `#40cc11`.

      Uma sobra cosmética: o run aparece na lista como `.github/workflows/restore-test.yml` em vez de
      `Teste mensal de restore`, embora o `name:` esteja no arquivo. É registro velho — o GitHub
      guardou o nome de quando o arquivo não parseava (run 31263876628, no bloco da T012) e não
      reescreve o registro depois. Não afeta execução: o run tem job, tem passo e tem verde.

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

- [x] T017 — **Segredos de production gerados e conferidos pelo parser da própria API.** Nenhum
      valor passou por terminal, log ou este arquivo: o script escreve num arquivo `600` e imprime
      só a forma.

      ```text
      $ bun t017/mint.ts ~/.transportada/production/secrets.env
      {"activeKeyId":"production-v1","keyRingSize":1,"envelopeKeyBytes":32,"hmacKeyBytes":32,
       "rabbitmqPassLength":32,"keycloakAdminPassLength":32,
       "objectStorage":{"bucket":"transportada-production-vosp8e","endpoint":"https://t3.storageapi.dev",
                        "region":"auto","forcePathStyle":"false"}}
      $ ls -l ~/.transportada/production/secrets.env
      -rw-------  1 anderson.filho  staff  661
      ```

      A conferência não é regex de script: o `mint.ts` importa
      `parseCryptographicConfiguration` de `src/config/` e passa os valores gerados por ele. Se a
      chave não tivesse 32 bytes canônicos, se o `production-v1` não estivesse na keyring ou se o
      HMAC repetisse uma chave de envelope, o comando teria falhado no lugar de escrever o arquivo
      — é o mesmo caminho que a API roda no boot.

      **`OBJECT_STORAGE_*` não se gera, se colhe.** O bucket de production é o nativo da Railway e
      já existia (`transportada-production`, credencial de 03/08/2026); as chaves saíram de
      `bucketS3Credentials` direto para o arquivo. O nome S3 real leva sufixo
      (`transportada-production-vosp8e`) e `urlStyle: virtual-host` é o que obriga
      `OBJECT_STORAGE_FORCE_PATH_STYLE=false`.

      Nenhum segredo é o mesmo do outro ambiente — comparação por igualdade, sem imprimir valor:

      ```text
      {"stagingBucket":"transportada-staging-zjeaet","productionBucket":"transportada-production-vosp8e",
       "mesmaAccessKey":false,"mesmoSecret":false}
      {"stagingActiveKeyId":"staging-v1","keyringIgualAoStaging":false,"hmacIgualAoStaging":false}
      ```

      **Onde a cópia vive** está em `docs/ops/backup-emergencia.md` § _Copiar a keyring_ —
      gerenciador de senhas do responsável, entrada `TransportAdA — production`, com o local e
      jamais o valor. O contrato `test/deploy/secrets.contract.ts` guarda as duas metades: falha se
      o runbook voltar a dizer "preencher" e falha se alguém colar ali uma chave de 32 bytes ou a
      keyring inteira. Vermelho antes (`Received: "_preencher na T017…"`), 62 pass depois.

      **A cópia foi feita por comando, não por cola-e-cola.** Não há `op` nem `bw` nesta máquina; o
      gerenciador que existe é o Chaveiro do macOS, e ele tem CLI. O `security` lê a senha do
      **stdin** — conferido antes de usar, com um item descartável que foi lido de volta e apagado
      —, então o valor não passa por `argv`, não entra no histórico do shell e não aparece na tela:

      ```text
      $ zsh t017/para-o-chaveiro.sh
      ok     ENCRYPTION_ACTIVE_KEY_ID (13 caracteres)
      ok     ENCRYPTION_KEYRING_JSON (64 caracteres)
      ok     IDEMPOTENCY_HMAC_KEY (44 caracteres)
      ok     RABBITMQ_DEFAULT_PASS (32 caracteres)
      ok     KC_BOOTSTRAP_ADMIN_PASSWORD (32 caracteres)
      ok     OBJECT_STORAGE_ACCESS_KEY (54 caracteres)   … e os outros cinco
      {"gravados":11,"falhas":0}
      ```

      `ok` não é "o comando não deu erro": cada campo é **lido de volta do Chaveiro e comparado**
      com o valor de origem antes de contar. Onze de onze.

      Só depois disso o arquivo de transferência foi destruído — `rm -P`, e
      `~/.transportada/production/` ficou vazio. A leitura da keyring pelo Chaveiro continua
      respondendo, então a cópia sobreviveu ao apagamento da origem.

      **O Chaveiro só vale como segundo lugar porque sai do laptop:**
      `com.apple.Dataclass.KeychainSync` está com `Enabled = 1` no `MobileMeAccounts.plist` — o
      primeiro `grep` sugeriu `false`, mas era o `Enabled` do bloco seguinte; lido dentro das
      chaves do bloco certo, é `1`. Se fosse local, a cópia morreria junto com a máquina, que é
      exatamente o cenário do qual ela deveria proteger — e isso está escrito no runbook como
      condição a reconferir em troca de máquina.

## Fase D — Subir production

- [x] T018 — **O banco de production está intocado, e o stack de ops custa US$ 9,53/mês.**

      **1. O banco de production nunca recebeu um cliente.** O ambiente `production` do projeto
      `transportada` tem exatamente duas instâncias de serviço e exatamente dois deploys na vida
      inteira — o provisionamento dos dois Postgres, no mesmo minuto:

      ```text
      $ tcpProxies(environmentId: production, serviceId: <cada um dos dois Postgres>)
      []   []

      $ environment(production) { serviceInstances, deployments }
      {"instancias":[{"svc":"Postgres-FDoz"},{"svc":"Postgres-Hqfu"}],
       "deploys":[{"id":"2938d4b5","status":"SUCCESS","createdAt":"2026-08-03T20:55:29.349Z","svc":"Postgres-FDoz"},
                  {"id":"eafb03fd","status":"SUCCESS","createdAt":"2026-08-03T20:55:23.861Z","svc":"Postgres-Hqfu"}]}
      ```

      Sem proxy TCP não existe caminho de fora; sem api, worker ou cron no ambiente não existe
      caminho de dentro. E o tamanho fecha a conta: os dois volumes estão a **8 KB de distância um
      do outro** (135,241728 MB e 135,24992 MB), que é a pegada do `initdb` mais ruído de WAL, contra
      188,80 MB e 225,21 MB dos dois de staging, que trabalham.

      **Ressalva honesta:** isto é a prova de que ninguém escreveu, não um `\dt` devolvendo vazio.
      Rodar o `\dt` exigiria abrir um proxy público no banco de production só para olhar — o oposto
      da regra "banco sem exposição pública". A prova direta chega de graça na T021: o
      `preDeployCommand` roda as 9 migrations, e migration em banco sujo falha ou encontra linha.

      **2. Bucket fiscal — 11,41 MB em staging, zero em production.**

      | bucket | objetos | bytes |
      |---|---:|---:|
      | `transportada-staging` (fiscal) | 618 | 11 411 168 |
      | `transportada-production` (fiscal) | 0 | 0 |
      | `transportada-afr-fernandes-backups` | 17 | 4 151 368 |
      | `transportada-afr-fernandes-logs` | 109 | 393 570 |
      | `transportada-afr-fernandes-fiscal-mirror` | 0 | 0 |

      Aberto por família de documento, o bucket fiscal de staging conta uma coisa que a soma
      escondia:

      ```text
      {"prefixo":"nfe-documents","objetos":301,"bytes":5648574,"medio":18766}
      {"prefixo":"nfe-imports",  "objetos":301,"bytes":5648574,"medio":18766}
      {"prefixo":"cte-documents","objetos":16, "bytes":114020, "medio":7126}
      ```

      Mesma contagem e mesmo total de bytes não é coincidência — comparando os ETags,
      `{"etagsDistintosEmImports":301,"etagsDistintosEmDocuments":301,"etagsPresentesNosDois":301}`.
      **Todo XML de NF-e é guardado duas vezes**: uma em `nfe-imports/<id>/staging/`, outra em
      `nfe-documents/<id>/original/`. São 36,7 KB por nota importada onde 18,4 KB bastariam, se a
      cópia de `staging` tiver retenção. Não é problema de custo — nesta escala não é problema de
      nada — mas é um fato que ninguém tinha medido, e fica registrado.

      Projeção por documento: **36,7 KB por NF-e importada** e **7,1 KB por CT-e emitido**. A
      1 000 NF-e + 1 000 CT-e por mês são ~44 MB/mês, e o primeiro GB-mês cobrável chega em ~2 anos.

      **3. Volume diário de log — e o que o gera.** O bucket de logs por hora, medido pelo
      `lastModified` dos objetos que o vector arquiva:

      ```text
      2026-08-08T16 → 1 objeto,    749 B      2026-08-09T01 → 12 objetos, 71 733 B
      2026-08-08T17 → 1 objeto,    516 B      2026-08-09T02 → 12 objetos, 72 150 B
      2026-08-08T19 → 1 objeto,    515 B      2026-08-09T03 → 12 objetos, 71 752 B
      2026-08-08T20 → 1 objeto,    751 B      2026-08-09T04 → 12 objetos, 72 127 B
      ```

      São dois regimes, com quase **cem vezes** de diferença. Ocioso: ~1 objeto e ~600 B por hora —
      o dia 08/08 inteiro deu 18 427 B. Com uma aba do frontend aberta numa tela de lote: 12 objetos
      e ~72 KB por hora, cravados, por horas seguidas.

      A causa está medida e é do frontend, não do log: `CTE_BATCH_PROGRESS_INTERVAL_MS = 3000` e
      `resolveProgressInterval` mantêm o polling de 3 s enquanto **qualquer** item estiver
      transmitindo. Um lote esquecido em `in_flight` faz a tela pedir `GET /cte-batches` para sempre
      — num arquivo de 5 minutos contamos 87 `GET` + 87 `OPTIONS` de `/cte-batches` contra
      2 de `/health/ready`.

      Projeção: dia ocioso ~18 KB; dia com 8 h de aba aberta ~588 KB; aba aberta 24 h, ~1,73 MB —
      52 MB/mês no pior caso, um ano inteiro sem alcançar o primeiro GB cobrável.

      **4. Custo mensal.** Preço publicado (`docs.railway.com/pricing`): RAM
      `$0,000231/GB/min`, CPU `$0,000463/vCPU/min`, volume `$0,15/GB/mês`, egresso `$0,05/GB`,
      bucket `$0,015/GB-mês` com operação S3 e egresso ilimitados e grátis
      (`docs.railway.com/storage-buckets/billing`).

      A unidade do `usage` da API não vem documentada, então foi **conferida contra o mundo real**
      antes de virar dólar: `DISK_USAGE_GB` do projeto `transportada` na janela de 6 h deu
      301,914 → `/360` = **0,839 GB**, e a soma dos cinco volumes do projeto lida na mesma hora é
      **837,1 MB**. Bate na terceira casa. É GB-minuto.

      | projeto | RAM média | vCPU média | disco médio | RAM | CPU | disco | egresso | **total/mês** |
      |---|---:|---:|---:|---:|---:|---:|---:|---:|
      | `transportada-ops` | 0,917 GB | 0,013 | 0,601 GB | $9,147 | $0,267 | $0,090 | $0,028 | **$9,53** |
      | `transportada` (só staging + os 2 Postgres de production ligados) | 1,544 GB | 0,032 | 0,839 GB | $15,408 | $0,631 | $0,126 | $0,006 | **$16,17** |
      | `financiamento-imobiliario-bot` (outro produto, mesma workspace) | 1,643 GB | 0,008 | 1,238 GB | $16,397 | $0,168 | $0,186 | $0,030 | **$16,78** |

      Buckets: 15 956 106 B = 0,016 GB somando os cinco. A Railway arredonda o GB-mês fracionário
      para cima, então a cobrança é de **1 GB-mês = $0,015** — e continuará sendo por anos.

      **O que a T018 pedia — o custo do projeto de ops — é $9,53/mês**, e 96% disso é RAM. Não há
      nada a otimizar em disco (US$ 0,09) nem em CPU (US$ 0,27): o stack de observabilidade custa o
      que custa por estar ligado, e o que o barateia é desligar serviço, não afiná-lo.

      Contexto para a decisão de subir production: a workspace está no plano **HOBBY** ($5/mês com
      $5 de uso incluso), gastando hoje ~$42,5/mês nos três projetos. Production vai acrescentar
      seis serviços de aplicação ao projeto `transportada` — pela forma do staging, mais alguma
      coisa entre $10 e $16/mês. **Isso é estimativa, não medição**, e a medição verdadeira só
      existe depois da T022.

      **5. Achado colateral: o espelho nunca rodou.** O bucket
      `transportada-afr-fernandes-fiscal-mirror` está com 0 objetos porque
      `.github/workflows/bucket-mirror.yml` só existe na `staging` — o GitHub responde
      `HTTP 404: workflow bucket-mirror.yml not found on the default branch`, isto é, nunca chegou a
      ser registrado. O `restore-test.yml` está registrado (rodou por `workflow_dispatch`), mas o
      `schedule:` dele também não dispara enquanto não estiver na `main`. Os dois passam a funcionar
      sozinhos no merge da T021 — não há nada a consertar, só a não confundir "0 objetos" com
      "espelho quebrado".

- [x] T019 — **Os seis serviços de production, e o que o Railway não deixa fazer antes do deploy.**

      **1. Variáveis.** Os seis já tinham o grosso posto (`APP_ENV=production`, portas `8080`,
      `QUEUE_PREFIX=transportada_production`, `FISCAL_ENVIRONMENT=production`,
      `OBJECT_STORAGE_BUCKET=transportada-production-vosp8e` com `FORCE_PATH_STYLE=false`,
      `RAILWAY_DOCKERFILE_PATH` nos cinco que constroem). O diff de chaves contra staging — só
      nomes, nunca valores — apontou o que faltava:

      | Serviço | Faltava | Destino |
      | --- | --- | --- |
      | api | `SCHEDULED_DISTRIBUTION_CRON`, `KEYCLOAK_ADMIN_CLIENT_ID` | **posto na T019** |
      | api + keycloak | `KEYCLOAK_ADMIN_CLIENT_SECRET` | **posto na T019** |
      | api, frontend, keycloak | `FRONTEND_ORIGIN`, `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URI`, `VITE_*`, `KC_HOSTNAME`, `KEYCLOAK_FRONTEND_ORIGIN` | T022 (dependem do domínio) |
      | api, worker, cron | `LOG_SINK_URL` | T024 (vector) |
      | api | `PROVISION_COMPANY_ID`, `BOOTSTRAP_TOKEN` | T023 |

      `SCHEDULED_DISTRIBUTION_CRON=0 * * * *`, espelhando o `deploy.cronSchedule` de
      `deploy/cron/railway.json`, e sem aspas — lido de volta assim.
      `KEYCLOAK_ADMIN_CLIENT_ID=transportada-admin`: o schema exige (`min(1)`), e sem ela a api não
      sobe. `KEYCLOAK_ADMIN_CLIENT_SECRET` é lacuna da T017 — o realm importa
      `${KEYCLOAK_ADMIN_CLIENT_SECRET}` no client `transportada-admin`, então api e keycloak
      precisam do **mesmo** valor. Gerado com `openssl rand -base64 32`, posto nos dois por
      `railway variable set --stdin` e copiado para o Chaveiro; conferido por leitura de volta:
      `api==keycloak: sim | chaveiro==api: sim | tamanho: 44`. Nenhum valor passou por `argv`.

      **2. A instância não nasce sem deploy — provado, não suposto.** `serviceDomainCreate` no
      frontend de production respondeu `ServiceInstance not found`. Tentei o atalho:
      `serviceInstanceUpdate(environmentId, serviceId, input)` respondeu `{"serviceInstanceUpdate":
      true}` para os seis — e não criou nada. `serviceInstance(environmentId, serviceId)` continua
      `ServiceInstance not found`, e `service(id){serviceInstances}` do `rabbitmq` lista só o de
      staging. Um `true` que não faz nada é pior que um erro: dá para fechar a task achando que
      criou. Os domínios passam para a T021.

      **3. Consequência para a T021.** `railway-deploy.sh assert-migrations` lê `/health/ready` pelo
      domínio público da api e falha explicitamente sem ele
      (`$service não tem domínio público`). Como o domínio só pode nascer depois do deploy que cria
      a instância, a primeira passada **vai** parar ali. Está anotado na T021 como ordem, não como
      surpresa.

      **4. Nome de serviço ≠ nome de domínio.** A tabela original da T019 mandava batizar os
      serviços de production com o nome do cliente. Isso quebraria tudo: o serviço é do projeto, não
      do ambiente (`docs/spec/railway.md` já dizia que renomear vale para os dois), e
      `.github/workflows/deploy.yml` chama `railway-deploy.sh deploy api|worker|cron|
      transportada-frontend|keycloak` nos dois ambientes. O nome do cliente vive no rótulo do
      domínio, que é campo independente. `test/deploy/service-naming.contract.ts` guarda as três
      coisas: o pipeline só deploya serviço declarado na tabela de build, o hostname de production
      casa `transportada-afr-fernandes(-api|-auth)?.up.railway.app`, e nenhum serviço interno
      aparece com domínio.

      **5. O `worker` de staging saiu da internet.** Antes de apagar, confirmado ao vivo, anônimo,
      sem credencial: `GET https://worker-staging-3ae1.up.railway.app/health/ready` →
      `{"dependencies":{"database":"up","rabbitmq":"up","storage":"up"},"service":"worker",
      "status":"ok"}`. Depois de `serviceDomainDelete(b25d4a11-…)`: `serviceDomains: []`, o mesmo
      `GET` responde `404`, e a api de staging seguiu em `200` — ninguém dependia dele (o Gatus
      monitora api e frontend).

      **6. 🔓 Segredos de production queimados aqui, e a rotação que isso obriga.** Ao inventariar as
      variáveis rodei `railway variables --json` sem filtro e os valores foram para o terminal:
      senha do `Postgres-Hqfu` (que é o `DATABASE_URL` de api, worker e cron), senha do
      `Postgres-FDoz` (`KC_DB_PASSWORD`), `RABBITMQ_DEFAULT_PASS`, `KC_BOOTSTRAP_ADMIN_PASSWORD` e o
      começo do `ENCRYPTION_KEYRING_JSON`. Regra de segurança §4: segredo que apareceu em terminal é
      segredo queimado, sem exceção. Do inventário em diante só nomes de chave saíram na tela, com
      os valores em arquivos `600`. A rotação virou a **T019a**, antes do primeiro deploy — é o
      momento mais barato que vai existir: o ambiente nunca subiu, o banco está vazio e nada foi
      cifrado com a keyring.

      Verificação: `bun test ./test/deploy.contract.test.ts` — 65 pass, 0 fail.

- [x] T019a — **Rotação dos segredos queimados na T019, antes do primeiro deploy.**

      **1. Os quatro de variável.** `RABBITMQ_DEFAULT_PASS` (rabbitmq), `KC_BOOTSTRAP_ADMIN_PASSWORD`
      (keycloak), `ENCRYPTION_KEYRING_JSON` e `IDEMPOTENCY_HMAC_KEY` (api **e** worker, iguais nos
      dois). Gerados com `openssl rand`, gravados por `railway variable set --stdin --skip-deploys`,
      conferidos por leitura de volta — nenhum valor passou por `argv` nem pela tela. O keyring novo
      tem só `production-v2`, e `ENCRYPTION_ACTIVE_KEY_ID` acompanhou. Antes de publicar, passei o
      trio pelo parser de verdade (`parseCryptographicConfiguration`), que respondeu
      `activeKeyId: production-v2 · chaves no keyring: production-v2 · bytes da hmac: 32` — o schema
      recusa chave que não seja base64 de exatamente 32 bytes e recusa HMAC igual a chave da keyring,
      e é melhor descobrir isso aqui que no boot.

      **2. `RABBITMQ_URL` é referência, não cópia.** O hash do valor resolvido no worker mudou
      sozinho depois da troca (`cb443dd3a0f5` → `b0c9c06eac45`) e passou a conter a senha nova. Mesmo
      para `DATABASE_URL` de api/worker/cron e `KC_DB_PASSWORD` do keycloak: um `POSTGRES_PASSWORD`
      trocado propagou para os quatro consumidores sem eu tocar em nenhum.

      **3. Os dois Postgres.** A variável do template só vale no `initdb`, e os dois já tinham
      deployado em 03/08 — trocar a variável sozinha não mudaria nada e a senha vazada continuaria
      valendo. O caminho foi `ALTER USER postgres WITH PASSWORD`, com o SQL entrando por stdin:

      ```
      railway ssh --service Postgres-Hqfu --environment production -- psql -v ON_ERROR_STOP=1 -f - < alter.sql
      → ALTER ROLE
      ```

      `railway ssh` re-tokeniza os argumentos, então `psql -tAc "select 1"` chega quebrado
      (`database "current_user" does not exist`) e `sh -c '…'` executa só o primeiro token. Stdin
      resolve as duas coisas de uma vez, e de quebra a senha nunca aparece em `argv` remoto.

      **Prova nos dois sentidos**, que é o que separa "rotacionei" de "acho que rotacionei":

      | Momento | Comando | Resposta |
      | --- | --- | --- |
      | Depois do `ALTER`, contêiner ainda com a env antiga | `psql -f -` via ssh | `FATAL: password authentication failed for user "postgres"` |
      | Depois do `redeploy`, env recarregada | `psql -f -` via ssh | `postgres@railway` |

      Os dois bancos responderam igual. Antes disso, `select count(*) from information_schema.tables
      where table_schema='public'` deu **0** nos dois — o que autoriza substituir a keyring inteira
      em vez de acrescentar id (ADR-0004): não havia envelope para ficar indecifrável.

      **4. O que não vazou, verificado.** Procurei o valor corrente de `OBJECT_STORAGE_ACCESS_KEY`,
      `OBJECT_STORAGE_SECRET_KEY` e `KEYCLOAK_ADMIN_CLIENT_SECRET` por busca literal nos transcripts
      da sessão: **0 ocorrências** — não precisam rotacionar. Na direção oposta, os quatro que eu
      declarei queimados aparecem em **1** transcript cada (o vazamento era real, não suposição), e
      nenhum dos seis valores novos aparece em transcript nenhum.

      **5. Cofre e runbook.** Os sete itens foram gravados no Chaveiro (`security add-generic-password
      -U -w`, valor por stdin) e conferidos por leitura de volta, incluindo dois novos:
      `POSTGRES_PASSWORD_APP` e `POSTGRES_PASSWORD_KEYCLOAK` — os dois bancos expõem a mesma
      `POSTGRES_PASSWORD` e sem sufixo o `-U` sobrescreveria um com o outro, o que só apareceria na
      emergência. Chaveiro e Railway conferem nos sete. O teste novo em
      `test/deploy/secrets.contract.ts` ficou **vermelho** antes da edição do runbook
      (`Expected to contain: "\`KEYCLOAK_ADMIN_CLIENT_SECRET\`"`) e verde depois: 66 pass, 0 fail.

      **6. Higiene.** Os arquivos `600` de transferência e todos os dumps de variável foram apagados
      com `rm -P`; `~/.transportada/production/` já estava vazio. A fonte do valor corrente é o
      Chaveiro, e o Railway é o desempate.

- [x] T019b — **O worker registrava o `SIGTERM` depois de já estar consumindo.**

      Apareceu como CI vermelho no PR #4: `sigterm.integration.ts` falhou com `Expected: 0 /
      Received: 143` — 128+15, o processo morto pela disposição padrão do sinal em vez de sair
      sozinho depois de drenar. Não era regressão dos commits da 029: o **mesmo** `633488c` ficou
      verde no `gate / integration` do deploy de staging e vermelho no CI do PR, e `origin/main` é
      ancestral de `staging`, então o merge commit que o `pull_request` testa tem conteúdo idêntico.
      Um verde e um vermelho no mesmo código é instabilidade, e instabilidade tem causa.

      **A causa, lida no código.** `registerWorkerShutdownSignals` era a última linha do boot
      (`main.ts:629`) e o consumidor sintético começava a consumir em `main.ts:351`, com quatro
      `await` entre os dois (os outros consumidores, linhas 356, 379, 419, 490). Cada `await`
      devolve o event loop, então a mensagem podia ser entregue e o `foundation_synthetic_effect_started`
      podia sair enquanto o processo ainda não tinha handler nenhum. O teste usa exatamente esse log
      como gatilho para mandar o sinal. Runner carregado alarga a janela — daí a intermitência.

      **O que estava em jogo não era o CI.** Worker que morre nessa janela não drena o que está em
      voo, e ele dá ack em mensagem de emissão fiscal. Um `redeploy` da Railway durante o boot cai
      no mesmo lugar.

      **Contrato antes.** `test/shutdown-signals.contract.test.ts`, dois testes, vermelhos primeiro:
      o primeiro boota `startWorkerRuntime` com `startFoundationSyntheticConsumer` injetado que mede
      `process.listenerCount('SIGTERM')` no instante em que é chamado (`Expected: > 0 / Received: 0`);
      o segundo emite o sinal antes de o desligamento existir e exige que ele drene assim que existir
      (`TypeError: undefined is not an object (evaluating 'params.shutdown.stop')`).

      **A correção.** `registerWorkerShutdownSignals` passou a receber `resolveShutdown: () =>
      Promise<…>` em vez do desligamento pronto, e o registro subiu para logo depois do logger
      (`main.ts:283`) — antes da primeira conexão RabbitMQ (327) e antes do health server (352).
      `runtime/deferred-shutdown.service.ts` é a ponte: sinal que chega no meio do boot espera o
      runtime ficar de pé e só então drena. O boot que falha rejeita a promessa (`main.ts`, bloco
      `catch`), e o deferred já nasce com um `catch` para a rejeição não derrubar o processo por cima
      do erro que o próprio boot está propagando.

      **Prova nos dois códigos, medida.** Um probe sobe o worker de verdade, espera o `/health/live`
      responder 200 — o mesmo gatilho do teste de integração — e manda `SIGTERM` na hora:

      | Código | 8 rodadas | Resultado |
      | --- | --- | --- |
      | Antes (`registerWorkerShutdownSignals` no fim do boot) | 8 | **7× `exit=143`**, 1× `exit=0` |
      | Depois (registro em `main.ts:283`) | 8 | **8× `exit=0`** |

      ⚠️ **Resíduo conhecido e inofensivo.** `SIGTERM` até ~300 ms depois do `bun src/main.ts` ainda
      sai 143: é carga de módulo e leitura de env, antes da linha 283. Ali não há conexão, consumidor
      nem mensagem em voo — não há o que drenar. Fechar isso exigiria registrar handler em escopo de
      módulo, antes do grafo de imports, e o ganho seria nenhum.

      **Gates:** worker 291 pass / 0 fail em 46 arquivos, já com os dois novos; integração do worker 33
      pass / 0 fail com a infra local; `format:check`, `lint` e `typecheck` verdes. O CI do PR #4
      fechou verde no rerun (`quality` e `integration`), antes desta correção — ela não foi o que
      destravou o PR, foi o que tirou a causa.

- [x] T020 — **A instância de ambiente não nasce de `serviceInstanceUpdate`, nasce de um patch de
      `EnvironmentConfig`.**

      A T019 deixou anotado que `serviceInstanceUpdate` responde `true` e não cria nada, e que os
      domínios teriam de esperar o primeiro deploy. As duas conclusões estavam certas sobre o
      sintoma e erradas sobre o remédio: existe caminho de API, só não é esse.

      **1. Criar serviço novo estava descartado, e agora com prova.** Criei um serviço-cobaia
      (`zz-probe`) em production e tentei renomeá-lo:

      ```
      serviceUpdate(id: <cobaia>, input:{name:"api"})
        → A service named "api" already exists in this project
      ```

      Serviço é do projeto e o nome é único nele. `railway add --service api` nunca poderia
      funcionar — não porque duplicaria o namespace, mas porque o Railway recusa antes. O que
      faltava em production nunca foi o serviço; era a **instância** dele no ambiente.

      **2. O caminho que funciona.** É o par que o próprio `railway environment edit` usa por baixo:

      ```
      environmentStageChanges(environmentId, input: EnvironmentConfig, merge: true)
      environmentPatchCommitStaged(environmentId, commitMessage, skipDeploys: true)
      ```

      O `EnvironmentConfig` é `SCALAR` na introspecção, e foi por isso que a T019 o tratou como
      inalcançável. Ele não é opaco: `railway environment config --json` **imprime exatamente esse
      documento**. Copiei a forma de staging em vez de adivinhar contra produção. O `merge: true` é
      o que preserva o resto — sem ele o patch seria o ambiente inteiro, e os dois Postgres que já
      estavam lá sairiam junto.

      Ordem que usei: um serviço primeiro (`api`), conferir, e só então os cinco restantes num
      patch só. `skipDeploys: true` porque a T021 é quem deploya, na ordem dela.

      **3. `railway environment edit --service-config` não serve para isto.** Ele só edita entrada
      que já existe, e o silêncio engana:

      ```
      railway environment edit -e production --service-config api      configFile ... --stage
      railway environment edit -e production --service-config naoexiste configFile ... --stage
        → ambos: {"committed":false,"message":"No changes to apply","staged":false}
      ```

      Serviço inexistente e serviço-sem-instância dão a mesma resposta de um no-op bem-sucedido.
      Anotado porque é a mesma armadilha do `true` da T019, com outra roupa.

      **4. Estado final, lido de volta com `railway environment config --json`.**

      | Serviço | config-as-code | variáveis | extra |
      | --- | --- | --- | --- |
      | api | `deploy/api/railway.json` | 22 | domínio `transportada-afr-fernandes-api` |
      | worker | `deploy/worker/railway.json` | 23 | — |
      | cron | `deploy/cron/railway.json` | 8 | — |
      | transportada-frontend | `deploy/frontend/railway.json` | 7 | domínio `transportada-afr-fernandes` |
      | keycloak | — (espelha staging: `RAILWAY_DOCKERFILE_PATH`) | 17 | domínio `transportada-afr-fernandes-auth` |
      | rabbitmq | — | 2 | imagem `rabbitmq:4-management-alpine` + volume |

      O config-as-code é o que faz o `preDeployCommand` de `deploy/api/railway.json` rodar, e é o
      que fecha a pendência 1. A cobaia foi apagada (`serviceDelete` → `true`), e `serviceInstances`
      de production não a lista mais.

- [x] T021 — **Primeira passada do deploy, verde de ponta a ponta.**

      ⚠️ **A previsão desta task estava errada, e o texto dela foi reescrito.** Ela dizia que a
      primeira passada falharia em `assert-migrations` por falta de domínio público. O run
      `31317861369` (push de `fade3e6` em `main`) não chegou perto disso: morreu no **primeiro**
      passo, `Deploy identity`, com `Failed to upload code with status code 404 Not Found` — a
      instância do keycloak não existia, e sem instância não há para onde subir código. Corrigido
      na T020; a ordem "deploy → domínio → config-as-code → segunda passada" deixou de ser
      necessária, porque com a instância criada por API dá para criar o domínio **antes**.

      **1. Hipótese concorrente descartada antes de agir.** O log do deploy trazia
      `Unable to parse config file, regenerating` — o `railway-deploy.sh` escreve
      `~/.railway/config.json` à mão porque project token não pode `railway link`. Parecia a causa.
      Não é: o run de staging que **passou** (`31317398973`) imprime a mesma linha **39 vezes** e
      sobe api, worker e cron sem falha. Ruído, não causa.

      **2. A passada verde.** Run `31319537690`, `workflow_dispatch` em `main`, ambiente
      `production`, com os domínios e as variáveis da T022 já postos:

      ```
      Deploy identity        keycloak: SUCCESS (2/3)
      Deploy API             api: SUCCESS (2/3)
      Conferir migrations    api: migrations aplicadas
      Deploy worker          worker: SUCCESS (2/3)
      Deploy cron            cron: SUCCESS (2/3)
      Deploy frontend        transportada-frontend: SUCCESS (2/3)
      ```

      `assert-migrations` passou de primeira justamente porque o domínio da api já existia quando
      ele foi ler `/health/ready`. Não foi sorte: foi a consequência de a T020 ter deixado de
      depender do deploy.

      **3. Prova de vida, não a cor do workflow.** O ambiente respondendo, anônimo:

      ```
      GET /health/live   → 200  {"service":"api","status":"ok"}
      GET /health/ready  → 200  {"database":"up","identity":"up","migrations":"up"}
      GET /  (frontend)  → 200
      GET /realms/transportada/.well-known/openid-configuration → 200
           issuer = https://transportada-afr-fernandes-auth.up.railway.app/realms/transportada
      ```

      O `issuer` devolvido pelo Keycloak é caractere a caractere o `KEYCLOAK_ISSUER` gravado na api
      — é o que prova que as três URLs ficaram coerentes entre os serviços, e não só preenchidas.

      **4. Os oito serviços do ambiente, por `latestDeployment`:** api, worker, cron,
      transportada-frontend, keycloak, rabbitmq, Postgres-FDoz e Postgres-Hqfu — todos `SUCCESS`. O
      `rabbitmq` subiu sozinho às 14:50, no instante em que a instância nasceu com a imagem; ele não
      está na lista de deploy do workflow porque não constrói código.

      **5. O worker conectou no RabbitMQ.** `worker_started` no log de production. Não é detalhe de
      log: `main.ts:638` só é alcançado depois de os consumidores existirem (`main.ts:620-624`), e
      consumidor não existe sem conexão. `RABBITMQ_URL` resolveu o `${{rabbitmq.*}}` que na T019
      apontava para host vazio.

- [x] T022 — **As oito variáveis de domínio, o volume do RabbitMQ, e o bundle conferido no ar.**

      Feita **antes** da T021, não depois: com a instância criada por API (T020), os domínios podem
      nascer antes do primeiro deploy, e aí a segunda passada que esta task previa deixa de existir.

      **1. Os três domínios.** `serviceDomainCreate` dá nome sorteado
      (`api-production-2789`, `keycloak-production-ab4d`, `transportada-frontend-production`);
      `serviceDomainUpdate` renomeia para os nomes que `docs/spec/railway.md:206-208` já
      documentava — `transportada-afr-fernandes-api`, `transportada-afr-fernandes-auth` e
      `transportada-afr-fernandes`. É a regra da T019 §4 em ato: o nome do cliente vive no domínio,
      nunca no serviço.

      **2. As oito variáveis**, lidas de volta do ambiente depois do commit:

      ```
      api       FRONTEND_ORIGIN          = https://transportada-afr-fernandes.up.railway.app
      api       KEYCLOAK_ISSUER          = …-auth.up.railway.app/realms/transportada
      api       KEYCLOAK_JWKS_URI        = …/realms/transportada/protocol/openid-connect/certs
      keycloak  KC_HOSTNAME              = https://transportada-afr-fernandes-auth.up.railway.app
      keycloak  KEYCLOAK_FRONTEND_ORIGIN = https://transportada-afr-fernandes.up.railway.app
      frontend  VITE_API_URL             = https://transportada-afr-fernandes-api.up.railway.app
      frontend  VITE_APP_URL             = https://transportada-afr-fernandes.up.railway.app
      frontend  VITE_KEYCLOAK_URL        = https://transportada-afr-fernandes-auth.up.railway.app
      ```

      **3. O volume do RabbitMQ.** `volumeCreate` em `/var/lib/rabbitmq`, região `sfo`, espelhando
      staging. Production tinha 2 volumes (os dois Postgres) e passou a ter 3; o `volumeMounts` da
      instância do rabbitmq aponta para ele. Fecha a pendência 5.

      **4. O bundle servido, não o build presumido.** A task avisava que restart não troca o bundle.
      Não precisou de rebuild extra porque as variáveis entraram **antes** do build da T021 — mas
      isso é presunção até alguém baixar o arquivo. Baixado:

      ```
      GET /assets/index-Cw6Izwnb.js  → 956.466 bytes
      transportada-afr-fernandes-api : 1 ocorrência
      transportada-afr-fernandes-auth: 1 ocorrência
      transportada-afr-fernandes.up  : 1 ocorrência
      staging                        : 0 ocorrências
      ```

      Zero ocorrência de `staging` é a metade que importa: prova que o bundle não é o de staging
      renomeado.

      **5. O que continua faltando na api, e por quê.** `BOOTSTRAP_TOKEN` e `PROVISION_COMPANY_ID`
      são T023, `SENTRY_DSN` e `LOG_SINK_URL` são T024. As quatro são `.optional()` em
      `config/environment.schema.ts` — a api sobe sem elas, e no caso das duas primeiras a ausência
      é o que mantém a rota de arranque morta (ADR-0022). Não é lacuna: é o estado declarado.

- [ ] T023 —

## Fase E — Prova de vida

- [ ] T024 —
- [ ] T025 —
- [ ] T026 —
- [ ] T027 —
- [ ] T028 —
