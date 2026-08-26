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
api  worker  cron  transportada-frontend  landing  keycloak  rabbitmq  Postgres (app)  Postgres (Keycloak)  bucket
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

| Serviço                 | `RAILWAY_DOCKERFILE_PATH`               | Config                         |
| ----------------------- | --------------------------------------- | ------------------------------ |
| `api`                   | `apps/api-transportada/Dockerfile`      | `deploy/api/railway.json`      |
| `worker`                | `apps/worker-transportada/Dockerfile`   | `deploy/worker/railway.json`   |
| `cron`                  | `apps/cron-transportada/Dockerfile`     | `deploy/cron/railway.json`     |
| `transportada-frontend` | `apps/frontend-transportada/Dockerfile` | `deploy/frontend/railway.json` |
| `landing`               | `apps/frontend-landing/Dockerfile`      | `deploy/landing/railway.json`  |
| `keycloak`              | `deploy/keycloak/Dockerfile`            | `deploy/keycloak/railway.json` |

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
- **cron**: `cronSchedule` `*/5 * * * *` com `restartPolicyType: NEVER` — processo de ciclo único,
  não serviço em loop. Ele não roda rotina nenhuma: pega o advisory lock, seleciona em
  `job_schedules` o que venceu e publica cada rotina em `job-run.v1`, para o worker executar
  (spec 052). Quem decide a cadência de cada uma é a linha do banco, editável pelo painel do
  produto — não o `cronSchedule` daqui, que é só o **piso** de granularidade: nada corre mais fino
  que cinco minutos, porque nada é olhado mais de perto que isso.

  Eram quatro serviços (`cron`, `cron-nfse`, `cron-notifications`, `cron-fuel`), separados pela
  variável `CRON_JOB` e por nada no build. A variável não existe mais: rotina cuja cadência mora no
  painel do provedor de hospedagem é rotina que o operador do cliente não consegue nem ver, e trocar
  o tique de uma publicava as quatro. Ela ficou de resto no painel dos dois ambientes até ser
  removida pela CLI em 24/08/2026 — nenhum código a lia, mas variável morta no painel diz que a
  rotina ainda é escolhida ali.

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
`VITE_*`, `FISCAL_ENVIRONMENT`, `CADENCE_MINUTES`, `PAGE_SIZE`,
`OBJECT_STORAGE_BUCKET`/`ENDPOINT`/`REGION`/`FORCE_PATH_STYLE`.

> 🚗 **`FLEET_VEHICLE_CATALOG_URL`, na `api`** (`https://brasilapi.com.br`), liga o
> catálogo de marca/modelo por FIPE do cadastro de veículo. Sem ela a capability
> `vehicleCatalog` fica `false` e os campos degradam para texto livre, em silêncio —
> não há erro de boot nem de request, só o combobox nunca aparecendo. Faltou nas
> variáveis de staging/production por ser opcional no schema; provisionar nos dois
> ambientes com o mesmo valor do `.env` local, é um espelho público da FIPE, sem
> segredo nenhum.

> ⏱ `SCHEDULED_DISTRIBUTION_CRON` **não existe mais** (spec 052). A API servia o "próximo ciclo
> automático" a partir de um espelho em texto do `cronSchedule`, e espelho não observado é espelho
> que mente: mudar o tique no painel sem mudar a variável mostrava ao operador uma data que nunca
> chegava. Hoje a data vem de `job_schedules.next_run_at`, escrita pela própria batida ao publicar.
> Se ela aparecer no painel de algum ambiente, é resto — pode ser removida.

> 📨 **`RABBITMQ_URL` e `QUEUE_PREFIX`, agora também na `cron`** (spec 052). A batida sempre
> publica em `job-run.v1` — não executa rotina nenhuma —, então o schema passou a exigir as duas no
> boot: cron que não alcança a fila não teria o que fazer, e falhar ao subir é melhor que abrir
> execução que ninguém consome. `RABBITMQ_URL` é referência entre serviços, como no `worker`, e o
> `QUEUE_PREFIX` é o mesmo do ambiente. Provisionar nos **dois** ambientes antes do primeiro deploy
> da batida.

> ⛽ **`ANP_BASE_URL`, `ANP_TIMEOUT_MS`, `ANEEL_BASE_URL` e `ANEEL_TIMEOUT_MS` mudaram da `cron`
> para o `worker`** (spec 052, T5). `fuel.price.pull` virou rotina do `worker`, e o endereço da
> agência vive onde a coleta acontece. Os dois destinos externos do preço
> (`https://www.gov.br/anp/...` e `https://dadosabertos.aneel.gov.br`) são bases públicas, sem
> token e sem segredo: litro e kWh saem do mesmo ciclo, e a presença é o que liga a coleta —
> nenhuma das duas declaradas é rotina não configurada (a janela pousa em
> `job_run_routine_missing`), e **uma só** derruba o boot, porque meia série gravada é tela com
> preço sem dizer que está incompleto. As quatro vivem no `worker` nos **dois** ambientes com o
> mesmo valor do `.env.example`, e saíram do painel da `cron` — conferido pela CLI em 24/08/2026.
> Nenhum script do repositório escreve variável no painel — `railway-deploy.sh` só publica —, então
> este passo é manual por ambiente, e conferir a presença é parte do deploy da rotina.

> 🧾 **A `cron` deixou de ler chaveiro, bucket e endereço da Nota RP** (spec 052, T7). A
> reconciliação de NFS-e virou rotina do `worker`, que já abria envelope selado e arquivava
> documento fiscal para **emitir** nota — nenhuma variável nova precisou ser provisionada.
> `ENCRYPTION_ACTIVE_KEY_ID`, `ENCRYPTION_KEYRING_JSON`, `NFSE_PROVIDER_BASE_URL`,
> `NFSE_PROVIDER_TIMEOUT_MS` e o bloco `STORAGE_*` **saíram do schema da `cron`**: se estiverem no
> painel dela, são resto e podem ser removidos. Não remova nada disso do `worker` — lá elas são o
> que faz a nota sair e o XML ser guardado.

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

1. Cada ambiente é publicado pelo **push da branch dele**: `push` em `staging` →
   staging, `push` em `main` → production; `workflow_dispatch` escolhe o
   ambiente. Branch sem ambiente não dispara o workflow, e se disparar por
   engano o job `target` falha em vez de assumir staging — `develop` é branch de
   trabalho, não de publicação. Staging publica o que está **na branch
   staging**, depois do merge do PR.
2. **PR nenhum publica** — nem mirando `staging`, nem mirando `main`. Em PR os
   jobs `target` e `deploy` ficam de fora por `github.event_name`, e sobra o
   `gate`. Não é cerimônia: a proteção da `main` exige os contextos
   `gate / quality` e `gate / integration`, e eles só existem se este workflow
   rodar no commit do PR.

   Publicar staging a partir do PR foi a intenção original e **nunca executou um
   passo sequer**. A política de branch do GitHub Environment casa com
   `refs/heads/*`, e o PR roda em `refs/pull/N/merge`; desde 08/12/2025 o GitHub
   avalia a regra contra o ref de execução, não contra a branch de origem. Todo
   deploy de PR morria em `Branch is not allowed to deploy to staging` com zero
   passos, e o PR ainda aparecia verde porque o `gate` tinha passado. Abrir a
   política para `refs/pull/*/merge` entregaria o `RAILWAY_TOKEN` de staging ao
   merge ref — exatamente o que aquela mudança do GitHub fechou — e publicaria
   um commit que não existe em branch nenhuma. O preço da troca é o back-merge
   de `main` em `staging` redeployar conteúdo idêntico; deploy é idempotente, e
   em troca staging passa a ser sempre o que está na branch.

3. O job `gate` chama `.github/workflows/ci.yml` inteiro (format, lint,
   typecheck, test, build, migration-test, integração e smoke). Nenhum deploy
   começa antes dele passar. Por isso `ci.yml` **não tem gatilho próprio**:
   um `pull_request` nele rodaria a mesma suíte duas vezes no mesmo commit.
4. Os três jobs de deploy usam o GitHub Environment homônimo. Hoje os dois ambientes têm
   **só política de branch** (`staging` aceita `staging`, `production` aceita
   `main`) e **nenhum _required reviewer_**: o push em `main` publica production
   sem parar para aprovação. A aprovação humana do release é o merge do PR
   `staging → main`, não uma parada no Environment. ⚠️ Ligar _required
   reviewers_ em `production` é decisão em aberto.
5. Ordem: **três frentes**, não uma fila.
   - `deploy-api` — keycloak (só quando muda) → reconciliação do realm → api
     (migration no `preDeployCommand`) → asserção de migrations aplicadas.
   - `deploy-frontend` — começa junto com a API. O bundle é estático e não fala
     com o banco: não tem migration para esperar.
   - `deploy-services` — matriz de dois (`worker`, `cron`), um runner cada,
     depois de `deploy-api`. Eles leem tabelas que só a migration da API cria;
     essa é a única ordem que existe.

   O job único levava **646s** no release de produção `32172971566`, com sete
   dos oito serviços apenas esperando a vez. O caminho crítico real é
   api (75s) → cron mais lento (121s).

   Três detalhes que a divisão trouxe:
   - `fail-fast: false` na matriz. O padrão cancela os irmãos quando um falha, e
     isso produz o pior estado possível — metade dos serviços na versão nova,
     metade na antiga, sem sinal de qual é qual.
   - A paralelização é por **job**, não por `&`/`wait` num job só:
     `railway-deploy.sh` reescreve `~/.railway/config.json` a cada chamada, e
     duas chamadas simultâneas no mesmo runner disputariam o mesmo arquivo.
   - Cada job é um _deployment_ próprio do Environment. Se `production` ganhar
     _required reviewers_ (item 4), passam a ser **três aprovações** por
     release, não uma.

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
`app`/`api`/`auth`/`site` para production e `*.staging` para staging. O ponto separa o
ambiente e o hifen nunca: `site.staging.<zona>`, jamais `site-staging.<zona>`. A zona responde pela KingHost, o
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

Serviço interno não recebe domínio: `worker`, `cron`, `rabbitmq` e os bancos falam
só por `*.railway.internal`. O `worker` de staging tinha um domínio gerado que
ninguém pedia e ninguém monitorava — anônimo, da internet aberta, o `/health/ready`
devolvia `{"dependencies":{"database":"up","rabbitmq":"up","storage":"up"}}` e
entregava a topologia da infra a quem perguntasse. Removido com `serviceDomainDelete`.

## Domínios gerados de staging

- api: `https://api-staging-5633.up.railway.app`
- transportada-frontend: `https://transportada-staging.up.railway.app`
- landing: `https://landing-staging-6070.up.railway.app` (proprio: `https://site.staging.fernandes-transportadora.com.br`, aguardando DNS)
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
