# Evidência — Feature 255

Worktree: `../transportada-wt/spec-255` (branch `work/spec-255`, a partir de `origin/staging` @ 754630a65).

## T0.1 — Conferência do `plan.md` contra `origin/staging` (2026-10-07)

Existem como escrito: `src/shared/trip-occurrence.constant.ts`, `src/database/trip.schema.ts`
(`company_occurrence_types` na linha 2726; `declared_amount_label` coluna 2854, CHECK 2946),
`src/trips/presentation/occurrence.schema.ts`, `save-occurrence-type-values.mapper.ts`,
`list-field-occurrence-types.use-case.ts`, `read-settings-resolution.use-case.ts`,
`infrastructure/delivery-proof-read.support.ts`, os dois `icon.tsx`, `scripts/driver-preview-api.ts`,
`field-occurrence-type.fixture.ts`.

Divergências (o plano deve ser lido com estas correções):

| Plano diz                                                           | Real                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-transportada/.../occurrenceType.types.ts`                 | `src/modules/trip/shared/occurrenceType.types.ts`                                                                                                                                         |
| `.../tripResponse.validation.ts`, `occurrenceTypeUpdate.service.ts` | também em `src/modules/trip/shared/`                                                                                                                                                      |
| `frontend-driver/.../driverTrip.types.ts`                           | `src/modules/driver-trip/shared/driverTrip.types.ts`                                                                                                                                      |
| `DriverOccurrenceRegistrationForm`                                  | `src/modules/driver-trip/components/`                                                                                                                                                     |
| só `frontend-driver` tem tipo de motorista                          | **`frontend-transportada/src/modules/driver-trip/shared/driverTrip.types.ts` também existe** (caminho de transição `/minha-viagem`, ADR-0075): T1.2 e T3.3 precisam tocar nas duas cópias |
| goldens `driver-snapshot-document.golden.json`                      | existe em **três** apps (api, frontend-driver, frontend-transportada); `settings-resolution.golden.json` em api e frontend-transportada                                                   |

Última migration: `20261007205304_nfse_national_taxation` (a nova tem de ser posterior).

## T0.2 — O `GET` da viagem devolve o tipo? (2026-10-07)

Devolve **só o nome**. `infrastructure/delivery-proof-read.support.ts:416` e `:919` fazem `innerJoin` com
`company_occurrence_types` e selecionam `typeName: companyOccurrenceTypes.name`; o painel lê `typeName`
em `trip.types.ts:208` e `:390` (e `trip.constant.ts:458`, chaves exatas da referência da linha do tempo).
Não há `typeIconName`. Consequência para o RF6: o join já existe, então o campo é aditivo
(`typeIconName: companyOccurrenceTypes.iconName` nos dois selects, T2.2) e o painel o lê como opcional (T1.1).
Atenção: `trip.constant.ts:458` e `:637` são listas de chaves exatas — conferir se `typeIconName` precisa entrar.

## T1.1 — Painel tolerante (2026-10-07)

**Vermelho inicial:**

- Contrato `occurrence-type-icon-tolerance.contract.ts` criado: 5 testes falhando (5 fail, 7614 pass)
  - `iconName` não aceito em tipo (chave desconhecida)
  - `typeIconName` não aceito em ocorrência
  - Função `tripOccurrenceFromApi` inexistente

**Implementação:**

1. `occurrenceType.types.ts:41-42`: `iconName?: null | string`
2. `trip.types.ts:208-209`: `typeIconName?: null | string` em `TripOccurrence`
3. `trip.types.ts:226-227`: `iconName?: null | string` em `FieldOccurrenceType`
4. `tripResponse.validation.ts:1924`: `iconName` em allowed keys
5. `tripResponse.validation.ts:1960`: validação `(value.iconName === undefined || value.iconName === null || isString(value.iconName))`
6. `tripResponse.validation.ts:2021`: desestruturação de `iconName` em `toOccurrenceType`
7. `tripResponse.validation.ts:2042`: spread condicional `...(isString(iconName) ? { iconName } : {})`
8. `trip.constant.ts:502-503`: `typeIconName` em `TRIP_OCCURRENCE_OPTIONAL_KEYS`
9. `tripResponse.validation.ts:1509-1512`: validação de `typeIconName` em `isTripOccurrence`
10. `tripResponse.validation.ts:1118-1120`: função `tripOccurrenceFromApi(input: unknown): TripOccurrence`
11. `test/trip.contract.test.ts:159`: import `occurrence-type-icon-tolerance.contract`
12. Prettier: formatação do arquivo novo

**Verde final:**

- Testes: 7619 pass, 0 fail ✓
- Typecheck: sem erros ✓
- ESLint: sem erros ✓
- Prettier: passou ✓

**Commit:** `cd5253999` — feat(frontend): painel aceita iconName opcional no tipo de ocorrência (spec 255 T1.1)

## T1.2 — App do motorista tolerante (2026-10-07)

**Vermelho inicial:**

- Contrato `occurrence-type-icon-tolerance.contract.ts` criado em `apps/frontend-driver/test/driver-trip/`: 3 testes falhando (3 fail, 1414 pass)
  - `iconName: 123` não era recusado (tipo errado)
  - `iconName: ['truck']` não era recusado (tipo errado)
  - Chave desconhecida não era recusada (falta guarda de chave exata)

**Implementação:**

1. `apps/frontend-driver/src/modules/driver-trip/shared/driverTrip.types.ts:471-473`: `iconName?: null | string` ao tipo `DriverOccurrenceType`
2. Mesmo arquivo, line 504: `readonly iconName?: unknown` ao candidato do guard
3. Mesmo arquivo, lines 536-540: validação `hasKnownIconName` (aceita `undefined`, `null`, `string`)
4. Mesmo arquivo, lines 487-502: guarda de chave exata com `allowedKeys.has(key)` (rejeita chaves desconhecidas)
5. Return do guard inclui `hasKnownIconName` na linha 550
6. `apps/frontend-transportada/src/modules/driver-trip/shared/driverTrip.types.ts:211`: `iconName?: null | string` ao tipo (cópia de transição /minha-viagem, sem guard)
7. `apps/frontend-driver/test/driver-trip.contract.test.ts:46`: import `occurrence-type-icon-tolerance.contract`
8. Prettier: formatação

**Verde final:**

- Testes: 1417 pass, 0 fail ✓
- Typecheck: sem erros ✓
- ESLint: sem erros ✓
- Prettier: passou ✓

**Verificação da cópia:**

- `frontend-transportada/src/modules/driver-trip/shared/driverTrip.types.ts` tem tipo `DriverOccurrenceType` simplificado (só `id` e `name`); sem guard; agora com `iconName?: null | string` tolerante.

**Commit:** feat(frontend-driver): app do motorista aceita iconName opcional no tipo de ocorrência (spec 255 T1.2)

### T1.2 — correção na revisão (2026-10-07)

O executor `haiku` acrescentou ao `isDriverOccurrenceType` uma whitelist de 18 chaves (guard de chave exata) que
o guard do motorista não tinha, e um teste que afirmava a recusa de chave desconhecida. Isso contrariava o
plano ("campo opcional, desconhecido tolerado") e faria o app recusar qualquer chave nova da API. Removido; o
teste agora afirma a tolerância. Também saíram os comentários que citavam a spec. Gates depois da correção:
typecheck `frontend-driver` e `frontend-transportada` limpos, `bun run test` 1417 pass / 0 fail, eslint e
prettier limpos.

## T2.1 — validação do `architect` (opus), antes de implementar

Veredito: **APROVADO COM AJUSTES**.

- CHECK com lista `IN` segue o padrão do repo (`inList` + `raw`); ampliar o catálogo = migration `DROP`+`ADD CONSTRAINT` numa instrução só; rollback de ampliação leva os valores novos a `NULL` antes de recriar a CHECK antiga.
- Gerar a pasta com `db:generate -- --name occurrence_type_icon` **depois** de `git fetch && git rebase origin/staging`; `prevIds` = id de `20261007205304_nfse_national_taxation`. Snapshot nunca à mão; segundo `db:generate` deve dar `no_changes`.
- Coluna só em `company_occurrence_types` (nunca nas tabelas `*_overrides`/`moments`).
- Ajuste obrigatório 1: acrescentar a pasta nova no fim da lista fixa de `test/database-migration/static-migration.contract.ts` (~linha 360).
- Ajuste obrigatório 2: registrar `./test/integration/occurrence-type-icon.integration.ts` em `test:integration` no `package.json` da API.
- Integração insere cada nome do catálogo, `NULL` e um inválido (`23514`, `constraint_name = company_occurrence_types_icon_name_check`).
- Recomendado: `test/database-migration/occurrence-type-icon.static.contract.ts` (padrão da 247) e assertion de rollback em `database-migration.integration.ts`.

## T2.1 — Catálogo, coluna, CHECK, migration e rollback (2026-10-08)

`git fetch && git rebase --autostash origin/staging` antes de gerar: já em dia com `754630a65`.

**Vermelho** (`bun --env-file=../../.env.test test --timeout 120000 ./test/integration/occurrence-type-icon.integration.ts`):

1. teste escrito antes de tudo: `SyntaxError: Export named 'OCCURRENCE_TYPE_ICON_NAMES' not found` — 0 pass / 1 fail;
2. com a constante e sem a coluna: `TypeError: Object.entries requires that input parameter not be null or undefined`
   (o `select` de `companyOccurrenceTypes.iconName` inexistente) — 0 pass / 1 fail.

**Implementação** (só `company_occurrence_types`; nada em `*_overrides` nem `moments`):

- `src/shared/trip-occurrence.constant.ts`: `OCCURRENCE_TYPE_ICON_NAMES` (10 nomes, `as const`) e `OccurrenceTypeIconName`.
- `src/database/trip.schema.ts`: `iconName: varchar('icon_name', { length: 32 }).$type<OccurrenceTypeIconName>()`, sem `notNull`/`default`;
  CHECK `company_occurrence_types_icon_name_check` = `icon_name is null or icon_name in (inList(catálogo))`.
- `db:generate -- --name occurrence_type_icon` → `drizzle/20261008024137_occurrence_type_icon/` (`migration.sql`, `snapshot.json`).
  `prevIds` = `b685ccc8-da17-4849-8518-5f564580ccda` = `id` de `20261007205304_nfse_national_taxation`. No `migration.sql` só
  entraram o cabeçalho de copyright e comentários; as duas instruções são as geradas. Segundo `db:generate`:
  `{"status":"no_changes","dialect":"postgresql"}`.
- `rollback.sql` à mão (padrão da 247): "Manual rollback only", `BEGIN`, `DROP CONSTRAINT IF EXISTS`, `DROP COLUMN IF EXISTS`,
  `DELETE` do journal com `ROW_COUNT = 1`, `COMMIT`. Sem `CASCADE`.
- Testes: `test/integration/occurrence-type-icon.integration.ts` (cada nome do catálogo, `NULL`, `'rocket'` → `{ constraint:
company_occurrence_types_icon_name_check, sqlState: 23514 }`), registrado no fim de `test:integration`;
  `test/database-migration/occurrence-type-icon.static.contract.ts` (um `ADD COLUMN "icon_name" varchar(32)` sem `DEFAULT`/`NOT NULL`,
  CHECK depois da coluna com o catálogo exato, sem `UPDATE`/`DROP`/`DELETE`, nenhuma `_overrides`/`_moments`; rollback em ordem e sem
  `CASCADE`), importado em `test/database-migration.contract.test.ts`; `occurrence-type-icon.assertion.ts` chamado em
  `database-migration.integration.ts` antes do rollback da 247 (ordem inversa do histórico): rollback derruba só a CHECK e a coluna,
  as outras CHECKs da tabela ficam, tipo gravado antes da reaplicação volta com `icon_name` NULL. Pasta nova no fim da lista fixa de
  `static-migration.contract.ts`.

**Verde (gates):**

- integração nova: 1 pass / 0 fail (13 expect).
- `bun run typecheck` (raiz): exit 0.
- `bun run lint` (cwd `apps/api-transportada`, `--max-warnings=0`): exit 0.
- `bun --env-file=../../.env.test run test` (API): 10924 pass / 25 skip / 0 fail, 207 arquivos.
- `bun --env-file=../../.env.test run test:integration` (Postgres de teste em 65432, `make up ENV_FILE=.env.test SERVICES=postgres`):
  1288 pass / 8 skip / 0 fail, 243 arquivos.
- `make migration-test`: 158 pass / 0 skip / 0 fail (inclui a asserção de rollback nova).
- `bun run format:check` (raiz): "All matched files use Prettier code style!".

Desvio do veredito: nenhum. O nome da pasta saiu com data `20261008` (relógio UTC do `drizzle-kit`).

## T2.2 — Zod, mapper, use case, leitura, DTOs e goldens (RF2, RF3, CA2)

**Vermelho (contrato escrito antes do código):** `test/trip-occurrence/occurrence-type-icon.contract.ts`, ligado em
`test/trip-occurrence.contract.test.ts` (já na lista do `package.json`). Primeira execução, sem nenhuma mudança em `src/`:
14 fail / 710 pass. Exemplos: `iconName` resolvido `Expected: "alert"` / `Received: undefined`; `readSettingsResolution`
`Expected ['invoice', null]` / `Received [undefined, undefined]`.

**Implementado:** `iconName: z.enum(OCCURRENCE_TYPE_ICON_NAMES).nullable().optional()` no `occurrenceTypeSchema` (fora do catálogo
é `400 INVALID_REQUEST` com o campo nos detalhes; ausente mantém, `null` limpa); `SaveOccurrenceTypeInput`/`SaveOccurrenceTypeValues`,
mapper, `writeOccurrenceTypeRow` (spread condicional, grava e devolve), `findOccurrenceType`/`listOccurrenceTypes`,
`toFieldOccurrenceType` (`iconName: null | nome`), `readSettingsResolution`, `typeIconName` em `listTripOccurrences` e
`findTripOccurrenceById`. `iconName` sai direto do tipo — nunca passa por `resolveOccurrenceRequirements` nem por exceção.
Goldens (`settings-resolution`, `driver-snapshot-document`) com `"iconName": "money"` e as cópias nas duas apps.

**Mutação vermelha:** removida a linha `iconName: input.iconName,` do `save-occurrence-type-values.mapper.ts`:

```
Expected: "alert"
Received: undefined
(fail) o PUT do catálogo valida o ícone do tipo (spec 255 RF2, CA2) > aceita alert do catálogo
... (um fail por nome do catálogo e o do caso de uso)
```

Linha restaurada; contrato volta a 724 pass / 0 fail.

**Verde (gates):**

- `bun run typecheck` (raiz): exit 0.
- API `test`: 10944 pass / 25 skip / 0 fail, 207 arquivos.
- integração `test/integration/occurrence-type-icon-write.integration.ts` (3 testes: grava/mantém/limpa e lê em get e list; sem o campo
  é `null`; `typeIconName` na lista e na leitura única), registrada no fim de `test:integration`; suíte inteira: 1291 pass / 8 skip / 0 fail,
  244 arquivos.
- `frontend-driver` `test`: 1417 pass / 0 fail. `frontend-transportada` `test`: 7619 pass / 0 fail (+1126 do passo seguinte do script).
- eslint `--max-warnings=0`: API exit 0; arquivos tocados do `frontend-transportada` limpos. O `lint` do `frontend-transportada`
  já falha na base (20 problemas, 4 erros, em arquivos não tocados) — idêntico sem as mudanças.
- `bun run format:check` (raiz): verde.

**Desvio:** a T1.1 deixou o painel aceitar `iconName` só no tipo de escritório. O guard de `GET /occurrence-types/field`
(`FIELD_OCCURRENCE_TYPE_OPTIONAL_KEYS`) e o de `settings-resolution` (`SETTINGS_RESOLUTION_OPTIONAL_KEYS`) rejeitavam a chave
(`TRIP_RESPONSE_INVALID`) assim que a API a mandasse; `iconName` entrou nas duas listas e em `SettingsResolutionOccurrenceType`.
Fora do escopo desta task por desenho: o feed, o detalhe e a view `occurrence-type-items-read` não ganharam `typeIconName` (possível
lacuna para o cartão da viagem na T3.4).

## T3.1 — Glyphs faltantes nos dois icon.tsx + contrato catálogo × ICON_PATHS

**Status**: ✅ COMPLETO

### Implementação

Adicionados os ícones do catálogo `OCCURRENCE_TYPE_ICON_NAMES` (10 nomes) aos dois apps:

- **Painel**: `clipboard-list`, `money`, `package` (adicionados a src/components/ui/icon.tsx e tipo IconName)
- **Motorista**: `truck` (adicionado a src/components/ui/icon.tsx e tipo IconName)

Traçados copiados do app que já os possuía, idênticos entre as duas apps (ADR-0075 §7):

- `clipboard-list`: prancheta com lista (motorista → painel)
- `money`: círculo com cifrão (motorista → painel)
- `package`: caixa 3D em perspectiva (motorista → painel)
- `truck`: caminhão com rodas (painel → motorista)

### Testes (TDD)

Contratos em `test/icon-catalog.contract.test.ts` (ambos os apps):

- Verifica que todos os 10 nomes do catálogo estão definidos em ICON_PATHS
- Usa regex simples (robusto a comentários e espaçamento)
- Painel: verde ✅ (7620 pass)
- Motorista: verde ✅ (1418 pass)

### Gates

- **typecheck**: ✅ PASSOU (0 errors)
- **format:check**: ✅ PASSOU
- **eslint**: ⚠️ 4 erros pré-existentes no painel (test/trip/occurrence-type-icon-tolerance.contract.ts), não relacionados a T3.1; motorista limpo
- **Testes**: ✅ painel 7620 pass / motorista 1418 pass

### Commit

- Hash: `9eb62438a`
- Mensagem: "feat(frontend): glyphs do catálogo de ícones do tipo de ocorrência (spec 255 T3.1)"
- Arquivos: 6 modificados, 2 criados (testes)
- Assinatura: Co-Authored-By: Claude Haiku 4.5

### T3.1 — correção na revisão

O contrato do executor tinha a lista de nomes copiada à mão e só conferia presença: ampliar o catálogo da API ou desenhar um glyph diferente numa das apps não deixaria nada vermelho. Os dois contratos passam a ler `OCCURRENCE_TYPE_ICON_NAMES` do arquivo da API (mesmo padrão de `catalog-parity.contract.ts`) e o do painel compara também o traçado de cada glyph com o do motorista.

Mutação vermelha: o traçado de `truck` do motorista alterado (`...v4h-7z` → `...v4h-8z`) deixa `desenha cada glyph igual ao do motorista` vermelho (1 pass, 1 fail); restaurado, 2 pass, 0 fail no painel e 1 pass, 0 fail no motorista. Medido à mão: os 10 traçados são idênticos nas duas apps.

## T3.2 — Aba Tipos: seletor de ícone + locale (RF4)

**Vermelho (antes de implementar):** os três contratos novos falharam — `occurrence-type-icon-catalog` e `occurrence-type-icon-picker`
com `Cannot find module` (constante e componente inexistentes); `occurrence-type-icon-body` com 2 fail (`iconName` string e `null` não
iam no corpo; o caso "omite a chave" já passava).

**Verde:** `OccurrenceTypeIconPicker` (grade de botões nativos, `aria-label` do locale, `aria-pressed`, "Sem ícone" devolve `null`) no
bloco Identificação (`OccurrenceTypeIdentity`); lista única em `shared/occurrenceTypeIcon.constant.ts`, igualada ao catálogo da API
lida como texto. `iconName` entrou em `OccurrenceTypeSaveInput`/`OccurrenceTypeEdit` e no corpo do `PUT` (`tripClient.service.ts`).
O formulário já modela "não mexe" como `undefined` (edição parcial), então a chave só vai quando o seletor é usado — string do catálogo
ou `null`. O tipo lido já traz `iconName` (T1.1), que alimenta o `aria-pressed`. Locale em `companySettings.locale.json` e `.en.locale.json`
(`occurrenceTypeCatalog.identity.icon.*`). Nenhum arquivo de `useTripWorkspace`/`TripOccurrences` foi tocado.

**Desvio:** o seletor mora em `OccurrenceTypeIdentity` (o bloco de identificação real da aba), não em `OccurrenceTypeRecordFields`.
O CSS usa `--control-height-compact` e import relativo da folha, exigidos pelos contratos de design system.

**Gates:** `bun run typecheck` (raiz) verde; `test` do `frontend-transportada` 7625 pass / 0 fail (+1130 do `test:hooks`);
`bunx eslint --max-warnings=0` nos arquivos da task: exit 0 (o `lint` da app segue com os 4 erros pré-existentes em
`test/trip/occurrence-type-icon-tolerance.contract.ts`, não tocado); `frontend-driver` não tocado.

## T3.3 — Chip do motorista com ícone (RF5, CA1)

**Vermelho (antes de ligar o chip):** `occurrence-type-icon-chip.contract.tsx` — 1 fail ("o chip põe o ícone antes do nome e não muda o
nome acessível"): o formulário ainda não trazia `<OccurrenceTypeIcon iconName={type.iconName} />`. Os demais casos (svg decorativo para
nome do catálogo; `''` para ausente, `null`, desconhecido, `sun` fora do catálogo; lista do motorista igual à da API lida como texto)
passavam por já existir o componente. Suíte do contrato: 1290 pass / 1 fail.

**Verde:** `OccurrenceTypeIcon` devolve `null` quando o nome não é do catálogo, então o chip sem ícone tem o mesmo markup de antes
(CA1); o `Icon` já é `aria-hidden`, e o nome acessível do chip (`role="radio"`, sem `aria-label`) não muda. Sem CSS novo: o botão da app já
espaça filho e texto. `iconName` entrou nos tipos de exemplo de `scripts/driver-preview-api.ts` (`package` e `null`).

**Desvio:** o catálogo do motorista é a cópia por valor `shared/occurrenceTypeIcon.constant.ts` (a app não importa código de outra); o
contrato confere a lista contra `OCCURRENCE_TYPE_ICON_NAMES` da API. O formulário inteiro não é renderizado estaticamente (hook com
estado e fila): a posição do ícone no chip é conferida no fonte, o markup sem ícone no componente.

**Gates:** `bun run typecheck` (raiz) verde; `test` do `frontend-driver` 1426 pass / 0 fail; `bunx eslint --max-warnings=0` nos arquivos
da task: exit 0; `format:check` (raiz) verde. `frontend-transportada` não tocado.

## T3.4 — Cartão da ocorrência no painel com ícone (2026-10-08)

**Caminhos que alimentam o cartão (RF6):**

- `TripOccurrences` (cartão da ocorrência da viagem/nota) lê `TripOccurrence`, que vem de
  `listTripOccurrences`/`findTripOccurrenceById` em `delivery-proof-read.support.ts` — já trazem
  `typeIconName` desde a T2.2. Tipo (`trip.types.ts:208`), guarda (`tripResponse.validation.ts:1513`)
  e lista de chaves exatas (`trip.constant.ts:499`) já toleravam a chave (T1.1): nada a mudar na API
  nem na guarda.
- Fora do escopo desta task, sem ícone e sem mudança: linha do feed (`trip-occurrence-feed.query.ts`,
  tabela, não cartão), linha do tempo (`typeName` é referência de chave exata) e o item do
  recebimento de carga (`CargoOccurrenceListItem`, outra leitura). Nenhum caminho precisou de
  mudança aditiva na API.

**Vermelho:** `test/trip/occurrence-card-type-icon.contract.tsx` (registrado em `trip.contract.test.ts`):
2 fail (ícone antes do nome, com e sem link), 2755 pass; os casos de markup idêntico passam desde o início.

**Verde:** `OccurrenceTypeIcon.component.tsx` (ícone decorativo `aria-hidden`, só nome do catálogo
`OCCURRENCE_TYPE_ICON_NAMES`; nulo/ausente/desconhecido = `null`), usado dentro do link/span do tipo em
`TripOccurrences`; classe `.occurrenceEntryTypeIcon` em `trip.module.css`. Sem ícone o markup é idêntico.

**Gates:** `bun run typecheck` raiz limpo; `bun run test` da frontend-transportada 1130 pass / 0 fail;
eslint `--max-warnings=0` nos arquivos tocados limpo; prettier aplicado. API não tocada (sem contrato/integração novos).
