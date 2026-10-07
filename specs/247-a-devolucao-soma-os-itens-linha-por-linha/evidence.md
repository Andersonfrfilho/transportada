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
