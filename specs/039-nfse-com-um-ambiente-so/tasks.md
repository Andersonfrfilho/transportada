# 039 — Tasks

> 🤖 Modelo: `sonnet` (T1 é 🧠 — o schema de boot decide o que fala com a Nota RP real)

Uma task por vez. Teste de contrato antes da implementação. Cada task fecha com evidência em
`evidence.md`.

## T1 🧠 — Contrato de ambiente: uma variável, nos dois schemas

**Antes:** escrever os casos em `apps/cron-transportada/test/nfse-status-pull/environment.contract.ts`
e no contrato equivalente do worker — `NFSE_PROVIDER_BASE_URL` presente resolve; ausente lança;
`FISCAL_ENVIRONMENT` não altera o endereço resolvido.

**Depois:** trocar o par por `NFSE_PROVIDER_BASE_URL` em
`apps/cron-transportada/src/config/environment.schema.ts` e
`apps/worker-transportada/src/config/environment.schema.ts`, removendo o ramo de meia-configuração e o
`Record<CronFiscalEnvironment, …>` de `providerBaseUrls` em `cron.types.ts`. As duas apps mudam na
mesma task: são cópias por valor, e metade da mudança sobe um deploy que emite e outro que não.

O fixture `NFSE_SETTINGS` de `test/notification-schedules/environment.contract.ts` declara o par — ele
usa o bloco de NFS-e só como cenário do trilho de aviso, e cai na mesma troca.

**Verificação:** `bun run --cwd apps/cron-transportada test` · `bun run --cwd apps/worker-transportada test` · `bun run typecheck`
**Aceite:** critérios 1, 2 e 4 da spec.

## T2 — Os nomes velhos não voltam

Teste que varre `apps/*/src/**` e falha se `NFSE_PROVIDER_BASE_URL_HOMOLOGATION` ou `_PRODUCTION`
reaparecerem. Mesmo molde dos contratos de design system que proíbem `<select>` cru.

**Verificação:** o teste falha ao reintroduzir o nome, e passa depois de removê-lo.
**Aceite:** critério 3.

## T3 — Repasse para o gateway e o job

Ajustar `nfse-status-pull.job.ts` (`baseUrls: settings.providerBaseUrls` → o endereço único) e
`nfse-fiscal-gateway.ts` nos dois lados. `nota-rp-v2.client.ts` **não muda** — ele sempre recebeu um
`baseUrl` só.

**Verificação:** `apps/cron-transportada/test/nfse-status-pull/nota-rp-parity.contract.ts` verde.
**Aceite:** critério 5.

## T4 — `.env.example` e configuração

Uma linha `NFSE_PROVIDER_BASE_URL=` no lugar das duas. Conferir se algum `*.env` de teste declara o
par.

**Verificação:** `make config`
**Aceite:** critério 7.

## T5 — Pipeline

No `.github/workflows/deploy.yml`, o passo `Deploy cron-nfse` passa de
`environment == 'staging'` para `environment == 'production'`, com comentário apontando a ADR-0035 —
o gate atual explica um motivo que deixou de ser o verdadeiro.

**Verificação:** `bunx --yes js-yaml .github/workflows/deploy.yml`
**Aceite:** critério 6.

## T6 — Variável em produção e boot verificado

Gravar `NFSE_PROVIDER_BASE_URL=https://www.notarp.com.br/api/v2` — valor da coleção oficial da v2, o
mesmo host que o swagger v3 declara como "Servidor de Produção" — no `worker` e no `cron-nfse` de
produção, remover o par onde existir, e
confirmar que o `cron-nfse` completa um ciclo sem `CronConfigurationError`.

⚠️ Esta task toca ambiente de produção e depende de T1–T5 mergeadas. Publicação é pelo pipeline, nunca
por comando direto.

**Verificação:** log do serviço no ciclo seguinte.
**Aceite:** objetivo 1 da spec.

## Nota

O `worker` não declara `FISCAL_ENVIRONMENT`, e não precisa: o ambiente fiscal da NFS-e vem da linha da
tentativa e é por ele que a credencial ativa é casada no join.
