# Tasks

> 🤖 Modelo: `sonnet` para o grosso (script, workflow, fiação). 🧠 em T001, T002, T005, T013 e
> T020 — redação de PII, `beforeSend`, prova do restore e config-as-code erram caro e erram em
> silêncio. Validar com `opus`.

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
- [ ] T007 Projeto Railway `transportada-ops` — GlitchTip (template
      `glitchtip-sentry-alternative`), OpenObserve e Uptime Kuma (template oficial), mais os
      buckets `transportada-logs`, `transportada-backups` e `transportada-fiscal-mirror`. Senha
      forte própria em cada painel, **nunca** a do template (regra de segurança §2); credencial de
      bucket com escopo só do bucket que usa. Evidência: os três painéis abrindo pelo domínio
      público, e `aws s3 ls` contra cada bucket.
- [x] T008 [P] Serviço `vector` — `deploy/vector/{Dockerfile,vector.yaml,railway.json}` — intake
      HTTP na 9000 IPv6, dois sinks: arquivo S3 em `transportada-logs` (NDJSON gzip, particionado
      por dia) e OpenObserve por `OPENOBSERVE_URL`/`OPENOBSERVE_TOKEN`.
- [ ] T009 Ligar em **staging**: criar o serviço `vector`, preencher as variáveis das três apps,
      provocar uma exceção e um log com PII de mentira. Evidência: a linha achada no OpenObserve
      pelo `correlationId`, o mesmo evento no arquivo do bucket, o issue no GlitchTip, e a prova de
      que nenhum dos três tem PII.

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
- [ ] T013 🧠 Ligar o backup em **staging** e provar o ciclo inteiro: uma execução verde, um
      restore mensal verde, e um restore manual cronometrado seguindo
      `docs/ops/backup-emergencia.md`. Evidência: tempo medido (RTO) em `evidence.md`.
- [ ] T014 Provocar a falha de propósito uma vez: pular a janela do backup e adulterar o manifesto.
      Evidência: as duas notificações do Uptime Kuma.

## Fase C — O portão humano

- [ ] T015 [P] GitHub Environment `production`: revisor obrigatório + `RAILWAY_TOKEN` do ambiente
      (project token criado no dashboard do Railway). `staging` ganha o seu token no mesmo passo.
      Fecha a pendência 2 e 3 de `docs/spec/railway.md`.
- [ ] T016 [P] Proteção de `main`: PR obrigatório, CI verde, sem push direto (D8). Sem isso o
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
- [ ] T025 [P] Monitores no Uptime Kuma: HTTP em `/health/ready` da API e no frontend, push do
      backup e push do restore. Provocar a queda de cada um uma vez e anexar a notificação.
- [ ] T026 Login do primeiro `company-admin` pelo frontend de production, enxergando a empresa
      provisionada. Evidência com o CNPJ mascarado.
- [ ] T027 [P] `docs/spec/railway.md`: serviços `vector` e `backup`, o projeto `transportada-ops`,
      variáveis novas, e as pendências 1–5 marcadas como fechadas. `CLAUDE.md` mencionando os dois
      serviços de infraestrutura. `docs/ops/observabilidade.md` com o que vai para onde, o custo
      medido na T018 e como ligar um monitor novo. Regra §14 do code-standart.
- [ ] T028 `evidence.md` fechado: RTO medido, notificações de alerta, print do config-as-code,
      saída do `assert-migrations`, e a prova de ausência de PII nos três destinos.
