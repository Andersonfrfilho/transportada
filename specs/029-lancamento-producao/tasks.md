# Tasks

> 🤖 Modelo: `sonnet` para o grosso (script, workflow, fiação). 🧠 em T001, T002, T005, T012a, T013
> e T020 — redação de PII, `beforeSend`, escolha do stack de uptime, prova do restore e
> config-as-code erram caro e erram em silêncio. Validar com `opus`.

Nenhum `[NEEDS CLARIFICATION]` aberto: RPO e a restrição a software sempre gratuito ou open source
foram resolvidos com o usuário (ver `spec.md` § D2 e D5).

As fases são sequenciais por decisão de arquitetura (D1) — a fase D não começa antes de A, B e C
terem evidência em `evidence.md`.

## Fase A — O que sai do processo

- [x] T001 🧠 Contract test do redator — `adatechnology-packages`, `src/redact.test.ts` — corpus
      de PII (CPF cru e formatado, CNPJ, e-mail, telefone com e sem DDI, chave de 44 dígitos),
      aninhamento em array, referência cíclica, profundidade acima do limite, **e** o teste
      negativo: `companyId`, `correlationId`, `sqlState`, `constraint`, contagem e duração passam
      intactos. Escrito antes de T002.
- [x] T002 🧠 Redator de duas camadas — `src/redact.ts` — denylist por nome de chave (recursiva,
      case-insensitive) + varredura por forma do valor. Chave de acesso vira `****` + 6 últimos.
      T001 passa a verde.
- [x] T003 Transporte HTTP no logger — `src/http-transport.ts` — NDJSON, batching, fila com teto,
      descarte silencioso. `sinkUrl` vazio desliga. Teste com servidor falso. **Inclui ligar o
      redator da T002 no `write` do `Logger`**, antes de stdout e do transporte: enquanto ele não
      for chamado ali, a redação depende da disciplina de quem escreve o log, que é justamente o
      que a regra de segurança §1 proíbe. Teste antes: `logger.info` com PII no `meta` não pode
      sair em nenhum dos dois destinos.
- [x] T004 Publicar `@adatechnology/logger@0.1.0` por changeset no GitHub Actions do repositório de
      packages, e subir a dependência nas três apps. Evidência: versão instalada no lockfile.
- [x] T005 🧠 Rastreio de erro nas três apps — `src/observability/sentry.service.ts` + fiação no `main.ts` —
      `@sentry/bun` 10.x, `sendDefaultPii: false`, `tracesSampleRate: 0`, `beforeSend` passando
      `extra`, `contexts`, `breadcrumbs` e `request` pelo **mesmo** redator. Contract test de
      redação ponta a ponta e de no-op sem `SENTRY_DSN`, um por app, adicionados à lista explícita
      do `package.json` de cada uma.
- [x] T006 [P] Env schema das três apps — `SENTRY_DSN?`, `SENTRY_ENVIRONMENT?`, `LOG_SINK_URL?` —
      e `.env.example` atualizado. Vazio é o padrão e significa desligado.
      ⚠️ `SENTRY_DSN`/`SENTRY_ENVIRONMENT` já entraram na T005 (a fiação do `main.ts` não existe
      sem eles) — sobra `LOG_SINK_URL` e o `.env.example`.
- [x] T007 Projeto Railway `transportada-ops` — GlitchTip (template
      `glitchtip-sentry-alternative`), OpenObserve e o serviço de uptime, mais os
      buckets `transportada-logs`, `transportada-backups` e `transportada-fiscal-mirror`. Senha
      forte própria em cada painel, **nunca** a do template (regra de segurança §2); credencial de
      bucket com escopo só do bucket que usa. Evidência: os três painéis abrindo pelo domínio
      público, e `aws s3 ls` contra cada bucket.
      ⚠️ Subiu o template **oficial** `glitchtip` (verificado, 87 deploys) em vez do
      `glitchtip-sentry-alternative` (de terceiro, 0 deploys). Falta concluir o assistente de
      primeira execução do Uptime Kuma — passo de navegador, não tem variável de bootstrap.
      ⚠️ Esse assistente nunca foi concluído: o Uptime Kuma saiu do projeto na T012a e o uptime
      passou a ser o Gatus, que sobe deste repositório e entra por Keycloak (ADR-0025).
      ⚠️ Os buckets viraram `transportada-afr-fernandes-*` (desvio 4): o projeto de ops é **um por
      cliente**, como o da aplicação. Nenhum código mudou — nome de bucket só existe em variável.
- [x] T008 [P] Serviço `vector` — `deploy/vector/{Dockerfile,vector.yaml,railway.json}` — intake
      HTTP na 9000 IPv6, dois sinks: arquivo S3 em `transportada-logs` (NDJSON gzip, particionado
      por dia) e OpenObserve por `OPENOBSERVE_URL`/`OPENOBSERVE_TOKEN`.
- [x] T009 Ligar em **staging**: criar o serviço `vector`, preencher as variáveis das três apps,
      provocar uma exceção e um log com PII de mentira. Evidência: a linha achada no OpenObserve
      pelo `correlationId`, o mesmo evento no arquivo do bucket, o issue no GlitchTip, e a prova de
      que nenhum dos três tem PII.
      ⚠️ A 0.57.0 do Vector desligou a interpolação de `${VAR}` por padrão, e desligada ela é
      silenciosa — corrigido no `CMD` com `--dangerously-allow-env-var-interpolation` e guardado por
      contrato (commit `3f9caa5`).
      ⚠️ O ingest do OpenObserve é `_multi`, não `_json`: `_json` só aceita array e o sink manda
      NDJSON. A linha do `plan.md` que dizia `_json` estava errada e foi corrigida.

## Fase B — Sobrevivência do dado

- [x] T010 `deploy/backup/{Dockerfile,backup.sh,railway.json}` — `postgres:18-alpine` (o servidor é
      18), dump custom dos **dois** bancos por private networking, `pg_restore --list` como
      validação, AES-256-CBC PBKDF2, upload com `.sha256`, linha no `manifest.jsonl`, retenção
      30/90 e push do heartbeat só no sucesso. Testado localmente contra o `docker compose` do
      repositório, sem bucket remoto no caminho.
- [x] T011 [P] `.github/workflows/bucket-mirror.yml` — `aws s3 sync` diário do bucket fiscal para
      `transportada-fiscal-mirror`, **sem `--delete`** (D6). Credencial de leitura na origem,
      escrita só no espelho.
- [x] T012 [P] `.github/workflows/restore-test.yml` — mensal, service container `postgres:18`,
      baixa o dump mais recente, decifra, restaura e compara com o manifesto (hash, contagem de
      tabelas, `lastMigration`). Recusa alvo cujo host não seja `localhost`. Sem nenhum secret de
      escrita em production.
- [ ] T012a 🧠 Trocar o Uptime Kuma pelo **Gatus** (ADR-0025): ele não tem login OIDC e o mantenedor
      diz que não terá tão cedo, e monitor clicado num painel não nasce junto com a instalação nova.
      `deploy/gatus/{Dockerfile,config.yaml,railway.json}` com login por Keycloak, monitores como
      arquivo e os dois heartbeats virando `POST` autenticado no `backup.sh` e no `restore-test.yml`.
      Evidência: contrato `test/deploy/gatus.contract.ts` verde, o serviço no ar pelo domínio
      público, e o Uptime Kuma removido do projeto de ops.
- [ ] T013 🧠 Ligar o backup em **staging** e provar o ciclo inteiro: uma execução verde, um
      restore mensal verde, e um restore manual cronometrado seguindo
      `docs/ops/backup-emergencia.md`. Evidência: tempo medido (RTO) em `evidence.md`.
      Execução verde ✅ e restore manual cronometrado ✅ (RTO 14 s). O restore mensal roda verde até
      o último passo e **para no heartbeat**, que não tem para onde apontar enquanto o monitor não
      tiver dono. Fecha na T012a, com o Gatus no ar.
- [ ] T014 Provocar a falha de propósito uma vez: pular a janela do backup e adulterar o manifesto.
      Evidência: as duas notificações do Gatus — a primeira sai sozinha do `heartbeat.interval`
      vencido, a segunda do job de restore que falha antes de pingar.

## Fase C — O portão humano

- [x] T015 [P] GitHub Environment `production`: revisor obrigatório + `RAILWAY_TOKEN` do ambiente
      (project token criado no dashboard do Railway). `staging` ganha o seu token no mesmo passo.
      Fecha a pendência 2 e 3 de `docs/spec/railway.md`.
      ⚠️ O revisor obrigatório não entrou: repositório privado em plano Free, a API recusa
      (`422`). O portão humano é o merge do PR na `main` protegida (T016) até o plano mudar.
- [x] T016 [P] Proteção de `main`: PR obrigatório, CI verde, sem push direto (D8). Sem isso o
      revisor do Environment é contornável.
- [ ] T017 Gerar os segredos de production — `ENCRYPTION_KEYRING_JSON` (`production-v1`),
      `IDEMPOTENCY_HMAC_KEY`, `RABBITMQ_DEFAULT_PASS`, `KC_BOOTSTRAP_ADMIN_PASSWORD`,
      `OBJECT_STORAGE_*` — e **copiar a keyring fora do Railway**, registrando o local (nunca o
      valor) em `docs/ops/backup-emergencia.md`. Fecha a pendência 4.

## Fase D — Subir production

- [ ] T018 Conferir que o banco da aplicação de production está vazio, e medir o tamanho atual do
      bucket fiscal de staging e o volume diário de log para projetar o custo mensal de storage e
      de compute do projeto de ops. Evidência: os números em `evidence.md`.
- [ ] T019 Criar os seis serviços em production — `rabbitmq`, `keycloak`, `api`, `worker`, `cron`,
      `transportada-frontend` — com `RAILWAY_DOCKERFILE_PATH` e todas as variáveis não secretas.
      `SCHEDULED_DISTRIBUTION_CRON` da API espelhando o `cronSchedule` do cron, sem aspas.
      ⚠️ **Nome de serviço é nome de domínio.** O Railway gera `<serviço>-<ambiente>-<hash>` — o
      nome do projeto nunca entra, e o ambiente entra sempre. Os três que o cliente enxerga têm de
      nascer com o nome certo, porque trocar depois troca a URL que o cliente já usa:

      | Serviço      | production                        | staging                                   |
      | ------------ | --------------------------------- | ----------------------------------------- |
      | frontend     | `transportada-afr-fernandes`      | `staging-transportada-afr-fernandes`      |
      | api          | `transportada-afr-fernandes-api`  | `staging-transportada-afr-fernandes-api`  |
      | keycloak     | `transportada-afr-fernandes-auth` | `staging-transportada-afr-fernandes-auth` |

      Production **não diz o ambiente** — é o normal, e o `-production-` do gerador tem de sair.
      Staging diz, e diz como **prefixo**. Serviço interno (`worker`, `cron`, `rabbitmq`, bancos)
      não tem domínio público e fica com nome curto.

      ⚠️ Falta confirmar **como** se edita o subdomínio do `up.railway.app`: `railway domain <valor>`
      trata o valor como domínio próprio (devolve registro DNS), não como subdomínio do Railway. Que
      seja editável está provado pelo `transportada-staging.up.railway.app` de hoje — é
      `serviceDomain`, sem `-frontend` e sem hash, então alguém escolheu. Descobrir se é CLI ou
      dashboard **antes** de criar os serviços, não depois.

- [ ] T020 🧠 Preencher **config-as-code** na aba _Settings_ de cada serviço de production. Sem
      isso o `preDeployCommand` não roda e a API sobe sem as 9 migrations (D9). Fecha a pendência 1.
      Evidência: print do campo preenchido nos seis.
- [ ] T021 Primeira passada do deploy: merge de `staging` em `main`, aprovar no Environment,
      acompanhar keycloak → api → worker → cron → frontend. `assert-migrations` tem de confirmar
      as 9 migrations.
- [ ] T022 Segunda passada (D9): com os domínios existindo, preencher `FRONTEND_ORIGIN`,
      `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URI`, `KC_HOSTNAME`, `KEYCLOAK_FRONTEND_ORIGIN` e os
      `VITE_*`, criar o volume do RabbitMQ, e **rebuildar** o frontend — restart não troca o
      bundle. Fecha a pendência 5.
- [ ] T023 Provisionar identidade: criar o primeiro usuário no admin console do Keycloak de
      production, copiar o `sub` para `PROVISION_ADMIN_SUBJECT`, definir `PROVISION_COMPANY_ID` e
      redeployar a API. As duas variáveis juntas ou nenhuma — meia configuração falha o deploy.

## Fase E — Prova de vida

- [ ] T024 Ligar o serviço `backup` e o `vector` em production, com as variáveis do ambiente
      (nunca as de staging). Primeira execução verde antes do fim do dia do deploy — é o que fecha
      a janela sem cópia (D1).
- [ ] T025 [P] Grupo `production` no `deploy/gatus/config.yaml`: HTTP em `/health/ready` da API e no
      frontend, push do backup e push do restore. Provocar a queda de cada um uma vez e anexar a
      notificação. É diff de pull request, não clique — o grupo `staging` da T012a é o molde.
- [ ] T026 Login do primeiro `company-admin` pelo frontend de production, enxergando a empresa
      provisionada. Evidência com o CNPJ mascarado.
- [ ] T027 [P] `docs/spec/railway.md`: serviços `vector` e `backup`, o projeto de ops
      (`transportada-afr-fernandes-ops`) e a regra de que ele é **um por cliente**, como o da
      aplicação — mais a convenção de nome: serviço que o cliente acessa carrega
      `transportada-<cliente>` porque é ele que vira domínio; serviço interno fica curto.
      variáveis novas, e as pendências 1–5 marcadas como fechadas. `CLAUDE.md` mencionando os dois
      serviços de infraestrutura. `docs/ops/observabilidade.md` com o que vai para onde, o custo
      medido na T018 e como ligar um monitor novo. Regra §14 do code-standart.
- [ ] T028 `evidence.md` fechado: RTO medido, notificações de alerta, print do config-as-code,
      saída do `assert-migrations`, e a prova de ausência de PII nos três destinos.

## Depois do go-live

Fora do escopo desta spec — anotado aqui para não se perder.

- [ ] Alinhar os domínios de **staging** à convenção da T019: `staging-transportada-afr-fernandes`,
      `-api` e `-auth`. Hoje são `api-staging-5633`, `keycloak-staging-d714` e
      `transportada-staging`, gerados pelo Railway. Não é cosmético: pede `FRONTEND_ORIGIN`,
      `KEYCLOAK_ISSUER` e `KEYCLOAK_JWKS_URI` na api; `VITE_API_URL`, `VITE_APP_URL` e
      `VITE_KEYCLOAK_URL` no frontend **com rebuild** (o `VITE_*` fica no bundle, restart não
      troca); `KC_HOSTNAME` e `KEYCLOAK_FRONTEND_ORIGIN` no keycloak; e os `redirectUris` /
      `webOrigins` do client no console admin — que **não** são versionados, o `realm/` só carrega
      o realm local. Errar a última linha para o login de staging sem deixar rastro no repositório.
      As `RAILWAY_SERVICE_*_URL` seguem sozinhas. Adiado para depois do go-live porque staging é o
      campo de prova das T009, T013 e T014, e o cliente não acessa staging.
