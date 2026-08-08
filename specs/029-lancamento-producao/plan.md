# Plano técnico — 029 Lançamento em produção

## Contexto e premissas

- O projeto Railway `transportada` (`62de4c69-…`) já existe com os dois ambientes; production tem
  os dois Postgres 18 provisionados, com volume e **sem** TCP proxy. Presume-se o banco da
  aplicação vazio — T012 confirma antes de qualquer migration.
- `.github/workflows/deploy.yml` já está completo: resolve o ambiente, chama `ci.yml` como gate,
  usa o GitHub Environment homônimo e deploya na ordem keycloak → api → worker → cron → frontend.
  Nada nele muda. O que falta é a configuração ao redor.
- `apps/*/src/logging/` tem `safe-logger.service.ts`, `error-descriptor.service.ts` e
  `log-format.policy.ts`. `describeErrorForLog` já devolve só `errorName`, `sqlState` e
  `constraint` — nunca mensagem, stack ou parâmetro de query. É a base certa; o que falta é a
  mesma garantia para o `meta` que os call sites passam à mão.
- `shouldPrettyPrintLogs` só é verdadeiro em `APP_ENV=local` (aprendizado da T013 da 028: `pretty`
  descarta o `meta`). Production emite JSON, que é o que o Vector consome.
- Uma instalação por transportadora (ADR-0021): não há tenant novo em runtime, e o custo fixo
  mensal do lançamento é multiplicado por cliente. Daí a restrição a software open source
  auto-hospedado no Railway — sem assinatura por cliente e sem cota de free tier para estourar.
- O projeto `transportada-ops` **não existe ainda**: a fase A o cria. Ele hospeda GlitchTip,
  OpenObserve, Uptime Kuma e os buckets de backup e de log, e serve os dois ambientes.

## Arquitetura e arquivos afetados

### Fora deste repositório

`~/Documents/personal/adatechnology-packages` → `@adatechnology/logger` **0.1.0**:

```text
src/redact.ts        redator de duas camadas (chave + forma do valor)
src/redact.test.ts   corpus de PII, aninhamento, ciclo, profundidade, custo
src/http-transport.ts envio NDJSON assíncrono com batching e descarte silencioso
src/logger.ts        passa meta e message pelo redator antes de qualquer destino
src/types.ts         config ganha `sinkUrl?`, `redact?: { extraKeys?: string[] }`
```

Publicação por changesets no GitHub Actions do repositório de packages — nunca `npm publish`
local, nunca editar `version` à mão.

### Neste repositório

```text
deploy/vector/Dockerfile              timberio/vector:latest-alpine + config
deploy/vector/vector.yaml             intake HTTP :9000 → sink S3 (arquivo) + sink OpenObserve
deploy/vector/railway.json            serviço comum, sem healthcheck público
deploy/backup/Dockerfile              postgres:18-alpine + openssl + awscli
deploy/backup/backup.sh               dump dos 2 bancos → cifra → bucket ops → manifesto → push
deploy/backup/railway.json            cronSchedule 0 6 * * *, restartPolicyType NEVER
.github/workflows/restore-test.yml    mensal: restaura no efêmero e confere o manifesto
.github/workflows/bucket-mirror.yml   diário: sync do bucket fiscal para o espelho de ops
docs/ops/backup-emergencia.md         runbook manual (já escrito nesta feature)
docs/ops/observabilidade.md           o que vai para onde, e como ligar um monitor novo
docs/spec/railway.md                  serviços novos, variáveis novas, pendências fechadas
.env.example                          SENTRY_DSN, SENTRY_ENVIRONMENT, LOG_SINK_URL
CLAUDE.md                             menção aos dois serviços de infraestrutura novos
```

Por app (`api-transportada`, `worker-transportada`, `cron-transportada`):

```text
src/config/environment.schema.ts   SENTRY_DSN?, SENTRY_ENVIRONMENT?, LOG_SINK_URL?
src/observability/sentry.service.ts  init idempotente; DSN vazio → no-op
src/main.ts                        init do Sentry antes do logger; sinkUrl no createLogger
test/observability/*.contract.ts   redação ponta a ponta e no-op sem DSN
```

`vector` e `backup` são serviços de _deploy_, não aplicações: vivem em `deploy/`, como
`deploy/keycloak/` já vive, e não entram em `apps/`. Não têm código TypeScript, não importam nada
do monorepo e não participam do `bun install`.

## Contratos/API/eventos

Nenhuma rota HTTP nova, nenhum envelope de fila novo, nenhum contrato de frontend alterado. Os
contratos desta feature são de infraestrutura:

| Contrato                | Forma                                                                             |
| ----------------------- | --------------------------------------------------------------------------------- |
| App → Vector            | `POST http://vector.railway.internal:9000`, NDJSON, sem TLS (WireGuard já cifra)  |
| Vector → arquivo        | sink S3 em `transportada-logs`, NDJSON gzip, `logs/%Y/%m/%d/` — retenção longa    |
| Vector → OpenObserve    | `POST $OPENOBSERVE_URL/api/<org>/<stream>/_multi` sobre HTTPS pública, Basic auth |
| App → GlitchTip         | SDK `@sentry/bun` 10.x sobre HTTPS pública, `beforeSend` com o redator do logger  |
| backup → bucket ops     | `db-backups/{daily,weekly}/backup-<stamp>-{app,keycloak}.dump.enc` + `.sha256`    |
| backup → manifesto      | `db-backups/manifest.jsonl`, uma linha JSON por execução                          |
| backup → push monitor   | `GET $BACKUP_HEARTBEAT_URL` (push do Uptime Kuma) só no caminho de sucesso        |
| bucket fiscal → espelho | `aws s3 sync`, prefixo preservado, **sem** `--delete`                             |

Os três primeiros saem do ambiente e entram no projeto de ops pelo domínio público dele (D2):
private networking não atravessa projeto. Todos autenticados por token; nenhuma porta nova é
aberta no lado de production.

Linha do manifesto:

```json
{
  "at": "2026-08-08T06:03:11Z",
  "tier": "daily",
  "db": "app",
  "bytes": 18422144,
  "sha256": "…",
  "tables": 48,
  "lastMigration": "20260807223440_rntrc_registry_leading_zero"
}
```

`lastMigration` sai de `drizzle.__drizzle_migrations` — o journal fica no schema `drizzle`, não no
público, e é por isso que ele não aparece em `database.schema.ts`. `tables` sai de
`information_schema.tables` no schema público (70 hoje). São os dois campos que o teste de restore
compara — o resto é diagnóstico.

## Dados, migration e rollback

Nenhuma migration de schema. O dado que esta feature toca é o dado inteiro, e por isso o desenho
de reversão é o que importa:

- **Reverter o redator**: `SENTRY_DSN` e `LOG_SINK_URL` vazios voltam as apps ao comportamento de
  hoje sem redeploy de código, só troca de variável. A redação em si não tem reversão por
  variável de propósito — desligar redação em production é o tipo de interruptor que alguém puxa
  às três da manhã e esquece de empurrar de volta.
- **Reverter o backup**: apagar o `cronSchedule` do serviço. Os dumps já enviados ficam.
- **Reverter o deploy de production**: Railway mantém o deployment anterior; o rollback de
  aplicação é o redeploy dele. O rollback de **schema** é o `rollback.sql` ao lado de cada
  migration, aplicado à mão, na ordem inversa — nunca automático (AGENTS.md).
- As 9 migrations pendentes rodam contra banco vazio, que é o caso mais fácil. `make
migration-test` já prova migration + rollback em Postgres descartável a cada CI.

## Segurança e tenant

- Nenhuma mudança de `companyId`, membership ou autorização. Os contratos negativos de
  `test/*-schema/tenant-safety.contract.ts` continuam valendo sem alteração.
- **Segredos novos**, todos por Environment e nunca iguais entre ambientes:

| Onde                    | Variável                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Railway (3 apps)        | `SENTRY_DSN` (aponta para o GlitchTip), `SENTRY_ENVIRONMENT`, `LOG_SINK_URL`                                |
| Railway (vector)        | `LOG_ARCHIVE_S3_*`, `OPENOBSERVE_URL`, `OPENOBSERVE_TOKEN`                                                  |
| Railway (backup)        | `APP_DATABASE_URL`, `KEYCLOAK_DATABASE_URL`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_S3_*`, `BACKUP_HEARTBEAT_URL` |
| Railway (ops)           | credenciais de admin do GlitchTip, do OpenObserve e do Uptime Kuma — nunca as default do template           |
| GitHub Env `production` | `RAILWAY_TOKEN`                                                                                             |
| GitHub repo             | `BACKUP_S3_*` (leitura), `BACKUP_ENCRYPTION_KEY` — só para o teste de restore                               |

- `BACKUP_ENCRYPTION_KEY` é o segredo mais perigoso do conjunto: com ele e o bucket alguém lê o
  banco inteiro. Fica fora do Railway num gerenciador de senhas, e o secret do GitHub que o teste
  de restore usa é o mesmo valor — não há como ser diferente, e é por isso que o workflow de
  restore não recebe nenhuma credencial de escrita em production.
- **Auto-hospedar traz painéis, e painel é superfície.** GlitchTip, OpenObserve e Uptime Kuma
  sobem com senha forte própria e nunca com a credencial do template. É a regra de segurança §2 —
  painel operacional não sobe com credencial default nem com fallback vazio.
- A credencial do bucket de backup dá escrita só no bucket de ops. Nenhum serviço de ops recebe
  credencial de escrita nos recursos de production; o `bucket-mirror` recebe **leitura** no bucket
  fiscal e escrita só no espelho.
- O `beforeSend` é a última linha entre uma exceção e a internet. Ele redige o evento inteiro,
  não só `extra`: `request.headers`, `breadcrumbs` e `contexts` também carregam PII.
- O banco continua sem exposição pública. É o motivo de o backup rodar dentro do Railway (D5) e
  não no GitHub Actions.

## Idempotência e concorrência

- **Backup**: `concurrency` do Railway já é serial por ser one-shot com `NEVER`; ainda assim o
  nome do objeto carrega timestamp UTC, então duas execuções na mesma janela produzem dois
  objetos em vez de corromper um. O heartbeat só é pingado no caminho de sucesso.
- **Espelho do bucket**: `aws s3 sync` é idempotente por definição, e sem `--delete` é
  monotonicamente crescente.
- **Teste de restore**: só lê. O alvo é efêmero e morre com o job.
- **Init do rastreador de erro**: idempotente e chamado uma vez no composition root de cada app; chamada dupla
  não duplica evento.
- **Transporte do logger**: fila em memória com teto. Cheia, descarta o mais antigo — perder linha
  de log é aceitável, segurar o processo não é.

## Observabilidade

Esta feature **é** a observabilidade, então o que se descreve aqui é como ela se prova:

| Sinal                      | Onde aparece                          | Como se sabe que funciona                     |
| -------------------------- | ------------------------------------- | --------------------------------------------- |
| Log estruturado das 3 apps | stdout + OpenObserve + arquivo NDJSON | Busca por `correlationId` acha a linha        |
| Exceção não tratada        | GlitchTip                             | Erro provocado em staging vira issue          |
| API fora do ar             | Uptime Kuma                           | `/health/ready` derrubado a propósito uma vez |
| Frontend fora do ar        | Uptime Kuma                           | idem                                          |
| Backup não rodou           | Push monitor                          | Janela pulada a propósito uma vez             |
| Teste de restore falhou    | Push monitor + job                    | Manifesto adulterado a propósito uma vez      |

Cada monitor é provocado uma vez, de propósito, e a notificação é anexada ao `evidence.md`. Alerta
que nunca disparou não é alerta configurado — é alerta que se supõe configurado.

O arquivo NDJSON no bucket e o OpenObserve recebem o **mesmo** fluxo, com retenções diferentes:
o arquivo é a memória longa e barata, o OpenObserve é a busca do incidente em curso. Se o
OpenObserve for desligado por custo (D2), o arquivo continua e o gate de log continua cumprido.

Log novo desta feature: `backup_cycle_started`, `backup_cycle_completed` (com `db`, `bytes`,
`tables`, `durationMs`) e `backup_cycle_failed` (com `step`). Nenhum carrega URL de banco,
credencial ou nome de objeto com dado dentro.

## Estratégia de testes

Contrato antes da implementação, como manda o `AGENTS.md`:

1. **Redator** (`adatechnology-packages`): corpus com CPF formatado e cru, CNPJ, e-mail, telefone
   com e sem DDI, chave de 44 dígitos, chave aninhada em array de objeto, referência cíclica,
   profundidade acima do limite. E o teste negativo, que é o que evita o redator inútil:
   `companyId`, `correlationId`, `sqlState`, `constraint`, contagem e duração passam intactos.
2. **Integração por app** (`test/observability/redaction.contract.ts`): monta o logger real com um
   transporte falso, loga um `meta` com PII e afirma que o que saiu não a contém. Um por app,
   porque cada uma tem o seu composition root.
3. **No-op sem DSN** (`test/observability/sentry-disabled.contract.ts`): sem `SENTRY_DSN` o init
   não abre socket e o app sobe. É o que mantém CI e local offline.
4. **`backup.sh`**: teste local contra o `docker compose` do repositório — dump, cifra, decifra,
   `pg_restore --list`, e conferência do manifesto. Sem bucket remoto no caminho.
5. **Restore mensal**: o próprio workflow é o teste, e ele falha por divergência de manifesto.
6. **Gates existentes** continuam obrigatórios: `make check`, `make migration-test`,
   `make worker-integration`, `make smoke`. Nada desta feature os altera.

Arquivo de teste novo **não roda** se não for adicionado à lista explícita do `package.json` da
app (CLAUDE.md). Vale para os três.

## Riscos

| Risco                                                             | Mitigação                                                                                                                        |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Config-as-code esquecido em algum dos serviços de production      | `assert-migrations` derruba o deploy da API; a conferência é task própria                                                        |
| `@adatechnology/logger@0.1.0` atrasa e vira caminho crítico       | Fase A é a primeira justamente por isso; nada depende dela além do log                                                           |
| Redator apaga demais e o log perde utilidade                      | Teste negativo do critério 2; o corpus define o que precisa sobreviver                                                           |
| Redator apaga de menos e PII vaza                                 | Duas camadas (chave + forma), e a de forma pega o que a denylist esqueceu                                                        |
| Incidente ruidoso enche o GlitchTip e come disco do banco de ops  | `tracesSampleRate: 0`, agrupamento por issue e retenção curta configurada no projeto; o volume é nosso, não uma cota de terceiro |
| Manter três ferramentas auto-hospedadas vira trabalho de operação | Todas com template Railway e imagem oficial; atualização é bump de tag, e nenhuma delas está no caminho de request da app        |
| Stack de ops cai e ninguém percebe                                | Checagem mensal do próprio vigia, junto do teste de restore; risco residual explícito na D2                                      |
| Backup roda mas ninguém nota que parou                            | Push monitor com alerta — a falha silenciosa é o modo de falha real                                                              |
| `BACKUP_ENCRYPTION_KEY` perdida                                   | Cópia em gerenciador de senhas + gate no critério 11; sem ela o bucket é lixo cifrado                                            |
| Keyring de production perdida                                     | Mesmo gate; e o runbook diz explicitamente que a saída é recadastrar certificado                                                 |
| 82 commits promovidos de uma vez                                  | O gate é a `ci.yml` inteira, já verde em staging, e o banco de production nasce vazio                                            |
| Vector cai e alguém acha que a app caiu junto                     | Envio assíncrono e descarte silencioso; stdout permanece autoritativo                                                            |
| Espelho do bucket e arquivo de log crescem sem teto               | Medidos na T018; ciclo de vida por prefixo e a decisão de custo volta ao responsável                                             |
| Perda da conta Railway leva ambiente e backup juntos              | Cópia manual fora da plataforma no runbook de emergência, cobrada no critério 11                                                 |
