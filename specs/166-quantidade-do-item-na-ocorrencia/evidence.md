# Evidência — Fase 2 (banco e API)

Escopo executado: T201–T208. Fase 1 (frontend tolerante) e Fase 3 (telas) são de outra sessão —
`apps/frontend-transportada` não foi tocado.

## T201 — Migration aditiva (CA01, CA03)

`drizzle/20260922192409_quantity_and_multi_item_occurrence/`: `quantity numeric(12,3)`,
`quantity_unit varchar(8)` (ambos anuláveis) em `trip_document_occurrence_products`, com três
CHECKs (presença casada, positivo, domínio da unidade); `allows_multiple_items boolean not null
default true` em `company_occurrence_types`. `rollback.sql` escrito à mão no molde das migrations
vizinhas (RAISE se houver dado a perder — aqui não há tabela nova, só colunas, então o rollback
apenas remove as colunas/CHECKs).

```
$ bun run db:generate
{"status":"no_changes","dialect":"postgresql"}
```

```
$ make migration-test
...
 110 pass
 0 fail
 1417 expect() calls
Ran 110 tests across 8 files. [32.35s]
```

Numeração conferida contra `origin/staging` antes de gerar; `db:generate` rodado de novo depois e
deu `no_changes`.

Commit: `e8289c530`.

## T202 — Política pura de quantidade/unidade (RF4, CA04, CA05)

`src/trips/domain/occurrence-item-quantity.policy.ts` (`resolveOccurrenceItemQuantities`): par
quantidade/unidade casado, zero/negativo recusados, unidade desconhecida recusada, listas
desalinhadas com `productCodes` recusadas — tudo por código de erro estável (`400`), sem tocar
banco nem HTTP. Contrato: `test/trip-occurrence/item-quantity.contract.ts` (13 casos).

Commit: `e073ba4db`.

## T203–T207 — Parse multipart, persistência, 422 de item único, resposta e cadastro do tipo

- **T203** `occurrence.schema.ts` lê `productQuantities`/`productQuantityUnits` (repetidos,
  alinhados por índice a `productCodes`, branco preservado).
- **T204** `drizzle-occurrence-product.repository.ts` grava `quantity`/`quantityUnit` por linha;
  `listOccurrenceProducts` lê as duas colunas (usado tanto no registro quanto na leitura da
  ocorrência).
- **T205** `register-trip-occurrence.use-case.ts`: tipo com `allowsMultipleItems: false` e mais de
  um item marcado é `422 OCCURRENCE_TYPE_SINGLE_ITEM`, antes de `saveOccurrence`/storage/aviso.
- **T206** a resposta do registro e a leitura da ocorrência (`listTripOccurrences`,
  `findTripOccurrenceById`) publicam `products: [{ code, quantity, unit }]` ao lado de
  `productCodes`, que continua inalterado (item sem linha nova cai no fallback com `quantity`/`unit`
  nulos — ocorrência antiga nunca aparece com número).
- **T207** `company_occurrence_types.allows_multiple_items` é lido/gravado pelo cadastro
  (`occurrenceTypeSchema`, `saveOccurrenceType`), padrão `true`.

Contratos novos: `test/trip-occurrence/item-quantity-registration.contract.ts` (422 de item único,
`products` na resposta), `test/trip-occurrence/item-quantity-schema.contract.ts` (parse multipart,
default do interruptor). Mocks/fixtures existentes atualizados para os campos novos
(`allowsMultipleItems`, `items`) em 16 arquivos de teste.

```
$ bunx tsc --noEmit
(sem saída — zero erros)

$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0
(sem saída — zero erros/avisos)

$ bun --env-file=../../.env.test test --timeout 120000
 6981 pass
 23 skip
 0 fail
 23713 expect() calls
Ran 7004 tests across 183 files. [26.68s]
```

Commit: `be9c9b953`.

## T208 — Integração contra Postgres (CA01, CA02, CA03, CA04)

`test/integration/trip-occurrence-item-quantity.integration.ts` (registrado em
`package.json#test:integration`): grava um item com quantidade+unidade e um sem nenhuma, lê a
linha de volta do Postgres e confere os dois casos; confirma que quantidade sem unidade e
quantidade zero são recusadas pelo próprio CHECK do banco (`error.cause`), não só pela API.

```
$ bun --env-file=../../.env.test test ./test/integration/trip-occurrence-item-quantity.integration.ts
 3 pass
 0 fail
 5 expect() calls
Ran 3 tests across 1 file. [4.07s]
```

`bun --env-file=../../.env.test run test:integration` (suíte completa, 73 arquivos) foi disparada
e ficou rodando em background por passar do teto de tempo do terminal interativo — resultado
reportado à parte quando terminar; os 3 testes novos, isolados, já confirmam T208 contra o banco.

## Gates pendentes desta fase

- `bun run lint`/`typecheck`/contrato: verdes, mostrados acima.
- `make migration-test`: verde (T201).
- `bun --env-file=../../.env.test run test:integration` completo: em execução no momento do
  fechamento deste documento — ver atualização abaixo se a sessão a reportar antes do fim.
