# Railway: staging e production

> A distribuição é **um deploy por transportadora** (ADR-0021). Este projeto do
> Railway, com os seus dois ambientes, é a instalação de **um** cliente. Cliente
> novo é projeto novo, com o mesmo pipeline e as mesmas variáveis — nunca um
> segundo tenant dentro do mesmo banco, fila, bucket ou realm.

- dashboard: `https://railway.com/project/62de4c69-216a-4335-93a0-4942c6a95c54`;
- project ID: `62de4c69-216a-4335-93a0-4942c6a95c54`;
- production ID: `4e24a47a-1514-4106-9d38-52420bd4cef6`;
- staging ID: `3cd99844-5712-40d2-aca7-75b25965419e`.

## Topologia

Um projeto Railway `transportada` com dois ambientes isolados:

| Ambiente     | Branch    | Ambiente fiscal do cron |
| ------------ | --------- | ----------------------- |
| `staging`    | `staging` | `homologation`          |
| `production` | `main`    | `production`            |

Serviços por ambiente — os nomes são únicos no projeto e cada ambiente tem a sua
própria instância e o seu próprio conjunto de variáveis:

```text
api  worker  cron  cron-nfse  cron-notifications  cron-fuel  transportada-frontend  keycloak  rabbitmq  Postgres (app)  Postgres (Keycloak)  bucket
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

| Serviço                 | `RAILWAY_DOCKERFILE_PATH`               | Config                                   |
| ----------------------- | --------------------------------------- | ---------------------------------------- |
| `api`                   | `apps/api-transportada/Dockerfile`      | `deploy/api/railway.json`                |
| `worker`                | `apps/worker-transportada/Dockerfile`   | `deploy/worker/railway.json`             |
| `cron`                  | `apps/cron-transportada/Dockerfile`     | `deploy/cron/railway.json`               |
| `cron-nfse`             | `apps/cron-transportada/Dockerfile`     | `deploy/cron-nfse/railway.json`          |
| `cron-notifications`    | `apps/cron-transportada/Dockerfile`     | `deploy/cron-notifications/railway.json` |
| `cron-fuel`             | `apps/cron-transportada/Dockerfile`     | `deploy/cron-fuel/railway.json`          |
| `transportada-frontend` | `apps/frontend-transportada/Dockerfile` | `deploy/frontend/railway.json`           |
| `keycloak`              | `deploy/keycloak/Dockerfile`            | `deploy/keycloak/railway.json`           |

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

- **api**: `preDeployCommand` roda `bun src/database/pre-deploy.service.ts` antes
  de trocar o tráfego — migration e provisionamento no mesmo processo, nessa
  ordem. **A Railway aceita um comando só** (`Array must contain at most 1
element(s)`) e o executa **como argv, sem shell**: `a && b` faz `a` receber
  `&&` e `b` como argumentos, roda a migration, sai `0` e deixa o deploy verde
  sem provisionar a empresa. Por isso o encadeamento vive em código, não em
  shell. É o único ponto onde migration é aplicada — e só
  passa a valer depois do config-as-code ligado. Antes disso, a migration é
  aplicada manualmente:
  `railway ssh --service api --environment <env> bun src/database/database-migration.service.ts`
  (de dentro do contêiner, porque `*.railway.internal` não é acessível de fora).
- **cron**: `cronSchedule` `*/15 * * * *` com `restartPolicyType: NEVER` — processo
  de ciclo único, não serviço em loop. O tique é mais fino que a janela de uma hora
  da SEFAZ porque essa hora corre do lado dela, a partir do instante em que nos
  serviu: no tique de hora cheia a permissão só era reencontrada na hora seguinte.
  Ciclo fora da janela é no-op — a elegibilidade recusa por `cooldown_active` antes
  de criar importação, e `CADENCE_MINUTES=60` mantém uma enfileirada por hora.
  Roda o job `nfe.distribution.pull`.
- **cron-nfse**: mesmo Dockerfile, mesmo binário, mesma política de reinício — o
  que separa os dois serviços é a variável `CRON_JOB`, e nada no build. Aqui ela é
  `nfse.status.pull`, a reconciliação das notas de serviço municipais. O tique é
  `*/5 * * * *` porque a reconsulta de uma nota pendente só é reagendada a cada
  `NFSE_PENDING_RECHECK_MINUTES` (5): tique mais largo que essa janela deixaria a
  nota elegível sem ninguém passando para pegá-la, e a autorização da prefeitura
  esperaria o tique inteiro para virar XML arquivado. É o serviço que exige o
  bloco `NFSE_*` de configuração — sem ele o boot falha, de propósito.
- **cron-fuel**: `CRON_JOB=fuel.price.pull`, o resumo semanal de preço da ANP (ADR-0033). O tique é
  `0 9 * * 6` — **sábado, 09:00 UTC (06:00 no Brasil)**, e o dia não é preferência. A semana da ANP
  vai de domingo a sábado e dá nome ao arquivo; `resolveReferenceWeek` deriva a URL da semana que
  contém o dia de hoje. Rodando no sábado, pede a semana que fecha naquele dia — publicada na
  sexta-feira anterior (ADR-0033: semana de 09/08 a 15/08, no ar em 14/08). Rodando no domingo,
  pediria a semana que **acabou de começar**, cujo arquivo só existe seis dias depois: 404 a cada
  ciclo. Ciclo sem a semana no ar não grava meia referência — falha limpa, e a semana anterior
  continua valendo. Diferente dos outros crons, este sobe nos dois ambientes: a referência é dado
  público de mercado, sem certificado, sem tenant e sem efeito fiscal.
- **frontend**: `VITE_*` é inlinado no bundle, então entra como `ARG` no build.
  Mudar domínio exige **rebuild**, não só restart. `VITE_APP_ENV` (`local` ·
  `staging` · `production`) decide o 🚧 no ícone da aba e a faixa de ambiente:
  ausente ou desconhecido cai em `production`, porque o valor esquecido no painel
  não pode fazer a instalação do cliente se anunciar como obra em andamento — em
  staging ele **precisa** estar declarado.

## Identidade

O realm `transportada` é versionado em `deploy/keycloak/realm.json` e importado
no boot com estratégia "ignora o que já existe" — reimportar não sobrescreve
configuração feita à mão. As URLs saem de `${KEYCLOAK_FRONTEND_ORIGIN}` e o
`unmanagedAttributePolicy: ENABLED` é o que mantém o claim `company_id` vivo.

Criar o usuário no admin console e atribuir `company_id` continua sendo passo
manual por ambiente. O que **deixou** de ser manual é o lado da aplicação: o
`preDeployCommand` da API roda `environment-provisioning.service.ts` depois da
migration e garante, de forma idempotente, a empresa única do ambiente e o
primeiro `company-admin` — sem `railway ssh` de SQL.

Duas variáveis governam o comando:

- `PROVISION_COMPANY_ID` — UUID da empresa do ambiente (ADR-0021: a empresa é o
  ambiente, não vem de payload).
- `PROVISION_ADMIN_SUBJECT` — o `sub` do usuário Keycloak que será o primeiro
  administrador, copiado do admin console.

As duas vazias significam "ambiente ainda não provisionado": o passo imprime
`{"provisioning":"skipped"}` e o deploy segue. Declarar só uma delas falha o
deploy — meia configuração é erro, não silêncio. Rodar de novo com a mesma
configuração não duplica nem sobrescreve nada; se o vínculo do admin tiver sido
desabilitado à mão, o comando recusa em vez de reativar.

Quando a fase C da feature 026 entregar o gateway do Keycloak (T000c), o
`PROVISION_ADMIN_SUBJECT` sai de cena: o próprio comando cria o usuário
desabilitado e emite o primeiro código de ativação.

## Variáveis

Não secretas, por serviço: `APP_ENV`, `LOG_LEVEL`, `PORT`/`APP_PORT`/`WORKER_PORT`
(todos `8080`), `QUEUE_PREFIX` (`transportada_staging` / `transportada_production`),
`KEYCLOAK_AUDIENCE`, `FRONTEND_ORIGIN`, `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URI`,
`VITE_*`, `CRON_JOB`, `FISCAL_ENVIRONMENT`, `CADENCE_MINUTES`, `PAGE_SIZE`,
`OBJECT_STORAGE_BUCKET`/`ENDPOINT`/`REGION`/`FORCE_PATH_STYLE`.

> ⏱ `SCHEDULED_DISTRIBUTION_CRON`, na `api`, tem de espelhar o `deploy.cronSchedule`
> de `deploy/cron/railway.json` — é dela que sai o "próximo ciclo automático" que a
> tela mostra, e a API não observa o serviço de cron para descobrir isso sozinha.
> Só o campo de minuto pode ser fixado (`0 * * * *`, `*/15 * * * *`); qualquer outra
> forma derruba o boot em vez de servir data inventada. Mudou a cadência do cron?
> mude a variável junto. No painel da Railway o valor vai **sem aspas** — elas só
> existem no `.env.example` porque o CI faz `. ./.env` e `*` solto vira glob.

Referências entre serviços, nunca cópia literal: `DATABASE_URL` aponta para
`${{Postgres.DATABASE_URL}}` e `RABBITMQ_URL` é montada a partir de
`${{rabbitmq.*}}`.

Secretas, geradas por ambiente e nunca iguais entre ambientes:
`ENCRYPTION_KEYRING_JSON`, `IDEMPOTENCY_HMAC_KEY`, `NOTIFICATION_SUPPRESSION_HMAC_KEY`,
`OBJECT_STORAGE_ACCESS_KEY`,
`OBJECT_STORAGE_SECRET_KEY`, `RABBITMQ_DEFAULT_PASS`, `KC_BOOTSTRAP_ADMIN_PASSWORD`.

> 🔑 **Faça backup do `ENCRYPTION_KEYRING_JSON` de production fora do Railway.**
> Perder a keyring torna todo certificado digital armazenado irrecuperável.
> `ENCRYPTION_ACTIVE_KEY_ID` é `staging-v1` / `production-v1`; rotação entra como
> chave nova na keyring, sem remover a antiga.

## Pipeline

`.github/workflows/deploy.yml`:

1. Pull request mirando `staging` → staging; `push` em `main` → production;
   `workflow_dispatch` escolhe o ambiente. Branch sem ambiente não dispara o
   workflow, e se disparar por engano o job `target` falha em vez de assumir
   staging — `develop` é branch de trabalho, não de publicação.
   Staging publica o código **proposto**, antes do merge: é o que o PR está
   pedindo para promover. `push` em `staging` não dispara nada, porque depois do
   squash-merge para `main` o back-merge de `main` em `staging` não traz
   conteúdo novo — rodava o gate inteiro e os cinco deploys para não mudar um
   arquivo. Dois PRs abertos ao mesmo tempo disputam o mesmo staging; abra um
   por vez.
2. O PR `staging → main` roda o workflow **sem publicar**: os jobs `target` e
   `deploy` ficam de fora por `github.base_ref`, e sobra o `gate`. Não é
   cerimônia — a proteção da `main` exige os contextos `gate / quality` e
   `gate / integration`, e eles só existem se este workflow rodar no commit do
   PR. Antes eles vinham do deploy do push em `staging`; sem aquele run, o PR de
   release ficaria bloqueado para sempre.
3. O job `gate` chama `.github/workflows/ci.yml` inteiro (format, lint,
   typecheck, test, build, migration-test, integração e smoke). Nenhum deploy
   começa antes dele passar. Por isso `ci.yml` **não tem gatilho próprio**:
   um `pull_request` nele rodaria a mesma suíte duas vezes no mesmo commit.
4. O job `deploy` usa o GitHub Environment homônimo — é ali que production
   ganha _required reviewers_ e a aprovação humana acontece.
5. Ordem: keycloak (só quando muda) → api (migration no pre-deploy) → worker →
   cron → cron-nfse → cron-notifications → cron-fuel → transportada-frontend. Os
   crons depois da API porque leem tabelas que só a migration dela cria.

`railway up --ci` sai quando o build termina, não quando o release sobe; por
isso `.github/scripts/railway-deploy.sh` faz polling do status do deployment e
derruba o job em `FAILED`/`CRASHED`, imprimindo os últimos 100 logs.

Os serviços **não** têm o repositório GitHub conectado no Railway. É deliberado:
auto-deploy nativo dispararia sem passar pelo gate.

## Pendências operacionais

Passos que exigem o dashboard ou uma decisão humana:

1. **Config-as-code por serviço**: preencher o caminho do `railway.json` na aba
   _Settings_ de cada um dos dezesseis pares serviço/ambiente. É o que liga
   `preDeployCommand` (migration da API), healthcheck e `cronSchedule`.
2. ~~**`RAILWAY_TOKEN`**~~ resolvida: project token por ambiente, guardado como secret do GitHub
   Environment homônimo (`staging` e `production`).
3. ~~**Required reviewers**~~ no GitHub Environment `production`: **não é possível hoje** —
   repositório privado em plano Free, a API responde `422`. O portão humano é o merge do PR na
   `main` protegida, e volta a ser o revisor do Environment quando o plano mudar.
4. ~~**Backup da keyring de production** fora do Railway.~~ **Resolvida.** Os segredos nasceram fora
   do painel, num arquivo `600`, e os onze campos estão no Chaveiro do macOS sob o serviço
   `TransportAdA production` — gravados via stdin, conferidos por leitura de volta, e o arquivo de
   transferência destruído com `rm -P`. Onde vive e como se lê está em
   `docs/ops/backup-emergencia.md` § _Copiar a keyring_ — o local, nunca o valor. Staging tem ciclo
   automático diário desde a feature 029; production ganha o dele junto com o primeiro deploy.
5. **Domínios e volume de production**: a instância do serviço só existe depois
   do primeiro deploy — comprovado, não suposto: `serviceDomainCreate` responde
   `ServiceInstance not found`, e `serviceInstanceUpdate` no par sem instância
   responde `true` sem criar nada. Então `FRONTEND_ORIGIN`, `KEYCLOAK_ISSUER`,
   `KEYCLOAK_JWKS_URI`, `KC_HOSTNAME`, `KEYCLOAK_FRONTEND_ORIGIN` e os `VITE_*`
   de production só podem ser preenchidos depois — e o frontend precisa de
   **rebuild** em seguida. O volume do RabbitMQ de production também fica para
   depois do primeiro deploy.
6. **Emissão fiscal real** em production continua atrás da configuração por
   empresa; o ambiente estar de pé não habilita CT-e real.

## Domínios próprios

O endereço que o cliente digita é `fernandes-transportadora.com.br`, em subdomínios:
`app`/`api`/`auth` para production e `*.staging` para staging. A zona responde pela KingHost, o
apex e o e-mail do domínio ficam intocados, e não há Cloudflare no caminho — estado da zona,
motivos e ordem de execução em `docs/ops/dns.md`. Os domínios no Railway se criam e se conferem
com `./scripts/railway-domains.py <ambiente>`.

Os `*.up.railway.app` abaixo continuam válidos e são o endereço interno de gate e smoke.

## Domínios gerados de production

O domínio é o endereço que o cliente digita, então é ele — não o nome do serviço —
que carrega o nome do cliente. Production não diz o ambiente:

- api: `https://transportada-afr-fernandes-api.up.railway.app`
- transportada-frontend: `https://transportada-afr-fernandes.up.railway.app`
- keycloak: `https://transportada-afr-fernandes-auth.up.railway.app`

> ⚠️ **Nome de serviço e rótulo de domínio são campos independentes, e só o segundo
> pode carregar o nome do cliente.** O serviço pertence ao projeto, não ao ambiente:
> renomear `api` para `transportada-afr-fernandes-api` renomearia em staging junto e
> quebraria `.github/scripts/railway-deploy.sh`, que endereça cada serviço pelo nome
> nos dois ambientes. Serviço fica curto; o domínio é que se renomeia, com
> `serviceDomainUpdate(input: {serviceDomainId, serviceId, environmentId, domain,
targetPort})` e `domain` sendo o hostname inteiro. O CLI não serve: `railway domain
<valor>` trata o valor como domínio próprio.

> ✅ Os três existem desde o primeiro deploy de production. Foi preciso deployar antes:
> `serviceDomainCreate` responde `ServiceInstance not found` enquanto o serviço não tiver
> o primeiro deploy no ambiente — a instância nasce com ele, e não há como antecipá-la: um
> `serviceInstanceUpdate` no par serviço/ambiente sem instância responde `true` e não
> cria nada. Por isso a primeira passada do deploy de production parou em
> `assert-migrations`, que exige domínio público na api para ler `/health/ready`.

Serviço interno não recebe domínio: `worker`, `cron`, `cron-nfse`, `cron-fuel`, `rabbitmq` e os bancos falam
só por `*.railway.internal`. O `worker` de staging tinha um domínio gerado que
ninguém pedia e ninguém monitorava — anônimo, da internet aberta, o `/health/ready`
devolvia `{"dependencies":{"database":"up","rabbitmq":"up","storage":"up"}}` e
entregava a topologia da infra a quem perguntasse. Removido com `serviceDomainDelete`.

## Domínios gerados de staging

- api: `https://api-staging-5633.up.railway.app`
- transportada-frontend: `https://transportada-staging.up.railway.app`
- keycloak: `https://keycloak-staging-d714.up.railway.app`

> ⚠️ Renomear um serviço **não** renomeia o domínio gerado — ele fica com o nome
> antigo até ser trocado à parte, e o nome do serviço é único no projeto, então a
> troca vale para staging e production ao mesmo tempo. Trocar o domínio quebra, de
> uma vez, o `FRONTEND_ORIGIN` da API (CORS), o `VITE_APP_URL` do frontend (que
> monta o `redirect_uri`) e `redirectUris`/`webOrigins` do client `transportada-spa`
> no Keycloak. Como o `--import-realm` ignora realm já existente, o client vivo só
> muda pela admin API — atualizar `KEYCLOAK_FRONTEND_ORIGIN` sozinho não basta.

## Promoção

1. PR de feature → `develop` → CI.
2. Merge de `develop` em `staging` → staging automático.
3. Migration compatível → smoke/E2E em homologação.
4. Tag/versão + aprovação humana no GitHub Environment.
5. Merge de `staging` em `main` → production.
6. Health, migration e smoke pós-deploy.

Schema evolui por expand/contract. Worker antigo e novo só convivem quando
envelopes e efeitos são compatíveis; consumidor fiscal incompatível exige drain
e troca controlada.
