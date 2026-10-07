# Evidence

## Fase 0 — Conferência

### T0.1 — Conferência dos fatos em origin/staging

**Status**: ✅ Completo

**Distância da branch**: 0 commits (alinhada com origin/staging)

**Fatos conferidos**:

| Arquivo e linha(s)                     | Fato esperado                                                    | Status                                    |
| -------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| `trip.schema.ts:2522`                  | `quantity: numeric('quantity', { precision: 12, scale: 3 })`     | ✅ Confirmado                             |
| `trip.schema.ts:2529`                  | `quantityUnit: varchar('quantity_unit', { length: 20 })`         | ✅ Confirmado                             |
| `trip.schema.ts:2677`                  | `itemsMode: varchar('items_mode', ...)`                          | ✅ Confirmado                             |
| `trip.schema.ts:2686-2693`             | `noteMode`, `signatureMode` de spec 246                          | ✅ Confirmado                             |
| `trip-occurrence.constant.ts:61-66`    | `OCCURRENCE_MOMENTS` com separation/document/stop/office         | ✅ Confirmado                             |
| `occurrence-template.policy.ts:16-28`  | Lista `OCCURRENCE_TEMPLATE_PLACEHOLDERS` com 11 marcadores       | ✅ Confirmado                             |
| `save-occurrence-type.use-case.ts:147` | Zera `emailBody` e `emailSubject` quando há `email_template_key` | ✅ Confirmado (defeito a corrigir em RF2) |

**Conclusão**: Todos os fatos de plan.md § Contexto estão válidos em origin/staging. Nenhuma divergência encontrada.

---

### T0.2 — Consulta só-leitura em staging

**Status**: ⚠️ Não medido

**Motivo**: Acesso ao banco de staging requer credenciais criptografadas. Não exponho credenciais em sessão — conforme instruções da spec, registra-se como não medido e segue-se.

**Consulta esperada**: `SELECT COUNT(*) FROM company_occurrence_types WHERE email_template_key IS NOT NULL AND emails_contractor = true`

(Resultado não medido — não afeta execução das Fases 1 e posteriores)

---

## Fase 1 — Painel e app tolerantes

### T1.1 — `frontend-transportada` validação

**Status**: ✅ Completo

**Implementação**:

- **Tipo**: Adicionados 6 campos opcionais a `RawOccurrenceType`: `referenceNumberMode`, `referenceNumberLabel`, `declaredAmountMode`, `declaredAmountScope`, `declaredAmountLabel`, `emailItemLineTemplate`
- Validação em `isOccurrenceType()` aceita os novos campos como opcionais e valida vocabulários
- Transformação em `toOccurrenceType()` passa os campos novos adiante quando presentes
- **Exceções**: Adicionados `referenceNumberMode` e `declaredAmountMode` (como modo-ou-nulo) à validação `hasValidRequirementFields()` em `occurrenceAttachmentOverrides.validation.ts`
- **Contratos**:
  - `tripResponse.validation.contract.test.ts`: tipo COM e SEM as chaves
  - `occurrenceAttachmentOverrides.validation.contract.test.ts` (novo): exceção COM/SEM/NULL nos modos novos, rejeita inválido

**Gates**:

- ✅ Typecheck: passou
- ✅ Testes: 7214 pass, 0 fail (incluindo novo contrato de exceções)

---

### T1.2 — `frontend-driver` validação

**Status**: ✅ Completo

**Implementação**:

- **Tipo de ocorrência**: Adicionados 6 campos opcionais a `DriverOccurrenceType`: `referenceNumberMode`, `referenceNumberLabel`, `declaredAmountMode`, `declaredAmountScope`, `declaredAmountLabel`, `emailItemLineTemplate`
- Validação em `isDriverOccurrenceType()` aceita os novos campos como opcionais e valida vocabulários
- **Snapshot**: Adicionado tipo `DriverNfeProduct` (code, description, unit, quantity, unitValue) e campo `products` (array opcional) ao `DriverTripDocument`
- **Contratos**:
  - `driverTripResponse.validation.contract.test.ts`: tipo COM e SEM as chaves (tipos de ocorrência)
  - `driverTripResponse.validation.contract.test.ts` (estendido): documento COM/SEM/VAZIO products no snapshot

**Gates**:

- ✅ Typecheck: passou
- ✅ Testes: 1250 pass, 0 fail (novo contrato de products incluído na lista)

---

## Fase 2 — O dado

Base: `git fetch && git rebase origin/staging` ("Current branch work/spec-247 is up to date") +
`bun install --frozen-lockfile` ("no changes"); distância `HEAD..origin/staging` = 0. Banco dos
gates: **Postgres nativo descartável** (Homebrew 18.4, cluster em scratchpad, porta 56247, `fsync=off`)
— nunca staging/produção. O `db:test` cria e derruba bancos aleatórios dentro dele.

### T2.1 — Constantes do valor pago e do número do cliente

**Status**: ✅ Completo

- `apps/api-transportada/src/shared/trip-occurrence.constant.ts`: `OCCURRENCE_DECLARED_AMOUNT_SCOPE`
  (`item`, `occurrence`) + `OCCURRENCE_DECLARED_AMOUNT_SCOPES`; `OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS`
  (modos `off` via `OCCURRENCE_ITEMS_MODE.off`, escopo `item`, rótulos "Número do documento do
  cliente" e "Valor pago"); `OCCURRENCE_REFERENCE_NUMBER_PATTERN = '^[A-Za-z0-9 ./-]{1,30}$'`;
  `OCCURRENCE_REQUIREMENT_LABEL_MAX_LENGTH = 40`; `OCCURRENCE_ITEM_LINE_TEMPLATE_MAX_LENGTH = 400`;
  `OCCURRENCE_TYPE_DECLARED_AMOUNT_ITEMS_CHECK`. `DELIVERY_PROOF_FIELD_MODES` continua em
  `src/database/company-delivery-proof-settings.schema.ts:25` (importado pelo schema na T2.2).
- Contrato **antes**: `test/trip-occurrence/declared-amount-constant.contract.ts` (no entrypoint
  `test/trip-occurrence.contract.test.ts`). Vermelho primeiro:
  `SyntaxError: Export named 'OCCURRENCE_DECLARED_AMOUNT_SCOPE' not found` → `0 pass 1 fail 1 error`.
  Depois: `5 pass 0 fail 17 expect() calls`.

**Gates**:

- `bun run typecheck` (raiz): exit 0.
- Contrato da API (`bun --env-file=../../.env.test test --timeout 120000`):
  `10058 pass · 25 skip · 0 fail · Ran 10083 tests across 199 files`.
- `db:test` (equivalente ao `make migration-test`, contra o Postgres nativo):
  `138 pass · 0 fail · Ran 138 tests across 8 files`.

### T2.2 — Schema e migration `20261007033420_occurrence_declared_amount`

**Status**: ✅ Completo (desenho validado pelo `architect`/opus antes; ajustes 1–3, 6–8 aplicados)

- `src/database/trip.schema.ts`: colunas e CHECKs do `plan.md` § Modelo de dados, geradas das
  constantes (`DELIVERY_PROOF_FIELD_MODES` importado de `company-delivery-proof-settings.schema.ts`,
  `OCCURRENCE_DECLARED_AMOUNT_SCOPES`, padrões, padrão do número, tetos, nome da CHECK de forma).
  Exceções: nomes encurtados `…_reference_mode_check` com o comentário do motivo (como o da 246).
- Opcionais do ajuste 8, **feitos**: `trip_document_occurrence_products_unit_value_check`
  (`unit_value is null or >= 0`); nas duas `declared_amount` a CHECK inclui `= round(declared_amount, 2)`;
  `reference_number` também `length(btrim(..)) > 0`.
- CHECK de forma com **três termos** (ajuste 3):
  `"declared_amount_mode" = 'off' or "declared_amount_scope" = 'occurrence' or "items_mode" <> 'off'`.
  `spec.md` § Campos novos e RF1 corrigidos para "com `declared_amount_mode <> 'off'`".
- `migration.sql`: 14 `ADD COLUMN` (exceções nulas sem padrão; tipo com padrão constante; ocorrência e
  produtos nulos, `numeric(14,4)`/`numeric(19,4)`), depois 15 `ADD CONSTRAINT`. Nenhum `UPDATE`.
- `rollback.sql`: `BEGIN; … COMMIT;`, CHECKs → colunas das 5 tabelas → `DELETE` do journal pelo nome
  da pasta com `ROW_COUNT = 1`; sem `CASCADE`; não toca nada da 241/246; cabeçalho registra o que se perde.
- Cadeia de snapshots: `prevIds` do novo = `['4aafa5e2-6d07-4537-b98c-a70a943aaa79']` = `id` de
  `20261006205232_street_occurrence_attachment_backfill` (o último antes). `bun run db:generate`
  depois de gerada: `{"status":"no_changes","dialect":"postgresql"}`.

**Nomes medidos (script, ≤ 63):**

| Nome                                                              | Tam. |
| ----------------------------------------------------------------- | ---- |
| `company_occurrence_types_reference_number_mode_check`            | 52   |
| `company_occurrence_types_reference_number_label_check`           | 53   |
| `company_occurrence_types_declared_amount_mode_check`             | 51   |
| `company_occurrence_types_declared_amount_scope_check`            | 52   |
| `company_occurrence_types_declared_amount_label_check`            | 52   |
| `company_occurrence_types_email_item_line_template_check`         | 55   |
| `company_occurrence_types_declared_amount_items_check`            | 52   |
| `occurrence_type_contractor_overrides_reference_mode_check`       | 57   |
| `occurrence_type_contractor_overrides_declared_amount_mode_check` | 63   |
| `occurrence_type_recipient_overrides_reference_mode_check`        | 56   |
| `occurrence_type_recipient_overrides_declared_amount_mode_check`  | 62   |
| `trip_document_occurrences_reference_number_check`                | 48   |
| `trip_document_occurrences_declared_amount_check`                 | 47   |
| `trip_document_occurrence_products_unit_value_check`              | 50   |
| `trip_document_occurrence_products_declared_amount_check`         | 55   |

Descartados por tamanho: `company_occurrence_type_contractor_overrides_reference_number_mode_check` (72)
e `…_recipient_…` (71). O contrato estático também afirma `≤ 63` em todos.

**Testes antes** (padrão da 246):

- `test/database-migration/occurrence-declared-amount.static.contract.ts` (importado em
  `test/database-migration.contract.test.ts`): nomes ≤ 63, colunas antes das CHECKs, sem
  `UPDATE/DROP/DELETE`, CHECK de forma com os três termos, rollback na ordem e sem tocar 241/246, sem
  `CASCADE`.
- `test/database-migration/occurrence-declared-amount.assertion.ts`, ligado em
  `database-migration.integration.ts` **antes** de `assertOccurrenceTypeQuantityMinimumsRollback`
  (ordem inversa): roda o rollback, confere que as 15 CHECKs e as 14 colunas somem e que as CHECKs
  da 241/246 ficam; semeia dois tipos **antes** da reaplicação (um com `items_mode = 'off'`), reaplica
  e confere os padrões nos dois.
- Vermelho primeiro (sem migration): `101 pass · 3 fail` — `error: occurrence_declared_amount is required`
  nos dois testes estáticos e em `applies, constrains, rolls back, and reapplies…`.
- Depois: o `static-migration.contract.ts` (lista explícita de pastas) também precisou da pasta nova
  (`+ "20261007033420_occurrence_declared_amount"`); então `104 pass · 0 fail`.

**Gates**:

- `bun run typecheck` (raiz): exit 0.
- Contrato da API: `10061 pass · 25 skip · 0 fail · Ran 10086 tests across 199 files`.
- `db:test` (Postgres nativo descartável): `141 pass · 0 fail · Ran 141 tests across 8 files`.
- `migration-completeness` + `occurrence-type-minimum-counts` + `occurrence-type-items-mode`
  (integração, Postgres nativo): `12 pass · 0 fail`.

### T2.3 — Integração da migration e das CHECKs

**Status**: ✅ Completo

- `test/integration/occurrence-declared-amount.integration.ts` (na lista explícita de
  `test:integration` do `package.json`), cinco testes contra Postgres real:
  1. tipo novo nasce com `OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS` e linha de item `''`; exceção por
     contratante e por destinatário (pelo repositório real) nasce com os dois modos **nulos**; modo
     fora do vocabulário na exceção recusado (`…_reference_mode_check`,
     `…_declared_amount_mode_check`), modo válido aceito;
  2. `declared_amount_scope = 'item'` com `items_mode = 'off'` e modo `optional`/`required` →
     `company_occurrence_types_declared_amount_items_check`; escopo `occurrence`, modo `off`, ou
     produtos ligados → aceito;
  3. vocabulário do tipo, rótulos em branco e linha de item com 401 caracteres recusados (cada CHECK
     pelo nome); 400 aceito;
  4. ocorrência: `-0.01` e `10.005` recusados (`>= 0` e `round(…, 2)`); número `45029;`, `NFD_1`,
     `Nº 12`, `'   '`, `''` recusados; `NFD 45029` + `199.99` aceitos e lidos como `199.9900`;
     produtos: valor pago `-1` e `0.001`, `unit_value` `-0.0001` recusados; válidos aceitos;
  5. **ajuste 5** — corrida do `PUT`: com valor pago por item gravado por fora, `saveOccurrenceType`
     com `itemsMode: 'off'` rejeita com `OccurrenceTypeDeclaredAmountNeedsItemsError` (422
     `OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS`) e `items_mode` fica `optional`.
- Tipo semeado **antes** da migration recebendo os padrões: na asserção da T2.2 (rollback → semeia
  dois tipos, um com `items_mode = 'off'` → reaplica → padrões nos dois).
- Vermelho primeiro: sem a classe, `SyntaxError: Export named 'OccurrenceTypeDeclaredAmountNeedsItemsError'
not found` (`0 pass 1 fail 1 error`); com a classe e sem a tradução, o teste 5 falha com o erro cru do
  Postgres (`Expected constructor: OccurrenceTypeDeclaredAmountNeedsItemsError` — seria 500): `4 pass 1 fail`.
- Implementação: `OccurrenceTypeDeclaredAmountNeedsItemsError` em `src/trips/domain/trip.error.ts`;
  `rethrowOccurrenceTypeViolation` (`src/trips/infrastructure/delivery-proof-read.support.ts`) traduz
  `OCCURRENCE_TYPE_DECLARED_AMOUNT_ITEMS_CHECK`, no padrão da 241/246. Depois: `5 pass · 0 fail`.

**Gates**:

- `bun run typecheck` (raiz): exit 0.
- Contrato da API: `10061 pass · 25 skip · 0 fail · Ran 10086 tests across 199 files`.
- `db:test` (Postgres nativo): `141 pass · 0 fail · Ran 141 tests across 8 files`.
- Integração do arquivo novo (Postgres nativo): `5 pass · 0 fail · Ran 5 tests across 1 file`.

### T2.4 — Mutações da T2.3

**Status**: ✅ Completo — as três vermelhas, revertidas por `git checkout -- <migration.sql>` e verde depois.

Cada mutação foi aplicada no `migration.sql` (é ele que o banco executa), e o mesmo comando rodou
contra o Postgres nativo descartável:
`bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-declared-amount.integration.ts ./test/database-migration.contract.test.ts`
(com `DRIZZLE_TEST_DATABASE_URL`/`API_TEST_DATABASE_URL`/`DATABASE_URL` no cluster nativo).

**(1) padrão `'optional'` em `declared_amount_mode`**

```text
-ALTER TABLE "company_occurrence_types" ADD COLUMN "declared_amount_mode" varchar(16) DEFAULT 'off' NOT NULL;
+ALTER TABLE "company_occurrence_types" ADD COLUMN "declared_amount_mode" varchar(16) DEFAULT 'optional' NOT NULL;

error: expect(received).toEqual(expected)
-   "declaredAmountMode": "off",
+   "declaredAmountMode": "optional",
(fail) … (spec 247 T2.3) > tipo novo nasce com os padrões e a exceção nasce nula — herda do tipo
ApiError: A declared amount per item requires the occurrence type to carry items.  (status: 422)
(fail) … (spec 247 T2.3) > valor pago por item exige produtos; pela ocorrência, ou desligado, não
error: Missing fragment: ALTER TABLE "company_occurrence_types" ADD COLUMN "declared_amount_mode" varchar(16) DEFAULT 'off' NOT NULL;
(fail) … (spec 247 T2.2) > colunas com padrão constante no tipo, nulas nas exceções; CHECKs depois; sem UPDATE
PostgresError: a restrição de verificação "company_occurrence_types_declared_amount_items_check" da relação "company_occurrence_types" é violada por alguma linha
(fail) Drizzle migration integration > applies, constrains, rolls back, and reapplies the fiscal migration
 105 pass
 4 fail
Ran 109 tests across 2 files. [11.22s]
```

A última falha é a prova do ajuste 3: com o padrão ligado, a reaplicação sobre o tipo semeado com
`items_mode = 'off'` quebra o `ADD CONSTRAINT`.

**(2) sem a CHECK `declared_amount_items`**

```text
-ALTER TABLE "company_occurrence_types" ADD CONSTRAINT "company_occurrence_types_declared_amount_items_check" CHECK (…);

error: expect(received).toBe(expected)
Expected: "company_occurrence_types_declared_amount_items_check"
Received: "accepted"
(fail) … (spec 247 T2.3) > valor pago por item exige produtos; pela ocorrência, ou desligado, não
error: Expected promise that rejects
(fail) … (spec 247 T2.3) > na corrida do PUT, a CHECK de forma vira 422 do domínio e nada é gravado
error: Missing fragment: "company_occurrence_types_declared_amount_items_check"
(fail) … (spec 247 T2.2) > colunas com padrão constante no tipo, nulas nas exceções; CHECKs depois; sem UPDATE
error: expect(received).toHaveLength(expected)
Expected length: 15
(fail) Drizzle migration integration > applies, constrains, rolls back, and reapplies the fiscal migration
 105 pass
 4 fail
Ran 109 tests across 2 files. [12.14s]
```

**(3) padrão não nulo na exceção**

```text
-ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "reference_number_mode" varchar(16);
+ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "reference_number_mode" varchar(16) DEFAULT 'off';

error: expect(received).toEqual(expected)
-     "referenceNumberMode": null,
+     "referenceNumberMode": "off",
(fail) … (spec 247 T2.3) > tipo novo nasce com os padrões e a exceção nasce nula — herda do tipo
error: Missing fragment: ALTER TABLE "company_occurrence_type_contractor_overrides" ADD COLUMN "reference_number_mode" varchar(16);
(fail) … (spec 247 T2.2) > colunas com padrão constante no tipo, nulas nas exceções; CHECKs depois; sem UPDATE
 107 pass
 2 fail
Ran 109 tests across 2 files. [13.61s]
```

**Revertidas** (`git status --short` limpo) — mesmo comando:

```text
 109 pass
 0 fail
Ran 109 tests across 2 files. [13.45s]
```

### Fechamento da Fase 2 — gates finais

- Integração completa da API (`bun --env-file=../../.env.test run test:integration`, de
  `apps/api-transportada`, com `DATABASE_URL`/`DRIZZLE_TEST_DATABASE_URL`/`API_TEST_DATABASE_URL`
  apontando para o Postgres nativo descartável — o `.env.test` aponta para a infra de E2E):
  `1102 pass · 1 skip · 0 fail · 8046 expect() calls · Ran 1103 tests across 204 files [869.12s]`, exit 0.
- `bun run format:check` (raiz): `All matched files use Prettier code style!`
- `bun run lint` (API): exit 0.
- ⚠️ O Postgres nativo é 18.4; a CI usa outro (memória "Postgres da CI ≠ Postgres 18 local"). As
  asserções desta fase leem nome de CHECK e `SQLSTATE` 23514, que não variam entre as versões.

## Etapa 1b — painel tolerante nos dois parsers

ADR-0081 §9 (painel tolerante ANTES da API): a T1.1 cobriu só `/occurrence-types` e as exceções; a API
(T4.6) passa a publicar os requisitos efetivos da devolução no tipo de rua e na verificação, e dois
guards do painel recusam chave desconhecida.

- **TP.1** `isFieldOccurrenceType` (`tripResponse.validation.ts`): `referenceNumberMode` e
  `declaredAmountMode` (`off|optional|required`), `declaredAmountScope` (`item|occurrence`),
  `referenceNumberLabel` e `declaredAmountLabel` (texto não vazio, até 40) como opcionais. Chaves em
  `FIELD_OCCURRENCE_TYPE_OPTIONAL_KEYS`; tipo `FieldOccurrenceType` com os cinco campos opcionais.
- **TP.2** `isSettingsResolutionView` (`settingsResolution.service.ts`): os mesmos cinco campos como
  opcionais por tipo, e `sources` aceita as camadas deles (valores texto). A tela não os exibe ainda.
- Validação compartilhada em `returnRequirementFields.validation.ts`; constantes em
  `occurrence.constant.ts` (sem literal repetido).
- Contrato: `test/trip/field-type-return-requirements-tolerance.contract.ts` (entra por
  `test/trip.contract.test.ts`, que está na lista do `package.json`). Escrito antes: 4 testes
  vermelhos (`4 fail`), verdes após a implementação. Cobre COM e SEM as chaves e recusa vocabulário,
  escopo, rótulo vazio/longo e camada que não é texto.
- Outros parsers do painel: nenhum outro valida `FieldOccurrenceType` com chaves fechadas. O
  `occurrenceTypes` do catálogo e as exceções já tolerantes (T1.1). `cargoOccurrenceGuards`
  (`TYPE_KEYS` exato: `allowsMultipleItems`, `id`, `itemsMode`, `name`) é outro contrato (caso de
  ocorrência do recebimento) e não está no caminho dos requisitos efetivos — vigiar na T4.6.
- frontend-driver: `isDriverOccurrenceType` já aceita `declaredAmountScope`, os dois modos e os
  rótulos (`driverTripResponse.validation.contract.test.ts`, com e sem as chaves, e recusa de escopo e
  modo inválidos) — sem mudança.
- Gates: `bun run typecheck` (raiz) exit 0 · `frontend-transportada test`: `7219 pass · 0 fail` e
  `838 pass · 0 fail` · `frontend-driver test`: `1250 pass · 0 fail` · `format:check`:
  `All matched files use Prettier code style!`.

## Fase 3 — Cálculo e modelo de e-mail (domínio)

### T3.1 — Contrato do cálculo, antes da implementação

`apps/api-transportada/test/trip-occurrence/occurrence-amount.contract.ts` (importado por
`test/trip-occurrence.contract.test.ts`, que está na lista explícita do `package.json`). Cobre CA02:
tabela de dez linhas (inclui `2,5 × 0,3333`, `3 × 19,995`, `1,005`, `8,345`, meio centavo, quantidade
nula caindo no `vProd`), soma das linhas arredondadas, valor pago vencendo, zero digitado, formatação
e um valor além de 2^53.

Vermelho esperado (a política ainda não existe) — o commit desta task é vermelho de propósito, e o
typecheck/lint só fecham na T3.2:

```text
$ bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts --timeout 120000
error: Cannot find module '../../src/trips/domain/occurrence-amount.policy.js' from '.../test/trip-occurrence/occurrence-amount.contract.ts'
 0 pass
 1 fail
 1 error
```

### T3.2 — `occurrence-amount.policy.ts`

`apps/api-transportada/src/trips/domain/occurrence-amount.policy.ts` (121 linhas): texto do `numeric` →
`bigint` (4 casas), produto em escala 8 → centavos meio para cima, soma das linhas já arredondadas,
valor pago vencendo, formatação brasileira. Sem `Number`/`parseFloat`/`Math`. O contrato da T3.1 passou
a verde (a regra de dinheiro do domínio fica 100% em `bigint`). Verde:

```text
$ bun run typecheck (raiz)   → exit 0
$ bun --env-file=../../.env.test test --timeout 120000 (API, só contrato)
 10085 pass · 25 skip · 0 fail · Ran 10110 tests across 199 files
$ bun run lint (API)         → exit 0
```

### T3.3 — Mutações da T3.1 (cada uma vermelha, depois revertida)

Comando: `bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts --timeout 120000`
(de `apps/api-transportada`), filtrado para as linhas `(fail)` e o resumo. Linha de base verde: `525 pass · 0 fail`.
Cada mutação foi aplicada em `occurrence-amount.policy.ts` e o arquivo foi restaurado do original
(`git status` limpo na política depois de cada uma).

**M1 — truncar em vez de meio para cima** (`(product + PRODUCT_HALF_CENT) / …` → `product / …`, e o mesmo em `parseAmountToCents`):

```text
(fail) … CA02 > 3 × 19,995 = 59,985 → 59,99
(fail) … CA02 > 1 × 1,005 → 1,01 (o binário dá 1,00)
(fail) … CA02 > 1 × 8,345 → 8,35 (o binário dá 8,34)
(fail) … CA02 > 1 × 0,005 → 0,01, meio para cima e não truncado
(fail) … CA02 > sem quantidade registrada: vProd da nota, 12,345 → 12,35
(fail) … RF9 > arredonda a quarta casa do numeric, meio para cima
(fail) … RF9 > um valor além de 2^53 não perde centavo (o binário perderia)
(fail) … RF9 > a soma geral soma as linhas já arredondadas, nunca antes de arredondar
(fail) … RF9 > valor pago nulo cai na soma da linha, e linha sem quantidade cai no vProd
 516 pass
 9 fail
```

**M2 — somar antes de arredondar** (`itemsSumCents` = arredondamento da soma dos produtos crus):

```text
(fail) … RF9 > a soma geral soma as linhas já arredondadas, nunca antes de arredondar
 524 pass
 1 fail
```

**M3 — `Number` no lugar de `bigint`.** Duas variantes, porque o `Math.round` sozinho acerta o caso
`3 × 19,995` por coincidência de arredondamento do binário (`3 × 19.995 × 100 = 5998.5`, e `Math.round`
sobe); quem erra esse caso é o `toFixed`, que é o que um implementador ingênuo escreve.

M3a — `BigInt(Math.round(Number(q) * Number(v) * 100))` (e o mesmo em `parseAmountToCents`):

```text
(fail) … CA02 > 1 × 1,005 → 1,01 (o binário dá 1,00)
(fail) … RF9 > um valor além de 2^53 não perde centavo (o binário perderia)
(fail) … RF9 > texto que não é um decimal sem sinal é recusado, sem repetir o valor
(fail) … RNF > o arquivo não chama Number, parseFloat, toFixed nem Math
 521 pass
 4 fail
```

M3b — `(Number(q) * Number(v)).toFixed(2)`:

```text
(fail) … CA02 > 3 × 19,995 = 59,985 → 59,99
(fail) … CA02 > 1 × 1,005 → 1,01 (o binário dá 1,00)
(fail) … RNF > o arquivo não chama Number, parseFloat, toFixed nem Math
 522 pass
 3 fail
```

Antes das mutações, o teste do valor além de 2^53 usava `99999999999999999.9999`, que o `Number` acerta
por acaso (`1e19`); entrou `12345678901234567.8901`, que ele erra — foi a primeira mutação M3a que
mostrou isso. Revertidas todas, mesmo comando: `525 pass · 0 fail`.

### T3.4 — Contrato do modelo de e-mail, antes da implementação

`apps/api-transportada/test/trip-occurrence/template.contract.ts` ampliado (já estava na lista, via
`test/trip-occurrence.contract.test.ts`). Cobre: as três listas fechadas (corpo, assunto, linha de item);
**CA04** (marcador de linha no corpo, marcador de linha e `{{linhasItens}}` no assunto, `{{linhasItens}}`
dentro da linha, marcador desconhecido com o nome); **CA01** (assunto e corpo exatos do modelo do SAC,
`SPANI` vindo de `contractorName` da fixture, e uma segunda contratante provando que o nome não é do
código); `numeroNotaSemSerie`; linha padrão; uma linha por item na ordem marcada; sete marcadores da
linha; quantidade da ocorrência (D5); somas e valor pago vencendo; ocorrência sem item; teto de 200 com
"e mais N itens"; `{{` na descrição, na observação, na razão social e no código sai literal; `valorNota`
formatado (D4); contrato de parede de que a política e a constante não citam `SPANI` nem "devolução".

Vermelho esperado (constantes e política ainda sem os símbolos novos) — o commit desta task é vermelho de
propósito; typecheck/lint fecham na T3.5:

```text
$ bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts --timeout 120000
error: Cannot find module '../../src/shared/occurrence-template.constant.js' from '.../test/trip-occurrence/template.contract.ts'
 0 pass
 1 fail
```

### T3.5 — `occurrence-template.policy.ts`

- `src/shared/occurrence-template.constant.ts` (novo, 68 linhas): as três listas fechadas, os contextos
  (`subject`/`body`/`itemLine`), o teto de 200 e a linha padrão.
- `src/trips/domain/occurrence-template.types.ts` (novo, 50 linhas): `OccurrenceTemplateValues` (campos
  novos opcionais: `documentNumber`, `referenceNumber`, `declaredAmount`, `itemLineTemplate`, `lines`),
  `OccurrenceTemplateLine`, `OccurrenceTemplateItem`. Os dois importadores de produção
  (`register-trip-occurrence.use-case.ts`, `delivery-proof-read.support.ts`) passaram a importar o tipo daqui.
- `src/trips/domain/occurrence-template.policy.ts` (199 linhas): `renderOccurrenceTemplate` em passagem única
  (nenhum valor é lido de novo, então `{{` de cliente sai literal); `{{linhasItens}}` rende cada linha com o
  modelo do tipo ou o padrão, na ordem, com teto de 200 e "e mais N itens"; `valorNota` formatado a partir do
  `numeric` cru (D4); `quantidadeItem` da linha = quantidade da ocorrência, senão a da NF-e (D5);
  `unknownTemplatePlaceholders({ template, context })` com a lista do contexto.
- `src/trips/presentation/occurrence.schema.ts`: os dois chamadores de `unknownTemplatePlaceholders` passam o
  contexto (`body` no corpo, `subject` no assunto) — consequência do contrato novo; o restante do cadastro
  (campos novos, linha de item) é a T4.1.
- Nenhum nome de tipo nem de contratante no código (contrato de parede confere `SPANI` e "devolução").

Verde:

```text
$ bun run typecheck (raiz)   → exit 0
$ bun --env-file=../../.env.test test --timeout 120000 (API, só contrato)
 10112 pass · 25 skip · 0 fail · Ran 10137 tests across 199 files
$ bun run lint (API)         → exit 0
$ bun run format:check (raiz) → All matched files use Prettier code style!
```

⚠️ Não rodei a integração (a fase é de domínio puro). `readOccurrenceTemplateValues` ainda não alimenta os
campos novos (T4.7), mas `valorNota` passa a sair formatado (`7.840,64`) e `quantidadeItem` formatado —
efeitos declarados D4/D5; testes de integração que afirmem o texto antigo, se existirem, serão pegos na T4.7.

### T3.6 — Mutações da T3.4 (cada uma vermelha, depois revertida)

Comando: `bun --env-file=../../.env.test test ./test/trip-occurrence.contract.test.ts --timeout 120000`
(de `apps/api-transportada`), filtrado para `(fail)` e o resumo. Linha de base verde: `552 pass · 0 fail`.
Cada mutação em `occurrence-template.policy.ts`, restaurada do original depois (`git status` limpo).

**M1 — aceitar marcador de linha no corpo** (`KNOWN_PLACEHOLDERS.body` ganha a lista da linha):

```text
(fail) marcador no contexto errado é recusado no cadastro (spec 247 CA04) > marcador de linha no corpo é recusado
 551 pass
 1 fail
```

**M2 — re-renderizar valor de item** (a linha renderizada passa uma segunda vez pelo mesmo resolvedor):

```text
(fail) o que veio do cliente nunca é interpretado como marcador (spec 247 plan) > `{{` na descrição do item sai literal
(fail) o que veio do cliente nunca é interpretado como marcador (spec 247 plan) > `{{` na observação, na razão social e no código sai literal
 550 pass
 2 fail
```

**M3 — manter `valorNota` cru** (`return values.totalValue`):

```text
(fail) o modelo do SAC sai exatamente como o SAC escreveu (spec 247 CA01) > corpo, com uma linha por item e as somas
(fail) o valor da nota sai em formato brasileiro, sem símbolo (spec 247 RF7, D4) > 7840.6400 vira 7.840,64, e `R$ {{valorNota}}` gravado continua certo
 550 pass
 2 fail
```

Revertidas todas, mesmo comando: `552 pass · 0 fail`.

## Fase 4 — API

### T4.1 — Cadastro do tipo: campos novos, 422 do valor pago e RF2

**Contrato e integração antes.** `test/trip-occurrence/declared-amount-type-write.contract.ts` (entrypoint
`trip-occurrence.contract.test.ts`, 21 casos) e `test/integration/occurrence-type-declared-amount-write.integration.ts`
(na lista `test:integration` do `package.json`, 6 casos, CA05 incluída) escritos antes do código. O contrato
ampliado de `template-key.contract.ts` passou a afirmar RF2 (a chave não zera assunto/corpo; o `email` do registro
só depende do assunto). Vermelho antes da implementação, de `apps/api-transportada`
(`bun --env-file=../../.env.test test --timeout 120000 ./test/trip-occurrence.contract.test.ts`, só a cauda foi
guardada):

```text
Expected constructor: [class OccurrenceTypeDeclaredAmountNeedsItemsError]
Received value: undefined
(fail) valor pago por item exige produtos, sobre o estado resultante (spec 247 RF1) > ligar o valor pago por item num tipo que já tem produtos desligados é 422
Expected: "assunto do SAC"
Received: ""
(fail) o aviso interno e o e-mail à contratante são independentes (spec 247 RF2, CA05) > salvar com email_template_key mantém assunto e corpo como vieram
 561 pass
 12 fail
```

**O que mudou** (tudo em `apps/api-transportada/src`):

- `trips/presentation/occurrence.schema.ts`: `declaredAmountMode|Scope|Label`, `referenceNumberMode|Label`,
  `emailItemLineTemplate` no corpo do `PUT` do tipo, **todos opcionais sem `default`** (ausente = "não mexa");
  rótulo aparado de 1 a 40; nas exceções, `referenceNumberMode` e `declaredAmountMode` nulos/opcionais
  (`overrideRequirementFields`). Marcadores conferidos por contexto em `occurrence-template-fields.schema.ts`
  (novo; compartilhado com a prévia): assunto, corpo e linha de item, cada um com a sua lista.
- `trips/domain/occurrence-declared-amount-shape.policy.ts` (novo): `assertDeclaredAmountHasItems` — inválido é
  `declared_amount_mode <> 'off' AND declared_amount_scope = 'item' AND items_mode = 'off'` (os três termos),
  lido sobre o estado **resultante** (campo ausente lê o gravado; sem gravado, os padrões das colunas).
- `trips/application/save-occurrence-type.use-case.ts`: chama a guarda; **não zera mais assunto/corpo** com
  `email_template_key` (RF2); o estado gravado também é lido quando algum campo novo vem ausente.
  `save-occurrence-type-values.mapper.ts` repassa os seis campos novos.
- `trips/infrastructure/delivery-proof-read.support.ts`: `findOccurrenceType`, `listOccurrenceTypes` e o retorno de
  `writeOccurrenceTypeRow` devolvem os campos novos; INSERT usa o padrão da coluna e UPDATE **omite** o campo
  ausente (os três estados). A tradução da CHECK `company_occurrence_types_declared_amount_items_check` para o
  mesmo 422 já existia (Fase 2) e a corrida é coberta por teste de integração.
- `occurrence-override-requirement-columns.support.ts` + `drizzle-occurrence-attachment-overrides.repository.ts`: os
  dois modos novos nas exceções — ausente → `null` no INSERT e "não mexa" no UPDATE; nulo herda; valor grava;
  lidos nas listas por tipo e em lote.
- `register-trip-occurrence.use-case.ts` (`renderEmail`): deixou de pular o modelo próprio quando há
  `emailTemplateKey` (RF2 do `spec.md`; efeito declarado: tipo com chave **e** assunto passa a devolver o e-mail
  montado no registro).

**Gates (de `apps/api-transportada`, salvo indicação):**

```text
$ bun run typecheck (raiz) → 7 × tsc --noEmit, sem saída (verde)
$ bun run lint (API)       → eslint ... --max-warnings=0, sem saída (verde)
$ bun run format:check (raiz) → All matched files use Prettier code style!
$ bun --env-file=../../.env.test test --timeout 120000          (contrato)
 10141 pass · 25 skip · 0 fail · Ran 10166 tests across 199 files. [127.57s]
$ DATABASE_URL=postgres://postgres@127.0.0.1:56247/postgres bun --env-file=../../.env.test test --timeout 120000 \
    ./test/integration/occurrence-type-declared-amount-write.integration.ts ./test/integration/occurrence-automatic-mail.integration.ts \
    ./test/integration/occurrence-type-items-mode.integration.ts ./test/integration/occurrence-type-minimum-counts.integration.ts \
    ./test/integration/occurrence-declared-amount.integration.ts
 24 pass · 0 fail · Ran 24 tests across 5 files. [62.31s]
```

Banco da integração: Postgres 18 **nativo descartável** na porta 56247 (initdb no scratchpad), `DATABASE_URL`
por variável de ambiente; nada de staging, produção nem do 65432.

⚠️ `bun run test` (o script, que não leva `--timeout 120000`) falha 9 testes de
`toll booth catalog repository (spec 154)` por **timeout de 5 s** — contra o banco do `.env.test` (infra de E2E,
inalcançável aqui), não contra o código desta task; o comando de contrato desta spec (com `--timeout 120000`) fecha
verde como acima.

### T4.2 — Mutação da CA05: devolver `emailBody: ''` no save

Em `save-occurrence-type.use-case.ts`, o último `return input.save(values)` virou
`return input.save({ ...values, emailBody: '' })`. Duas rodadas, as duas vermelhas:

```text
=== CONTRACT (mutation: emailBody '') ===
Expected: "corpo digitado"
Received: ""
(fail) gravação do tipo com template do módulo > key válida grava a key e mantém assunto/corpo — são dois canais (spec 247 RF2)
Expected: "corpo do SAC"
Received: ""
(fail) o aviso interno e o e-mail à contratante são independentes (spec 247 RF2, CA05) > salvar com email_template_key mantém assunto e corpo como vieram
 571 pass
 2 fail
=== INTEGRATION (mutation) ===
error: expect(received).toMatchObject(expected)
(fail) o aviso interno e o e-mail à contratante são independentes (spec 247 RF2, CA05) > salvar o tipo com email_template_key mantém assunto e corpo, e o aviso automático sai com eles
 5 pass
 1 fail
```

Revertido (arquivo restaurado do original; `git diff` mostra só a mudança da T4.1): contrato `573 pass · 0 fail`,
integração `6 pass · 0 fail`.

### T4.3 — `POST /company-settings/occurrence-types/email-preview`

**O que há** (`apps/api-transportada/src/trips`): `presentation/occurrence-type-email-preview.routes.ts` (rota,
`settings.manage`, teto **em memória** de 60/min — o mesmo desenho da prévia de modelos de e-mail da contratante;
um teto no Postgres obrigaria a entrar na lista de `rate-limited-routes.contract.test.ts`, e a rota não toca o
banco nem tem custo externo), `presentation/occurrence-type-email-preview.schema.ts` (corpo `strict()` com
`emailSubject`, `emailBody` e `emailItemLineTemplate`, conferidos pelas **mesmas** listas de marcadores do cadastro)
e `domain/occurrence-template-preview.policy.ts` (dados de exemplo **fixos** — contratante, razão social, número,
duas linhas de item — e a chamada a `renderOccurrenceTemplate`, a função de `renderEmail` do registro). Resposta
200 no envelope `{ data: { subject, body } }`; corpo inválido 400; `companyId` não é aceito no corpo (`strict`).
Ligada em `main.ts` junto das demais rotas do módulo.

**Contrato** (`test/trip-occurrence/occurrence-type-email-preview.contract.ts`, 8 casos, no entrypoint): roteador
**real** com `AuthorizationService` — sem `settings.manage` (lista vazia e só `trip.manage`) é 403 `FORBIDDEN`;
com a permissão, o modelo do SAC sai exatamente (`NFD 45029 – R$ 117,19`, `1FD`, `3CX`, `VALOR DA ENTREGA: R$
7.840,64`: `57,20 + round(3 × 19,995) = 57,20 + 59,99`); o endereço fixo não é lido como `:occurrenceTypeId`;
marcador desconhecido, de linha no corpo, `{{linhasItens}}` no assunto e na linha, linha com 401 caracteres e
`companyId` no corpo são 400. **Prova de que a prévia é a mesma função:** seis modelos (vazio, SAC, espaços dentro
das chaves, marcadores legados, os de linha, mistura) comparados com `renderOccurrenceTemplate` sobre os mesmos
dados — mais as mutações abaixo, porque igualdade de saída sozinha não impede uma reimplementação que coincida.

**Mutações** (vermelhas, depois revertidas):

```text
=== MUTATION A: prévia com substituição própria (regex só de {{contratante}}) em vez de renderOccurrenceTemplate ===
(fail) a rota da prévia do e-mail do tipo (spec 247 RF4) > com settings.manage responde 200 no envelope { data: { subject, body } }
(fail) a prévia é a função do envio, com dados de exemplo fixos (spec 247 RF4) > devolve exatamente o que renderOccurrenceTemplate devolve para os mesmos dados
(fail) a prévia é a função do envio, com dados de exemplo fixos (spec 247 RF4) > a linha de item é a do corpo da requisição, e vazia usa a linha padrão
 578 pass
 3 fail
=== MUTATION B: permissão da rota trocada para trip.manage ===
(fail) a rota da prévia do e-mail do tipo (spec 247 RF4) > exige settings.manage e tem teto em memória
(fail) a rota da prévia do e-mail do tipo (spec 247 RF4) > sem settings.manage é 403, mesmo com outra permissão da empresa
(fail) ... > com settings.manage responde 200 ... · o endereço fixo ... · marcador desconhecido ... (5 falhas no total)
 576 pass
 5 fail
=== REVERTIDAS ===
 581 pass
 0 fail
```

⚠️ **Não existe documento OpenAPI/Scalar neste repositório** (`grep -ril openapi|scalar` em `apps/api-transportada`
não acha nada): a tabela de rotas é o código (`defineRoute`), então não há documento gerado a que a rota nova
precise entrar nem teste "toda rota aparece no documento" a manter verde. O teste existente que lista os arquivos
com `store: 'postgres'` (`rate-limited-routes`) segue verde, porque a rota nova usa o balde em memória.
