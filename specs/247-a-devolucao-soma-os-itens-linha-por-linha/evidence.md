# Evidence

## Resumo executivo (T7.5, 2026-10-07)

**O que a spec entregou.** O tipo de ocorrência passa a configurar número do documento do cliente, valor pago (por linha ou pela
ocorrência) e o e-mail à contratante com linha de item; quem registra (motorista no app, operador na correção) marca itens, vê a soma de
cada linha e a geral, e o e-mail sai no padrão do SAC. Tudo é coluna do tipo, nada por nome de tipo (CA03 provada com mutação).

**Em staging (`origin/staging`):** Fases 0 a 4 — migration `20261007033420_occurrence_declared_amount`, API (registro do motorista, snapshot com
produtos, prévia, aviso automático, correção) e parsers tolerantes do painel e do app —, mais as correções de API da T7.2/T7.2b (R1, R2, N1, N2, N10).
**Fora de staging (45 commits locais em `work/spec-247-ui` antes desta consolidação):** todas as telas (aba Tipos, e-mail à contratante, correção, acerto da 164, app do
motorista), os rótulos de momento, o roteiro `docs/operacao/tipos-de-ocorrencia-do-sac.md`, as correções de frontend da T7.2/T7.2b, o contexto de IA e esta evidência.
Nada foi publicado nem implantado nesta rodada.

**Gates finais (T7.4, detalhe na seção "T7.4"):** typecheck, format, lint das 7 apps e builds das 7 apps: exit 0. Contrato da API 10493 pass · 25 skip · 0 fail;
integração da API 1171 pass · 1 skip · 0 fail em 6 lotes (216 arquivos, Postgres 18.4 descartável); `db:test` 141 pass; `db:generate` = `no_changes`; painel
7374 + 934 pass; app do motorista 1383 pass; portal 89; worker 1991; cron 101; landing 131. `make check` literal: exit 0.

**Duas revisões independentes (`code-reviewer`, `opus`).** 1ª: **reprovada** (app do motorista A3 + B1, painel A1/A2/M3, API M1/M2/M5 e acabamentos); corrigida em
"T7.2 — correções da revisão". 2ª: **aprovada com ressalvas**; N1, N2, N3, N4, N5, N7, N8, N9, N10, N11, N13 e N14 corrigidos (seções "T7.2b"). Os achados N6 e N12
da 2ª revisão não têm registro nesta evidência: conferir com o relatório da revisão antes de publicar.

**Decisões pendentes do usuário (não são fatos).** (1) O registro do motorista **não abre a tratativa da 164** (`saveDocumentOccurrence` não recebe `redeliveryPolicy`), então a
sugestão de acerto (RF12) só existe no galpão e no lote do escritório; abrir a tratativa na rua, ou aceitar que devolução de rua não tem acerto. (2) `previous_items` guarda só as
linhas: número e valor pago **da ocorrência** são sobrescritos sem rastro na correção; guardar exige duas colunas aditivas em `trip_document_occurrence_corrections`.

**Riscos abertos.** (a) M4: modelo antigo com `{{quantidadeItem}}` no corpo (fora de `{{linhasItens}}`) imprime as quantidades separadas por vírgula, que se confunde com decimal brasileiro
(`2,5`). (b) Snapshot acima de 256 KiB só **medido sintético** (76 KB para 300 itens; viagem inteira extrapolada acima de 256 KiB); a paginação do plano não foi feita nem medida em staging. (c) Login e fila
offline **reais** do motorista nunca foram exercitados (só arnês descartável e contrato). (d) T0.2 não medida em staging (sem credencial): quantos tipos têm `email_template_key` e `emails_contractor`
perdiam o e-mail antes da RF2. (e) Caso `requirements: null` por tipo inexistente coberto por contrato, sem integração. (f) `make smoke` e Playwright do repositório não rodaram sobre as telas novas.

**Correções desta consolidação.** Removidas a seção T6.1 solta (a que dizia `companies.settings`, permissão que não existe) e a cópia duplicada das seções T7.1, T7.2 painel e T7.2 motorista; contagens de linhas
e afirmações superadas (T4.8, T5.4) anotadas no próprio texto. As seções históricas seguem abaixo, sem outras mudanças.

---

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

`apps/api-transportada/src/trips/domain/occurrence-amount.policy.ts` (121 linhas na T3.2; 134 hoje): texto do `numeric` →
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

## T4.8 — a correção edita o número e os valores pagos (2026-10-07)

**O que mudou** (`apps/api-transportada/src`):

- `PATCH .../occurrences/:occurrenceId/items` aceita, além de `items[].{code, quantity, unit}`: `items[].declaredAmount`,
  `declaredAmount` (a ocorrência) e `referenceNumber`. **Três estados**: ausente mantém o gravado, `null` limpa, texto passa a
  valer (número vazio limpa). Número: `[A-Za-z0-9 ./-]`, até 30; valor: texto com até 2 casas, `>= 0` — o mesmo vocabulário do registro.
  `unitValue` e `quantityUnit` da nota no corpo são `400` (`strict`): o servidor nunca lê preço do payload.
- `trips/domain/occurrence-correction-values.policy.ts` (novo, puro): `buildCorrectedOccurrenceLines` (o `unit_value` de um
  código que já estava na ocorrência é o **copiado no registro**, o de um código novo sai da nota; teto de quantidade da nota, só
  na unidade da nota), `resolveCorrectedOccurrenceScalars` (os três estados; `'50'` e `'50.0000'` não são mudança) e
  `assertSingleDeclaredAmountLevel` (valor da ocorrência e de linha ao mesmo tempo é `400 DECLARED_AMOUNT_SELECTION_CONFLICT`, como no registro).
- `correct-occurrence-items.use-case.ts`: `previous_items` passa a guardar `{code, quantity, unit, unitValue, declaredAmount}`; o número e o valor da
  ocorrência são gravados quando mudam; mudança só de valor pago ou de número também conta como correção real (RF5). **A correção não manda e-mail.**
  `companyId` vem do contexto; ocorrência de outra empresa continua `404`.
- `occurrence-correction-read.query.ts`: a leitura **projeta** `previousItems` nas três chaves de sempre. O painel publicado recusa chave a mais em cada item
  (`isOccurrenceProduct` usa `hasExactKeys(['code','quantity','unit'])`); a API só passa a publicá-las depois de ele as tolerar (ADR-0081 §9).
- Fingerprint da idempotência (`buildOccurrenceCorrectionFingerprint`): sem os campos novos é a chave de sempre; com eles, ausente, nulo e texto dão chaves
  diferentes.

**Defeito antigo corrigido de passagem (necessário para editar linha do motorista):** a correção chamava `resolveOccurrenceItemQuantities` **sem** os
produtos da nota, então a unidade comercial da nota (`'CX'`, `'FD'` — a que o registro do motorista grava desde a T4.4 e a 172 aceita) era recusada com
`OCCURRENCE_ITEM_QUANTITY_UNIT_UNKNOWN`. Agora a correção passa os produtos, como o registro. Visto vermelho antes do código (abaixo).

### Limitações e decisões — para o architect

1. **O número e o valor pago da OCORRÊNCIA antigos não ficam no histórico.** `previous_items` é a única coluna da correção e é uma lista de linhas; guardar
   `reference_number` e `declared_amount` anteriores exige duas colunas aditivas em `trip_document_occurrence_corrections` (migration + `rollback.sql`), que
   o `plan.md` não prevê. Os valores **das linhas** estão no histórico; o número e o valor da ocorrência são sobrescritos sem rastro. Decisão: aceitar, ou autorizar a migration.
2. **A resposta da correção (`CorrectedOccurrenceView`) não ganhou `referenceNumber`/`declaredAmount`** — o mesmo motivo (painel com chaves exatas); fica para a tela (Fase 5), junto da tolerância.
3. **(Superado na T7.2b N1: `required` recusa a limpeza explícita; ausente mantém.)** A correção não cobra `required` do número nem do valor pago: o painel publicado não os envia, e cobrá-los travaria a correção de qualquer ocorrência antiga de um tipo que
   passou a exigi-los depois. A correção é o caminho de **completar** (D12), não de reprovar retroativamente.
4. O pass-through de `main.ts` (rota → caso de uso) não tem teste: a rota → `execute` está provada por contrato, o caso de uso por integração; a fiação entre os dois, em `main.ts`, só pelo typecheck (os campos são opcionais).

### Vermelho antes do código

```text
$ bun --env-file=../../.env.test test --timeout 120000 ./test/trip-occurrence.contract.test.ts
 0 pass · 1 fail · 1 error      (módulo `occurrence-correction-values.policy.js` ausente)
$ DATABASE_URL=postgres://postgres@127.0.0.1:56249/transportada_test \
  bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-correction-values.integration.ts
Expected: "OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT"
Received: "OCCURRENCE_ITEM_QUANTITY_UNIT_UNKNOWN"
 0 pass
 4 fail
```

### Testes existentes alterados (e por quê)

- `test/trip-occurrence/items-mode-guard.contract.ts`: o dublê da transação (`lockOccurrence`, `listCurrentItems`, `writeDeclaredValues`) passou a ter a forma nova da porta.
- `test/fixtures/document-product.fixture.ts`: a linha neutra ganhou `totalValue` — a porta devolve o produto inteiro da nota (a correção usa preço e unidade, não só código e descrição).

### Mutações (cada uma sozinha, rodada e revertida; integração + contrato)

```text
M1 — valor unitário sempre da nota (perde o copiado):                          2 fail (integração, contrato)
M2 — valor pago ausente apaga o gravado:                                       3 fail
M3 — previous_items só com as três chaves:                                     1 fail (integração)
M4 — leitura sem a projeção de três chaves (vaza ao painel):                   1 fail (integração)
M5 — correção sem os produtos da nota na validação da unidade:                 3 fail
M6 — número/valor sozinhos não contam como mudança:                            1 fail
M7 — item do corpo sem `strict` (preço da nota passa):                         2 fail (parse e rota)
M8 — sem o teto de quantidade da nota:                                         2 fail
M9 — nível único do valor pago não conferido:                                  1 fail
base restaurada: 684 pass · 0 fail
```

### Gates

```text
$ bun run typecheck                      (raiz)  → tsc --noEmit ×4, sem erro
$ bun run lint                           (apps/api-transportada) → eslint --max-warnings=0, sem saída
$ bun run format:check                   (raiz)  → All matched files use Prettier code style!
$ bun --env-file=../../.env.test test --timeout 120000   (contrato, apps/api-transportada)
 10364 pass
 25 skip
 0 fail
Ran 10389 tests across 200 files. [45.22s]
```

Integração completa (210 arquivos da lista `test:integration`), quatro lotes em primeiro plano, Postgres 18 nativo
descartável (`127.0.0.1:56249`, diretório no scratchpad), `DATABASE_URL` por variável de ambiente:

```text
lote 1 (53 arquivos): 377 pass · 0 fail            [293.04s]
lote 2 (53 arquivos): 308 pass · 7 skip · 0 fail   [173.67s]
lote 3 (53 arquivos): 242 pass · 0 fail            [182.32s]
lote 4 (51 arquivos): 198 pass · 1 skip · 0 fail   [184.54s]
```

Os `skip` não são testes desta task (nenhum arquivo novo pula). Sem migration nesta task: `make migration-test` não se aplica.

## Fase 5 — Telas do painel (etapa 3)

### T5.1 — Aba Tipos: número do documento do cliente e valor pago (2026-10-07)

**Contrato antes do código** (`apps/frontend-transportada/test/trip-hooks/occurrence-type-record-fields.contract.ts`,
15 casos, entra por `test/trip-hooks.contract.test.ts`): monta o `OccurrenceTypeCatalogPanel` de verdade e
**procura no controle** o que cada linha mostra (texto do gatilho do `Select`, valor do `input`, `role="alert"`).
Vermelho antes de qualquer arquivo de `src/`:

```text
$ bun test --preload ./test/trip-hooks/dom.preload.ts ./test/trip-hooks/occurrence-type-record-fields.contract.ts
 2 pass
 13 fail
Ran 15 tests across 1 file.
```

**O que a tela faz** (decisões sobre o desenho aprovado, `preview.html` 1054–1141 e 1210–1238):

- As duas linhas moram na seção "O que exige", abaixo da grade de Foto/Observação/Assinatura/Produtos, no
  **mesmo `Select` de três estados** (`OccurrenceRequirementModeSelect`, sem `Select` novo e sem tocar o CSS do
  `Select`). O nome do controle é fixo ("Número do documento do cliente", "Valor pago"); o **rótulo da tela de
  registro** é um `input` à parte (máx. 40, grava ao sair, vazio ou igual ao gravado volta sem gravar, como o nome do tipo).
- O valor pago ganha "Digitado": "Por linha de produto" · "Um só, pela ocorrência" (`declaredAmountScope`).
- Só aparecem as linhas que a API trouxe (`referenceNumberMode`/`declaredAmountMode` presentes) **e** que o momento
  cobra: nota ou escritório (`scope.recordFields`); parada sozinha e galpão não mostram nada.
- **Regra do 422 antecipada** (`hasDeclaredAmountWithoutItems`, predicado de três termos:
  `declaredAmountMode <> 'off' AND scope = 'item' AND itemsMode = 'off'`), avaliado sobre o estado **depois** da
  edição. A escolha inválida **não grava** e a linha do valor pago mostra `role="alert"` ligado ao grupo por
  `aria-describedby`: _"Valor pago por linha precisa de produtos…"_. O aviso some na edição válida seguinte ou quando
  o tipo é recarregado. Rede de segurança: o código estável `OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS` do servidor
  vira a mesma frase pelo alerta da aba (`trip.feedback.occurrenceTypeDeclaredAmountNeedsItems`).
- **Exceções (D8):** contratante e destinatário ganham as duas linhas, com o rótulo que o tipo deu ("Número da NFD"),
  "Igual ao tipo" (nulo herda); a exceção nova nasce com os **dois nulos explícitos**; rótulos e e-mail continuam do tipo
  (nota na lista).
- O `PUT` manda só o que a edição mudou (`undefined` é "não mexa"): `saveOccurrenceType` agora recebe
  `OccurrenceTypeSaveInput` (um só tipo, no lugar da cópia inline).

**Mutações do contrato** (cada uma vermelha, depois revertida; base restaurada → 15 pass):

```text
M1 — predicado de três termos arrancado (hasDeclaredAmountWithoutItems devolve sempre false):
     4 fail — "ligar o valor pago sem produtos não grava e diz por quê", "desligar Produtos com valor pago por linha...",
              "trocar o escopo para por linha...", "uma edição válida depois da recusa tira o aviso"
M2 — as linhas valem em qualquer momento (scope.recordFields sem olhar document/office):
     2 fail — "API sem os campos, tipo só de parada e tipo de galpão não oferecem as linhas",
              "tipo de parada e API sem os campos não mostram as duas linhas na exceção"
```

**Teste existente ajustado de propósito:** `test/trip/occurrence-exception-service.contract.ts` — a exceção nova passa
a nascer com sete nulos (os dois modos novos), não cinco.

**Gates:**

```text
$ bun run typecheck                                (raiz) → tsc --noEmit ×4, sem erro
$ bun run --cwd apps/frontend-transportada lint    → ✖ 16 problems (0 errors, 16 warnings)   [os 16 já existiam, em arquivos que esta task não tocou]
$ bun run format:check                             (raiz) → All matched files use Prettier code style!
$ bun run --cwd apps/frontend-transportada test
 7222 pass · 0 fail   Ran 7222 tests across 36 files.
 854 pass · 0 fail    Ran 854 tests across 1 file.   (test:hooks)
```

### T5.2 — Bloco "E-mail à contratante" e "Aviso interno" (2026-10-07)

**Contrato antes do código** (`test/trip-hooks/occurrence-type-contractor-mail.contract.ts`, 15 casos): monta a
linha do tipo (`OccurrenceTypeRow`) de verdade com o cliente dublado (`previewOccurrenceTypeEmail`), procura nos
controles o que cada um mostra e conta as chamadas à prévia. Vermelho antes de qualquer arquivo de `src/`:

```text
$ bun test --preload ./test/trip-hooks/dom.preload.ts ./test/trip-hooks/occurrence-type-contractor-mail.contract.ts
 0 pass
 15 fail
Ran 15 tests across 1 file.
```

**O que a tela faz** (`preview.html` 1143–1208 e 1242–1253):

- Bloco entre "O que exige" e "Aviso interno": interruptor `emailsContractor` ("Mandar e-mail à contratante da nota ao
  registrar", grava na hora), **Assunto**, **Corpo**, **Linha de cada produto** e a prévia ao lado (empilha abaixo de
  64rem). Só aparece quando a API manda `emailsContractor` (API anterior: nada que ela recusaria).
- Os três textos são **rascunho** (mesmo padrão dos momentos): nada grava a cada tecla; "Salvar e-mail" manda os três
  de uma vez e só liga com mudança e sem marcador errado; "Desfazer" volta ao gravado.
- **Marcadores por contexto** (`occurrenceMailTemplate.constant.ts`, cópia por valor da API, uma só declaração):
  o campo em foco decide a lista — assunto (15), corpo (15 + `{{linhasItens}}`), linha (15 + 4 de linha). O clique
  insere no cursor (ou no lugar da seleção), devolve o foco e o cursor ao campo, e não passa do teto do campo.
- **Marcador desconhecido** (mesmo recorte do servidor, `/\{\{\s*([a-zA-Z]+)\s*\}\}/`) fica **no próprio campo**:
  `aria-invalid`, aviso `role="alert"` ligado por `aria-describedby` nomeando o marcador (`{{numeroNfd}}`), Salvar
  travado e **nenhuma chamada à prévia**. Vale também para marcador de outro contexto (`{{linhasItens}}` na linha,
  `{{valorItem}}` no assunto — CA04).
- **Prévia = resposta do servidor** (`POST /company-settings/occurrence-types/email-preview`, `settings.manage`),
  sem segunda implementação no painel: cada texto assenta separado 400 ms depois da última tecla
  (`useDebouncedValue`), o anterior fica na tela enquanto o novo chega, falha diz "Não foi possível gerar a prévia" e
  não toca no que foi digitado. A nota diz se o e-mail sai sozinho, que sem assunto o automático não sai, e que
  `{{linhasItens}}` em tipo sem produtos sai vazio.
- **RF2 no painel:** o `PUT` sem `emailSubject`/`emailBody` grava texto vazio (default da API), então **toda** edição de
  um tipo existente leva os dois como estão; `emailItemLineTemplate` e `emailsContractor` só vão quando editados.
- **"Notificação" → "Aviso interno"**, com a dica corrigida visível (não mais só no tooltip): _"Aviso a quem
  despachou a viagem, pelo módulo de Notificações…"_; o motivo do desabilitado idem.

**Mutações do contrato** (cada uma vermelha, depois revertida; base restaurada → 15 pass):

```text
M1 — o save deixa de levar emailSubject/emailBody (RF2):
     2 fail — "o interruptor grava emailsContractor e leva assunto e corpo como estão",
              "uma edição que nada tem a ver com o e-mail também leva o assunto e o corpo gravados"
M2 — todo campo valida contra a lista do corpo (contexto ignorado):
     6 fail — salvar com marcador de linha, marcador errado, marcador de outro contexto e as três da prévia
```

**Testes existentes ajustados de propósito** (a edição de tipo agora leva assunto e corpo): `occurrence-type-update`,
`occurrence-type-row-edits`, `occurrence-type-items-mode-panel`, `occurrence-type-identity` (ordem: "Aviso interno").
Novos casos no contrato do cliente (`occurrence-requirement-catalog-client`): PUT só leva o e-mail quando informado;
prévia por POST em `/email-preview`; resposta sem assunto ou corpo é recusada.

**Fora do que a task pediu, deixado como estava:** o trecho "modelo próprio (legado)" dentro de "Aviso interno" (mostra
`emailSubject` de tipo sem chave) descreve agora o e-mail à contratante — vale uma revisão na T7.1.

**Gates:**

```text
$ bun run typecheck                                (raiz) → tsc --noEmit ×4, sem erro
$ bun run --cwd apps/frontend-transportada lint    → ✖ 16 problems (0 errors, 16 warnings)   [os mesmos 16 de antes, fora desta task]
$ bun run format:check                             (raiz) → All matched files use Prettier code style!
$ bun run --cwd apps/frontend-transportada test
 7226 pass · 0 fail   Ran 7226 tests across 36 files.
 869 pass · 0 fail    Ran 869 tests across 1 file.   (test:hooks)
```

### T5.4 — Correção com número e valores; acerto da 164 com sugestão (2026-10-07)

**Contratos antes do código** (todos vermelhos antes de qualquer arquivo de `src/`):

```text
test/trip/occurrence-amount-mirror.contract.ts        → Cannot find module '.../occurrenceAmount.service'   (os mesmos casos da política da API)

test/trip/occurrence-amount-mirror.contract.ts        → Cannot find module '.../occurrenceAmount.service'   (os mesmos 40 casos da API)

test/trip/occurrence-correction-amounts.contract.ts   → idem  (três estados, escopo, número)
test/trip/occurrence-settlement-suggestion.contract.ts→ idem  (RF12, zero nunca sugerido)
test/trip-hooks/occurrence-correction-amounts.contract.ts   → 0 pass · 9 fail   (formulário montado de verdade)
test/trip-hooks/occurrence-settlement-suggestion.contract.ts→ 2 pass · 4 fail   (painel de acerto montado de verdade; os 2 que passam são os "sem sugestão")
```

**A correção** (`TripOccurrenceCorrectionForm` + `OccurrenceCorrectionAmounts`): seção "Número e valor pago" com o número do
documento do cliente, "Digitado" (por linha de produto · um só pela ocorrência) e o valor pago de cada linha, com a máscara de
moeda pt-BR que o acerto já usa. **Três estados:** o campo que o operador não tocou não vai (a API mantém o gravado); digitado e
apagado vai `null` (limpa); texto vale. O corpo do `PATCH` só leva `referenceNumber`/`declaredAmount`/`items[].declaredAmount`
quando editados. **Nunca os dois níveis:** com itens escolhidos o escopo padrão é por linha e o campo da ocorrência some (e
vice-versa); "a nota inteira" só tem o da ocorrência — a recusa `DECLARED_AMOUNT_SELECTION_CONFLICT` do servidor também tem frase
própria. Dinheiro é sempre texto (`50.00`; `0.00` é valor, não vazio). Número fora de `[A-Za-z0-9 ./-]{1,30}` marca o campo
(`aria-invalid` + aviso) e trava o salvar. **Soma da linha como referência** (`Soma da linha: R$ 57,20`, `Soma geral: R$ 13,00`):
conta em inteiro sobre a nota carregada (`occurrenceAmount.service.ts`, **espelho** da política da API, provado pelos mesmos casos);
linha na unidade de fallback (caixa) não tem conta confiável e fica sem soma — e sem soma de uma linha não há soma geral.

**O acerto da 164** (`OccurrenceSettlementPanel` + `OccurrenceSettlementSuggestion`): enquanto o acerto não tem itens gravados e o
operador não digitou nada, o painel lista a "Sugestão pelo registro": o valor pago digitado (origem `manual`), senão a soma da
linha (origem `nfe`), com a soma da linha como referência. "Usar a sugestão do registro" **só preenche as linhas**; o operador
confirma ao salvar, e cada linha manda a própria `amountSource` (editar o valor sugerido a faz `manual`). **Linha com valor pago 0
não gera sugestão** — aparece à parte, "A loja não pagou, sem valor a acertar", com a soma visível — e **nada é preenchido com 0**
(a 164 exige `amount > 0`, `422 OCCURRENCE_SETTLEMENT_AMOUNT_INVALID`). Item sem dado da nota nem valor pago não ganha sugestão
inventada. Nenhuma regra da 164 mudou.

**Tolerância (ADR-0081 §9), antes de a API publicar:** `previousItems[]` aceita `unitValue` e `declaredAmount` opcionais; os itens
do detalhe aceitam `declaredAmount` opcional (o painel o usa para sugerir quando a API o publicar).

### ⚠️ Achado do architect, conferido no código: o registro do motorista NÃO abre a tratativa da 164

A tratativa só abre onde `saveTripOccurrence` recebe `redeliveryPolicy` (`delivery-proof-read.support.ts:621-628`,
`if (input.redeliveryPolicy !== undefined) openOccurrenceCase(...)`). Quem repassa a política são **dois** caminhos:
`register-trip-occurrence.use-case.ts:433-435` (registro do galpão/separação) e `office-occurrence-batch.service.ts:156-158` (lote do
escritório). O caminho do motorista — `register-driver-occurrence.use-case.ts:62` → `DrizzleDriverFieldReportRepository
.saveDocumentOccurrence` (`drizzle-driver-field-report.repository.ts:1164`) — **não tem nenhuma referência a `redeliveryPolicy`**:
a devolução registrada na rua pelo app **nasce sem tratativa**, qualquer que seja a política do tipo. Consequência para esta spec: o
fluxo que a 247 constrói (motorista registra itens + valor pago) nunca chega ao acerto da 164, e a sugestão da RF12 só aparece onde
já há tratativa (registro do galpão e lote do escritório). **Não inventei solução**: implementei a sugestão onde há tratativa e
deixo a decisão — abrir a tratativa também no registro do motorista, ou aceitar que devolução de rua não tem acerto — ao usuário.
A API não foi tocada.

### Limitações e o que fica para a API

1. **(Superado pela T7.2 R2/N2, API, e pelo painel na T7.2b: o detalhe publica `referenceNumber`, `declaredAmount`, `itemValues` e `requirements`.)** A leitura da API ainda não publica o que a correção grava (T4.8, limitação 2): o detalhe não traz o número do documento do
   cliente, o valor pago da ocorrência nem o das linhas, e a resposta da correção não os devolve. Por isso a seção abre **vazia**
   ("em branco mantém o gravado") em vez de pré-preenchida. Quando a API publicar, a tolerância já está no painel; falta só o
   pré-preenchimento (e mostrar o gravado no histórico de correções).
2. A sugestão do acerto só vê o valor pago digitado quando a API o publicar nos itens do detalhe; hoje ela sugere pela soma
   (`nfe`). O caso "valor pago 0 → sem sugestão" está provado no contrato com o campo presente.
3. A sugestão fica na página de detalhe da ocorrência (que conhece os itens); a linha expandida da lista segue com o acerto como era.
4. `OccurrenceSettlementPanel.component.tsx` já passava de 200 linhas (418) e agora tem 485 — a divisão fica para a T7.

### Mutações (cada uma vermelha, depois revertida; base restaurada: 2589 pass · 0 fail)

```text
M1 — valor pago zero deixa de ser "a loja não pagou":                 1 fail (contrato puro) + 4 fail (painel)
M2 — número não editado vira nulo (apagaria o gravado):               1 fail (contrato puro) + 1 fail (formulário)
M3 — o espelho trunca em vez de arredondar meio para cima:            6 fail (casos de CA02, inclusive 3 × 19,995)
```

## T5.3 — app do motorista (2026-10-07)

Ramo `work/spec-247-driver`, a partir de `origin/staging` `477e5f535`. Só `apps/frontend-driver`.

### O que mudou

- **Snapshot chega à tela.** `toDocument` (`driverTripResponse.validation.ts`) descartava `products`; agora lê `products` (ausente
  fica `undefined`, lista vazia fica vazia, item malformado some) e `hasVaryingUnitValue` (ausente é `false`). Parsado com o JSON de
  referência da API (`test/fixtures/driver-snapshot-document.golden.json`).
- **Espelho do cálculo.** `shared/occurrenceAmount.service.ts` (bigint, meio para cima por linha, soma das linhas já
  arredondadas, valor pago digitado vence). `test/driver-trip/occurrence-amount.contract.ts` roda os **mesmos 24 casos** do
  `occurrence-amount.contract.ts` da API, linha a linha, e o mesmo contrato de parede (sem `Number`/`parseFloat`/`Math`).
- **Decisão local, sem rede.** `occurrenceDraftValues.service.ts` avalia produtos marcados, quantidade (até 3 casas, > 0, não
  acima da nota), valor pago (por linha ou da ocorrência, conforme o escopo **efetivo**) e número do documento.
  `resolveDeclaredAmountTarget` espelha o do servidor: escopo `item` sem linha marcada, ou com Produtos `off`, cai na ocorrência;
  Produtos obrigatório sem nenhuma linha marcada espera as linhas. `required` bloqueia, `optional`/`off` não; preço que varia na
  nota (`hasVaryingUnitValue`) com valor pago ligado e escopo item exige o valor **naquela linha**; `"0"` é valor, vazio não é.
  Mínimo de produtos: `min(itemsMinimumCount ?? total, total)`, como `assertOccurrenceItemsRequirement` (nulo = todos os itens).
- **Corpo pela fila existente.** `items?: [{ productCode, quantity, declaredAmount? }]`, `referenceNumber?`, `declaredAmount?`,
  tudo `string`; o valor pago só vai no nível do escopo efetivo (nunca os dois — o servidor responde 400); nunca preço, unidade,
  contratante nem escopo (`.strict()`). O relato `documentOccurrence` guarda os três e o `send` os põe no corpo do `POST`.
- **Tela** (desenho de `preview.html`): `OccurrenceValuesSection` → `OccurrenceItemsField` (lista, caixa com rótulo-alvo de 44 px,
  quantidade na unidade da nota, valor pago da linha, conta da linha `1 UN × R$ 57,20 = R$ 57,20`, soma dos produtos e valor pago),
  campo da ocorrência e número do documento (rótulo e "obrigatório/opcional" do tipo). Ordem do formulário: produtos → valor pago
  da ocorrência → número → observação → foto → assinatura (a mesma da lista "Para registrar, falta: …"). Sem lista no snapshot,
  continua o chip "A nota inteira".
- **Recusa do servidor na fila** diz o campo: `TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED`, `TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED`
  (com `details[].field` = `items[N].declaredAmount` → "o valor pago de cada produto"), `OCCURRENCE_ITEM_QUANTITY_ABOVE_DOCUMENT`,
  `TRIP_OCCURRENCE_ITEMS_REQUIRED`/`_MINIMUM_NOT_MET` (`rejectionCauseLabel.service.ts`, pt e en).

### Desvios deliberados do protótipo

| Protótipo                                                               | Tela real                                                                             | Por quê                                                                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Valor pago da ocorrência sem "obrigatório/opcional" no rótulo           | com o sufixo, como a linha e o número                                                 | campo exigido sem aviso é só descoberto no botão desabilitado                                                  |
| `R$ 19,99` (centavos) como valor unitário na nota                       | `R$ 19,995` (2 a 4 casas, como a nota traz)                                           | a soma da linha parte de 19,995; arredondado, a conta que o motorista faz de cabeça não fecha                  |
| cobre puro no título do bloco e cinza/vermelho puros no apoio e no erro | misturados com o tom do texto                                                         | medido no tema claro: 4,03:1 / 4,26:1 / 4,14:1 (< 4,5); depois 5,5:1 ou mais nos dois temas                    |
| `<input type=checkbox>` visível de 20 px                                | caixa desenhada, `<input>` escondido do olho e não do leitor (padrão do `file-field`) | `test/shared/touch-target.contract.ts` recusa `height < 44px` em controle; o alvo é o rótulo inteiro (≥ 44 px) |

### Contratos (vermelho antes do código)

- `occurrence-amount.contract.ts` (24), `occurrence-values.contract.ts` (34: digitação, soma, escopo efetivo, exigências, ordem),
  `occurrence-values-queue.contract.ts` (7: gate do dispatch, relato, corpo do `POST` com o cliente de verdade),
  `occurrence-values-fields.contract.tsx` (17: marcação, rótulos ligados por `for`/`id`, somas na tela, erro por linha, motivo do botão,
  sem estilo em linha/`React.FC`/literal `R$` no TSX), `occurrence-rejection-cause.contract.ts` (4), mais os testes de `products` no
  `driverTripResponse.validation.contract.test.ts`. Todos na lista do `test/driver-trip.contract.test.ts`. Dois testes antigos mudaram
  de expectativa por motivo legítimo: a forma de `resolveOccurrenceRequirements`/`resolveOccurrenceFieldVisibility` ganhou as chaves
  novas (default `off`), e a ordem da lista de faltas passou a `produtos, … , observação, foto, assinatura`.

### Mutações

```text
base:                                                         55 pass · 0 fail (3 arquivos de valores)
M0 espelho: meio para cima → truncar (occurrenceAmount)        5 fail  (24 casos do espelho)
M1 dispatch sem os fatos de valores (gate de segunda trava)    1 fail
M2 escopo "item" ignora Produtos desligado                     sobrevivia → teste direto de resolveDeclaredAmountTarget → 1 fail
M3 valor pago "0" vira vazio                                   4 fail
M4 corpo manda `unitValue` do produto                          5 fail
M5 cliente descarta `items` do corpo                           1 fail
restaurado: 1340 pass · 0 fail (app inteira)
```

M2 ficou verde de primeira porque `evaluateOccurrenceValues` já zera as linhas marcadas com Produtos `off` antes de chamar a função;
o teste direto de `resolveDeclaredAmountTarget` fecha o buraco.

### Navegador (`motorista-api-demo` + Vite do worktree, porta 53200; verificado por texto)

⚠️ **Login real não foi usado.** A app do motorista não tem atalho de autenticação (ADR-0075 §7), a senha do `local-user` está só no
`.env` (o `.env.example` traz um valor de exemplo) e o contrato do projeto veda expor o `.env`. Em vez disso, um arnês descartável
(`harness247.html`, **apagado, não commitado**) montou o **`DriverOccurrenceRegistrationForm` real**, com o CSS e o i18n reais, sobre
o documento que o **parser real** leu do JSON da demo (`/me/trips/current`, com produtos e três tipos efetivos adicionados a
`scripts/driver-preview-api.ts`). Não passou por `DriverStopCard`/`DriverTripWorkspace` nem pelo IndexedDB e pela fila — isso fica para
o smoke e para o usuário.

- Tipo "Devolução parcial" (produtos obrigatórios, mínimo 1, valor pago obrigatório por linha, número obrigatório): título
  "PRODUTOS DEVOLVIDOS (OBRIGATÓRIO)"; botão desabilitado com "Para registrar, falta: a marcação dos produtos, “Número da NFD”.";
  marcados três produtos, falta "“Valor pago pela loja” de cada produto marcado"; digitação real (`3,5ab` → `3,5`, "A nota tem só 3 FD.",
  `aria-invalid`), depois `3`, `50,00`, `0`, `8,5` e `NFD 45029!ç` (→ `NFD 45029`): **soma dos produtos R$ 127,19**
  (59,99 + 57,20 + 10,00) e **valor pago R$ 58,50**; botão habilitado; o corpo que o relato leva:
  `items:[{declaredAmount:"50.00",productCode:"2073170",quantity:"3"},{declaredAmount:"0",…},{declaredAmount:"8.5",…}]`,
  `referenceNumber:"NFD 45029"`, `productCode:""`, nenhum preço/unidade.
- Tipo "Avaria na descarga" (escopo da ocorrência, opcional, Produtos opcional, observação obrigatória): linhas sem campo de valor,
  "Valor pago · opcional" e "Número do documento do cliente · opcional" abaixo da soma; marcar um produto mantém o valor na ocorrência
  (soma R$ 57,20). "Cliente ausente" (tudo `off`): nenhum campo novo.
- Geometria (`scrollWidth`/`clientWidth`, elementos fora da janela, alvo < 44 px, recortes), três larguras:

| Largura | scrollWidth / clientWidth | fora da janela | alvo < 44 px | margem esq./dir. |
| ------- | ------------------------- | -------------- | ------------ | ---------------- |
| 375     | 375 / 375                 | 0              | 0            | 16 px / 16 px    |
| 768     | 768 / 768                 | 0              | 0            | —                |
| 1280    | 1280 / 1280               | 0              | 0            | —                |

- Contraste (menor razão entre os textos do bloco, canvas + composição de camadas): tema escuro 5,69:1; tema claro 5,55:1 (antes
  4,03–4,26:1, corrigido). O campo de "Quantidade" e o de "Valor pago" lado a lado ficavam com alturas diferentes (55 × 46 px, a grade
  esticava a linha do campo): `align-content: start`.
- Uma captura (375 px, tema escuro) como prova final ao usuário.

### O que NÃO foi rodado

- Smoke Playwright (`bun run --cwd apps/frontend-driver smoke`): exige Keycloak real e o build do smoke; não foi tentado.
- Fluxo completo pela fila offline real no navegador (IndexedDB, drenagem, `POST` na API de staging): coberto só por contrato
  (`occurrence-values-queue.contract.ts` usa o cliente HTTP de verdade com `fetch` dublê).
- Revisão de design lado a lado com o `preview.html` em 768 e 1280 (T7.1 é outra task).

### Gates

```text
$ bun run typecheck                                (raiz) → tsc --noEmit ×4, sem erro
$ bun run --cwd apps/frontend-transportada lint    → ✖ 16 problems (0 errors, 16 warnings)   [os mesmos 16 de antes]
$ bun run format:check                             (raiz) → All matched files use Prettier code style!
$ bun run --cwd apps/frontend-transportada test
 7269 pass · 0 fail   Ran 7269 tests across 36 files.
 884 pass · 0 fail    Ran 884 tests across 1 file.   (test:hooks)
```

### T5.5 — Rótulos de momento e dicas (2026-10-07)

**Contrato antes do código** (`test/trip-hooks/occurrence-type-moment-labels.contract.ts`, 7 casos): monta a aba Tipos de verdade
e **procura o rótulo no controle** — não a chave de tradução, não o texto da fonte. Vermelho antes do código:

```text
$ bun test --preload ./test/trip-hooks/dom.preload.ts ./test/trip-hooks/occurrence-type-moment-labels.contract.ts
 0 pass
 7 fail
Ran 7 tests across 1 file.
```

**O que a tela diz agora** (plan § Rótulos, D10; só texto, os valores gravados `separation`/`document`/`stop`/`office` não mudam):

| Onde                 | Antes                         | Agora                                                                                                           |
| -------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Título do controle   | Em que momento pode acontecer | **Quem registra, e onde**                                                                                       |
| `separation`         | Separação no galpão           | **Separador, no galpão**                                                                                        |
| `document`           | Entrega da nota               | **Motorista, numa nota**                                                                                        |
| `stop`               | Chegada à parada              | **Motorista, na parada**                                                                                        |
| `office`             | Escritório, pelo motorista    | Escritório, pelo motorista (e o **filtro** passa a dizer o mesmo, não "Escritório")                             |
| Dica de cada momento | —                             | o exemplo do `preview.html`, **à vista** abaixo do controle (`<dl>`), no tipo aberto e no cadastro do tipo novo |

- **Uma chave só:** o controle do tipo aberto, as pílulas, a linha recolhida, o cadastro do tipo novo **e o filtro** leem
  `occurrenceTypeCatalog.moments.labels`; as quatro chaves duplicadas de `filters.chips.moment` foram apagadas (pt e en), então os
  nomes não têm como divergir.
- Os textos que falavam em "entrega da nota" / "chegada à parada" seguem o vocabulário novo: nota de exigência de tipo misto, nota de
  parada, recusa de momentos juntos (aba e `trip.feedback`) — nos dois idiomas.
- **Dica fora do `MultiSelect` de propósito:** `description` da opção viraria o valor da pílula selecionada (`multi-select.tsx:139`) e
  poluiria cada pílula com uma frase; `MultiSelect` é componente compartilhado e não foi tocado.
- **Testes existentes ajustados** só no texto dos rótulos: `occurrence-exceptions-panel`, `occurrence-type-create-form`,
  `occurrence-type-filters-panel`, `occurrence-type-identity`, `occurrence-type-moment-scope`.

**Mutações do contrato** (cada uma vermelha, depois revertida; base restaurada → 7 pass):

```text
M1 — a chave única volta a dizer "Entrega da nota":                   5 fail (controle, dica, linha recolhida, filtro, cadastro novo)
M2 — o filtro volta a ler a própria chave (apagada):                   1 fail (pílulas do filtro)
M3 — a dica de cada momento some do bloco do tipo aberto:              1 fail (o cadastro novo também tem dicas: o contrato olha dentro do bloco do tipo)
```

**Gates:**

```text
$ bun run typecheck                                (raiz) → tsc --noEmit ×4, sem erro
$ bun run --cwd apps/frontend-transportada lint    → ✖ 16 problems (0 errors, 16 warnings)   [os mesmos 16 de antes]
$ bun run format:check                             (raiz) → All matched files use Prettier code style!
$ bun run --cwd apps/frontend-transportada test
 7269 pass · 0 fail   Ran 7269 tests across 36 files.
 891 pass · 0 fail    Ran 891 tests across 1 file.   (test:hooks)
```

### Verificação no navegador (T5.1, T5.2, T5.4, T5.5) — 2026-10-07

**Como:** o painel **desta árvore** (`spec-247`, Vite 7 na porta **53010** — a 53000 e a 53001 são de **outra** árvore,
`reconcile-spec-145`, e ficaram intocadas), com `VITE_SMOKE_AUTH_BYPASS`, a API dublada por `page.route` (os endpoints novos do
tipo, a prévia, as exceções, o detalhe da ocorrência, a nota, o acerto) e Chromium headless do Playwright do repositório — **não** o
painel do navegador embutido do Claude. Verificação **por texto e geometria** (`innerText`, `getBoundingClientRect`, contraste
calculado sobre os fundos reais, `PUT`/`PATCH` capturados); um print só como prova. Os scripts ficam fora do repositório.

```text
Aba Tipos, tipo "Devolução parcial" aberto — estouro horizontal (scrollWidth − clientWidth), controles do bloco < 44 px, contraste mínimo
  375 px toque, claro   : 0 · nenhum · 4,69:1
  375 px toque, escuro  : 0 · nenhum · 5,55:1
  768 px fino,  claro   : 0 · 4 (38,4 px "Salvar e-mail" — Button sm do design system; 20 px "Tirar momento…" e 28 px "Limpar momentos" — MultiSelect compartilhado) · 4,69:1
  1280 px fino, claro   : 0 · os mesmos 4 · 4,69:1
  1280 px fino, escuro  : 0 · os mesmos 4 · 5,55:1
```

Os 4 abaixo de 44 px só existem com ponteiro fino e são controles do design system que esta spec não altera; com toque (375 px) nenhum
controle do bloco fica abaixo de 44 px. Nenhum elemento do bloco fica fora da janela em nenhuma largura.

Interações conferidas **no navegador**, com a API dublada gravando o corpo:

1. Salvar e-mail começa desabilitado; `{{numeroNfd}}` no corpo → `aria-invalid="true"` **só** no corpo, aviso _"Este marcador não existe neste campo: {{numeroNfd}}…"_,
   Salvar desabilitado e **zero chamadas à prévia** durante o erro (a prévia anterior fica, com "Corrija o marcador para ver a prévia").
2. Marcador clicado entra **no cursor** (`"Linha {{contratante}}1
Linha 2"`) e o foco volta ao campo; assunto tem 15 marcadores (sem `{{linhasItens}}`), a linha tem 19 (com
   `{{valorItem}}`, sem `{{linhasItens}}`).
3. `PUT` do "Salvar e-mail" leva `emailSubject`, `emailBody` e `emailItemLineTemplate`; o do interruptor leva `emailsContractor:false` **e o assunto/corpo já gravados** (RF2, sem zerar).
4. "Produtos: Desligado" com valor pago por linha ligado **não grava** (nenhum `PUT` novo) e mostra o aviso; o rótulo editado grava só `referenceNumberLabel`.
5. Correção (`/ocorrencias/:id` → Corrigir): seção "Número e valor pago" sem estouro a 375 e 1280 px, nenhum controle < 44 px; `3 × 19,995` mostra
   **Soma da linha: R$ 59,99**, `Soma geral: R$ 117,19`; digitar `5000` mostra `50,00`; o `PATCH` leva `referenceNumber:"NFD 45029"` e `declaredAmount:"50.00"` **só** na linha editada.
6. Acerto da 164 (tratativa `goods_paid`): "Sugestão pelo registro" lista `R$ 57,20 · soma da linha R$ 57,20` e _"A loja não pagou, sem valor a acertar · soma da linha R$ 59,99"_;
   "Usar a sugestão do registro" preenche **uma** linha (`57,20`, nunca 0) e o `PUT` leva `amountSource:"nfe"`.

⚠️ Um tropeço do dublê, não do produto: o primeiro stub devolvia o corpo do `PUT` com `occurrenceTypeId` no tipo e o painel — corretamente — recusou a
lista inteira (`isOccurrenceType` é de chaves fechadas) e seguiu mostrando o tipo antigo; corrigido o stub.

**O que não deu para fazer:** o desenho `preview.html` não foi posto **lado a lado** com a tela real (isso é a T7.1, com os mesmos dados nos três
tamanhos); o acerto foi verificado só no desktop e a 375 px por texto/geometria, sem o fluxo do app do motorista (T5.3, outro executor).

$ bun run typecheck (raiz) → tsc --noEmit ×7, sem erro
$ bun run --cwd apps/frontend-driver test → 1340 pass · 0 fail · 2948 expect() (4 arquivos de contrato)
$ bun run --cwd apps/frontend-driver lint → eslint ., sem saída
$ bun run format:check (raiz) → All matched files use Prettier code style!

```

Sem migration: `make migration-test` não se aplica. Sem push nem deploy.
```

---

## Fase 6 — Roteiro operacional

### T6.1 — Roteiro operacional (2026-10-07, reescrito após reprovação)

**Arquivo**: `docs/operacao/tipos-de-ocorrencia-do-sac.md`

**O que foi corrigido na reescrita** (a primeira versão foi reprovada na conferência):

1. **Erro de conteúdo grave**: a versão anterior mandava desligar o e-mail à contratante na Devolução total e dizia que o SAC não pediu e-mail automático. A spec (§ "Modelos do SAC") define o contrário: assunto `DEVOLUÇÃO TOTAL – NF {{numeroNotaSemSerie}}` e corpo com `Motivo: {{observacao}}`. O roteiro agora traz os passos de assunto, corpo, **Salvar e-mail**, ligar a caixa e conferir a prévia, e o resultado esperado do exemplo do SAC (NF 677002, FARMA LÍDER SANTA ISABEL LTDA, R$ 2.612,88; valores de exemplo). Diz que a Devolução total não usa linha de item (Produtos Desligado).
2. **Rótulos chutados**: todo nome de tela, bloco, campo e botão foi trocado pelo texto real do painel (tabela abaixo). Não há mais "ou" nem "se ainda não foi atualizado". A rota errada `/company-settings/occurrence-types` saiu: a aba é **Tipos** em **Ocorrências** (`/ocorrencias`), permissão `settings.manage` (a correção posterior que trocou por `companies.settings` estava errada: essa permissão não existe).
3. **Fluxo real**: renomear é editar o campo **Nome** do bloco **Identificação** do tipo aberto (grava ao Enter/sair do campo); criar é o bloco **Novo tipo** (nasce com o momento **Separador, no galpão**, que precisa ser trocado); o formulário de criação não tem número do documento, valor pago nem e-mail, então estes se configuram depois, no tipo aberto. Texto do e-mail grava só com **Salvar e-mail**; momentos só com **Aplicar momentos**.
4. **Campo a campo contra a spec**: parcial (momentos, Foto Obrigatório mínimo 1, Observação Obrigatório, Assinatura Desligado, Produtos Obrigatório "Ao menos N itens" com N=1 e **Aceita vários itens**, Número Obrigatório "Número da NFD", Valor pago Opcional "Por linha de produto" rótulo "Valor pago pela loja", e-mail ligado, assunto/corpo/linha exatos); total (foto como a parcial, Observação Obrigatório, Produtos Desligado, Número Opcional "Número da NFD", Valor pago Desligado, e-mail ligado). Ordem do **Valor pago** por linha documentada (exige Produtos ligado; a tela recusa sem gravar).
5. **Prévia**: os resultados esperados vieram de `renderOccurrenceEmailPreview` executado (dados fixos de `occurrence-template-preview.policy.ts`: "Contratante Exemplo", NF 123456, "Supermercado Exemplo Ltda", NFD 45029, soma 117,19), não escritos de memória. A prévia nunca mostra a NF 677002; o exemplo do SAC é o resultado numa nota real.
6. Mantidas: nota `{{numeroNotaSemSerie}}` vs `{{numeroNota}}`; zero à esquerda do "01FD"; decisão da spec de configurar/renomear "Recusa parcial/total" (id não muda); a Spani entra por `{{contratante}}`, nunca cravada; seção final da spec 248 sem instruções.

**Rótulos reais usados e arquivo de origem**:

| Rótulo na tela                                                                                                                                                                                                    | Origem                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Ocorrências (menu)                                                                                                                                                                                                | `src/modules/shared/workspaceNavigation.constant.ts:13`                                           |
| Tipos (aba)                                                                                                                                                                                                       | `trip/locales/trip.locale.json` `occurrenceFeed.tabs.types`                                       |
| No galpão · Na rua; Novo tipo; Nome do tipo; Cadastrar tipo; Avisar quando acontecer; Aceita vários itens; Modelo de e-mail; Sem e-mail                                                                           | `company-settings/locales/companySettings.locale.json` `occurrenceTypeCatalog.*`                  |
| Identificação; Nome; Devolução                                                                                                                                                                                    | `occurrenceTypeCatalog.identity.*`; `OccurrenceTypeIdentity.component.tsx`                        |
| Quem registra, e onde; Motorista, numa nota; Escritório, pelo motorista; Separador, no galpão; Tirar momento {{label}}; Aplicar momentos; Desfazer                                                                | `occurrenceTypeCatalog.moments.*`; `OccurrenceTypeMoments` e `OccurrenceTypeCreateMoments`        |
| O que exige; regra geral; Foto; Observação; Assinatura; Produtos; Número do documento do cliente; Valor pago; Desligado/Opcional/Obrigatório                                                                      | `occurrenceTypeCatalog.requirements.*`                                                            |
| Rótulo do número na tela de registro; Rótulo do valor na tela de registro; Digitado; Por linha de produto                                                                                                         | `requirements.record.*`; `OccurrenceTypeRecordFields.component.tsx`                               |
| Quantidade mínima de fotos; Produtos exigidos; Ao menos N itens; Quantidade mínima de produtos                                                                                                                    | `requirements.photoMinimum` e `requirements.itemsMinimum`; `OccurrenceTypeMinimums.component.tsx` |
| E-mail à contratante; Mandar e-mail à contratante da nota ao registrar; Assunto; Corpo; Linha de cada produto; Salvar e-mail; Desfazer; Prévia · dados de exemplo; Sai automaticamente quando o tipo é registrado | `occurrenceTypeCatalog.mail.*`; `OccurrenceTypeContractorMail.component.tsx`                      |
| Ordem dos blocos do tipo aberto; clique na linha para abrir                                                                                                                                                       | `OccurrenceTypeRow.component.tsx`, `OccurrenceTypeSummary.component.tsx`                          |
| Permissão `settings.manage`                                                                                                                                                                                       | `TripOccurrenceTypesTab.component.tsx` (comentário)                                               |

**Marcadores**: só os das listas fechadas de `apps/api-transportada/src/shared/occurrence-template.constant.ts`, por contexto: assunto (`contratante`, `numeroNotaSemSerie`), corpo (`numeroReferencia`, `valorDeclarado`, `razaoSocial`, `numeroNotaSemSerie`, `valorNota`, `observacao`, `linhasItens`), linha (`codigoItem`, `item`, `quantidadeItem`, `unidadeItem`, `observacao`).

**O que não foi conferido**: o roteiro não foi executado na tela (nenhum navegador aberto); os rótulos vêm da leitura do código e dos `locale.json`. O texto exato do motivo do SAC ("o cliente já havia recebido…") veio truncado na spec, então o exemplo usa "o cliente já havia recebido". A dica da tela em **Produtos exigidos** ainda diz que o app do motorista só marca "A nota inteira" e que "Ao menos N" não muda o que ele cobra; o `frontend-driver` hoje lê `itemsMinimumCount`, então a dica pode estar defasada (fora do escopo desta task). Não confirmei se o servidor aceita ligar o e-mail com assunto vazio, por isso o roteiro manda salvar os textos antes de ligar.

---

## T7.1 — preview x tela real (2026-10-07)

**Como.** Painel desta árvore (Vite 7, porta 53010, binário da app, `VITE_SMOKE_AUTH_BYPASS`, API dublada por `page.route`) e Chromium headless do Playwright do repositório; 375 px e 768 px **com toque** (`pointer: coarse`), 1280 px com ponteiro fino. O `preview.html` foi aberto por `file://` nos mesmos tamanhos, com os **mesmos dados** (NF 680481, três produtos, SPANI, "Número da NFD", "Valor pago pela loja"). Verificação por texto, geometria e contraste calculado (`getComputedStyle`, incluindo `color-mix`); prints só como prova, em `prints/t71-*` (`tipos`, `correcao`, `acerto`, `motorista`; `-real-` e `-preview-`, 375/768/1280).

⚠️ **Motorista: arnês descartável, login real não exercitado.** O app não tem atalho de autenticação (ADR-0075 §7) e a senha do `local-user` é do `.env`, que não se abre. Um arnês (apagado, nunca commitado) montou o `DriverOccurrenceRegistrationForm` **real**, com o CSS e o i18n reais, sobre o JSON de `/me/trips/current` da API de demo (porta 53901) lido pelo **parser real** (`toDriverTripSnapshot`); só os produtos e o tipo foram trocados no JSON para ficarem iguais aos do desenho. **Não foram exercitados:** login/Keycloak, `DriverStopCard`/`DriverTripWorkspace`, IndexedDB e fila offline, a moldura de página do app (as margens do arnês são 16 px e as do app real podem diferir), foto de câmera real (a foto do print é um PNG de 1 px esticado).

Servidores: painel (PID 77449, cwd `.../spec-247/apps/frontend-transportada`), Vite do motorista (77739) e demo (77737), ambos `.../spec-247/apps/frontend-driver`; as portas 53000/53001 (outra sessão) não foram tocadas. Encerrados por PID; portas livres.

### Tabela — elemento → preview → tela real → veredito

| #                                                                                              | Elemento                                                                                                                            | Preview                                                                                                                               | Tela real                                                                                                                                                       | Veredito                                                                                  |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **a. Painel — aba Tipos, tipo aberto**                                                         |                                                                                                                                     |                                                                                                                                       |                                                                                                                                                                 |                                                                                           |
| 1                                                                                              | Ordem dos blocos                                                                                                                    | Identificação · Momentos · O que exige · E-mail · Aviso interno · Exceções                                                            | a mesma (a prévia do e-mail fica dentro do bloco E-mail)                                                                                                        | OK                                                                                        |
| 2                                                                                              | Rótulos de momento e dicas                                                                                                          | 4 momentos, dica à vista abaixo de cada                                                                                               | idênticos, dica à vista                                                                                                                                         | OK                                                                                        |
| 3                                                                                              | Rótulos do bloco "O que exige"                                                                                                      | Foto · Observação · Produtos · Número do documento do cliente · Valor pago · Digitado (Por linha de produto / Um só, pela ocorrência) | idênticos                                                                                                                                                       | OK                                                                                        |
| 4                                                                                              | "Rótulo na tela de registro" (número e valor)                                                                                       | o mesmo texto nos dois                                                                                                                | "Rótulo do número…" e "Rótulo do valor na tela de registro"                                                                                                     | DESVIO justificado: dois campos com o mesmo nome no mesmo bloco                           |
| 5                                                                                              | Assinatura, Quantidade mínima de fotos, Produtos exigidos                                                                           | ausentes (fora do escopo do desenho)                                                                                                  | presentes (spec 246)                                                                                                                                            | DESVIO justificado: controles da 246                                                      |
| 6                                                                                              | Dica de "Produtos exigidos" e da exceção                                                                                            | —                                                                                                                                     | dizia que o app só marca "A nota inteira" e para não configurar "Ao menos N" — falso desde a T5.3                                                               | **CORRIGIDO** (`9f0d8ede2`)                                                               |
| 7                                                                                              | E-mail: interruptor, Assunto, Corpo, Linha de cada produto                                                                          | mesma ordem e textos                                                                                                                  | mesma ordem e textos; desligado mostra "Desligado: o operador manda pela conversa da ocorrência, se quiser." (igual)                                            | OK                                                                                        |
| 8                                                                                              | Marcadores                                                                                                                          | uma fileira com os 16, para qualquer campo                                                                                            | lista por campo (assunto 15, corpo, linha 19), só os válidos no campo com o cursor                                                                              | DESVIO justificado: marcador de outro campo é recusado (RF3)                              |
| 9                                                                                              | Dica dos marcadores                                                                                                                 | "Toque num marcador para inserir no campo em que o cursor está."                                                                      | "Marcadores do corpo — toque num para inserir onde o cursor está." (muda com o campo)                                                                           | DESVIO justificado (acompanha o item 8)                                                   |
| 10                                                                                             | Prévia                                                                                                                              | coluna à direita do formulário inteiro                                                                                                | à direita do bloco E-mail a 1280 px (463 px); empilhada abaixo a 375/768, como no desenho                                                                       | DESVIO justificado: fica ao lado do que edita                                             |
| 11                                                                                             | Erro de marcador                                                                                                                    | não desenhado                                                                                                                         | `aria-invalid` só no campo, aviso "Este marcador não existe neste campo…", Salvar desabilitado, nenhuma chamada à prévia, prévia anterior mantida               | OK (estado a mais, conferido no navegador)                                                |
| 12                                                                                             | Salvar e-mail / Desfazer                                                                                                            | sem botão (o desenho edita ao vivo)                                                                                                   | botões; Salvar nasce desabilitado                                                                                                                               | DESVIO justificado: texto grava só por ação (T5.2)                                        |
| 13                                                                                             | Alvo de "Salvar e-mail"/"Desfazer" sob toque                                                                                        | —                                                                                                                                     | 38,4 px a 768 px com toque (Button sm)                                                                                                                          | **CORRIGIDO** (`c5f6ab7f5`): 44 px medidos                                                |
| 14                                                                                             | Aviso interno                                                                                                                       | "Avisar quem despachou a viagem" + dica                                                                                               | "Avisar quando acontecer" + modelo da notificação (246)                                                                                                         | DESVIO justificado: controle da 246                                                       |
| 15                                                                                             | Aviso interno com "Avisar" ligado e tipo sem chave                                                                                  | —                                                                                                                                     | mostrava o texto do e-mail à contratante como "modelo próprio (legado)" sob "Sem e-mail"                                                                        | **CORRIGIDO**                                                                             |
| 16                                                                                             | Dica do Aviso interno                                                                                                               | —                                                                                                                                     | "…fica no bloco ao lado" (está acima)                                                                                                                           | **CORRIGIDO** ("se configura no bloco acima")                                             |
| 17                                                                                             | Exceções                                                                                                                            | 2 seletores (número, valor), rótulos do tipo                                                                                          | linha completa da 246; os rótulos são "Número da NFD" e "Valor pago pela loja"                                                                                  | DESVIO justificado: 246 + os rótulos do desenho                                           |
| 18                                                                                             | Seletores                                                                                                                           | o `Select` real                                                                                                                       | o `Select` real, CSS global intocado                                                                                                                            | OK                                                                                        |
| 19                                                                                             | Estados vazio/erro/desabilitado                                                                                                     | "Nenhum…" não desenhado                                                                                                               | "Nenhuma exceção neste tipo.", "Não há cliente cadastrado sem exceção…", Produtos desligado + valor por linha recusa sem gravar                                 | OK                                                                                        |
| 20                                                                                             | Contraste                                                                                                                           | 4,88 (config)                                                                                                                         | mínimo 4,69 (claro), 5,55 (escuro, medido na T5.x)                                                                                                              | OK (≥ 4,5)                                                                                |
| 21                                                                                             | Foco                                                                                                                                | anel de cobre                                                                                                                         | `outline: 2px solid` cobre no campo e nos marcadores (Tab)                                                                                                      | OK                                                                                        |
| 22                                                                                             | Alvos ≥ 44 px                                                                                                                       | 38,4 px nos seletores de exceção                                                                                                      | 375 e 768 com toque: nenhum controle do bloco < 44; ponteiro fino: 38,4 (Select compacto, Button sm, MultiSelect)                                               | DESVIO justificado: iguais ao desenho e a todo o painel                                   |
| 23                                                                                             | Estouro                                                                                                                             | 0                                                                                                                                     | 0 a 375/768/1280, nada fora da janela                                                                                                                           | OK                                                                                        |
| 24                                                                                             | Largura útil a 375 px                                                                                                               | 309 px                                                                                                                                | 267 px                                                                                                                                                          | DESVIO justificado: o tipo vive dentro da linha da lista (acordeão), recuo da 246         |
| **b. Painel — correção e acerto** (sem desenho no `preview.html`; conferidos contra RF12/RF13) |                                                                                                                                     |                                                                                                                                       |                                                                                                                                                                 |                                                                                           |
| 25                                                                                             | Seção "Número e valor pago"                                                                                                         | —                                                                                                                                     | número, Digitado, valor por linha, "Soma da linha" e "Soma geral" (117,19 = 57,20 + 59,99); vazio mantém o gravado                                              | OK                                                                                        |
| 26                                                                                             | Número inválido                                                                                                                     | —                                                                                                                                     | aviso, `aria-invalid`, Salvar correção desabilitado                                                                                                             | OK                                                                                        |
| 27                                                                                             | Soma geral ao digitar o valor pago                                                                                                  | —                                                                                                                                     | não muda (é referência; o texto da seção diz)                                                                                                                   | DESVIO justificado: RF13, a soma nunca é gravada                                          |
| 28                                                                                             | Alvos, contraste, estouro                                                                                                           | —                                                                                                                                     | 0 controles < 44 px na seção (375/768 toque e 1280); contraste 5,19; estouro 0                                                                                  | OK                                                                                        |
| 29                                                                                             | Acerto: "Sugestão pelo registro"                                                                                                    | —                                                                                                                                     | "R$ 57,20 · soma da linha R$ 57,20"; valor pago 0 vira "A loja não pagou, sem valor a acertar"; botão "Usar a sugestão do registro" preenche uma linha, nunca 0 | OK                                                                                        |
| 30                                                                                             | Acerto: "Código do produto" e "Valor" na página de detalhe                                                                          | —                                                                                                                                     | `<input>` nativo de 21 px, sem borda do sistema (fora do `.workspace-panel`)                                                                                    | **CORRIGIDO**: 48 px, foco e estado inválido                                              |
| **c. App do motorista — registro** (arnês)                                                     |                                                                                                                                     |                                                                                                                                       |                                                                                                                                                                 |                                                                                           |
| 31                                                                                             | Ordem                                                                                                                               | produtos → valor da ocorrência → número → observação → foto → faltas → botão                                                          | a mesma                                                                                                                                                         | OK                                                                                        |
| 32                                                                                             | Produto: marcar, "Na nota: N UN × R$ …", quantidade (UN), "Valor pago pela loja · se diferente", conta `1 FD × R$ 57,20 = R$ 57,20` | idênticos                                                                                                                             | idênticos; marcar preenche 1                                                                                                                                    | OK                                                                                        |
| 33                                                                                             | Valor unitário                                                                                                                      | `R$ 50,00` (49,995 arredondado) e conta `2 FD × R$ 50,00 = R$ 99,99`                                                                  | `R$ 49,995` e `2 FD × R$ 49,995 = R$ 99,99 · pago R$ 99,00`                                                                                                     | DESVIO justificado: a conta fecha com o que a nota traz                                   |
| 34                                                                                             | Soma geral e valor pago                                                                                                             | 157,19 / 157,19                                                                                                                       | 157,19 / 156,20 (99,00 digitado numa linha)                                                                                                                     | OK (a conta é a do desenho; o dado difere)                                                |
| 35                                                                                             | Título do bloco e rótulos                                                                                                           | "Produtos devolvidos" · "Número da NFD · obrigatório"                                                                                 | "…(obrigatório)" · "Número da NFD · obrigatório"; valor da ocorrência "· opcional"                                                                              | DESVIO justificado: exigência à vista                                                     |
| 36                                                                                             | Observação                                                                                                                          | "Observação · obrigatória", campo desenhado                                                                                           | "O que aconteceu (obrigatório)" (texto do app, spec 218); era `<textarea>` nativo de 3 linhas                                                                   | rótulo DESVIO (vocabulário anterior à 247); campo **CORRIGIDO** (mesmo campo dos valores) |
| 37                                                                                             | Foto                                                                                                                                | "Tirar foto da mercadoria avariada"                                                                                                   | "Tirar foto \*" / "Anexar" (spec 209/218)                                                                                                                       | DESVIO justificado: fluxo existente                                                       |
| 38                                                                                             | Motivo do botão desabilitado                                                                                                        | "Falta: número da nfd, foto."                                                                                                         | "Para registrar, falta: “Número da NFD”, a observação, a foto." (`role=status`)                                                                                 | DESVIO justificado: texto da 246 RF7                                                      |
| 39                                                                                             | Mensagem de tudo preenchido                                                                                                         | "Tudo o que o tipo pede está preenchido."                                                                                             | "Tudo o que o tipo pede está preenchido." em `role="status"` (criada na B1(c) da T7.2); o botão liberado é o outro sinal                                        | CONFERE: a mensagem existe (B1(c)), só com tipo que exige algo                            |
| 40                                                                                             | Botão                                                                                                                               | "Registrar devolução"                                                                                                                 | "Registrar"                                                                                                                                                     | DESVIO justificado: rótulo genérico do app, serve a todos os tipos                        |
| 41                                                                                             | Escolha do tipo                                                                                                                     | "Tipo: Devolução parcial"                                                                                                             | fichas com o nome e "Foto obrigatória"                                                                                                                          | DESVIO justificado: o motorista escolhe o tipo                                            |
| 42                                                                                             | "E-mail que sai ao registrar"                                                                                                       | coluna à direita                                                                                                                      | ausente                                                                                                                                                         | DESVIO justificado: o motorista não vê nem manda o e-mail (RF11)                          |
| 43                                                                                             | Mínimo de produtos                                                                                                                  | "ao menos um produto"                                                                                                                 | `itemsMinimumCount` nulo = todos ("mais produtos (mínimo de 3)"); com 1, basta um                                                                               | DESVIO justificado: RF11 (nulo = todos, como o servidor)                                  |
| 44                                                                                             | Estados                                                                                                                             | vazio / completo                                                                                                                      | vazio: Registrar desabilitado e motivo; quantidade 11 > 10: "A nota tem só 10 FD." + `aria-invalid`; completo: liberado                                         | OK                                                                                        |
| 45                                                                                             | Contraste                                                                                                                           | 5,35                                                                                                                                  | 4,57 (claro), 5,87 (escuro, com erro)                                                                                                                           | OK (≥ 4,5)                                                                                |
| 46                                                                                             | Foco                                                                                                                                | —                                                                                                                                     | caixa desenhada com anel de 2 px de cobre; campos idem                                                                                                          | OK                                                                                        |
| 47                                                                                             | Alvos                                                                                                                               | —                                                                                                                                     | rótulo da linha ≥ 65 px, campos 45–51 px, botões 48 px (375/768 toque e 1280)                                                                                   | OK                                                                                        |
| 48                                                                                             | Estouro e borda                                                                                                                     | 0                                                                                                                                     | 0 nas três larguras, nada a menos de 8 px da borda                                                                                                              | OK                                                                                        |

**Contagem:** 48 linhas — OK 22 · desvio justificado 20 · corrigido 5 (linhas 6, 13, 15, 16, 30) · mista 1 (linha 36: rótulo é desvio, campo foi corrigido).

**Correções (contrato antes, commit isolado):** `9f0d8ede2` dica de Produtos exigidos; `896d58354` Aviso interno; `c5f6ab7f5` Salvar/Desfazer; `a8c8b02eb` campos do acerto; `83006aef1` observação do motorista. Detalhe: dica de Produtos exigidos (vermelho: "1 fail" do contrato M3, depois 2 pass); Aviso interno sem texto legado e "bloco acima" (vermelho 1 fail); `Salvar e-mail`/`Desfazer` a 44 px sob toque (vermelho 2 fail, medido 44 px a 768 px com toque); campos do acerto (vermelho 2 fail, medido 48 px); observação do motorista (vermelho 1 fail).

**O que não foi verificado:** o login e a fila reais do app do motorista e a moldura de página do app; o tipo aberto com os dados reais da API (o painel usa API dublada, então "Salvar" fala com um dublê); tema escuro do painel nesta rodada (vale a medição da T5.x: 5,55); prints a 375 px do tipo aberto foram só geradas, não revistas uma a uma.

## T7.2 — correções da revisão: API

Reprovação da revisão independente (T7.2). Duas tasks sequenciais, commits por item. Integração em Postgres 18 nativo
descartável (`127.0.0.1:56251`, diretório no scratchpad, `DATABASE_URL` por variável de ambiente).

### R1 — correções pequenas e protetoras

| Item  | O que mudou                                                                                                                                                                                                                                                                                                                                     | Prova                                                                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1    | `emailBody`/`emailSubject` do `PUT` do tipo passam de `.default('')` a `.optional()`; ausente é "não mexa" no caso de uso e no repositório (INSERT usa o padrão da coluna, UPDATE omite); `''` explícito continua apagando de propósito. O painel publicado em staging não manda os dois campos e apagava o e-mail à contratante a cada edição. | `test/trip-occurrence/email-template-absent.contract.ts` (3) e `occurrence-type-declared-amount-write.integration.ts` (PUT sem os campos preserva; `''` apaga). Mutação (voltar `.default('')`): 1 fail no contrato, 1 fail na integração.             |
| M2    | Com o modo **efetivo** `off`, número do documento, valor pago da ocorrência e valor pago de linha do registro do motorista são descartados (viram `null`) em `assessDriverOccurrence`, pelo modo já resolvido por `resolveOccurrenceRequirements`; nada é recusado (a fila offline não trava quando a configuração muda).                       | `driver-occurrence-items.integration.ts`, caso novo (escopo `item` e escopo `occurrence`). Mutação (gravar mesmo com `off`): 1 fail.                                                                                                                   |
| M5    | A leitura de produtos do snapshot do motorista (`listActiveTrips`) segue isolada, mas agora deixa `logger.warn` estruturado `driver_snapshot_products_read_failed` só com `companyId`, `tripIds` e `affectedDocumentCount` (sem a mensagem do erro).                                                                                            | `driver-snapshot-products.integration.ts`, caso novo (leitura forçada a falhar: snapshot segue sem `products`, aviso presente, sem `boom`). Mutação (tirar o aviso): 1 fail.                                                                           |
| B3    | `occurrence-correction.policy.ts` usava 3 bytes NUL literais como separador; agora `\u0000` no template. Comportamento igual.                                                                                                                                                                                                                   | `git grep -I -c normalizeQuantity` passa a casar o arquivo (o git o trata como texto); contratos de correção seguem verdes (26 pass). O próprio commit de troca aparece como binário porque o lado antigo era binário; qualquer diff seguinte é texto. |
| B4    | `SETTINGS_MANAGE_POLICY` exportada de `trip.routes.ts` e importada na rota da prévia; `OCCURRENCE_DECLARED_AMOUNT_FIELD` em `shared/trip-occurrence.constant.ts`, importada pelo schema, pelo guarda de exigência e pelo erro de conflito.                                                                                                      | typecheck, lint, contratos.                                                                                                                                                                                                                            |
| B6/B7 | Permissão correta é `settings.manage` (a correção anterior para `companies.settings` estava errada: não existe); preço no payload é recusado com 400 (`.strict()`), não "ignorado" (spec.md CA06, tasks.md). Comentários do painel (`TripOccurrenceTypesTab.component.tsx`, `companySettingsTabs.service.ts`) corrigidos, sem lógica.           | `prettier --check`.                                                                                                                                                                                                                                    |

**Teste existente alterado (M2).** `driver-occurrence-items.integration.ts` › "preço forjado no valor pago é gravado como valor
pago…" afirmava que o número do documento era gravado com `referenceNumberMode: 'off'` (a T4.4 aceitava e gravava `off`).
Isso é exatamente o defeito M2. O caso agora usa `referenceNumberMode: 'optional'` — a intenção dele é provar que `unit_value`
e unidade saem da nota —, e o novo caso prova que, com `off`, o valor é descartado.

**Gates R1** (fresh, código de saída conferido):

```text
contrato (apps/api-transportada)        exit=0 · 10367 pass · 25 skip · 0 fail (200 arquivos)
integração, 4 lotes em primeiro plano   exit=0 · 377 pass | 308 pass 7 skip | 242 pass | 201 pass 1 skip · 0 fail (210 arquivos)
bun run lint (API)                      exit=0
bun run typecheck (raiz)                exit=0
bun run format:check (raiz)             exit=0
```

### R2 — o detalhe da ocorrência publica o que foi gravado (A2, M3)

`GET /trip-occurrences/:id` (`findTripOccurrenceDetail`) passa a devolver, **no nível da ocorrência** e sem tocar nos objetos de
`items[]`:

| Campo novo        | Tipo                                                     | Origem                                                                                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `referenceNumber` | `string \| null`                                         | `trip_document_occurrences.reference_number`                                                                                                                                                                                                                                             |
| `declaredAmount`  | `string \| null`                                         | valor pago da ocorrência, duas casas (`"150.50"`; zero é `"0.00"`, nunca `null`)                                                                                                                                                                                                         |
| `itemValues`      | `{ productCode, quantity, unitValue, declaredAmount }[]` | linhas gravadas, na ordem de `position`: `quantity` como o `numeric(12,3)` (`"2.000"`), `unitValue` é a **cópia** do `vUnCom` no registro (4 casas, como a nota: `"19.9950"` — arredondar a duas casas perderia o centavo da soma, D9), `declaredAmount` do item em duas casas ou `null` |

Ocorrência de parada, nota inteira e ocorrência anterior à 247 devolvem `null`, `null` e `[]`. Dinheiro é `bigint` (centavos) até o
texto, sem `number`. `occurrence-detail-values.golden.json` (API) e a cópia idêntica em `apps/frontend-transportada/test/fixtures/`
são o JSON de referência dos três campos; `driver-snapshot-products.contract.ts` prova que as cópias são iguais, e a integração
prova que o detalhe real serializa igual ao JSON.

**Vermelho antes do código** (`occurrence-detail-values.integration.ts`): 3 fail (dois itens com valor pago e número; valor pago
da ocorrência com `0.00`; correção troca os valores), 1 pass (outra empresa já era 404).

**Mutações** (cada uma sozinha, revertida): zero virar `null` → 2 fail; `unitValue` forçado a `0.0000` → 3 fail.

**Casos cobertos** (integração, Postgres real): registrar com 2 itens e valor pago → o detalhe devolve os campos; a correção troca
valores e número → o detalhe reflete e o `unit_value` copiado sobrevive à alteração do preço na nota; escopo `occurrence` com
`150.5` → `"150.50"`; valor pago `0` → `"0.00"`; sem valor → `null`; empresa B recebe `TripOccurrenceNotFoundError` (404), igual
a ocorrência inexistente; as chaves de cada `items[]` seguem exatamente `code`, `description`, `quantity`, `unit`.

**Parsers do painel publicado (origin/staging) conferidos — nenhum precisa ficar tolerante antes desta publicação.**
`readDetail` (`modules/trip/shared/tripOccurrenceFeedClient.service.ts`) valida a resposta com `isFeedItem` (`isRecord`, não
`hasExactKeys`), `isDetailDriver` e `isDetailItem` (ambos `isRecord`) e devolve `{ ...toFeedItem(raw), ... }`, que espalha as chaves
desconhecidas — elas passam sem recusa. Por isso os três nomes (`referenceNumber`, `declaredAmount`, `itemValues`) entram sem erro. O
que **recusaria** chave nova é `isTripOccurrence` (`modules/trip/shared/tripResponse.validation.ts`, `hasKeys` com lista) e
`isOccurrenceCorrection`/`isOccurrenceProduct` (`hasExactKeys`), que leem o detalhe da **viagem** e `corrections[].previousItems[]` — a
R2 não toca nenhum dos dois (as correções seguem publicando `code`/`quantity`/`unit`). O painel só passa a **usar** os campos quando
`TripOccurrenceDetail` (`tripOccurrenceFeed.service.ts`) e `readDetail` os declararem; isso é trabalho de painel, fora desta task.

**Gates R2** (fresh, código de saída conferido):

```text
contrato (apps/api-transportada)        exit=0 · 10368 pass · 25 skip · 0 fail (200 arquivos)
integração, 4 lotes em primeiro plano   exit=0 · 377 pass | 308 pass 7 skip | 242 pass | 205 pass 1 skip · 0 fail (211 arquivos)
bun run lint (API)                      exit=0
bun run typecheck (raiz)                exit=0
bun run format:check (raiz)             exit=0
```

**O que não foi rodado:** nenhuma tela (a task não toca o painel além dos JSONs de referência); `make migration-test` (nenhuma
migration); suíte do `frontend-transportada` (só ganhou um fixture, sem consumidor); o caminho do escritório
(`register-trip-occurrence`) não recebe número nem valor pago, então M2 não o alcança.

## T7.2 — correções da revisão: painel

Reprovação da revisão independente (T7.2): achados A1, A2, M3 e B1 do painel, mais a higiene de tamanho. A API (R2) já publica `referenceNumber`,
`declaredAmount` e `itemValues` no detalhe. Cinco commits no painel (`798babc14`, `a9a22c1c1`, `b5ec95ca4`, `d26536974`, `4454131da`); nenhum arquivo da API
nem do `frontend-driver` foi tocado. Sem push nem deploy.

| Item | O que mudou                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `TripOccurrenceDetail` declara `referenceNumber`, `declaredAmount` e `itemValues` (opcionais: ausente é API ou ocorrência antiga); `readDetail` valida com guards (dinheiro só em texto decimal; forma errada recusa a resposta). O golden `occurrence-detail-values.golden.json` entra em `test/trip/occurrence-detail-values.contract.ts`, com e sem as chaves.                                                                                                                                                                                                        |
| 2/A2 | A correção nasce preenchida: número, valor pago da ocorrência ou da linha vêm do detalhe (`occurrenceRecordedAmounts.service.ts`); rótulos do **tipo** (`referenceNumberLabel`/`declaredAmountLabel`, lidos de `GET /company-settings/occurrence-types` pelo `useOccurrenceTypeRecordConfig`), com fallback genérico. Sem valor gravado o campo diz "Nada gravado."; **Limpar** é botão explícito (envia `null`) e o campo vazio com gravado diz "Será limpo ao salvar.". "Valor que vai no e-mail" aparece ao lado da "Soma geral" (regra de RF9 sobre o estado final). |
| 3/A1 | O nível do valor pago nasce onde está gravado (linhas, ocorrência; senão o escopo do tipo; senão por linha). Valor digitado num nível com o outro gravado manda o outro `null` no mesmo corpo; trocar de nível **sem** valor novo não apaga nada. `DECLARED_AMOUNT_SELECTION_CONFLICT`, `TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED` e `TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED` têm mensagem própria (pt/en), dizendo o que fazer.                                                                                                                                      |
| 4/M3 | A sugestão do acerto usa o `unitValue` **copiado** (`itemValues`), soma todas as linhas do mesmo código, deixa o valor pago (linha ou ocorrência) vencer a soma e nunca sugere 0 ("A loja não pagou, sem valor a acertar"). Valor pago da ocorrência com vários códigos não tem como ser atribuído a um item: aparece o aviso "A loja pagou R$ X pela ocorrência inteira…" e nenhuma linha é inventada. Sem `itemValues` volta ao comportamento anterior, sem erro.                                                                                                      |
| 5/B1 | O rascunho do "Salvar e-mail" (assunto/corpo/linha de item) é guardado por tipo num contexto da página (`useOccurrenceMailDraftStore`, criado pelo `OccurrenceTypeCatalogPanel`): recolher e reabrir a linha do tipo o devolve. Escolhida a solução mais simples (guardar), e não a de avisar antes de descartar: não exige perguntar nada ao operador. Trocar de aba da página desmonta o painel e descarta o rascunho (fora do escopo pedido).                                                                                                                         |
| 6    | `OccurrenceSettlementPanel.component.tsx` (485 linhas) passou a 169 (183 hoje), dividido em `OccurrenceSettlementRow`, `OccurrenceSettlementSaved`, `useOccurrenceSettlementDraft` e `occurrenceSettlementDraft.service`, em **commit separado e antes** da mudança funcional (`a9a22c1c1`); o contrato de parede `occurrence-settlement-panel.contract.ts` passou a ler as cinco partes. `OccurrenceCasePanel.component.tsx` (335) não foi tocado e não foi dividido.                                                                                                   |

**Decisão de commits.** A2 e A1 dividem os mesmos arquivos (o rascunho, o serviço de resolução e o componente de valores) e nasceram juntos: um commit só
(`b5ec95ca4`), em vez de dois que não compilariam isolados.

### Vermelho antes do código e mutações

Os contratos de B1 e de M3 (tabela) foram escritos antes do código e viram vermelho (`B1`: reabrir devolvia o assunto gravado; `M3`: 8 fail). Em A1/A2, o
serviço puro foi escrito antes do contrato desta rodada (o contrato dos componentes veio depois, sobre o componente já montado): a prova de que os
contratos mordem é a mutação, cada uma sozinha e revertida (cópia do arquivo restaurada, `diff` vazio):

```text
A1-1  não limpar o outro nível ao trocar (clearsOccurrence/clearsLines = false)
      puro:   3 fail — (a) "um só" · (b) "por linha" · "trocar de nível sem valor novo…zero é valor e apaga o outro nível"
      painel: 2 fail — (a) PATCH sem as linhas nulas · (b) PATCH sem declaredAmount: null     (Expected path: "declaredAmount")
A1-2  o nível nasce sempre "por linha" (resolveCorrectionAmountScope ignora o gravado e o tipo)
      puro:   1 fail — "o nível nasce onde está gravado; sem gravado, no do tipo; sem tipo, por linha"
      painel: 5 fail — valor da ocorrência gravado (inclusive zero) · (b) · (c) limpar tudo · nível do tipo · e-mail da ocorrência
M3-1  o valor unitário vem da nota, não da cópia: puro 3 fail (3 × 19,995 · código repetido · código repetido com valor pago) + painel 1 fail
M3-2  valor pago 0 vira sugestão: puro 2 fail ("a loja não pagou" no contrato antigo e no novo)
```

### Navegador (painel desta árvore, Vite 7 na porta 53010, API dublada por `page.route`, Chromium headless)

Servidor: PID 59923, `cwd` conferido por `lsof -d cwd` = `.../transportada-wt/spec-247/apps/frontend-transportada` antes de qualquer afirmação; binário da app
(`./node_modules/.bin/vite`), `VITE_API_URL` apontando para uma porta sem servidor (qualquer rota sem dublê voltava 404 em vez de tocar a API de outra
sessão); 53000/53001/53911 intocadas; sem o `preview_start` do harness. Verificação por texto (`innerText`, `inputValue`, corpo capturado do `PATCH`, geometria
com `getBoundingClientRect`); um recorte da seção como prova (não commitado).

```text
(a) gravado 50,00 na linha P1 e NFD 45029, tipo com "Número da NFD" / "Valor pago pela loja"
    campos: "NFD 45029" · P1 "50,00" · P2 vazio com "Nada gravado." · nível "Por linha de produto" · "Valor que vai no e-mail: R$ 107,20" (50,00 + vProd 57,20)
    "Um só, pela ocorrência" + 4000 → aviso das linhas; PATCH {"items":[{"code":"P1","declaredAmount":null,…},{"code":"P2","declaredAmount":null}],"declaredAmount":"40.00"}
(b) gravado 40,00 na ocorrência → nasce "Um só, pela ocorrência" com "40,00"; "Valor que vai no e-mail: R$ 40,00"
    "Por linha de produto" + 5000 na P1 → PATCH {"items":[{"code":"P1","declaredAmount":"50.00",…},{"code":"P2"}],"declaredAmount":null}
(c) Limpar na linha e no número → "Será limpo ao salvar." ×2; PATCH {"items":[{"code":"P1","declaredAmount":null,…},{"code":"P2"}],"referenceNumber":null} (sem declaredAmount)
Acerto (decidida goods_paid), preço atual da nota 25,00 e cópia 19,995: "P1 — R$ 59,99 · soma da linha R$ 59,99" e "P2 — R$ 57,20 · soma da linha R$ 57,20"

                 375 px (toque)   768 px (toque)   1280 px (ponteiro fino)
estouro horiz.         0                0                  0
controles < 44 px      nenhum           nenhum             2 (Limpar, 38,4 px — Button sm do design system, só com ponteiro fino)
```

Os mesmos três cenários e a sugestão passaram nas três larguras. Os 404 do console são rotas sem dublê (sino, atalhos), não das telas verificadas. Servidor
encerrado por PID, porta 53010 livre, harness e recorte apagados, `git status` limpo.

### Limitações

1. A **soma da linha** e a **Soma geral** da correção continuam calculadas sobre a nota carregada (preço atual) e a quantidade editada; o "valor que vai no e-mail"
   com o pago digitado não depende disso, mas sem valor pago ele usa a mesma conta da nota, enquanto o servidor usa o `unit_value` copiado. Só diverge se o preço da
   nota mudou depois do registro (o aviso do acerto, esse sim, parte da cópia).
2. Os rótulos do tipo só chegam a quem tem `settings.manage` (a lista de tipos é dessa permissão); os demais operadores veem os rótulos genéricos.
3. Código repetido na seleção da correção não é um caso do formulário (a seleção é por código): o valor gravado por linha usa a primeira linha do código.
4. Vários códigos com valor pago da ocorrência: não há atribuição por item, o acerto mostra só o aviso (decisão acima), e o operador distribui o valor ao preencher.

## T7.2 — correções da revisão: app do motorista (2026-10-07)

A revisão independente reprovou o app do motorista no **A3 (bloqueante)** e levantou três itens de usabilidade (B1).

### A3 — o valor pago descartava dígito em silêncio

`sanitizeDecimalInput` aceitava `.` e `,` como separador e cortava o que passasse da 2ª casa: `1.500` digitado
virava `1.50` (e o e-mail saía com R$ 1,50) e colar `1.234,56` gravava `1.23`. O painel usa outra semântica
(`maskAmountInput`: só dígito, os dois últimos são centavos) — dado financeiro com duas digitações é defeito.

**Correção.** O app do motorista replica a máscara do painel (sem importar código de outra app) em
`occurrenceMoneyMask.service.ts`: só dígito entra, exibição `1.234,56` com milhar, eco imediato. `1.500` → `15,00`
(visível ao vivo); colar `1.234,56` → `1.234,56`; `R$ 57,20` → `57,20`. `0` e `0,00` são **valor** (`"0.00"`); vazio
não é; apagar a partir de `0,00` limpa o campo. O corpo segue string com ponto e 2 casas (`1234.56`), no padrão
`DECLARED_AMOUNT_DECIMAL` da API. No teto (10 inteiros + 2 centavos) a tela diz, em região viva
(`aria-live="polite"`): "Limite do campo: o valor não pode passar de R$ 9.999.999.999,99." — a tecla extra não
entra, mas nunca calada. Teclado `inputMode="numeric"`. `DECLARED_AMOUNT_INPUT`/`sanitizeDecimalInput` foram
removidos (zero consumidores). O espelho do cálculo (`occurrenceAmount.service.ts`) não precisou mudar; os 24 casos
da tabela espelhada seguem verdes.

**Quantidade (até 3 casas).** `.` vale como `,` (o campo mostra a vírgula). Casa a mais NÃO é cortada: o texto
fica como digitado, o campo ganha `aria-invalid` e a mensagem "A quantidade aceita no máximo 3 casas depois da
vírgula." (`quantityProblem: 'too-many-decimals'`); mais de 9 dígitos inteiros idem (`'too-many-digits'`). O botão
fica bloqueado pelo motivo "a quantidade dos produtos marcados" (`hasInvalidItemQuantity`).

### B1

- **(a)** Espaço não separável (U+00A0) depois de todo `R$` dos textos da tela (`money`, `paid`, `calculation`,
  `onNote`, `limit`; pt-BR e en). `pago R$ / 99,00` não parte mais. Contrato: nenhum `R$ ` com espaço comum em
  `occurrenceRegistration`, nos dois locales.
- **(b)** O total "Valor pago pela loja R$ 156,20" misturava linhas digitadas com calculadas. Decisão: o rótulo é
  **"Total que vai no e-mail"** e uma linha de origem o acompanha (`resolveOccurrenceTotalOrigin`): "Calculado pela
  nota (quantidade × valor unitário).", "Valor pago digitado em todas as linhas.", "N de M linhas com valor pago
  digitado; as outras, calculadas pela nota." ou "Valor pago digitado para a ocorrência inteira." — a semântica da
  RF9 (o digitado vence a soma da linha) dita na tela, sem esconder a mistura.
- **(c)** `OccurrenceRegisterAction` ganhou uma região viva `role="status"` sempre montada com o botão; ela diz o que
  falta ou, quando o tipo exige algo (`hasRequiredOccurrenceField`) e tudo está preenchido, "Tudo o que o tipo pede
  está preenchido." (verde `--color-ready` misturado ao tom do texto: 6,05:1 no claro, 6,87:1 no escuro).

### Divisão de arquivo (sem mudar comportamento)

`occurrenceDraftValues.service.ts` (299 linhas) foi dividido por responsabilidade, com 1341 testes verdes antes e
depois: `occurrenceDraftValues.types.ts` (68; 66 depois da T7.2b), `occurrenceItemLine.service.ts` (~130) e o serviço de avaliação (~150).
Os importadores seguem pelo mesmo caminho (reexport). `occurrenceRequirements.service.ts` (270) não foi editado.
⚠️ `DriverOccurrenceRegistrationForm.component.tsx` está com 211 linhas (era 209: já estava acima do teto antes);
acrescentei uma linha (`hasRequiredFields`) e não o dividi por estar fora do escopo pedido.

### Vermelho antes do código

Contrato novo `test/driver-trip/occurrence-money-input.contract.ts` (registrado no entrypoint):

```text
error: Cannot find module '../../src/modules/driver-trip/shared/occurrenceMoneyMask.service'
 1 error
```

B1 (a–c) e origem do total, antes da implementação: `bun run --cwd apps/frontend-driver test` → `12 fail`
(locale com `R$ ` comum, `Total que vai no e-mail`, origem, `hasRequiredFields`/`role="status"`).

### Mutações (cada uma sozinha, vermelho, depois revertida)

1. **Voltar a descartar dígito em silêncio** (`maskMoneyInput` cortando além da 2ª casa depois do separador e
   `sanitizeQuantityInput` com `.slice(0, 3)`):

```text
(fail) a máscara de centavos do valor pago (igual à do painel) > "1.500" digitado vira 15,00 — visível ao vivo, e nenhum dígito some
(fail) ... > "57,2" digitado: cada tecla ecoa na hora, sem perder dígito
(fail) ... > teclas repetidas: zeros à esquerda não contam e o texto fica estável
(fail) ... > milhar com ponto, em pt-BR
(fail) ... > o teto são 10 dígitos inteiros + 2 centavos: além dele a tela avisa (nunca ignora calada)
(fail) a quantidade (até 3 casas) não descarta dígito em silêncio > casas a mais ficam como digitadas (a tela marca, não corta)
 1357 pass
 6 fail
```

2. **Tratar "0,00" como vazio** (`unmaskMoneyText` devolvendo `undefined` para só zeros):

```text
(fail) a lista, a soma da linha e a soma geral (RF11, os números do protótipo) > valor pago 0 é aceito e diferente de vazio
(fail) ... > escopo "item" sem nenhuma linha marcada cai na ocorrência — como o servidor
(fail) o botão só libera com o exigido, sem rede (CA07) > valor pago obrigatório por linha: toda linha marcada o pede; zero vale
(fail) ... > valor pago obrigatório da ocorrência: o campo da ocorrência o pede; zero vale
(fail) a máscara de centavos ... > zero é valor: "0" e "0,00" mascaram para 0,00 e vão como "0.00"; vazio não é valor
(fail) ... > o texto enviado casa com DECLARED_AMOUNT_DECIMAL da API
(fail) o valor pago mascarado entra na conta e no corpo do envio > "0,00" é um valor ("0.00"), e vazio não manda nada
 7 fail
```

Arquivos restaurados; base de volta a verde.

### Testes existentes alterados (e por quê)

`occurrence-values.contract.ts`: os rascunhos do valor pago passam a ser o texto **mascarado** que o campo guarda
(`'0'` → `'0,00'`, `'10'` → `'10,00'`, `'50'` → `'50,00'`, `'8'` → `'8,00'`) e o corpo esperado ganha as 2 casas
(`'0.00'`, `'10.00'`); o teste de `sanitizeDecimalInput` saiu junto com a função (coberto pelo contrato novo).
`occurrence-values-fields.contract.tsx`: textos com `R$` + U+00A0, "Total que vai no e-mail" no lugar do rótulo do tipo.

### Navegador (arnês descartável + Vite do worktree, porta 53200; verificado por texto)

Arnês não commitado renderizando o `DriverOccurrenceRegistrationForm` real, com CSS e i18n reais; Vite do binário da
app, PID confirmado com `cwd` neste worktree; encerrado por PID, arnês apagado, portas 53200/53901 livres.
Sem login real (ADR-0075 §7).

| Cenário digitado                                        | Resultado na tela                                                                                                                                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1.500`                                                 | `15,00`                                                                                                                                                                     |
| `R$ 1.234,56`                                           | `1.234,56`                                                                                                                                                                  |
| 14 noves                                                | `9.999.999.999,99` + região viva "Limite do campo: …"                                                                                                                       |
| `0`                                                     | `0,00`; "falta" passa a ser só a observação; corpo `declaredAmount: "0.00"`                                                                                                 |
| quantidade `2.5555`                                     | texto fica `2,5555`, `aria-invalid="true"`, "…no máximo 3 casas…", Registrar desabilitado ("falta: a quantidade dos produtos marcados")                                     |
| quantidade `2.555` + valor pago `9900` na linha do bolo | `2,555 CX × R$ 19,995 = R$ 51,09`; `1 UN × R$ 57,20 = R$ 57,20 · pago R$ 99,00`; total R$ 150,09; "1 de 2 linhas com valor pago digitado; as outras, calculadas pela nota." |
| tipo exigindo valor + observação, tudo preenchido       | `role="status"`: "Tudo o que o tipo pede está preenchido."; Registrar liberado                                                                                              |

Geometria: sem estouro em 375/768/1280 (`scrollWidth == innerWidth`), campos 46 px, botões 44–57 px, nenhum `R$ `
com espaço comum nas linhas de conta; contraste da mensagem positiva 6,05:1 (claro) e 6,87:1 (escuro). Um print a
375 px foi tirado como prova.

### Gates (exit code conferido com `$?`)

```text
bun run typecheck                          exit=0
bun run --cwd apps/frontend-driver test    exit=0  — 1371 pass · 0 fail · 3025 expect() calls
bun run --cwd apps/frontend-driver lint    exit=0
bun run format:check (raiz)                exit=0  — All matched files use Prettier code style!
```

### O que NÃO foi rodado

`make check` completo, smoke Playwright do app do motorista, integração da API (fora do escopo; outro executor cuida
da API), e o fluxo com login e fila reais (o arnês usa fila em memória). Revisão independente (T7.2) a repetir.

## T7.2b — API: requisitos efetivos no detalhe e correção sob o modo do tipo (2026-10-07)

Segunda revisão independente (T7.2) aprovou com ressalvas; os médios N1, N2 e N10 são da API.

### N1 — a correção segue o modo EFETIVO do tipo

`correctOccurrenceItems` agora lê o contratante e o destinatário DA NOTA (`findDocumentSubject`) e as exceções
do tipo (`findOccurrenceTypeOverrides`), resolve pelo ponto único (`resolveDocumentOccurrenceRequirements`, por
`resolveStoredOccurrenceRequirements`, que não aplica o filtro "tipo ativo do momento": tipo desativado depois do
registro não trava a correção) e passa o resultado por `applyCorrectionRequirements`:

- modo efetivo `off`: número, valor pago da ocorrência e valor pago de linha enviados são DESCARTADOS (voltam a
  "mantém"), sem 4xx. Decisão: o `null` explícito (limpar) segue valendo; descartar não apaga o que já estava
  gravado (ocorrência de antes de o tipo virar `off`);
- modo efetivo `required`: só a limpeza EXPLÍCITA (`null`) é 422 (`TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRED` /
  `TRIP_OCCURRENCE_DECLARED_AMOUNT_REQUIRED`, `details[].field` = `declaredAmount` ou `items[i].declaredAmount`);
  ausente mantém, então a ocorrência anterior à 247 continua corrigível;
- o lugar do valor pago é `resolveDeclaredAmountTarget` com o `itemsMode` efetivo e o nº de linhas da correção;
  valor por linha com escopo efetivo `occurrence` segue na regra de conflito de nível.

Vermelho antes do código (`test/trip-occurrence/correction-effective-requirements.contract.ts`, 10 falhas):

```text
(fail) a correção descarta o campo desligado no modo efetivo número com modo off: não grava, sem erro
(fail) a correção descarta o campo desligado no modo efetivo valor pago da ocorrência com modo off: não grava, sem erro
(fail) a correção descarta o campo desligado no modo efetivo valor pago de linha com modo off: a linha é gravada sem o valor
(fail) a correção descarta o campo desligado no modo efetivo a exceção do contratante da nota desliga o número que o tipo exigia
(fail) a correção descarta o campo desligado no modo efetivo a exceção de OUTRO contratante não vale para a nota
(fail) a correção não deixa limpar o campo exigido número exigido: nulo explícito é 422 TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRE
(fail) a correção não deixa limpar o campo exigido valor pago exigido na ocorrência: nulo explícito é 422 com o campo declaredAm
(fail) a correção não deixa limpar o campo exigido valor pago exigido por linha: nulo explícito é 422 com o campo da linha
(fail) a correção não deixa limpar o campo exigido escopo item sem linha cai na ocorrência: o nulo explícito do valor da ocorrên
(fail) a correção não deixa limpar o campo exigido Produtos desligado pela exceção leva o escopo item para a ocorrência
```

Mutação 1 — gravar mesmo com `off` (contrato 5 falhas, integração 3), depois revertida:

```text
(fail) a correção descarta o campo desligado no modo efetivo número com modo off: não grava, sem erro
(fail) a correção descarta o campo desligado no modo efetivo valor pago da ocorrência com modo off: não grava, sem erro
(fail) a correção descarta o campo desligado no modo efetivo valor pago de linha com modo off: a linha é gravada sem o valor
(fail) a correção descarta o campo desligado no modo efetivo a exceção do contratante da nota desliga o número que o tipo exigia
(fail) a correção descarta o campo desligado no modo efetivo a exceção de OUTRO contratante não vale para a nota
(fail) a correção sob o modo efetivo do tipo contra Postgres tipo que virou off depois do registro: número e valor novos são des
(fail) a correção sob o modo efetivo do tipo contra Postgres valor pago por linha com o modo off: a linha é gravada sem o valor
(fail) a correção sob o modo efetivo do tipo contra Postgres exceção do contratante da nota desliga o que o tipo exigia: descart
```

Mutação 2 — aceitar limpar o campo `required` (contrato 5 falhas, integração 1), depois revertida:

```text
(fail) a correção não deixa limpar o campo exigido número exigido: nulo explícito é 422 TRIP_OCCURRENCE_REFERENCE_NUMBER_REQUIRE
(fail) a correção não deixa limpar o campo exigido valor pago exigido na ocorrência: nulo explícito é 422 com o campo declaredAm
(fail) a correção não deixa limpar o campo exigido valor pago exigido por linha: nulo explícito é 422 com o campo da linha
(fail) a correção não deixa limpar o campo exigido escopo item sem linha cai na ocorrência: o nulo explícito do valor da ocorrên
(fail) a correção não deixa limpar o campo exigido Produtos desligado pela exceção leva o escopo item para a ocorrência
(fail) a correção sob o modo efetivo do tipo contra Postgres tipo exigido: limpar com nulo é 422 e não grava; ausente mantém; ou
```

### N2 — `requirements` no detalhe da ocorrência (aditivo, nível da ocorrência)

`findTripOccurrenceDetail` passa a devolver `requirements`, resolvido pelo servidor com as exceções do contratante e
do destinatário da NOTA; `null` na ocorrência de parada (sem nota) e no tipo que não existe mais. Nenhuma chave
existente mudou. Formato (contrato com o painel; dinheiro não passa por aqui, rótulos são texto):

```json
"requirements": {
  "referenceNumberMode": "off | optional | required",
  "referenceNumberLabel": "string",
  "declaredAmountMode": "off | optional | required",
  "declaredAmountScope": "item | occurrence",
  "declaredAmountLabel": "string",
  "itemsMode": "off | optional | required"
}
```

`declaredAmountScope` é o EFETIVO: `resolveDeclaredAmountTarget` com o `itemsMode` efetivo e a contagem de produtos
distintos da nota. O golden `occurrence-detail-values.golden.json` ganhou `requirements` (a cópia do painel é igual;
o teste de cópias da API segue verde). Vermelho antes do código:

```text
(fail) o detalhe publica o requisito efetivo do tipo sem exceção: os modos, o escopo e os rótulos do tipo
(fail) o detalhe publica o requisito efetivo do tipo exceção do contratante e do destinatário da NOTA vale; Produtos desligado l
(fail) o detalhe publica o requisito efetivo do tipo a exceção de Produtos off leva o valor pago de item para a ocorrência
(fail) o detalhe da ocorrência (spec 183 T202) > itens da ocorrência: código, descrição da nota, quantidade como string decimal e unidade
```

Mutação 3 — `declaredAmountScope` cru do tipo (contrato + integração, 3 falhas), depois revertida:

```text
(fail) o requisito efetivo do detalhe da ocorrência escopo item com Produtos desligado no efetivo vira ocorrência
(fail) o requisito efetivo do detalhe da ocorrência escopo item numa nota sem produto vira ocorrência
(fail) o detalhe publica o requisito efetivo do tipo a exceção de Produtos off leva o valor pago de item para a ocorrência
```

Mutação 4 — `requirements` sem as exceções do contratante/destinatário (integração, 2 falhas), depois revertida:

```text
(fail) o detalhe publica o requisito efetivo do tipo exceção do contratante e do destinatário da NOTA vale; Produtos desligado l
(fail) o detalhe publica o requisito efetivo do tipo a exceção de Produtos off leva o valor pago de item para a ocorrência
```

### N10 — logger no repositório do canal WhatsApp

`main.ts` instanciava `DrizzleCurrentDriverTripRepository(database.db)` sem logger; agora recebe `logger`. Contrato
`driver-repository-logger-wiring.contract.ts` (toda instância em `main.ts` leva `logger`) estava vermelho antes
(`n10-red`: 1 falha) e verde depois. A leitura de produtos NÃO foi cortada no canal WhatsApp: ele chama
`findCurrentDriverTrip`, que monta o snapshot inteiro, e não há prova de que nenhum fluxo use os produtos — não é
seguro tirar sem teste.

### Divisão de arquivo (commit de refactor anterior, sem mudar comportamento)

`trip-occurrence-detail.query.ts` estava em 200 linhas; `findRecordedValues` foi para
`trip-occurrence-detail-values.query.ts` (testes do detalhe verdes antes e depois: 10 pass).

### Gates (exit code conferido com `$?`)

```text
bun run typecheck (raiz)                         exit=0
contrato da API (bun --env-file test)            exit=0  — 10388 pass · 25 skip · 0 fail
bun run lint (API)                               exit=0
bun run format:check (raiz)                      exit=0
integração da API, 6 lotes em primeiro plano     exit=0 em todos — 208+250+230+180+178+94 pass · 0 fail · 8 skip
```

Integração em Postgres 18 nativo descartável (porta própria, derrubado ao fim).

## T7.2b — frontends: requisitos efetivos, avisos e acabamento (2026-10-07)

Achados da segunda revisão independente (T7.2): N1, N2, N3, N4, N5, N7, N8, N9, N11, N13, N14. A API publica o requisito
efetivo do tipo no detalhe (contrato `requirements`, consumido aqui e fixado no golden local); nenhum arquivo de
`apps/api-transportada` foi tocado. Sem push nem deploy.

| Achado  | Correção                                                                                                                                                                                                                           | Prova                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| leitura | `TripOccurrenceDetail.requirements` (opcional, `null` tolerado) lido por guard sem `any` (`tripOccurrenceRequirements.validation.ts`); golden local ganhou a chave                                                                 | `occurrence-detail-values.contract.ts`: com a chave, sem a chave, `null` e 5 formas erradas recusadas                         |
| N1      | modo efetivo manda: `off` esconde o campo e nada dele vai no PATCH; `required` sem "Limpar", com o texto "Obrigatório" e Salvar bloqueado se o operador esvaziar; ambos `off` escondem a seção toda                                | `occurrence-correction-amounts.contract.ts` (corpo) e `occurrence-correction-requirements.contract.tsx` (tela)                |
| N2      | rótulos e nível vêm de `requirements`; `useOccurrenceTypeRecordConfig` (exige `settings.manage`) é só fallback quando `requirements` falta                                                                                         | contrato do operador sem permissão; navegador: "Número da NFD" e "Valor pago pela loja (da ocorrência)" sem `settings.manage` |
| N9      | "Soma da linha" e "Valor que vai no e-mail" usam o `unitValue` copiado em `itemValues`, com fallback ao preço da nota                                                                                                              | contrato (59,99 pela cópia x 60,00 pela nota); navegador: "Soma da linha: R$ 39,99" com nota a 20,00                          |
| N5      | máscara do painel com teto de 12 dígitos (10 + 2), igual ao motorista, e `AmountLimitNotice` (região viva) na correção, no acerto e no acerto da carga                                                                             | contrato da máscara e do aviso; navegador: 14 dígitos viram `1.234.567.890,12` e o aviso aparece                              |
| N8      | o rascunho do e-mail só some quando o salvar pousa (o guardado iguala o rascunho); PUT que falha preserva o texto                                                                                                                  | DOM `occurrence-type-mail-save-failure.contract.ts`; mutação (descartar antes do `onEdit`) fez 2 dos 3 casos falharem         |
| N7      | marcador que estoura o teto do campo é dito em `role="status"` `aria-live="polite"` (pt/en)                                                                                                                                        | mesmo arquivo DOM, caso do corpo com 4000 caracteres                                                                          |
| N14     | dica na aba Tipos: valor pago por linha + Produtos obrigatório + sem mínimo → "sem mínimo, o motorista marca todos os produtos"                                                                                                    | `occurrence-type-items-minimum-hint.contract.tsx` (aparece e 4 casos silenciosos)                                             |
| N3      | motorista: total sem o que somar é "—" (com "Sem valor" para leitor de tela); zero digitado continua "R$ 0,00"                                                                                                                     | contrato do componente; navegador: "Soma — Sem valor / Total — Sem valor" no início                                           |
| N4      | motorista: número do documento mantém o texto digitado, `aria-invalid`, explica os caracteres válidos (pt/en) e o Registrar fica bloqueado pelo motivo ("falta: “Número da NFD” com letras, números…")                             | contratos do serviço e da seção; navegador: `NFD 45029<script>` e `Nº 45029` ficam no campo                                   |
| N11     | `'required'`, `'off'`, `'item'`, `'occurrence'` e os problemas de quantidade viram constantes (`occurrenceValues.constant.ts`, `CORRECTION_AMOUNT_SCOPE`) nos arquivos editados                                                    | typecheck + suítes sem mudança de comportamento                                                                               |
| N13     | seção T6.1 duplicada (a que dizia `companies.settings`) removida; tabela da T7.1 linha 39 atualizada (a mensagem de tudo preenchido existe desde a B1(c)); `occurrenceDraftValues.types.ts` tem 68 linhas (66 depois desta rodada) | esta seção                                                                                                                    |

### Mutações registradas (vermelho colado, revertidas)

1. **Ignorar o modo `off`** (`isReferenceOff`/`isAmountOff` fixos em `false`, no componente e no serviço): `occurrence-correction-requirements.contract.tsx` + `occurrence-correction-amounts.contract.ts` → **25 pass, 4 fail**:

```text
(fail) ... (spec 247 T7.2b, N1/N2) > modo off: o campo não existe, nem o valor pago nem o número
(fail) ... (spec 247 T7.2b, N1/N2) > modo off só no número: o valor pago continua
(fail) ... (spec 247 T7.2b, N1) > off: nada do número nem do valor pago vai no corpo, mesmo digitado antes
(fail) ... (spec 247 T7.2b, N1) > off só no número: o valor pago segue, e número inválido digitado antes não reprova
```

2. **Rótulo genérico mesmo com `requirements`** (`amountLabel`/`referenceLabel` fixos em `undefined` em `buildRecordConfigFromRequirements`) → **3 pass, 3 fail**:

```text
(fail) ... (spec 247 T7.2b, N1/N2) > operador sem settings.manage: o rótulo e o nível vêm de requirements, não do genérico
(fail) ... (spec 247 T7.2b, N1/N2) > escopo por linha com nada gravado: um campo por produto, com o rótulo do tipo
(fail) ... (spec 247 T7.2b, N1/N2) > modo off só no número: o valor pago continua
```

3. **Descartar o rascunho antes do `onEdit`** (N8) → `1 pass, 2 fail` (os dois casos de sobrevivência do rascunho).

### Gates (código de saída conferido com `$?`, sem pipe)

Painel (`apps/frontend-transportada`):

```text
bun run typecheck (raiz)                         exit=0
bun run --cwd apps/frontend-transportada test    exit=0   (contratos + test:hooks: 921 pass, 0 fail)
bun run --cwd apps/frontend-transportada lint    exit=0   (0 errors, 16 warnings pré-existentes)
bun run format:check (raiz)                      exit=0
```

App do motorista (`apps/frontend-driver`):

```text
bun run typecheck (raiz)                         exit=0
bun run --cwd apps/frontend-driver test          exit=0   (1380 pass, 0 fail)
bun run --cwd apps/frontend-driver lint          exit=0
bun run format:check (raiz)                      exit=0
```

### Verificação no navegador (por texto, headless)

Painel: Vite de **dentro deste worktree** (binário da app, porta 53010, PID confirmado com `cwd` no worktree), `VITE_SMOKE_AUTH_BYPASS=true`, API dublada por `page.route` do Playwright do repositório; operador **sem** `settings.manage`.

| Cenário                                              | Observado                                                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| modo `off` nos dois campos                           | a seção "Número e valor pago" não existe; o formulário segue com os itens; Salvar habilitado                                                                              |
| modo `required`, valores gravados                    | campos "Número da NFD" e "P1 — Valor pago pela loja" sem botão "Limpar", cada um com "Obrigatório: este campo não pode ficar vazio."; esvaziar o número desabilita Salvar |
| `requirements` com escopo `occurrence`, nada gravado | "Número da NFD" e "Valor pago pela loja (da ocorrência)"; "Nada gravado."                                                                                                 |
| sem `requirements` (API anterior)                    | rótulos genéricos "Número do documento do cliente" e "P1 — Valor pago"                                                                                                    |
| soma com valor unitário copiado (19,995 x 2)         | "Soma da linha: R$ 39,99" (a nota diz 20,00 → 40,00)                                                                                                                      |
| teto do dinheiro: 14 dígitos                         | campo `1.234.567.890,12` e região viva "Limite de 10 dígitos antes da vírgula: a próxima tecla não entra."                                                                |
| 375 / 768 / 1280                                     | sem estouro horizontal (`scrollWidth <= clientWidth`)                                                                                                                     |

App do motorista: arnês descartável (não commitado) que renderiza o `DriverOccurrenceRegistrationForm` real, Vite na porta 53210 (cwd confirmado).

| Cenário                      | Observado                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| total sem nada a somar       | "Soma dos produtos (NF-e) — Sem valor" e "Total que vai no e-mail — Sem valor"                                                                             |
| `NFD 45029<script>`          | texto mantido no campo, `aria-invalid="true"`, erro ligado ao campo, "Para registrar, falta: “Número da NFD” com letras, números…", Registrar desabilitado |
| `Nº 45029`                   | texto mantido como digitado (nada de `N 45029`)                                                                                                            |
| teto do dinheiro: 14 dígitos | `1.234.567.890,12` e aviso "Limite do campo…" em região viva                                                                                               |
| 375 / 768 / 1280             | sem estouro horizontal                                                                                                                                     |

Servidores encerrados por PID (cwd conferido), arnês e roteiros apagados, portas 53010 e 53210 livres, `git status` limpo.

**O que não foi rodado:** nenhum print (a regra do projeto pede um só ao fim, e o relatório é por texto); `make smoke`/Playwright do repositório (a verificação usou um roteiro descartável com a mesma dublagem por `page.route`); integração de API e `make migration-test` (a API não foi tocada); a dica N14 foi provada por contrato de componente, não no navegador; o desvio (dica "Limpar" ainda aparece no texto de ajuda geral da seção mesmo com campos `required`) ficou como está, por ser a legenda da seção, não de um campo.

## T7.4 — gates finais (2026-10-07)

`git fetch`: `origin/staging` não avançou (0 atrás, 44 à frente antes da T7.3); sem rebase. Código de saída conferido por `$?`, saída em arquivo, sem pipe.
Postgres 18.4 **nativo descartável** (`127.0.0.1:56254`, diretório no scratchpad, `DATABASE_URL`/`DRIZZLE_TEST_DATABASE_URL`/`API_TEST_DATABASE_URL` por variável de
ambiente), derrubado por `pg_ctl stop` no diretório (PID 46787) e diretório removido; `pg247` não foi tocado; nada contra staging ou produção.

```text
bun install --frozen-lockfile                      exit=0   (788 installs, no changes)
bun run typecheck (raiz)                           exit=0
bun run format:check (raiz)                        exit=0   All matched files use Prettier code style!
lint api/painel/driver/worker/cron/client/landing  exit=0 em todos (painel: 16 warnings antigos, 0 errors)
contrato da API (--env-file=../../.env.test)       exit=0   10493 pass · 25 skip · 0 fail · 10518 tests, 200 files
bun run --cwd apps/frontend-driver test            exit=0   1383 pass · 0 fail
bun run --cwd apps/frontend-transportada test      exit=0   7374 pass · 0 fail  +  934 pass · 0 fail (hooks)
bun run --cwd apps/frontend-client test            exit=0   89 pass · 0 fail
worker 1991 pass · cron 101 pass · landing 131 pass         exit=0 em todos, 0 fail
integração da API, 6 lotes em primeiro plano       exit=0 em todos: 209 + 259 + 242 + 172 + 166 (1 skip) + 123 = 1171 pass · 1 skip · 0 fail (216 arquivos)
bun run db:test (API)                              exit=0   141 pass · 0 fail · 8 arquivos
bun run db:generate (API)                          exit=0   {"status":"no_changes","dialect":"postgresql"}; git status limpo
bun run build das 7 apps                           exit=0 em todos
make check (literal)                               exit=0   API 10484 pass · 34 skip · 0 fail; demais suítes como acima
```

**`make check` literal passou**: o `bun run test` da API rodou sem o timeout de `toll booth catalog repository (spec 154)` nesta máquina e sem DATABASE_URL de ambiente
(34 skip contra 25 da execução com `--env-file` avulso; a diferença não foi investigada). O que prova o banco é a integração em lotes acima, não o `make check`.

**O que não rodou:** `make migration-test` (sobe o Postgres do Docker); `db:test` rodou direto contra o Postgres nativo descartável, o mesmo script que o make chama. `make smoke`, `make worker-integration`,
`make e2e-up`. Nenhum gate revelou defeito de código.

## T7.3x — botão de quantidade total do item (pedido do usuário)

Pedido: na linha do produto marcado (`P1 · Biscoito · Na nota: 3 CX × R$ 19,995`), um botão que preenche
"Quantidade devolvida" com tudo o que a nota tem do produto, em vez de digitar. Só `apps/frontend-driver`.

- `shared/occurrenceTotalQuantity.service.ts`: `resolveTotalQuantityText` (texto da nota → `3`, `2,5`, `0,333`, `1000`;
  `bigint`/string, sem `number`; sem botão para vazio, zero, inválido, mais de 3 casas ou 9 dígitos) e
  `isTotalQuantityText` (`3`, `3,0` e `3,00` valem o total). Contrato de tabela: `occurrence-total-quantity.contract.ts`.
- `OccurrenceItemRow.component.tsx`: botão "Total da nota" (`aria-label` "Devolver tudo: 3 CX", `aria-pressed`)
  ao lado do campo, via `handleFillTotalQuantity` → o mesmo `form.handleItemQuantityChange` do campo. Quantidade já
  total: botão pressionado, mesmo rótulo, sem sumir. Chaves `occurrenceRegistration.items.fillTotal` e `fillTotalAria`
  (pt-BR e en).
- Teste de comportamento: `occurrence-fill-total.contract.tsx` renderiza com o hook real e chama o `onClick` do
  `<button>` real (sem DOM nesta app, o arnês chama a linha dentro do render e dispara o clique).

**Mutação (vermelho, revertida).** (1) O botão preenche a quantidade de outro produto (`code: 'P1'` fixo):
`o clique de um produto não mexe no campo do outro` — `Expected to contain: "value=\"2\""`, `Received: … value="5" … A nota tem só 3 CX.`
(1 fail, 6 pass). (2) O clique não passa pelo caminho de edição (handler sem chamar o formulário): falham
`o clique põe 3 no campo e a conta, a soma da linha e a soma geral seguem` e `o clique de um produto não mexe no campo do outro` (2 fail, 5 pass).

**Navegador** (arnês descartável, `DriverOccurrenceRegistrationForm` real, Vite 53210, cwd conferido): P1 com `1` →
"1 CX × R$ 19,995 = R$ 20,00", soma R$ 20,00, botão `aria-pressed="false"`; clique em "Total da nota" → campo `3`,
"3 CX × R$ 19,995 = R$ 59,99", soma e total R$ 59,99, `aria-pressed="true"`. Medidas 375/768/1280: sem estouro horizontal,
botão 118 x 48 px (alvo >= 44), contraste do texto 13,6:1, foco por Tab com contorno cobre de 2 px (`:focus-visible`).
Servidor encerrado por PID, arnês apagado, porta 53210 livre.

**Não rodado:** fluxo com login real (Keycloak) e fila real; `make smoke`; um print só (375 px) foi visto, não anexado.

## T7.4x — moldura real do registro do motorista (espaçamento)

Queixa do usuário: "essa tela ta sem espaçamento internas, esta grudada nas extremidades", vista em
`harness.html`. Esse arnês renderizava só o `DriverOccurrenceRegistrationForm`, sem o cartão `.document` nem a
página; as medidas anteriores eram do arnês. Desta vez o arnês descartável (não versionado, `apps/frontend-driver/harness.{html,tsx}`)
monta a página REAL `DriverTripWorkspacePage` (header, lista, `DriverStopCard`, CSS e i18n reais) sobre a API de demonstração, com o
formulário aberto no documento com produtos (tipo "Devolução parcial", 3 produtos, valor pago por linha, "Total da nota").
Vite do próprio worktree (cwd conferido por `lsof`), Chromium, `getBoundingClientRect`/`getComputedStyle`, tema escuro e claro.

| Elemento (estados: recém-aberto, produtos marcados + quantidade + "Total da nota", erro `aria-invalid`, botão bloqueado com motivo, nota resolvida) | Distância à borda interna do cartão (375 / 768 / 1280)                                                                                  | Distância à janela (375 / 768 / 1280) | Veredito |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------- |
| Cartão `.document` (borda 1 px, `padding: var(--space-3)`)                                                                                          | recuo 12 px nos três                                                                                                                    | 33 / 97 / 353 px                      | correto  |
| Título, aviso, chips de tipo, produtos, totais, NFD, observação, foto, "Registrar", "Cancelar", mensagem do motivo                                  | 12 px (esq.) e >= 12 px (dir.), nenhum <= 4 px                                                                                          | >= 45 px                              | correto  |
| Campos de quantidade e valor pago, "Total da nota", cálculo da linha, mensagem de erro                                                              | 12 + recuo da linha (>= 12)                                                                                                             | >= 45 px                              | correto  |
| Estouro horizontal (formulário, cartão, página)                                                                                                     | `scrollWidth == clientWidth` em todos                                                                                                   | idem                                  | nenhum   |
| Alvos: botões e campos                                                                                                                              | >= 45 px de altura (Registrar 48, Tirar foto/Anexar 48, campo 45, textarea 83); rótulos de 19 px são legenda do campo, o alvo é o campo |                                       | correto  |

Resultado: no app real o formulário tem 12 px de recuo interno em todos os estados, larguras e temas; nenhum elemento encosta
(<= 4 px) nem ultrapassa o cartão ou a janela. O defeito visto era do arnês antigo (sem o cartão). Nenhum código do app foi alterado.
Contrato novo `test/driver-trip/occurrence-frame-padding.contract.ts` trava a regra CSS resolvida do cartão (`.document`: borda e
`padding: var(--space-3)`; `.occurrenceForm` sem margem negativa); provado por mutação (`padding: 0` no cartão derruba o teste).

**Não verificado:** login real (Keycloak) e API real (autenticação do arnês é um stub de token; dados da demo); aparelho físico.
