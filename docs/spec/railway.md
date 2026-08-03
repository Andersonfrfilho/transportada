# Railway: staging e production

- dashboard: `https://railway.com/project/62de4c69-216a-4335-93a0-4942c6a95c54`;
- project ID: `62de4c69-216a-4335-93a0-4942c6a95c54`;
- production ID: `4e24a47a-1514-4106-9d38-52420bd4cef6`;
- staging ID: `3cd99844-5712-40d2-aca7-75b25965419e`.

## Topologia

Um projeto Railway `transportada` com dois ambientes isolados:

| Ambiente     | Branch    | Ambiente fiscal do cron |
| ------------ | --------- | ----------------------- |
| `staging`    | `develop` | `homologation`          |
| `production` | `main`    | `production`            |

Serviços por ambiente — os nomes são únicos no projeto e cada ambiente tem a sua
própria instância e o seu próprio conjunto de variáveis:

```text
api  worker  cron  frontend  keycloak  rabbitmq  Postgres (app)  Postgres (Keycloak)  bucket
```

API, worker e cron compartilham banco e fila dentro do mesmo ambiente; nunca
entre ambientes. O browser fala só com o domínio público da API e do Keycloak;
o resto do tráfego é private networking (`*.railway.internal`).

O Keycloak tem banco próprio, separado do banco da aplicação: schema de
identidade e schema de domínio não disputam a mesma migration.

> ⚠️ O CLI do Railway ignora `--service` ao criar banco, então o banco do
> Keycloak nasceu com nome gerado: `Postgres-q0RQ` em staging e `Postgres-FDoz`
> em production (`Postgres-Hqfu` é o banco da aplicação em production). As
> variáveis `KC_DB_*` referenciam esses nomes — renomear o serviço no dashboard
> exige atualizar as referências.

### Armazenamento

Bucket nativo do Railway (S3-compatível), um por ambiente, região `sjc`:
`transportada-staging` e `transportada-production`. Não existe região no Brasil
— a decisão de residência de dado sob a LGPD é do responsável pelo produto.

O endpoint é `virtual-host`, por isso `OBJECT_STORAGE_FORCE_PATH_STYLE=false` é
obrigatório. O schema declara `.default('true')`, e o encadeamento
`OBJECT_STORAGE_FORCE_PATH_STYLE ?? STORAGE_FORCE_PATH_STYLE` nunca chega ao
segundo termo: configurar só `STORAGE_*` é silenciosamente ignorado.

## Build e configuração como código

O Dockerfile de cada serviço é escolhido pela variável de build
`RAILWAY_DOCKERFILE_PATH`, definida por serviço em cada ambiente:

| Serviço    | `RAILWAY_DOCKERFILE_PATH`               | Config                         |
| ---------- | --------------------------------------- | ------------------------------ |
| `api`      | `apps/api-transportada/Dockerfile`      | `deploy/api/railway.json`      |
| `worker`   | `apps/worker-transportada/Dockerfile`   | `deploy/worker/railway.json`   |
| `cron`     | `apps/cron-transportada/Dockerfile`     | `deploy/cron/railway.json`     |
| `frontend` | `apps/frontend-transportada/Dockerfile` | `deploy/frontend/railway.json` |
| `keycloak` | `deploy/keycloak/Dockerfile`            | `deploy/keycloak/railway.json` |

> ⚠️ **O caminho do arquivo de config é uma _configuração de serviço_, não uma
> variável de ambiente.** Não existe `RAILWAY_CONFIG_PATH`: definir essa
> variável não tem efeito nenhum e o build cai no builder padrão (Railpack),
> ignorando `dockerfilePath`, `preDeployCommand`, `healthcheckPath` e
> `cronSchedule`. O caminho precisa ser preenchido no campo _Config-as-code_ da
> aba _Settings_ do serviço, no dashboard, **um por serviço e por ambiente**.
> Enquanto isso não for feito, só `RAILWAY_DOCKERFILE_PATH` está ativo e o
> conteúdo dos `railway.json` é inerte.

O contexto de build é a raiz do monorepo — os workspaces Bun exigem o
`package.json` de todas as apps antes do `bun install --frozen-lockfile`.

- **api**: `preDeployCommand` roda `bun src/database/database-migration.service.ts`
  antes de trocar o tráfego. É o único ponto onde migration é aplicada — e só
  passa a valer depois do config-as-code ligado. Antes disso, a migration é
  aplicada manualmente:
  `railway ssh --service api --environment <env> bun src/database/database-migration.service.ts`
  (de dentro do contêiner, porque `*.railway.internal` não é acessível de fora).
- **cron**: `cronSchedule` `0 * * * *` com `restartPolicyType: NEVER` — processo
  de ciclo único, não serviço em loop.
- **frontend**: `VITE_*` é inlinado no bundle, então entra como `ARG` no build.
  Mudar domínio exige **rebuild**, não só restart.

## Identidade

O realm `transportada` é versionado em `deploy/keycloak/realm.json` e importado
no boot com estratégia "ignora o que já existe" — reimportar não sobrescreve
configuração feita à mão. As URLs saem de `${KEYCLOAK_FRONTEND_ORIGIN}` e o
`unmanagedAttributePolicy: ENABLED` é o que mantém o claim `company_id` vivo.

Nenhum usuário vem semeado: criar o primeiro usuário e atribuir `company_id` é
passo manual por ambiente, no admin console.

## Variáveis

Não secretas, por serviço: `APP_ENV`, `LOG_LEVEL`, `PORT`/`APP_PORT`/`WORKER_PORT`
(todos `8080`), `QUEUE_PREFIX` (`transportada_staging` / `transportada_production`),
`KEYCLOAK_AUDIENCE`, `FRONTEND_ORIGIN`, `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URI`,
`VITE_*`, `CRON_JOB`, `FISCAL_ENVIRONMENT`, `CADENCE_MINUTES`, `PAGE_SIZE`,
`OBJECT_STORAGE_BUCKET`/`ENDPOINT`/`REGION`/`FORCE_PATH_STYLE`.

Referências entre serviços, nunca cópia literal: `DATABASE_URL` aponta para
`${{Postgres.DATABASE_URL}}` e `RABBITMQ_URL` é montada a partir de
`${{rabbitmq.*}}`.

Secretas, geradas por ambiente e nunca iguais entre ambientes:
`ENCRYPTION_KEYRING_JSON`, `IDEMPOTENCY_HMAC_KEY`, `OBJECT_STORAGE_ACCESS_KEY`,
`OBJECT_STORAGE_SECRET_KEY`, `RABBITMQ_DEFAULT_PASS`, `KC_BOOTSTRAP_ADMIN_PASSWORD`.

> 🔑 **Faça backup do `ENCRYPTION_KEYRING_JSON` de production fora do Railway.**
> Perder a keyring torna todo certificado digital armazenado irrecuperável.
> `ENCRYPTION_ACTIVE_KEY_ID` é `staging-v1` / `production-v1`; rotação entra como
> chave nova na keyring, sem remover a antiga.

## Pipeline

`.github/workflows/deploy.yml`:

1. `push` em `develop` → staging; `push` em `main` → production;
   `workflow_dispatch` escolhe o ambiente.
2. O job `gate` chama `.github/workflows/ci.yml` inteiro (format, lint,
   typecheck, test, build, migration-test, integração e smoke). Nenhum deploy
   começa antes dele passar. Por isso `ci.yml` não dispara mais em `push`:
   rodaria a mesma suíte duas vezes no mesmo commit.
3. O job `deploy` usa o GitHub Environment homônimo — é ali que production
   ganha _required reviewers_ e a aprovação humana acontece.
4. Ordem: keycloak (só quando muda) → api (migration no pre-deploy) → worker →
   cron → frontend.

`railway up --ci` sai quando o build termina, não quando o release sobe; por
isso `.github/scripts/railway-deploy.sh` faz polling do status do deployment e
derruba o job em `FAILED`/`CRASHED`, imprimindo os últimos 100 logs.

Os serviços **não** têm o repositório GitHub conectado no Railway. É deliberado:
auto-deploy nativo dispararia sem passar pelo gate.

## Pendências operacionais

Passos que exigem o dashboard ou uma decisão humana:

1. **Config-as-code por serviço**: preencher o caminho do `railway.json` na aba
   _Settings_ de cada um dos dez pares serviço/ambiente. É o que liga
   `preDeployCommand` (migration da API), healthcheck e `cronSchedule`.
2. **`RAILWAY_TOKEN`**: criar um project token por ambiente no dashboard e
   guardar como secret do GitHub Environment correspondente (`staging` e
   `production`). Sem isso o deploy não autentica.
3. **Required reviewers** no GitHub Environment `production`.
4. **Backup da keyring de production** fora do Railway.
5. **Domínios e volume de production**: a instância do serviço só existe depois
   do primeiro deploy, então `FRONTEND_ORIGIN`, `KEYCLOAK_ISSUER`,
   `KEYCLOAK_JWKS_URI`, `KC_HOSTNAME`, `KEYCLOAK_FRONTEND_ORIGIN` e os `VITE_*`
   de production só podem ser preenchidos depois — e o frontend precisa de
   **rebuild** em seguida. O volume do RabbitMQ de production também fica para
   depois do primeiro deploy.
6. **Emissão fiscal real** em production continua atrás da configuração por
   empresa; o ambiente estar de pé não habilita CT-e real.

## Domínios de staging

- api: `https://api-staging-5633.up.railway.app`
- frontend: `https://frontend-staging-a83a.up.railway.app`
- keycloak: `https://keycloak-staging-d714.up.railway.app`

## Promoção

1. PR → CI.
2. Merge em `develop` → staging automático.
3. Migration compatível → smoke/E2E em homologação.
4. Tag/versão + aprovação humana no GitHub Environment.
5. Merge em `main` → production.
6. Health, migration e smoke pós-deploy.

Schema evolui por expand/contract. Worker antigo e novo só convivem quando
envelopes e efeitos são compatíveis; consumidor fiscal incompatível exige drain
e troca controlada.
