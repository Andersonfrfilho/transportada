# 039 — Evidência

## T1 — Contrato de ambiente: uma variável, nos dois schemas ✅

Testes escritos antes da troca. `NFSE_PROVIDER_BASE_URL` substitui o par em
`apps/cron-transportada/src/config/environment.schema.ts` e no schema equivalente do worker; sumiram o
ramo de meia-configuração e o `Record<…FiscalEnvironment, string | undefined>` de `cron.types.ts` e
`worker.types.ts`.

O teste de independência de `FISCAL_ENVIRONMENT` ficou só no cron: o worker **não conhece** a
variável, e ali o caso seria vazio.

```
bun run --cwd apps/worker-transportada test   → 449 pass, 0 fail
bun test --cwd apps/cron-transportada         → 156 pass, 1 fail (ver abaixo)
bun run --cwd apps/worker-transportada typecheck → limpo
bun run --cwd apps/cron-transportada typecheck   → só os erros de fuel-price-pull
```

⚠️ A falha e os erros de tipo do cron são de `test/fuel-price-pull/catalog.contract.ts`, que importa
`src/fuel-price-pull/domain/fuel.constant.js` — módulo que não existe no working tree. É trabalho
paralelo em andamento, anterior e alheio a esta spec. As quatro suítes tocadas aqui rodam limpas:

```
bun test ./test/environment.contract.test.ts ./test/nfse-status-pull.contract.test.ts \
         ./test/notification-schedules.contract.test.ts ./test/deploy.contract.test.ts
→ 101 pass, 0 fail
```

## T2 — Os nomes velhos não voltam ✅

Um teste por app varre `src/**/*.ts` com `Bun.Glob` e falha se `NFSE_PROVIDER_BASE_URL_` reaparecer.
Verde nas duas.

## T3 — Repasse para o gateway e o job ✅

`nfse-status-pull.job.ts` passa `baseUrl` único; os dois `nfse-fiscal-gateway.ts` deixaram de indexar
por `credential.fiscalEnvironment` — o campo continua existindo e continua escolhendo a **credencial**
no join, só não escolhe mais o endereço. `nota-rp-v2.client.ts` não mudou.

`test/nfse-fiscal-gateway.contract.test.ts` do worker foi reescrito: onde afirmava que a URL segue o
ambiente da credencial, agora afirma que a única configurada vale para qualquer credencial.
`nota-rp-parity.contract.ts` passou sem alteração.

## T4 — `.env.example` ✅

Duas linhas viraram uma, com o comentário refeito. `make config` não foi rodado: ele exige a stack
Docker de pé, e a mudança é de nome de chave — o schema já cobre o que ele verificaria.

## T5 — Pipeline ✅

`Deploy cron-nfse` passou de `environment == 'staging'` para `== 'production'`. O comentário anterior
dizia que o endereço era "da prefeitura, por instalação" — a razão errada, corrigida para a ADR-0035.

```
bunx --yes js-yaml .github/workflows/deploy.yml → YAML ok
bunx prettier --check <arquivos alterados>      → All matched files use Prettier code style!
```

## T6 — Variável em produção — pendente

Depende de T1–T5 mergeadas. Valor a gravar em `worker` e `cron-nfse` de produção:
`NFSE_PROVIDER_BASE_URL=https://www.notarp.com.br/api/v2`.

## Fora do escopo, registrado

`FISCAL_ENVIRONMENT` não existe no schema do worker, e está certo assim: o ambiente fiscal da NFS-e
vem da linha da tentativa (`nfse_issuance_attempts.fiscal_environment`) e é por ele que o repositório
casa a credencial ativa. É dado, não configuração de processo — a lacuna que eu suspeitava ao escrever
T1 não existe.
