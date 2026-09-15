# 151 — GTIN da caixa a partir do cEAN — evidência

Data: 15/09/2026. Branch `work/gtin-caixas`, publicada em `staging`.

## O que mudou

- `@adatechnology/fiscal-provider` 0.3.1 → **0.3.2** no worker e na API (`NfeXmlProduct.gtin` =
  `cEAN`, `taxableUnitGtin` = `cEANTrib`). Pins dos contratos atualizados.
- **Importação** (`worker/.../drizzle-nfe-import-consumer.repository.ts`, `writePackageBoxes`):
  a caixa nasce com `carton_gtin`; linha existente só ganha GTIN onde ele é nulo
  (`ON CONFLICT DO UPDATE ... WHERE carton_gtin IS NULL`), nunca troca o gravado nem a medição.
- **Regra** (`worker/.../domain/carton-gtin.policy.ts`): `cEAN` vence; `cEANTrib` só com `cEAN`
  ausente; `cEAN` presente e inválido fica nulo (não cai para a unidade tributável, que é outra
  embalagem). Dígito GS1 conferido, zeros rejeitados, DUN-14 reduzido a GTIN-13 pela
  `reduceToGtin13` copiada por valor da API — contrato de paridade compara o texto das duas funções.
- **Rotina** `backfill:nfe-package-box-gtin` (worker; no contêiner
  `bun dist/nfe-imports/nfe-package-box-gtin-backfill.main.js`): empresa por empresa, lotes de 100
  notas com produto cuja caixa está nula; relê o XML pelo gateway de storage da aplicação; UPDATE
  com `carton_gtin is null`. Dry-run padrão, `--confirm` grava, `--company-id=` restringe. Log só
  com contagens e `documentId`.

## Testes vermelhos antes

- `carton-gtin.contract.ts`: 2 `(fail)` em `buildPackageBoxRows` antes da mudança na política da caixa.

## Gates

| Gate                                                       | Resultado                                                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run format:check`                                     | limpo                                                                                                                                                           |
| `bun run typecheck` / `bun run lint`                       | 0 erros / 0 problemas                                                                                                                                           |
| worker `bun run test`                                      | 1354 pass / 0 `(fail)`                                                                                                                                          |
| worker integração nova (Postgres)                          | 4 pass / 0 fail                                                                                                                                                 |
| worker `test:integration` (Postgres nativo descartável)    | 113 pass, 4 skip, 4 `(fail)` — RabbitMQ/MinIO/SIGTERM por infra Docker parada; `contractor-mail outbound` por estado compartilhado (2/0 sozinho em banco limpo) |
| API `bun --env-file=../../.env.test test --timeout 120000` | 5844 pass, 3 `(fail)` — 2 do extrato OSM `-latest` (corrigido em staging no mesmo dia), 1 SQLSTATE 23001≠23503 da migration fiscal no Postgres 18 nativo        |
| `make migration-test`                                      | não se aplica (sem migration)                                                                                                                                   |

O Postgres de teste do Docker (`.env.test`) travou em toda consulta; as integrações rodaram num
cluster Postgres 18 nativo no scratchpad, com o schema migrado pela API.

## Staging

Deploy: os runs do `deploy.yml` do `9d608eb5` foram cancelados por pushes seguintes de outras
sessões; o worker de staging ficou `SUCCESS` na implantação `3bccd8f7` (17:11), já com
`dist/nfe-imports/nfe-package-box-gtin-backfill.main.js` no contêiner.

Rotina via `railway ssh` no worker de staging:

| Modo        | empresas | notas lidas | caixas preenchidas | sem GTIN | GTIN inválido | XML ausente | XML ilegível |
| ----------- | -------- | ----------- | ------------------ | -------- | ------------- | ----------- | ------------ |
| dry-run     | 1        | 0           | 0                  | 0        | 0             | 1909        | 0            |
| `--confirm` | 1        | 0           | 0                  | 0        | 0             | 1909        | 0            |

⚠️ **XML ausente em staging é estrutural, não defeito da rotina.** O refresh restaura o dump de
produção e **não** copia os objetos: as 1979 notas de staging apontam em `stored_objects` para o
bucket de produção, que a credencial de staging não lê — e não deve ler (buckets não se misturam).
Staging segue com 465 caixas, todas com `carton_gtin` nulo. A leitura do XML e a gravação só se
comprovam contra Postgres na integração (seção Gates) e, de verdade, em produção.

Produção (não rodado — exige aprovação humana), primeiro sem gravar e depois gravando:

```bash
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -e production -s worker -- \
  bun dist/nfe-imports/nfe-package-box-gtin-backfill.main.js
railway ssh -p 62de4c69-216a-4335-93a0-4942c6a95c54 -e production -s worker -- \
  bun dist/nfe-imports/nfe-package-box-gtin-backfill.main.js --confirm
```
