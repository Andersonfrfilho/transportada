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

### Fechamento das T4.1–T4.3 — integração completa

A integração completa (202 arquivos da lista `test:integration`) foi rodada em **quatro lotes em primeiro plano**
(o teto de uma chamada em primeiro plano é de 10 min e a suíte leva ~14), todos com
`DATABASE_URL=postgres://postgres@127.0.0.1:56247/postgres` (Postgres 18 nativo descartável) e
`bun --env-file=../../.env.test test --timeout 120000 <arquivos>` de `apps/api-transportada`:

```text
lote 1 (51 arquivos): 362 pass · 0 fail   [324.43s]
lote 2 (51 arquivos): 197 pass · 3 skip · 0 fail   [165.69s]
lote 3 (51 arquivos): 238 pass · 0 fail   [183.90s]
lote 4 (49 arquivos): 184 pass · 1 skip · 1 fail   [172.70s]
(fail) exceções de exigência em lote (spec 246 T5.3-api, RF11c) > agrupa por tipo, inclui o inativo e o tipo sem exceção, e não vaza para outra empresa
```

A falha era legítima e vinha desta fase: `occurrence-attachment-overrides-batch.integration.ts` esperava, por
`toEqual`, as exceções lidas **sem** os dois modos novos; a leitura passou a devolver
`declaredAmountMode: null` e `referenceNumberMode: null` (RF1, D8). Corrigido o teste (e só ele); reexecutado com
os dois vizinhos de exceção:

```text
$ bun ... test ./test/integration/occurrence-attachment-overrides-batch.integration.ts \
    ./test/integration/occurrence-override-minimum-shape.integration.ts ./test/integration/occurrence-type-requirement-modes.integration.ts
 5 pass · 0 fail
```

Os 25 `skip` do contrato (rodado sem `DATABASE_URL`) e os 4 da integração não foram investigados um a um nesta
fase; nenhum é teste novo desta fase.

## T4.4 🧠 — registro do motorista com itens, número e valor pago (2026-10-07)

Contrato do `architect` (opus) aplicado; onde divergiu do plan/spec, ele prevaleceu. Diagnóstico confirmado no
código: o registro do motorista é `register-driver-occurrence.use-case.ts` + `driver-occurrence-assessment.service.ts`
(não o `register-trip-occurrence`, que é o galpão), e antes desta task ele aceitava um `productCode`, não conferia
`allowsMultipleItems` e **não gravava linha** em `trip_document_occurrence_products`.

**O que mudou** (`apps/api-transportada/src`):

- `shared/money.constant.ts`: `DECLARED_AMOUNT_DECIMAL` (até 2 casas; `MONEY_DECIMAL` exige 4 e recusaria `"50"`).
- `trips/domain/occurrence-requirements.policy.ts` (resolvedor **único**): `referenceNumberMode` e
  `declaredAmountMode` por `resolveMode` (exceção do contratante/destinatário vale); `declaredAmountScope` e os dois
  rótulos só do tipo (D8), camada `type` em `sources`. `OccurrenceCoreRequirements` = os seis da 246.
- `trips/domain/occurrence-declared-amount-target.policy.ts` (novo, puro): `resolveDeclaredAmountTarget`.
- `trips/domain/occurrence-product-pricing.policy.ts` (novo, puro): `resolveDocumentProductPricing` — por código,
  `unitValue` da linha de menor `ordinal`, `hasVaryingUnitValue`, `totalQuantity` (soma), `commercialUnit`. Em
  `bigint` (`parseScaledDecimal`/`formatScaledDecimal`, exportados de `occurrence-amount.policy.ts`). A T4.6 reaproveita.
- `trips/domain/driver-occurrence-items.policy.ts` (novo): código fora da nota (422) → item único (422) → quantidade
  acima da soma da nota (`400 OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT`, novo).
- `trips/domain/occurrence-requirement-guard.policy.ts`: depois de observação, foto e assinatura —
  `TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED` e `TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED` (422), com
  `details[].field` = `referenceNumber` | `declaredAmount` | `items[i].declaredAmount`; preço que varia na nota exige
  o valor da linha com modo ≠ `off`.
- `trips/presentation/occurrence.schema.ts`: `items`, `referenceNumber`, `declaredAmount` opcionais no `.strict()`;
  `refineItemSelection` (`ITEM_SELECTION_CONFLICT`, `ITEM_DUPLICATED`, `DECLARED_AMOUNT_SELECTION_CONFLICT`). Item
  `.strict()` — `unitValue`/`quantityUnit` no corpo é 400.
- `assessment` + `use-case` + `drizzle-driver-field-report.repository.ts`: uma consulta a `listDocumentProducts`;
  linhas `{ productCode, position, quantity, quantity_unit = uCom, unit_value = vUnCom, declared_amount }` gravadas
  **dentro** do `perform` (mesma transação da chave); a resposta é relida do banco (`findDocumentOccurrenceById`),
  igual à do reenvio: `referenceNumber`, `declaredAmount`, `items[]`.
- `whatsapp-commands/application/driver-occurrence-refusal.service.ts`: as três recusas novas → "Registre pelo aplicativo."

**Decisões locais registradas:**

1. **O tipo publicado ao painel continua com os seis campos da 246.** O painel recusa chave desconhecida em
   `fieldOccurrenceTypesFromApi` (`tripResponse.validation.ts:1491`, `hasKeys`) e na verificação
   (`settingsResolution.service.ts`). Por isso `FieldOccurrenceType` e a resposta da verificação usam
   `pickCoreRequirements`/`pickSources`; a exigência inteira sai por `FieldOccurrenceTypeResolution.requirements`,
   que só o servidor lê. **Expor os modos novos no snapshot (T4.6) exige antes o painel tolerá-los nesses dois
   parsers** (a T1.1 cobriu só `/company-settings/occurrence-types`).
2. Sem `items`, o contrato anterior (`productCode`) segue byte a byte — inclusive sem gravar linha. O alvo do valor
   pago para ele é `occurrence` (zero linhas).
3. O mínimo de produtos com `items` conta códigos distintos da nota (`pricing.size`); nota com código repetido
   tornaria "todos os itens" impossível se contasse linhas.
4. O driver Bun devolve o zero do `numeric` como `'0'` (sem casas); os demais valores saem com a escala do banco
   (`'150.5000'`). O teste aceita as duas grafias do zero.
5. Spec corrigida (§ Casos extremos): "como hoje na 166" era falso — a 166 nunca comparou com a nota.

**Confirmado por teste:** os dois `select` de `listOverridesForTypes` trazem `referenceNumberMode` e
`declaredAmountMode` (mutação 3 abaixo); `findOccurrenceType` (`delivery-proof-read.support.ts`) traz os modos do
tipo — sem eles o caso "exigido e ausente" não recusaria.

### Vermelho antes do código (`c53b02605`)

```text
$ DATABASE_URL=postgres://postgres@127.0.0.1:56247/transportada_test \
  bun --env-file=../../.env.test test --timeout 120000 ./test/integration/driver-occurrence-items.integration.ts
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > exigido e ausente recusa; exceção de outro contratante não vale; a do contratante da nota afrouxa [1001.26ms]
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > preço forjado no valor pago é gravado como valor pago; unit_value e unidade saem da nota [951.33ms]
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > items_mode off da exceção leva o valor pago à ocorrência; itens enviados são recusados [1008.16ms]
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > nota inteira com produtos opcionais: o valor pago exigido é da ocorrência, e zero vale [954.72ms]
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > reenvio pela mesma chave devolve o mesmo corpo sem duplicar as linhas [951.36ms]
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > quantidade acima da soma da nota é 400; código repetido na nota soma e usa o menor ordinal [931.37ms]
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > código fora da nota e dois itens em tipo de item único são recusados [1113.36ms]
 1 pass
 7 fail
Ran 8 tests across 1 file. [8.20s]
```

(O "1 pass" é o caso da empresa B, que já era 409 antes.)

### Verde

```text
$ (mesmo comando)
 8 pass
 0 fail
Ran 8 tests across 1 file. [8.15s]
```

### Mutações (cada uma aplicada sozinha, rodada e revertida com `git checkout --`)

M1 — ler o modo do **tipo** em vez do efetivo (o guarda recebe `occurrenceType.referenceNumberMode/declaredAmountMode`):

```text
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > exigido e ausente recusa; exceção de outro contratante não vale; a do contratante da nota afrouxa [1019.80ms]
 7 pass
 1 fail
```

M2 — `unit_value` lido do payload (o preço forjado vai no campo aceito `items[].declaredAmount`):

```text
error: expect(received).toEqual(expected)
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > preço forjado no valor pago é gravado como valor pago; unit_value e unidade saem da nota [936.78ms]
error: expect(received).toBe(expected)
Expected: "10.0000"
Received: "22.0000"
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > quantidade acima da soma da nota é 400; código repetido na nota soma e usa o menor ordinal [951.11ms]
 6 pass
 2 fail
```

M3 — tirar `referenceNumberMode`/`declaredAmountMode` dos dois `select` de `listOverridesForTypes`:

```text
(fail) registro do motorista com itens, número e valor pago (spec 247 T4.4, CA06) > exigido e ausente recusa; exceção de outro contratante não vale; a do contratante da nota afrouxa [1029.74ms]
 7 pass
 1 fail
```

Depois das três: `git status --short` vazio.

### Gates

```text
$ bun run typecheck                      (raiz)  → tsc --noEmit ×3, sem erro
$ bun run lint                           (apps/api-transportada) → eslint --max-warnings=0, sem saída
$ bun --env-file=../../.env.test test --timeout 120000   (contrato, apps/api-transportada)
 10175 pass
 25 skip
 0 fail
 34072 expect() calls
Ran 10200 tests across 199 files. [42.60s]
```

Integração completa (206 arquivos da lista `test:integration`), quatro lotes em primeiro plano, Postgres 18 nativo
descartável (`127.0.0.1:56247`, diretório no scratchpad), `DATABASE_URL` por variável de ambiente:

```text
lote 1 (52 arquivos): 364 pass · 0 fail            [279.58s]
lote 2 (52 arquivos): 307 pass · 7 skip · 0 fail   [164.01s]
lote 3 (52 arquivos): 245 pass · 0 fail            [184.70s]
lote 4 (50 arquivos): 193 pass · 1 skip · 0 fail   [183.32s]
```

Os `skip` não são testes desta task (nenhum arquivo novo pula).

## T4.5 — CA03: só a configuração decide (2026-10-07)

Quatro tipos: dois com o **mesmo nome** e configuração diferente (a exigente, `required` em tudo, e a
desligada, escopo `occurrence`), e dois com **nomes diferentes** e a mesma configuração (`Prorrogação`
e `Devolução total`). Três arquivos novos, todos na lista explícita do `package.json`:

- contrato `test/trip-occurrence/configuration-decides.contract.ts` — `registerDriverOccurrence` com o
  dublê: exigência efetiva (número, valor pago, escopo, produtos), exceção do contratante da nota e do
  destinatário (o destinatário vence), exceção de outro contratante nunca vale, e o gravado, a soma
  (82,20 pago de 97,19) e o e-mail montado das linhas gravadas;
- integração `test/integration/occurrence-configuration-decides.integration.ts` — o mesmo, pelo caminho
  real (repositórios Drizzle, exceção lida do banco pela nota), o nome igual em duas empresas (o nome é
  único por empresa);
- parede `test/trip-occurrence/type-name-wall.contract.ts` + detector
  `test/fixtures/occurrence-type-name-branch.fixture.ts` — varre `src` das quatro apps (comentário
  fora) atrás de comparação de `.name`/`typeName` com literal, `switch` sobre o nome, `spani`, a palavra
  devolução/prorrogação como condição e nome de tipo do catálogo em literal. **A parede tem dentes:** o
  detector é provado contra 10 fontes que violam (acha) e 7 limpas (cala), e a lista dos 3 arquivos de
  dados semeados (catálogo de bootstrap e bancada local, que viram linha em `company_occurrence_types`)
  é conferida para não envelhecer. Nenhum `if` por nome nem constante por tipo foi encontrado no código
  existente; só esses 3 arquivos de seed carregam nome em literal.

Como a CA03 já valia no código (a exigência efetiva passa pelo resolvedor único), os testes nasceram
verdes: não houve correção de produção. O vermelho está nas mutações.

### Mutações (cada uma sozinha, rodada e revertida com `git checkout --`)

M1 — `if` pelo nome do tipo em `driver-occurrence-assessment.service.ts`
(`occurrenceType.name === 'Devolução parcial'` força `referenceNumberMode: 'required'`):

```text
contrato (trip-occurrence.contract.test.ts):  641 pass · 6 fail
(fail) nenhum código ramifica pelo nome do tipo nem por contratante específico (CA03) > apps/api-transportada/src: nada fora dos dados semeados
(fail) as quatro configurações: o nome do tipo não entra na exigência (CA03) > mesmo nome, configuração diferente: o desligado aceita onde o exigente recusa
(fail) as quatro configurações: o nome do tipo não entra na exigência (CA03) > produtos exigidos no tipo: sem item recusa; o tipo desligado aceita a nota inteira
(fail) a exceção da nota vale, e vale a efetiva — nunca o modo do tipo (CA03) > o contratante da nota afrouxa o tipo exigente; o de outra nota não
(fail) a exceção da nota vale, e vale a efetiva — nunca o modo do tipo (CA03) > a exceção endurece o tipo desligado, e o destinatário vence o contratante
(fail) a exceção da nota vale, e vale a efetiva — nunca o modo do tipo (CA03) > o contratante da nota vem do servidor: exceção de outro contratante nunca vale
integração (occurrence-configuration-decides): 0 pass · 3 fail
parede sozinha: 21 pass · 1 fail (src: nada fora dos dados semeados)
```

M2 — ler o modo do tipo em vez do efetivo (`resolve-document-occurrence-requirements.service.ts`
devolve `declaredAmountMode`/`referenceNumberMode` de `occurrenceType`, descartando a exceção):

```text
contrato:  644 pass · 3 fail
(fail) a exceção da nota vale, e vale a efetiva — nunca o modo do tipo (CA03) > o contratante da nota afrouxa o tipo exigente; o de outra nota não
(fail) a exceção da nota vale, e vale a efetiva — nunca o modo do tipo (CA03) > a mesma exceção em tipo de outro nome e mesma configuração dá o mesmo resultado
(fail) a exceção da nota vale, e vale a efetiva — nunca o modo do tipo (CA03) > a exceção endurece o tipo desligado, e o destinatário vence o contratante
integração:  2 pass · 1 fail
(fail) só a configuração decide, contra o banco (spec 247 T4.5, CA03) > a exceção do contratante da nota (lida do banco) vale; o modo do tipo não
```

Depois de cada uma: `git status --short` vazio, contrato 647 pass · 0 fail e integração 3 pass · 0 fail.

### Gates

```text
$ bun run typecheck                      (raiz)  → tsc --noEmit ×3, sem erro
$ bun run lint                           (apps/api-transportada) → eslint --max-warnings=0, sem saída
$ bun --env-file=../../.env.test test --timeout 120000   (contrato, apps/api-transportada)
 10207 pass
 25 skip
 0 fail
 34129 expect() calls
Ran 10232 tests across 199 files. [42.90s]
```

Integração completa (207 arquivos da lista `test:integration`), quatro lotes em primeiro plano, Postgres 18
nativo descartável (`127.0.0.1:56248`, diretório no scratchpad), `DATABASE_URL` por variável de ambiente:

```text
lote 1 (52 arquivos): 364 pass · 0 fail            [306.49s]
lote 2 (52 arquivos): 307 pass · 7 skip · 0 fail   [164.08s]
lote 3 (52 arquivos): 245 pass · 0 fail            [181.65s]
lote 4 (51 arquivos): 196 pass · 1 skip · 0 fail   [178.46s]
```

Os `skip` não são testes desta task (nenhum arquivo novo pula).

## T4.6 — snapshot do motorista com produtos por nota (2026-10-07)

**O que mudou** (`apps/api-transportada/src`):

- `trips/domain/driver-document-products.policy.ts` (novo, puro): `buildDriverDocumentProducts` — um item **por código**
  (`code`, `description`, `unit` = `uCom`, `quantity` = soma das linhas, `unitValue` da linha de menor ordinal,
  `hasVaryingUnitValue`), pela mesma `resolveDocumentProductPricing` do registro; `refineDeclaredAmountScopeForDocument`
  — o escopo `item` numa nota sem produto vira `occurrence` (`resolveDeclaredAmountTarget`).
- `trips/infrastructure/drizzle-current-driver-trip.repository.ts`: **uma** consulta a `nfe_products` para todas as notas
  de todas as viagens ativas do motorista (`listDocumentProducts`, `inArray` + `orderBy documentId, ordinal`), isolada do
  `Promise.all` com `.catch(() => null)` (refinamento; se falhar, a nota sai **sem** `products` e o app oferece a nota
  inteira). `products: []` é nota sem produto; ausente é leitura que falhou.
- `FieldOccurrenceType` (`list-field-occurrence-types.use-case.ts`) publica os cinco campos novos (`referenceNumberMode`,
  `referenceNumberLabel`, `declaredAmountMode`, `declaredAmountScope`, `declaredAmountLabel`); o escopo sai **efetivo**
  (`resolveDeclaredAmountTarget` com o `itemsMode` efetivo; o tipo não conhece a nota, então `lineCount: 1`, e a nota sem
  produto refina no snapshot). Os modos já vêm resolvidos por contratante/destinatário.
- `read-settings-resolution.use-case.ts`: a verificação passa a devolver os onze campos e a camada de cada um (o painel já
  os tolera desde a etapa 1b); antes publicava só os seis da 246.

**Parsers (fixtures reais, não escritas à mão).** A integração `driver-snapshot-products.integration.ts` serializa o
documento do snapshot contra Postgres e o compara com `test/fixtures/driver-snapshot-document.golden.json`; o contrato
`driver-snapshot-products.contract.ts` faz o mesmo com a verificação (`settings-resolution.golden.json`, saída real de
`readSettingsResolution`). Os JSONs são copiados para `frontend-driver/test/fixtures/` e `frontend-transportada/test/fixtures/`
(nenhuma app importa código de outra) e o contrato da API prova que as três cópias são **idênticas byte a byte**. Passam:
`toDriverTripSnapshot` do app do motorista (tipo efetivo preservado com os campos novos; `isDriverOccurrenceType` aceita),
`toDriverTripSnapshot`, `fieldOccurrenceTypesFromApi` e `isSettingsResolutionView` do painel.

⚠️ **Lacuna para a Fase 5, não corrigida aqui:** o parser do app do motorista (`driverTripResponse.validation.ts`,
`toDocument`) **ignora** `products` — a chave é tolerada (não quebra), mas não chega à tela. A T5.x do app precisa lê-la.

### Tamanho do snapshot (medido com fixture sintética; **a medição em staging NÃO foi feita** — sem acesso por credencial)

```text
300 itens, 1 nota (descrição de 120 caracteres, código longo): 76 201 bytes   (254 B por item)
50 itens típicos (descrição de ~35 caracteres):                   7 641 bytes   (153 B por item)
extrapolado, 40 notas × 50 itens típicos (1 viagem):            305 640 bytes
extrapolado, 3 notas de 300 itens:                               228 603 bytes
```

O contrato afirma `< 100 000` bytes para a nota de 300 itens. **A maior nota plausível cabe (76 KB), mas a viagem inteira
pode passar de 200 KB** quando tem dezenas de notas de dezenas de itens (extrapolação, não medida em dado real). O plano
manda paginar acima de 256 KiB por viagem; isso fica registrado como risco aberto para decisão, não resolvido nesta task.

### Vermelho antes do código

```text
$ bun --env-file=../../.env.test test --timeout 120000 ./test/trip-occurrence.contract.test.ts
error: Cannot find module '../../src/trips/domain/driver-document-products.policy.js' from '.../driver-snapshot-products.contract.ts'
 0 pass
 1 fail
 1 error
```

O contrato foi escrito e visto vermelho antes da política. A integração foi escrita junto do código: o vermelho dela é o
das mutações abaixo.

### Testes existentes alterados (e por quê)

- `test/fixtures/field-occurrence-type.fixture.ts` (`buildFieldOccurrenceType`): ganhou os cinco campos novos com os padrões do
  tipo (`off`, `item`, rótulos padrão). Os três testes de `field-catalog.contract.ts` comparam o tipo inteiro com `toEqual`; o tipo
  passou a publicar os campos, então a fixture espelha o que a API devolve.
- `test/integration/me-trip.integration.ts` ("o override de contratante muda o attachmentMode…"): as duas notas do cenário
  não têm `nfe_products`, e o escopo efetivo do valor pago da nota sem produto é `occurrence` — o teste esperava `item`.

### Mutações (cada uma sozinha, rodada e revertida; contrato + integração dos arquivos novos)

```text
M1 — uma consulta por nota (N+1) no lugar da consulta única:
(fail) ... > uma consulta aos produtos para a viagem inteira, com uma nota ou com várias
 661 pass · 1 fail
M2 — não refinar o escopo pela nota (a nota sem produto fica com `item`):
(fail) ... > o tipo efetivo leva os campos novos; nota sem produto e exceção sem Produtos levam o valor pago à ocorrência
 661 pass · 1 fail
M3 — publicar o escopo cru do tipo, sem o `itemsMode` efetivo:
(fail) o tipo efetivo do snapshot com os campos novos (spec 247 T4.6) > o escopo publicado é o efetivo: Produtos desligado pela exceção leva o valor pago à ocorrência
 661 pass · 1 fail
M4 — `products` fora do documento:
(fail) ... > a nota com produtos traz um item por código; a nota sem produto traz lista vazia
(fail) ... > o documento serializado é o JSON de referência que o painel e o app do motorista leem
 660 pass · 2 fail
base restaurada: 662 pass · 0 fail
```

### Gates

```text
$ bun run typecheck                      (raiz)  → tsc --noEmit ×4, sem erro
$ bun run lint                           (apps/api-transportada) → eslint --max-warnings=0, sem saída
$ bun run format:check                   (raiz)  → All matched files use Prettier code style!
$ bun --env-file=../../.env.test test --timeout 120000   (contrato, apps/api-transportada)
 10342 pass
 25 skip
 0 fail
Ran 10367 tests across 200 files. [43.71s]
$ bun run test (apps/frontend-driver)  → 1252 pass · 0 fail
$ bun run test (apps/frontend-transportada) → 7222 pass nas suítes · driver-trip 838 pass · 0 fail
```

Integração completa (208 arquivos da lista `test:integration`), quatro lotes em primeiro plano, Postgres 18 nativo
descartável (`127.0.0.1:56249`, diretório no scratchpad), `DATABASE_URL` por variável de ambiente:

```text
lote 1 (52 arquivos): 363 pass · 1 fail (me-trip, esperava `item`; corrigido e o arquivo passou sozinho: 21 pass)  [292.06s]
lote 2 (52 arquivos): 308 pass · 7 skip · 0 fail   [163.05s]
lote 3 (52 arquivos): 245 pass · 0 fail            [185.66s]
lote 4 (52 arquivos): 200 pass · 1 skip · 0 fail   [185.71s]
```

Os `skip` não são testes desta task (nenhum arquivo novo pula).

## T4.7 — o aviso automático e a prévia com os valores gravados (2026-10-07)

**O que mudou** (`apps/api-transportada/src`):

- `trips/domain/occurrence-template-lines.policy.ts` (novo, puro): `buildOccurrenceTemplateLines` monta as linhas do modelo
  do que o registro gravou (quantidade, unidade, `unit_value` copiado, valor pago) e do que a nota diz (descrição, quantidade
  da NF-e, `vProd` somado por código). Ordem por `position`; sem linha gravada, os códigos marcados viram linhas inteiras;
  código fora da nota é omitido.
- `trips/infrastructure/occurrence-template-source.query.ts` (novo): duas consultas por ocorrência registrada — número do
  documento do cliente, valor pago, formato da linha de item do tipo e as linhas de item.
- `readOccurrenceTemplateValues` (`delivery-proof-read.support.ts`): com `occurrenceId` preenche `lines`, `referenceNumber`,
  `declaredAmount`, `itemLineTemplate` e `documentNumber` (o número sem série, D6); a quantidade de `{{quantidadeItem}}` no
  corpo passa a ser a da ocorrência (D5) e `{{valorNota}}` já sai formatado pela política (D4). Sem `occurrenceId`, o
  comportamento é o anterior com a quantidade da NF-e.
- Chamadores: `createOccurrenceSuggestedMailReader` (prévia da ocorrência **e** aviso automático, que usa o mesmo leitor) e
  `registerTripOccurrence` (o `renderEmail` do galpão/escritório) passam o `occurrenceId`.

**CA01 e a CA03 estendida ao caminho real** (`test/integration/occurrence-template-values.integration.ts`, na lista do
`package.json`): o motorista registra pelo caminho de produção (`registerDriverOccurrence` + repositórios Drizzle) com itens,
número e valor pago; o aviso automático da 183 sai pelo envio real da 143. Assunto `OCORRÊNCIA: SPANI – NF 680481 – DEVOLUÇÃO
PARCIAL` e o corpo do SAC **exatos**, com `SPANI` de `contractors.display_name` da fixture, e a prévia
(`readSuggestedMail`) idêntica ao que foi persistido em `contractor_mail_messages`. Também: valor pago digitado vence
(`Pago 50,00 de 143,00`, soma da linha continua a calculada, quantidade `2,5` da ocorrência e não a `10` da NF-e); valor pago de
escopo `occurrence` em `{{valorDeclarado}}` com `{{linhasItens}}` vazio; e a CA03 — dois tipos de **mesmo nome** em empresas
diferentes com configuração diferente dão e-mails diferentes, e dois tipos de nomes diferentes com a mesma configuração dão
exatamente o mesmo `suggested` do `findPlan` (o que o envio usa).

### Vermelho antes do código

```text
$ DATABASE_URL=postgres://postgres@127.0.0.1:56249/transportada_test \
  bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-template-values.integration.ts
Expected: "OCORRÊNCIA: SPANI – NF 680481 – DEVOLUÇÃO PARCIAL"
Received: "OCORRÊNCIA: SPANI – NF  – DEVOLUÇÃO PARCIAL"
Expected: "Pago 50,00 de 143,00 – 2,5 – R$ 7.840,64"
Received: "Pago  de  – 10 – R$ 7.840,64"
 0 pass
 4 fail
```

(A primeira passada falhou por defeito da fixture — Produtos `required` sem mínimo; corrigida — e só então o vermelho acima, pelo
motivo certo: o número sem série vazio e a quantidade da NF-e.) O contrato das linhas nasceu vermelho por módulo ausente
(`occurrence-template-lines.policy.js`).

### Testes existentes

Nenhum teste existente afirmava o texto antigo de `valorNota` ou `quantidadeItem`: o contrato do renderizador já tinha sido
atualizado na T3.4/T3.5, e as integrações que montam `readTemplateValues` (`trip-detail-leaves-behind`, `trip-auto-dispatch`,
`whatsapp-operator-flow-actions`, `occurrence-configuration-decides`, `occurrence-type-moments-registration`,
`trip-occurrence-attachment`, `occurrence-automatic-mail`, `occurrence-conversation-mail`) passaram sem alteração (35 pass).
`test/trip-occurrence/product-codes.contract.ts` ganhou uma asserção: o leitor do modelo recebe o `occurrenceId` gravado.

### Mutações (cada uma sozinha, rodada e revertida; integração + contrato)

```text
M1 — quantidade da NF-e no lugar da gravada (`quantity: null`):                      3 fail (CA01, quantidade, contrato das linhas)
M2 — valor unitário da nota no lugar do copiado:                                     1 fail (contrato das linhas)
M3 — `occurrenceId` fora da leitura da prévia/aviso:                                 3 fail (as três da CA01)
M4 — formato da linha de item do tipo ignorado (`itemLineTemplate: undefined`):      1 fail (modelo do SAC)
M5 — valor pago da ocorrência ignorado (`declaredAmount: null`):                     1 fail (escopo occurrence)
M6 — número da nota sem série ignorado (`documentNumber: undefined`):                2 fail (modelo do SAC e CA03 pelo envio real)
M7 — `occurrenceId` fora do `renderEmail` do registro do escritório:                 1 fail (product-codes.contract)
base restaurada: 668 pass · 0 fail
```

### Gates

```text
$ bun run typecheck                      (raiz)  → tsc --noEmit ×4, sem erro
$ bun run lint                           (apps/api-transportada) → eslint --max-warnings=0, sem saída
$ bun run format:check                   (raiz)  → All matched files use Prettier code style!
$ bun --env-file=../../.env.test test --timeout 120000   (contrato, apps/api-transportada)
 10348 pass
 25 skip
 0 fail
Ran 10373 tests across 200 files. [42.76s]
```

Integração completa (209 arquivos da lista `test:integration`), quatro lotes em primeiro plano, Postgres 18 nativo
descartável (`127.0.0.1:56249`, diretório no scratchpad), `DATABASE_URL` por variável de ambiente:

```text
lote 1 (53 arquivos): 377 pass · 0 fail            [289.43s]
lote 2 (53 arquivos): 308 pass · 7 skip · 0 fail   [182.41s]
lote 3 (53 arquivos): 242 pass · 0 fail            [192.67s]
lote 4 (50 arquivos): 194 pass · 1 skip · 0 fail   [188.89s]
```

Os `skip` não são testes desta task (nenhum arquivo novo pula).
