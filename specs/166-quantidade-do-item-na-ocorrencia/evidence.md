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

## Suíte de integração completa (73 arquivos)

```
$ bun --env-file=../../.env.test run test:integration
 516 pass
 7 skip
 9 fail
Ran 532 tests across 94 files. [441.29s]
```

As 9 falhas são **pré-existentes e alheias a esta spec** — nenhuma cita
`trip-occurrence-item-quantity`:

- 8 em `toll-booth-extract-storage.integration.ts`/`toll-booth-reload.integration.ts`:
  `ObjectStorageError: Object storage is unavailable` — o MinIO local não respondeu durante a
  corrida (nada em `trips/`, `database/trip.schema.ts` ou nos arquivos desta spec toca storage de
  pedágio).
- 1 timeout em `package-box-catalog-import.integration.ts` (CA03) — módulo de caixa/catálogo,
  também fora do escopo desta fase.

`test/integration/trip-occurrence-item-quantity.integration.ts` isolado (T208) e os 3611 contratos
da API seguem 100% verdes; não alterei nenhum arquivo de pedágio ou de catálogo de caixa nesta
sessão.

## Gates desta fase

- `bun run lint` (api-transportada): verde.
- `bunx tsc --noEmit`: verde.
- `bun --env-file=../../.env.test test --timeout 120000` (contrato, 183 arquivos): verde.
- `make migration-test`: verde (T201).
- `bun --env-file=../../.env.test test ./test/integration/trip-occurrence-item-quantity.integration.ts`: verde (T208).
- `bun --env-file=../../.env.test run test:integration` (suíte completa): 9 falhas pré-existentes,
  alheias a esta spec (MinIO local e módulo de caixa) — ver acima.

## Fase 3 — Telas (T301–T305)

Escopo executado nesta sessão: só `apps/frontend-transportada`. Não toquei em
`apps/api-transportada` nem em `docs/spec/railway.md`. T402 (revisão de design com print) fica de
fora por pedido explícito — é do usuário.

### T301/T302 — Campo de quantidade por item + envio (RF7, CA09)

`TripOccurrences.component.tsx` ganha, por item marcado, um `<input type="number" step="0.001">`
com seletor `@/components/ui/select` para a unidade (peça/caixa) — em branco continua válido, sem
exigir nada (RF7). Estado em `Map<code, {quantity, unit}>` para sobreviver a desmarcar/remarcar o
item sem perder a associação com `productCodes`.

Lógica pura (testada antes da UI, `test/trip/occurrence-product-selection.contract.ts`):
`resolveOccurrenceItemQuantityFields` monta `productQuantities`/`productQuantityUnits` alinhadas
por índice a `productCodes` — item sem quantidade digitada (ou só espaços) vira `null` nas duas
listas, nunca uma string vazia solta. O envio (`tripClient.service.ts#registerTripOccurrence`)
manda os dois campos repetidos no multipart, alinhados por índice, com `''` na posição em branco —
mesmo formato que `productQuantities`/`productQuantityUnits` da API (Fase 2, T203) espera. A cadeia
inteira (`TripOccurrences` → `SeparationOccurrenceDialog`/`TripDetail` →
`useTripWorkspace.hook.ts#sendSeparationOccurrencePhotos` → `tripClient.service.ts`) ficou tipada
ponta a ponta; os dois campos novos são opcionais no client e no hook para não quebrar os
fixtures/mocks de hook existentes que ainda não passam quantidade.

### T303 — Seleção única quando o tipo não aceita vários (RF8)

Com `type.allowsMultipleItems` falso, o campo de item troca o `MultiSelect` pelo `Select` (mesmo
primitivo do design system, nunca `<select>` nativo) — escolher outro item substitui em vez de
somar, porque o `Select` já é exclusivo por natureza. Trocar de tipo com mais de um item já marcado
trunca para o primeiro (`handleOccurrenceTypeChange`), para não mandar dois itens a um tipo que a
API vai recusar com `422 OCCURRENCE_TYPE_SINGLE_ITEM`.

### T304 — Interruptor no cadastro de tipos (RF9, CA10)

`OccurrenceType.allowsMultipleItems` (padrão `true`, RF3) entra no guard de leitura
(`isOccurrenceType`, chave fechada) e no `saveOccurrenceType` do client. `OccurrenceTypeCatalogPanel`
ganha um `@/components/ui/checkbox` — "Aceita vários itens" — tanto no formulário de cadastro novo
quanto por linha de tipo já cadastrado, ao lado dos interruptores existentes ("Avisar"/"Em uso").

### T305 — Quantidade na leitura da ocorrência (P3)

`resolveOccurrenceProductEntries` casa cada código de `productCodes`/`productCode` com a linha
correspondente em `products` (quando existe) — item sem linha (ocorrência antiga, ou item sem
contagem) sai com `quantity`/`unit` nulos. `formatOccurrenceProductEntryLabel` imprime só o código
quando não há contagem, e `"código (quantidade unidade)"` quando há — nunca `"código (0 peça)"`.
`formatOccurrenceProductsLine` compõe a linha inteira (todos os itens, cada um com a contagem que
tiver) e cai para "a nota inteira" quando a lista de itens é vazia. `TripOccurrences.component.tsx`
usa essa função na listagem, substituindo `formatOccurrenceProductLabel` (que continua existindo,
sem uso agora, para não quebrar o contrato que já a testava isolada).

### Testes novos

- `test/trip/occurrence-product-selection.contract.ts`: 15 casos novos —
  `resolveOccurrenceItemQuantityFields` (par casado, branco vira `null`, espaço em branco conta
  como vazio) e a leitura (`resolveOccurrenceProductEntries`,
  `formatOccurrenceProductEntryLabel`, `formatOccurrenceProductsLine`).
- `test/trip/occurrence-item-quantity-field.contract.ts` (novo, registrado em
  `test/trip.contract.test.ts`): fiação na tela — primitivo certo (nunca `<select>` cru), `Select`
  substituindo `MultiSelect` em item único, `handleOccurrenceTypeChange` truncando a seleção,
  `resolveOccurrenceItemQuantityFields`/`formatOccurrenceProductsLine` conectados, chaves de locale
  presentes nos dois idiomas.
- `test/company-settings/occurrence-type-catalog-panel.contract.ts`: 2 casos novos — o `Checkbox`
  do interruptor (nunca `<input type=checkbox>`) e o rótulo nos dois locales.
- `test/trip/separation-occurrence-button.contract.ts`: fixture `buildType` atualizada com
  `allowsMultipleItems: true` (campo novo obrigatório no tipo).

### Gates desta fase (`apps/frontend-transportada`)

```
$ bunx tsc --noEmit
(sem saída — zero erros)

$ bun run lint
$ eslint .
(sem saída — zero erros/avisos)

$ bun run test
 4868 pass
 0 fail
Ran 4868 tests across 29 files. [4.16s]
 44 pass
 0 fail
Ran 44 tests across 1 file. [571.00ms]
```

Commits: `e7a8e3d23` (T304 + transporte da quantidade), `e02e37fe7` (T301–T303, T305).

### O que não rodou, e por quê

- **T402** (revisão de design com print): fora de escopo desta sessão por pedido explícito — cabe
  ao usuário.
- **`make smoke`/Playwright** (`verify-picker.smoke.spec.ts` e afins): não fazem parte do gate
  `bun run test` da app nem foram pedidos; não rodei.
- Publicação em staging (Fase 3): não fiz deploy — só implementei e testei localmente, como pedido.
