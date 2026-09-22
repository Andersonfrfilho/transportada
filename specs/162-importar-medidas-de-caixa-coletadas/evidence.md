# Evidência — spec 162

## T003 — FK de `measured_by_user_id` e decisão do ator

Confirmado por leitura de `apps/api-transportada/src/database/nfe.schema.ts` (comentário da tabela
`nfePackageBoxMeasurements`): **sem FK** para nenhuma tabela de usuário (ADR-0039). Decisão
registrada em `plan.md` § "T003 — decisão sobre o ator": `CATALOG_IMPORT_ACTOR_ID` é constante UUID
fixa, sem linha de banco criada pela migration.

## T004 — Migration aditiva das CHECKs + rollback

Comando: `bun run db:generate --name package_box_catalog_source` (dentro de
`apps/api-transportada`), após alargar as duas CHECKs em `src/database/nfe.schema.ts` para incluir
`'catalog'`. Resultado: `drizzle/20260922020751_package_box_catalog_source/migration.sql` com
exatamente as duas ALTER TABLE esperadas (`nfe_package_box_measurements_source_check`,
`nfe_package_boxes_measurement_source_check`). `rollback.sql` escrito à mão seguindo o padrão de
`20260917153054_package_box_replicated_source`.

Verificação manual contra o Postgres 18 nativo descartável (127.0.0.1:56998, banco
`transportada_mig162_<epoch>`, Docker local indisponível):

```
DATABASE_URL=postgres://test@127.0.0.1:56998/transportada_mig162_<epoch> \
  bun --env-file=../../.env.test run db:migrate
```

→ aplicou sem erro; `pg_get_constraintdef` confirmou as duas CHECKs com `'catalog'` no `ANY(ARRAY[...])`.

```
psql ... -f drizzle/20260922020751_package_box_catalog_source/rollback.sql
```

→ `BEGIN / DO / ALTER TABLE / ALTER TABLE / DO / COMMIT`; `pg_get_constraintdef` confirmou a CHECK
voltando à lista de 4 valores (sem `'catalog'`). Banco descartável removido em seguida
(`drop database`).

`bun run typecheck` (raiz): verde nos 6 apps.

## T001/T002 — fixture, schema e mapper do JSONL

Fixture com 3 linhas do formato real (`test/fixtures/package-box-catalog-capture.fixture.ts`):
`found` cm/kg (GTIN 7891150059849, real do arquivo), `found_manual` sintético com `lado1..3`
(nenhuma linha `found_manual` existe ainda no arquivo real, formato confirmado em
`assisted-capture-server.ts`/`cosmos-capture.user.js`), e a torta do Tixan (spec 160) no formato
de linha. `bun test ./test/package-box-catalog.contract.test.ts` → 28 pass, 0 fail (CA01, CA02).

## T005/T006/T007 — repositório, caso de uso e integração

`DrizzlePackageBoxCatalogImportRepository` (proposta/promoção condicionais, idempotência RF07,
transação única RNF01) + `createImportPackageBoxCatalog` (parser → sanidade vazia de conteúdo →
consenso → repositório). Integração contra Postgres 18 nativo (127.0.0.1:56998):

```
DRIZZLE_TEST_DATABASE_URL=$U API_TEST_DATABASE_URL=$U DATABASE_URL=$U \
  bun --env-file=../../.env.test test --timeout 120000 \
  ./test/integration/package-box-catalog-import.integration.ts
```

→ 5 pass, 0 fail (CA03 medida intocável, CA04 simulação sem gravação, CA05 idempotência, CA06
duas empresas/mesmo GTIN, sanidade rejeita fixture torta).

⚠️ **Decisão registrada**: sem fonte de peso líquido/densidade por NCM em produção (nem
`nfe_products` guarda GTIN ou peso, nem o catálogo de densidade da spec 160 foi construído — 160
suspensa após a Fase 1), a sanidade roda com `PackageBoxCatalogContentReference` vazia. Só
`EDGE_TOO_LARGE`/`EDGE_TOO_SMALL`/`UNIT_AMBIGUOUS` protegem hoje; documentado no cabeçalho de
`import-package-box-catalog.use-case.ts`.

## T008 — CLI na imagem

`bun run build` (raiz `apps/api-transportada`) agora gera dois entrypoints:
`dist/main.js` e `dist/cli/import-package-box-catalog.js` (bundle standalone, 56 KB). O Dockerfile
já copiava `dist/` inteiro (`COPY --from=build .../dist apps/api-transportada/dist`), então a CLI
entra na imagem sem `COPY` adicional — só o comentário explicando o caminho de execução
(`railway ssh ... bun apps/api-transportada/dist/cli/import-package-box-catalog.js`).

Testado local: bundle standalone rodado contra um banco descartável (`DATABASE_URL=... bun
dist/cli/import-package-box-catalog.js < linha.jsonl`) e a CLI fonte (`bun
src/cli/import-package-box-catalog.ts`) rodada contra o JSONL real completo (613 linhas), em
simulação — ver relatório consolidado abaixo.

## T009 — script de produção/staging

`scripts/box-catalog-harvest/import-to-production.sh <jsonl> [--environment staging|production]
[--apply]`. `bash -n` (sintaxe) verde. **Não executado** (só roda contra staging/produção reais,
fora do escopo desta sessão). Desvio documentado no próprio script: o base64 vai pelo stdin do
`railway ssh`, não embutido no argumento do comando (`export-pending-queue.sh` embute um script
curto; aqui o payload é o JSONL inteiro, ~2.7 MB / ~3.6 MB em base64 — grande demais para caber
num argumento único).

## T010 — fechamento

- `bun run lint` (api-transportada): verde.
- `bun run typecheck` (raiz, 6 apps): verde.
- `bun run test` (api-transportada, 181 arquivos / 3611+ contratos incluindo os novos): 6743 pass,
  0 fail, 32 skip (skips pré-existentes, não relacionados). Precisou de um ajuste em
  `test/database-migration/static-migration.contract.ts` (lista estática de diretórios de
  migration) para incluir `20260922020751_package_box_catalog_source` — sem isso o contrato
  `preserves baseline and identity bytes` falhava sozinho, nada a ver com a migration em si.
- `bun run test:integration` (api-transportada, 73 arquivos, cada um com seu próprio banco
  descartável): 495 pass, 9 fail, 376s. As falhas são **pré-existentes, sem relação com a spec
  162** — `package-box-catalog-import.integration.ts` (os 5 testes desta spec) passou 100%, tanto
  isolado quanto dentro da suíte completa. As falhas visíveis: três em
  `toll-booth-reload.integration.ts` (spec 154, `ObjectStorageError: Object storage is
unavailable` — depende de MinIO, e o Docker local está indisponível nesta sessão, conforme
  registrado no CLAUDE.md da raiz) e uma em `contractor-mail-template-repository.integration.ts`
  (spec 150, unicidade de nome — não toca em `nfe_package_boxes`/`nfe_package_box_measurements`
  nem em nenhum arquivo desta spec). Nenhuma tem relação com o schema, a migration ou o código do
  importador.
- README de `scripts/box-catalog-harvest/` ganhou a seção "Importar o JSONL coletado (spec 162)".
- `railway`/deploy/staging/produção: nada executado.

### Relatório da CLI em simulação local (JSONL real, 613 linhas, banco vazio)

```
apply: false
linesRead: 613
ignoredStatus: 502        # status "no_dimensions" (RF03 — fora do escopo de importação)
invalidLines: 0
parseRejected: { IGNORED_STATUS: 0, CARTON_GTIN_MISSING: 0, EDGES_INCOMPLETE: 0, UNIT_MISSING: 0 }
sanityRejected: 60        # das 111 "found", rejeitadas por EDGE_TOO_LARGE (+ UNIT_AMBIGUOUS quando aplicável)
outcomes: { proposed: 0, promoted: 0, skipped_measured: 0, duplicate: 0, no_matching_box: 51 }
```

`no_matching_box: 51` é esperado: o banco de teste local não tem nenhuma `nfe_package_boxes` com
os `carton_gtin` da captura — casamento real só acontece em staging/produção, onde as caixas da
fila (`export-pending-queue.sh`) existem. As 51 linhas restantes (111 found − 60 rejeitadas pela
sanidade) todas caíram em `no_matching_box` por esse motivo, não por defeito do importador.
