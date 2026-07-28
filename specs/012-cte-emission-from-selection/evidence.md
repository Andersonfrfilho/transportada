# Evidence — 012 CT-e emission from selection

## T001 — Schema dos perfis de emissão

### Artefatos

- `apps/api-transportada/src/database/cte-emission-profile.schema.ts`
- `apps/api-transportada/src/database/database.schema.ts` (import, `export *`, `databaseSchema`)
- `apps/api-transportada/drizzle/20260727114820_cte_emission_profiles/{migration.sql,rollback.sql,snapshot.json}`
- `apps/api-transportada/test/cte-profiles-schema.contract.test.ts` + `test/cte-profiles-schema/*.contract.ts`
- `apps/api-transportada/package.json` — teste registrado na lista explícita do script `test`
- `apps/api-transportada/test/database-migration/support.ts` — `CTE_PROFILE_TABLES`
- `apps/api-transportada/test/database-migration/{static-migration.contract.ts,database-migration.integration.ts}`

### Red antes da implementação

```
bun test ./test/cte-profiles-schema.contract.test.ts
SyntaxError: Export named 'cteEmissionProfiles' not found in module
  '.../apps/api-transportada/src/database/database.schema.ts'.
0 pass · 1 fail · 1 error
```

### Green

```
$ bun test ./test/cte-profiles-schema.contract.test.ts
 17 pass · 0 fail · 32 expect() calls  [102.00ms]
```

### Migration + rollback em PostgreSQL descartável

```
$ make migration-test
 9 pass · 0 fail · 129 expect() calls  [2.39s]
```

Cobre: aplicar todas as migrations, conferir as tabelas criadas (agora incluindo
`cte_emission_profiles`, `cte_emission_profile_matchers`, `cte_emission_profile_components`),
rodar os rollbacks em ordem reversa, reaplicar e derrubar de novo. Hash do journal validado:
`86f9672dff874cbefd2769fc7fe0e1273a8dcf881f0f6b8741933e552b37d6e9`.

### Gates

```
$ bun run typecheck        # api + worker + cron + frontend — sem erros
$ bun run --cwd apps/api-transportada test
 503 pass · 1 skip · 0 fail · 3037 expect() calls
$ bun run lint             # 4 apps, --max-warnings=0 — limpo
```

### Decisões registradas

- Isolamento de tenant por chave composta: `(company_id, freight_rule_id)` → `freight_rules(company_id, id)`
  e `(created_by_user_id, company_id)` → `user_company_memberships(user_id, company_id)`. Nenhum
  relacionamento alcança outro registro só por `id`.
- Matchers e componentes caem por `cascade` a partir do perfil; o perfil só cai por `restrict`
  a partir da empresa.
- Alíquotas (`icms_rate`, `icms_base_reduction_rate`, `components.rate`) são `numeric(9, 6)` como
  fração 0..1; `components.amount` é `numeric(19, 4)`. Nenhum valor monetário em float.
- `cte_emission_profile_components_value_coherence_check` impede um componente com `rate` e `amount`
  ao mesmo tempo: `fixed_amount` exige `amount`, os percentuais exigem `rate`.
- `operation_nature` limitada a 60 caracteres no banco — é o limite que a SEFAZ aceita em `natOp`
  e o CT-e de referência chega truncado nesse tamanho.
- `cte_emission_profiles_predominant_product_check` amarra `predominant_product_name` preenchido
  exatamente quando o modo é `fixed`.

## T002 + T002a — Domínio: resolução de perfil e motor de cobrança

### Artefatos

- `apps/api-transportada/src/cte-profiles/domain/cte-profile.error.ts`
- `apps/api-transportada/src/cte-profiles/domain/emission-profile-resolution.policy.ts`
- `apps/api-transportada/src/cte-profiles/domain/charge-composition.service.ts`
- `apps/api-transportada/src/shared/decimal.service.ts` (aritmética BigInt extraída)
- `apps/api-transportada/src/freight-calculations/domain/freight-calculation-engine.service.ts`
  (refatorado sobre o módulo compartilhado, comportamento inalterado)
- `apps/api-transportada/test/cte-profiles-domain.contract.test.ts` +
  `test/cte-profiles-domain/{profile-resolution,charge-composition,support}.ts`
- `apps/api-transportada/package.json` — teste registrado na lista explícita do script `test`

### Red antes da implementação

```
$ bun test ./test/cte-profiles-domain.contract.test.ts
error: Cannot find module '../../src/cte-profiles/domain/emission-profile-resolution.policy.js'
0 pass · 1 fail · 1 error
```

Segunda rodada vermelha, depois de escrever o domínio: **12 pass · 6 fail** — `toThrow('CODE')`
comparava a _mensagem_, não o código. Trocado por `expectApiErrorCode` em
`test/cte-profiles-domain/support.ts`, que valida `instanceof ApiError` e `.code` — o contrato
estável e legível por máquina.

### Green

```
$ bun test ./test/cte-profiles-domain.contract.test.ts
 21 pass · 0 fail · 42 expect() calls  [13.00ms]
```

### Regressão do motor de frete (refator do decimal compartilhado)

```
$ bun test ./test/freight-calculation-engine.contract.test.ts \
           ./test/freight-rules-application.contract.test.ts \
           ./test/freight-simulation-application.contract.test.ts
 18 pass · 0 fail · 80 expect() calls  [14.00ms]
```

### Gates

```
$ bun run typecheck        # api + worker + cron + frontend — sem erros
$ bun run lint             # 4 apps, --max-warnings=0 — limpo
$ bun run --cwd apps/api-transportada test
 524 pass · 1 skip · 0 fail · 3079 expect() calls · 41 arquivos
```

### Caso de aceite fiscal

NF-e de referência: `vNF` 958,48 · alíquota 4,5% → 43,1316 na escala interna (4 casas) →
**43,13** na escala fiscal (2 casas). Bate com `vTPrest`/`vRec` do CT-e autorizado em `example/`.

### Decisões registradas

- Ranking da resolução automática: **precisão** (CNPJ completo > raiz de 8 dígitos) → **papel**
  (remetente > destinatário) → **prioridade** (menor número vence). Empate nos três critérios
  lança `CTE_PROFILE_AMBIGUOUS` — o sistema não adivinha qual perfil fiscal usar.
- A resolução automática só enxerga perfis com `matchMode = 'sender_tax_id'` e `status = 'active'`.
  Perfis manuais, rascunhos e inativos ficam de fora; nenhum candidato → `CTE_PROFILE_UNRESOLVED`.
- `requestedProfileId` curto-circuita a resolução (`matchedBy: 'manual'`), mas ainda valida
  existência no tenant (`CTE_PROFILE_NOT_FOUND`) e status ativo (`CTE_PROFILE_INACTIVE`).
- Ordem de cálculo D2b: percentuais sobre a carga → percentuais sobre o frete → valores fixos.
  Os percentuais sobre o frete incidem sobre o componente principal **já ajustado** por piso/teto.
- `roundChargeToFiscalScale` calcula o total como **soma das parcelas já arredondadas** em 2 casas.
  Assim `vTPrest == Σ vComp` por construção — a SEFAZ rejeita CT-e com divergência de um centavo
  entre o total e a soma dos `Comp`.
- Vigência por componente (`valid_from`/`valid_until`) avaliada na data de emissão da NF-e, o que
  dá reajuste programado sem intervenção manual.
- Aritmética monetária unificada em `src/shared/decimal.service.ts` (BigInt, `half_up`, escala 4
  interna e 2 fiscal). O motor de frete passou a consumi-la com `errorCodePrefix` para preservar
  seus códigos `FREIGHT_*` já cobertos por contrato.

## T003 — Application + rotas CRUD `/cte-emission-profiles`

### Red

Entrypoint `test/cte-profiles-http.contract.test.ts` escrito antes da camada de apresentação:

```
$ bun test ./test/cte-profiles-http.contract.test.ts
error: Cannot find module '../../src/cte-profiles/presentation/cte-emission-profiles.routes.js'
0 pass · 13 fail
```

### Green

```
$ bun test ./test/cte-profiles-http.contract.test.ts
 14 pass · 0 fail · 50 expect() calls  [92.00ms]
```

### Gates

```
$ bun run typecheck        # api + worker + cron + frontend — sem erros
$ bun run lint             # 4 apps, --max-warnings=0 — limpo
$ bunx prettier --check .  # limpo
$ bun run --cwd apps/api-transportada test
 587 pass · 1 skip · 0 fail · 3413 expect() calls · 47 arquivos
```

O salto de 41 para 47 arquivos inclui os entrypoints `cte-profiles-application.contract.test.ts`
(escrito no T002 e que nunca havia sido registrado) e `cte-profiles-http.contract.test.ts` — a lista
de testes do `package.json` é explícita, arquivo não listado não roda.

### Isolamento multiempresa

Nenhuma query nova foi introduzida no T003 (a camada é só apresentação sobre o use case do T002).
`test/cte-profiles-schema/tenant-safety.contract.ts` continua cobrindo as cinco garantias
estruturais que sustentam as queries do `DrizzleCteEmissionProfileRepository`: perfil ancorado em
`companies`, regra de frete alcançada por `(company_id, freight_rule_id)`, autor amarrado a um
membership ativo da mesma empresa e matchers/componentes incapazes de apontar para um perfil de
outro tenant. Todo filtro do repositório usa `eq(<tabela>.companyId, input.companyId)`; o
`companyId` chega de `context.scope`, nunca do corpo da requisição — coberto pelo teste
"refuses a company identifier smuggled in the payload".

### Decisões registradas

- Transição de status é **um recurso** (`PATCH /cte-emission-profiles/:id/status` com
  `status: 'active' | 'inactive'`), não dois endpoints em forma de verbo. `draft` é recusado com
  400: rascunho é estado inicial, não destino de transição.
- Trava otimista pelo corpo (`expectedVersion`), não por `If-Match`: a versão é um `bigint` do
  agregado, não um hash de representação HTTP, e o frontend já a recebe no `data.version`.
- Path `:id` que não é UUID canônico devolve **404**, não 400 — o `router.service.ts` valida o
  formato no `matchRoute`, então a rota simplesmente não casa. Teste ajustado à semântica real.
- Validação de fronteira espelha os CHECKs do banco (coerência valor/tipo do componente, produto
  predominante fixo exigindo nome, alíquota 0..1, CFOP 4 dígitos, CNPJ/raiz 14|8 dígitos), de modo
  que payload inválido morre em 400 antes de tocar o domínio.
- Zod dos perfis ficou em `cte-emission-profile-request.schema.ts` e os parsers/HTTP helpers em
  `cte-emission-profiles.schema.ts` para manter os arquivos abaixo de 200 linhas.
- `predominantProductMode`/`predominantProductName` só passam pela função nomeada
  `hasCoherentPredominantProduct`: a comparação inline `(a === b) === (c > 0)` foi reformatada pelo
  prettier em `(a === b) === c > 0`, que muda o significado. O teste "demands a product name only
  when the predominant product is fixed" cobre as duas direções e trava a regressão.

## T004 — Rotas de mutação de `freight_rules` + filtros de aplicabilidade

### Red

Três arquivos escritos antes da implementação — `test/freight-rules-domain/rule-filters.contract.ts`
(política pura), `test/freight-http/rules-mutation.contract.ts` (rotas) e os casos novos em
`test/freight-rules-application.contract.test.ts`:

```
$ bun test ./test/freight-rules-domain.contract.test.ts \
           ./test/freight-http.contract.test.ts \
           ./test/freight-rules-application.contract.test.ts
error: Cannot find module '../../src/freight-rules/domain/freight-rule-filters.policy.js'
13 pass · 16 fail · 1 error
```

### Green

```
$ bun run --cwd apps/api-transportada test
 604 pass · 1 skip · 0 fail · 3468 expect() calls · 48 arquivos  [730.00ms]
```

O 48º arquivo é o entrypoint `test/freight-rules-domain.contract.test.ts`, adicionado à lista
explícita do `test` no `package.json` da API — sem isso o arquivo existe e nunca roda.

### Gates

```
$ bun run typecheck        # api + worker + cron + frontend — sem erros
$ bun run lint             # 4 apps, --max-warnings=0 — limpo
$ bunx prettier --check .  # All matched files use Prettier code style!
```

### Defeito corrigido no caminho

`createRuleVersionRecord` sempre gravava a versão como `status: 'draft'`, enquanto
`findApplicableVersion` exigia `status = 'active'`: **nenhuma versão jamais era aplicável** e toda
simulação terminava em `FREIGHT_RULE_NOT_FOUND`. Agora `activate`/`deactivate` publicam as versões
via `setVersionsStatus` e o `update` de uma regra já ativa grava a nova versão como `active`.
Coberto por "publishes the rule versions together with the rule so an activated rule is actually
applicable" e "keeps a new version of an already active rule applicable instead of parking it as
draft".

Junto disso, `updateCurrentVersion` fazia no-op silencioso quando a versão esperada não batia — a
regra ficava intacta e uma linha de versão órfã era escrita mesmo assim. Passou a usar
`.returning()`; `null` vira 409 `FREIGHT_RULE_VERSION_CONFLICT` e a versão não é criada.

### Isolamento multiempresa

`findApplicableVersion` continua ancorada em `eq(freightRuleVersions.companyId, input.companyId)` e
`setVersionsStatus` escopa os dois `UPDATE` por `(company_id, freight_rule_id)`. Os três novos
`leftJoin` do `findDocument` (participante emitente, participante destinatário, endereço do
destinatário) carregam `eq(<tabela>.companyId, ...)` na condição de junção, então nenhum join
atravessa tenant. O teste "reports a status change on a rule outside the tenant as not found"
prova que uma regra de outra empresa responde 404 em vez de mudar de status.

### Decisões registradas

- Exceção por UF e por CNPJ do remetente **não exigiu migration**: `freight_rule_versions.filters`
  já é `jsonb`. Linhas legadas com `{}` e arrays vazios continuam casando com tudo por construção
  do predicado.
- O predicado usa `jsonb_exists(...)` / `jsonb_array_length(...)` em vez do operador `?` do
  Postgres — `?` colide com o placeholder de parâmetro do driver e quebraria de forma silenciosa.
- No `update`, o ponteiro da regra é atualizado **antes** da linha de versão: assim o conflito
  otimista aborta a transação sem deixar versão órfã.
- `PATCH /freight-rules/:id/status` é um recurso único que despacha para `activate`/`deactivate`,
  espelhando a decisão já tomada em `/cte-emission-profiles/:id/status`.
- `parseJsonBody` de `freight.schema.ts` foi exportado como `parseFreightJsonBody` em vez de
  duplicado no schema novo; os parsers de mutação ficaram em `freight-rule-mutation.schema.ts`
  porque `freight.schema.ts` já tem 565 linhas.
- `setVersionsStatus` inativa todas as versões da regra e reativa apenas a que casa com
  `freight_rules.current_version` — nunca reativa histórico.
- A normalização (`uppercase` + trim + dedupe + ordenação) mora na policy de domínio
  `freight-rule-filters.policy.ts`, sem I/O; o Zod da fronteira só rejeita formato.

## T005 — Frontend: página `/cte-profiles`

```
$ bun run --cwd apps/frontend-transportada test
bun test v1.3.14
 119 pass
 0 fail
 627 expect() calls
Ran 119 tests across 9 files.

$ bun run lint            # api + worker + cron + frontend, --max-warnings=0
$ bun run typecheck       # tsc --noEmit
$ bun run format:check    # All matched files use Prettier code style!
$ bun run --cwd apps/frontend-transportada build   # ✓ built, PWA precache 11 entries
```

O arquivo `test/cte-profiles.contract.test.ts` (8 testes, 68 asserções) foi adicionado à lista
explícita do `package.json` — sem isso a suíte não roda. Ele agrega três suítes: client + queries,
permissões/estados e fronteiras de apresentação.

### O que a página entrega

`src/modules/cte-profiles/` — lista de perfis (tabela zebrada, badge de situação, ativar/desativar/
editar) ao lado de um formulário com identificação, cobrança, componentes adicionais, CNPJs
vinculados e parâmetros fiscais. Entrada `Perfis CT-e` no grupo **Administração** de `src/main.tsx`
(`/cte-profiles` em pathname, `sessionStorage` e `resolvePage`).

### Decisões registradas

- **Dinheiro e percentual nunca passam por float binário.** `cteProfilesDecimal.service.ts` faz a
  conversão `'4,5' → '0.045000'` e `'1.234,50' → '1234.5000'` com aritmética de string/inteiro e
  rejeita perda de precisão (`CTE_PROFILES_INVALID_RATE` / `CTE_PROFILES_INVALID_AMOUNT`). O padrão
  da operação, 4,5%, está fixado em `DEFAULT_FREIGHT_PERCENTAGE`.
- **Conversão só na borda do formulário.** O estado do form guarda o que o usuário digitou
  (`'4,5'`, `'2026-01-01'`); `cteProfilesForm.service.ts` converte para o corpo canônico apenas no
  submit — digitar `'4,'` não explode no meio da edição.
- **`companyId` não entra nem sai.** `cleanBody` monta o corpo por whitelist de chaves
  (`SETTINGS_KEYS`, `COMPONENT_KEYS`, `MATCHER_KEYS`, `FREIGHT_RULE_KEYS`), e `profileFromApi`
  rejeita resposta com chave estranha. Coberto pelo teste de contrabando de tenant.
- **Sem `useEffect` para resetar o form.** Trocar de perfil remonta o `CteProfileForm` via `key`.
- **Concorrência otimista no corpo**, não em `If-Match`: `expectedVersion` viaja no PATCH e o código
  `CTE_EMISSION_PROFILE_VERSION_CONFLICT` da API vira a mensagem `versionConflict` na tela.
- Toda a tela é gated por `settings.manage`: sem a permissão o controller rejeita as quatro mutações
  com `CTE_PROFILES_FORBIDDEN` e a query nem dispara.

## T006 — Lote CT-e multi-documento: composição, cobrança congelada e bloqueio rígido

### Teste de contrato antes da implementação

Estado RED registrado antes de tocar em `src/`: `13 pass / 10 fail` nas suítes de schema e
aplicação. Depois da implementação:

```
$ bun test ./test/cte-batch-schema.contract.test.ts
 8 pass / 0 fail / 121 expect() calls

$ bun test ./test/cte-batch-application.contract.test.ts
 15 pass / 0 fail / 113 expect() calls

$ bun test            # apps/api-transportada
 611 pass / 1 skip / 0 fail / 3550 expect() calls — 48 arquivos

$ make migration-test
 9 pass / 0 fail / 129 expect() calls

$ make check
 6 + 611 + 112 + 24 + 119 pass / 0 fail — format:check, lint, typecheck, test e build de todas as apps
```

Suítes novas: `test/cte-batch-schema/item-composition.contract.ts` (colunas, uniques, FKs compostas,
tipos SQL `numeric(19,4)` / `numeric(9,6)` e todos os CHECKs das duas tabelas) e
`test/cte-batch-application/document-blocking.contract.ts` (5 cenários de recusa, todos exigindo que
nada tenha sido persistido).

### Lacuna de CI corrigida junto

Quatro entrypoints existiam mas **nunca rodavam** — não estavam na lista explícita do `test` script:
`cte-batch-schema`, `cte-batch-application`, `cte-batch-http` e `cte-issuance-http`. Todos entraram
no `apps/api-transportada/package.json`. Passavam, mas passavam no escuro.

### O que mudou

**Schema** — `cte_batch_item_documents` liga cada NF-e ao item de CT-e projetado
(`(company_id, batch_id, nfe_document_id)` único, `(company_id, item_id, position)` único, FKs
compostas para `cte_batch_items`, `cte_batches` e `nfe_documents`); `cte_batch_item_charges`
congela a composição da cobrança do item (`(company_id, item_id, ordinal)` único, `calculation_type`
em `percentage_of_cargo | percentage_of_freight | fixed_amount`, coerência `fixed_amount ⇒ rate is
null`, `rate` entre 0 e 1, valores não negativos). Migration
`20260727133210_cte_batch_item_composition` + `rollback.sql` manual (BEGIN/COMMIT, filhos primeiro,
sem CASCADE, remoção da linha do journal por name+hash com `RAISE EXCEPTION` se o count ≠ 1).

**Application** — `createBatch` deixou de descartar a seleção. `resolveDocumentIds` recusa seleção
vazia e acima de 100; o fingerprint agora cobre a lista ordenada inteira
(`[companyId, name, ...documentIds]`), então dois lotes com notas diferentes nunca colidem na mesma
chave de idempotência. `prepareBatchItems` valida **todos** os documentos antes de qualquer escrita:
elegibilidade → ausência de vínculo ativo → cálculo de frete snapshotado. Só depois vêm
`createBatch`, um item por nota (`position` 1..n) e, por item, o vínculo da NF-e e a cobrança
principal derivada do snapshot de frete.

**Infraestrutura** — `createBatchItem` passou a devolver o registro (`.returning()`), porque o `id`
do item é a chave dos dois inserts seguintes. `findActiveBatchLink` faz join de
`cte_batch_item_documents` com `cte_batches` filtrando `company_id` nas duas pontas e
`status <> 'cancelled'`.

### Decisões registradas

- **Bloqueio rígido é erro próprio, não 500 de constraint.** `CTE_BATCH_DOCUMENT_ALREADY_LINKED`
  (409, `'NF-e is already linked to an active CT-e'`) cobre tanto a nota já ligada a um CT-e não
  cancelado quanto a mesma nota repetida na seleção. A mensagem não carrega `companyId` — testado.
- **Nada parcial no banco.** Toda a validação acontece antes do primeiro insert; os cinco cenários de
  recusa afirmam `createdBatches`, `createdItems`, `createdItemDocuments`, `createdItemCharges` e
  `createdEvents` todos vazios.
- **Leituras sequenciais de propósito.** As consultas por documento rodam na mesma transação/conexão
  do lote — `Promise.all` aqui seria concorrência sobre uma conexão só, além de tornar a ordem dos
  erros não determinística.
- **A cobrança congelada vem do snapshot que já existe**, não de um valor recalculado:
  `rate = ruleSnapshot.percentage`, `baseAmount = calculationSnapshot.totalAmount`,
  `amount = calculationSnapshot.calculatedAmount`, `calculationType: 'percentage_of_cargo'`. O rótulo
  fica em `'Frete'` até T008 trazer o `chargeComponentLabel` do perfil — dinheiro segue como string
  `numeric`, sem passar por float em ponto algum.
- **`batch_id` fora de `cte_batch_item_charges`.** É alcançável por `item_id`; denormalizar só criaria
  uma segunda fonte de verdade. Em `cte_batch_item_documents` ele fica porque o único
  `(company_id, batch_id, nfe_document_id)` — o que garante uma nota por lote — depende dele.
- **`position` do vínculo começa em `'1'` por item.** Hoje é 1:1 (uma nota por item); o
  agrupamento por remetente+destinatário de T008 preenche 2..n sem mudar o schema.
- `CTE_BATCH_TABLES` no suporte de migração ganhou as duas tabelas — sem isso o
  `readBusinessTables` filtraria as novas e o teste de rollback aprovaria um drop que nunca conferiu.

## T007 — `POST /cte-batches/preview`: projeção antes de persistir

### Teste de contrato antes da implementação

RED registrado antes de tocar em `src/`: `24 pass / 18 fail` — as requisições HTTP de preview
devolviam **404** (rota inexistente) e as suítes de aplicação quebravam no import ausente de
`preview-cte-batch.use-case.js`. Depois da implementação:

```
$ bun test ./test/cte-batch-application.contract.test.ts
 29 pass / 0 fail / 182 expect() calls

$ bun test ./test/cte-batch-http.contract.test.ts
 13 pass / 0 fail / 62 expect() calls

$ bun test            # apps/api-transportada
 629 pass / 1 skip / 0 fail / 3640 expect() calls — 48 arquivos

$ make check
 6 + 629 + 112 + 24 + 119 pass / 0 fail — format:check, lint, typecheck, test e build de todas as apps
```

Suítes novas: `test/cte-batch-application/preview.contract.ts` (6 cenários de projeção),
`test/cte-batch-application/preview-blocks.contract.ts` (8 cenários de bloqueio) e
`test/cte-batch-http/preview.contract.ts` (4 cenários de borda HTTP), com as fixtures em
`test/cte-batch-application/preview-support.ts`.

### A NF-e de referência

A nota do `example/` atravessa o caminho inteiro sem float binário:

| Campo                         | Valor                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| chave                         | `35260705868574001090550020008526741408978623`                     |
| base (`totalAmount`)          | `958.4800`                                                         |
| percentual do perfil          | `0.045000` (4,5%)                                                  |
| `calculatedAmount` (escala 4) | `43.1316`                                                          |
| `fiscalAmount` (escala 2)     | `43.13`                                                            |
| componentes                   | `[{ label: 'Frete', calculationType: 'main', amount: '43.1316' }]` |

Cenários fechados junto: agrupamento `sender_recipient` (`2000.0000` → `90.0000` → `90.00`),
`groupingMode` do request sobrepondo o do perfil (`['43.13','46.87']`), GRIS 0,3% + pedágio fixo
(`43.1316` + `2.8754` + `15.0000` = `61.0070`, arredondados para `43.13` + `2.88` + `15.00` = `61.01`)
e piso mínimo (`adjustments: [{ type: 'minimum_amount', amount: '36.8684' }]` → `80.0000`).

### O que a rota entrega

`POST /cte-batches/preview`, política `cte.manage`, **sem** `idempotency-key` — nada é persistido, o
`cache-control: no-store` da resposta impede cache intermediário. Request `.strict()`:
`documentIds` (1..100 UUIDs), `emissionProfileId?` e `groupingMode?`
(`per_invoice` | `sender_recipient`). `companyId` no corpo é `400 INVALID_REQUEST` — o tenant sai do
contexto autenticado.

Resposta: `{ data: { blocked, projections, summary } }`, com
`summary = { blockedCount, documentCount, projectedCount, totalAmount }`.

### Decisões registradas

- **Preview é informativo, `create` é tudo-ou-nada.** Nota inelegível vira uma entrada em `blocked`
  com código estável e as demais continuam projetando. O operador vê o lote inteiro antes de decidir,
  em vez de descobrir uma nota ruim por vez.
- **Só o perfil pedido explicitamente derruba o request.** `emissionProfileId` desconhecido é `404
CTE_PROFILE_NOT_FOUND` e inativo é `409 CTE_PROFILE_INACTIVE` — resolvidos **uma vez**, antes do
  laço. Já os erros da resolução automática (`CTE_PROFILE_UNRESOLVED`, `CTE_PROFILE_AMBIGUOUS`,
  `CTE_PROFILE_INVALID_TAX_ID`) são capturados por nota e viram bloqueio. Qualquer coisa que não seja
  `ApiError` propaga.
- **`CTE_PROFILE_RULE_NOT_IN_FORCE` é bloqueio novo** porque `calculatePercentageFreight` não confere
  a janela de vigência da regra. Sem essa checagem uma regra futura ou expirada cobraria calada.
- **Três queries para até 100 notas.** `findPreviewDocuments` (documentos + partes + peso agregado em
  três selects paralelos), `findActiveBatchLinks` e o catálogo de perfis. Nada de N+1 por nota.
- **O port de leitura só lê.** O contrato prova, por prototype, que o reader expõe exclusivamente
  `findPreviewDocuments` e `findActiveBatchLinks` — nenhum método de escrita alcançável a partir do
  preview.
- **Placeholders de rótulo (`{cliente}`, `{percentual}`) não são expandidos aqui.** Ficam para T013,
  junto do golden test do payload.
- **Identidade da versão da regra fica para T008.** `CteEmissionProfileDetail` não carrega
  `freightRuleVersionId`; o snapshot do preview usa `''` / `'0'` e **não** expõe esses campos, para
  não publicar uma identidade de versão que não existe.

### Lacuna conhecida

`nfe_addresses` não tem coluna de código IBGE de município — RF09 hoje confere apenas presença de
cidade/UF das duas pontas. `cMunIni`/`cMunFim` do CT-e exigem o código real: a coluna entra em T010 e
o payload a consome em T013.

## T008 — `POST /cte-batches`: perfil, agrupamento e cálculo de frete versionado

```
bun test apps/api-transportada/test/cte-batch-application.contract.test.ts
 35 pass · 0 fail · 211 expect() calls

bun test apps/api-transportada/test/cte-batch-http.contract.test.ts
 15 pass · 0 fail · 67 expect() calls

bun run --cwd apps/api-transportada test
 635 pass · 1 skip · 0 fail · 3669 expect() calls

make check
 format:check · lint · typecheck · test (6 + 637 + 112 + 24 + 119 pass, 0 fail) · build
```

Suítes novas: `test/cte-batch-application/create-grouping.contract.ts` (agrupamento por
remetente+destinatário, cálculo por nota, snapshot versionado) somada às seis já existentes no
entrypoint `test/cte-batch-application.contract.test.ts`. No HTTP, dois cenários novos em
`test/cte-batch-http/create-submit-and-query.contract.ts`: `emissionProfileId`/`groupingMode`
repassados ao use case e `groupingMode` desconhecido barrado em `400 INVALID_REQUEST`.

### O request agora carrega a parametrização da seleção

`createBatchSchema` continua `.strict()` e ganhou `emissionProfileId?` (UUID) e `groupingMode?`
(`per_invoice` | `sender_recipient`) — os mesmos campos do preview, para que o operador confirme
exatamente o que viu. `companyId` no corpo segue sendo `400 INVALID_REQUEST`.

### Agrupamento por remetente + destinatário

Base do exemplo: duas notas das mesmas partes (`10000.0000` + `20000.0000`) e uma terceira de outro
destinatário (`5000.0000`), perfil de 4,5% com GRIS de 0,3%.

| Item              | Base         | Frete       | GRIS      | Total lote  |
| ----------------- | ------------ | ----------- | --------- | ----------- |
| grupo A (2 notas) | `30000.0000` | `1350.0000` | `90.0000` | `1440.0000` |
| grupo B (1 nota)  | `5000.0000`  | `225.0000`  | `15.0000` | `240.0000`  |

`fiscalAmount` do grupo A fecha em `1440.00` — soma das partes arredondadas, nunca o total exato
arredondado, porque a SEFAZ rejeita `vTPrest ≠ Σ Comp`.

### Decisões registradas

- **D-T008 — a composição do grupo é a autoridade, o cálculo por nota é rastreabilidade.**
  `projectCteBatchCharges` roda sobre a carga somada do grupo, então preview e create devolvem o
  mesmo número. Em paralelo, **toda** nota selecionada ganha sua própria linha em
  `freight_calculations` (nunca reaproveitada) com chave `cte-batch:${idempotencyKey}:${documentId}`
  e `requestFingerprint` = fingerprint do lote. É o que permite o faturamento por nota (RF12) sem
  quebrar a cobrança agrupada (RF11).
- **D3 — um item de lote é um CT-e.** `cte_batch_items.nfe_document_id` aponta para a nota de maior
  valor do grupo (rege o produto predominante) e `cte_batch_item_documents` recebe uma linha por
  nota, nas posições 1..m.
- **Snapshot versionado de verdade.** A seleção roda duas vezes dentro da transação: a primeira apura
  bloqueios, a segunda congela o snapshot já com o `{id, version}` real da versão publicada da regra.
  Fecha a lacuna do T007, que gravava `''`/`'0'`. Regra sem versão `active` é
  `409 CTE_PROFILE_FREIGHT_RULE_VERSION_MISSING` — o lote não nasce cobrando com identidade inventada.
- **Leituras em lote e dentro da transação.** `findEligibleDocument`/`findActiveBatchLink`/
  `findFreightCalculation` (uma ida ao banco por nota) saíram; entraram `findSelectionDocuments` e
  `findActiveBatchLinks`, que recebem os até 100 ids de uma vez. Manter a checagem de vínculo dentro
  da transação é o que serializa criações concorrentes sobre a mesma nota.
- **Query de seleção compartilhada.** `infrastructure/cte-batch-selection.query.ts` aceita
  `Database | Transaction`; preview (fora de transação) e create (dentro) leem exatamente o mesmo
  SQL, com o mesmo filtro de `companyId`. Sem isso, preview e create poderiam divergir em silêncio.
- **Escritas sequenciais de propósito.** Dentro da transação tudo roda na mesma conexão — `Promise.all`
  não paralelizaria de fato e ainda embaralharia a ordem que define `position`/`ordinal`.
- **Catálogo de perfis fica fora da unit of work.** `profiles` é dependência própria do use case
  (`CteEmissionProfileCatalogPort`), a mesma injetada no preview — leitura de configuração não
  precisa da transação do lote.

## T009 — `GET /cte-batches/:id/items`: status, valor, notas, chave e protocolo

```
$ bun run typecheck
$ bunx tsc --noEmit

$ bun test test/cte-batch-application.contract.test.ts test/cte-batch-http.contract.test.ts
 58 pass
 0 fail
 302 expect() calls

$ make check
 6 pass / 0 fail        (cron-transportada)
 645 pass / 0 fail      (api-transportada, era 637 no T008)
 112 pass / 0 fail      (worker-transportada)
 24 pass / 0 fail
 119 pass / 0 fail      (frontend-transportada)
```

Testes novos: `test/cte-batch-application/list-items.contract.ts` (3) e
`test/cte-batch-http/items.contract.ts` (5), ambos registrados nos entrypoints correspondentes.

### Contrato da resposta

`GET /cte-batches/:id/items` → `200 { "data": [ ... ] }`, sem paginação — o lote já é limitado a 100
notas no `POST`. Cada item é um CT-e:

| Campo                                                     | Origem                                             |
| --------------------------------------------------------- | -------------------------------------------------- |
| `id`, `position`                                          | `cte_batch_items`                                  |
| `baseAmount`, `totalAmount`, `fiscalAmount`               | `cte_batch_items.calculation_snapshot` (congelado) |
| `charges[]`                                               | `cte_batch_item_charges`, ordenado por `ordinal`   |
| `documents[]`                                             | `cte_batch_item_documents` ⋈ `nfe_documents`       |
| `status`, `fiscalSeries`, `fiscalNumber`, `lastErrorCode` | última `cte_issuance_attempts`                     |
| `accessKey`, `authorizationProtocol`, `authorizedAt`      | `cte_fiscal_documents`                             |

`documents[]` traz `number`, `series`, `accessKey` e `totalAmount` de cada nota, nas posições 1..m —
é o vínculo nota ⇄ CT-e pedido pelo usuário, na direção N:1 (um CT-e carrega N notas).

### Decisões registradas

- **D-T009 — o valor vem do snapshot, não de uma nova soma.** `baseAmount`/`totalAmount`/
  `fiscalAmount` saem de `calculation_snapshot`, que é o número congelado no momento da criação do
  lote. Recalcular na leitura abriria espaço para a tela mostrar um valor diferente do que foi (ou
  será) transmitido à SEFAZ. `charges[]` vem da tabela normalizada porque é a mesma decomposição
  gravada, só que consultável e ordenada.
- **Status é derivado da última tentativa, não persistido no item.** `selectDistinctOn(batch_item_id)`
  ordenado por `attempt_number desc`: tentativas anteriores viram histórico. Item sem nenhuma
  tentativa responde `pending` (`CTE_BATCH_ITEM_PENDING_STATUS`) — é estado, não erro.
- **Chave e protocolo só existem com autorização.** `cte_fiscal_documents` entra por `leftJoin`
  (único por `(company_id, batch_item_id)`); item não autorizado devolve `accessKey`,
  `authorizationProtocol` e `authorizedAt` nulos em vez de omitir os campos — o frontend não precisa
  distinguir ausência de chave de ausência de campo.
- **Quatro queries fixas, independentes da quantidade de itens.** Itens, tentativas, componentes e
  notas são lidos em lote por `inArray`/`batchId` e casados em `Map` na aplicação. Nenhum N+1 mesmo
  com 100 notas no lote.
- **404 antes de qualquer leitura de item.** O use case confirma o lote pelo par
  `(companyId, batchId)` e devolve `CTE_BATCH_NOT_FOUND` sem ecoar o id — lote de outro tenant é
  indistinguível de lote inexistente. Todas as quatro queries filtram `companyId` do contexto
  autenticado; o contrato de aplicação assere que a query recebida é exatamente
  `{ batchId, companyId }`.
- **Identificador não-UUID já morre no router.** `collectPathParameters` rejeita segmento fora do
  formato canônico, então `/cte-batches/not-a-uuid/items` é `404 NOT_FOUND` global, sem chegar à
  aplicação. O teste de contrato fixa esse comportamento em vez de esperar um `400` que a rota nunca
  produziria.
- **Política `cte.submit`.** Leitura de itens acompanha `GET /cte-batches/:id` e `/events`; quem só
  tem `cte.manage` recebe `403` antes de qualquer trabalho.

## T010 — CNPJ das partes e município IBGE no item de listagem de notas

Teste antes da implementação, em quatro frentes:

- `apps/api-transportada/test/nfe-schema/document-children.contract.ts` — `city_code` na lista de
  colunas de `nfe_addresses`.
- `apps/api-transportada/test/nfe-http/listing-and-detail.contract.ts` — dois testes: a listagem
  expõe `emitterTaxId`/`emitterCityCode`/`recipientTaxId`/`recipientCityCode`, e os quatro campos
  aceitam `null` para notas importadas sem eles.
- `apps/worker-transportada/test/nfe-import-consumer/document-children.contract.ts` (novo, somado ao
  entrypoint `nfe-import-consumer.contract.test.ts`) — `writeDocumentChildren` grava `cityCode` do
  emitente e do destinatário, e grava `null` quando o endereço veio sem `cMun`.
- `apps/frontend-transportada/test/nfe-workspace/client-and-queries.contract.ts` — o type guard
  rejeita (`NFE_WORKSPACE_RESPONSE_INVALID`) uma listagem sem os quatro campos.

```
bun test test/nfe-schema.contract.test.ts test/nfe-http.contract.test.ts   → 42 pass  0 fail
bun test test/nfe-import-consumer.contract.test.ts (worker)                → 11 pass  0 fail
bun test test/nfe-workspace.contract.test.ts (frontend)                    → 53 pass  0 fail
make check                                                                → 647+114+24+120+6 pass  0 fail
make migration-test                                                       →  9 pass  0 fail
```

### Contrato da resposta

`GET /nfe-documents` e `GET /nfe-documents/:id` ganharam quatro campos `string | null`:

| Campo               | Origem                                         | Uso no CT-e        |
| ------------------- | ---------------------------------------------- | ------------------ |
| `emitterTaxId`      | `nfe_participants.tax_id` (papel emitente)     | `<rem>` / `<toma>` |
| `emitterCityCode`   | `nfe_addresses.city_code` (papel emitente)     | `cMunIni`          |
| `recipientTaxId`    | `nfe_participants.tax_id` (papel destinatário) | `<dest>`           |
| `recipientCityCode` | `nfe_addresses.city_code` (papel destinatário) | `cMunFim`          |

### Decisões registradas

- **D-T010 — o código IBGE já vinha parseado; o que faltava era persistir.** O pacote fiscal expõe
  `NfeXmlAddress.cityCode` (mapeado de `cMun`) desde a 0.2.0 — `dist/types.d.ts:512-524`. Nenhuma
  mudança foi necessária em `adatechnology-packages`; o gap era a coluna `city_code`, que não
  existia em `nfe_addresses`, e o consumidor do worker que descartava o campo.
- **`cMunIni`/`cMunFim` exigem o código IBGE real.** Derivar de nome de município seria adivinhação
  (homônimos entre UFs) e o campo é rejeitado pela SEFAZ se divergir. Por isso a origem é o `cMun`
  do XML original, preservado byte a byte.
- **Nulo é estado legítimo, não erro.** Notas importadas antes desta migração — e resumos de
  distribuição, que não trazem endereço — ficam com `city_code` nulo. A coluna é opcional e os
  quatro campos são nuláveis no contrato; a validação de completude para emissão de CT-e é decisão
  do fluxo de emissão, não da listagem.
- **Cópia do schema do worker movida junto.** `apps/worker-transportada/src/database/nfe.schema.ts` é
  duplicata por cópia e as migrations só rodam na API. A coluna foi adicionada nos dois arquivos no
  mesmo commit, senão o worker gravaria contra um schema que não conhece a coluna.
- **Serializador da API e type guard do frontend entregues juntos.** O guard de listagem é estrito:
  se o frontend passasse a exigir os campos antes de a API devolvê-los (ou o contrário), a tela
  responderia "Indisponível" com dados válidos no banco — o mesmo modo de falha já visto em
  divergência de allowlist. Os dois lados mudam no mesmo passo.
- **Migração aditiva com rollback manual ao lado.** `20260727151037_nfe_address_city_code` é um
  `ADD COLUMN` nulável (sem reescrita de tabela, sem default); o `rollback.sql` derruba a coluna e
  remove a linha correspondente de `drizzle.__drizzle_migrations` sob guarda `deleted_migrations <> 1`.
- **Isolamento inalterado.** `city_code` não é dado sensível nem chave de tenant;
  `test/nfe-schema/tenant-safety.contract.ts` percorre todas as tabelas genericamente e passou sem
  alteração. As queries de leitura continuam filtrando `companyId` do contexto autenticado.

## T011

Frontend: ação **Gerar CT-es (N)** na `selectionBar` da tabela "Notas" + diálogo de prévia com
perfil, agrupamento, projeção fiscal, bloqueios e total do lote.

### Fronteiras cobertas por teste (escritas antes da implementação)

1. **Contrato do client** — `test/cte-batch/client-and-queries.contract.ts`: `previewBatch` fala com
   `POST /cte-batches/preview`, `cache: 'no-store'`, **sem `idempotency-key`** (a prévia não
   persiste nada), e carrega `emissionProfileId`/`groupingMode` só quando escolhidos; a criação
   repete os mesmos parâmetros mais o `name`.
2. **Estritura do envelope** — a prévia é rejeitada com `CTE_BATCH_INVALID_PREVIEW_RESPONSE` quando
   `summary` vaza campo fora do envelope, `projections` não é lista, ou um bloqueio traz `xml`.
3. **Anti-drift da projeção** — uma projeção com campo fiscal que o diálogo ainda não lê
   (`cargoWeight`) atravessa o adaptador intacta.
4. **Contrato do diálogo** — `test/nfe-workspace/cte-emission-dialog.contract.ts` (12 testes):
   deduplicação e ordem da seleção, perfil automático omitido do payload, criação restrita às notas
   que sobreviveram à prévia, linha da projeção (notas, base, alíquota, perfil, total fiscal),
   chave da linha agrupada, conversão da alíquota sem float binário, agrupamento de bloqueios por
   motivo e as três recusas de confirmação (carregando, criando, tudo bloqueado).

### Resultado

```
bun test test/nfe-workspace.contract.test.ts test/cte-batch.contract.test.ts → 75 pass / 0 fail
bun run --cwd apps/frontend-transportada test                               → 142 pass / 0 fail
make check                                                                  → 6 + 647 + 114 + 24 + 142 pass / 0 fail
```

### Decisões registradas

- **D-T011 — `test/cte-batch.contract.test.ts` não rodava.** O arquivo existia mas não estava na
  lista explícita do `test` do `package.json` do frontend; foi adicionado. Sem isso o contrato do
  client de lotes era letra morta.
- **Prévia não usa `idempotency-key`.** `POST /cte-batches/preview` não escreve nada; enviar chave de
  idempotência daria a entender que a chamada é uma criação e criaria o risco de o mesmo header
  vazar para o `POST /cte-batches` seguinte.
- **Estritura assimétrica no adaptador de prévia.** Envelope, entradas de bloqueio e `summary`
  rejeitam chave extra — um vazamento ali significaria dado de tenant ou fiscal fora do contrato.
  Dentro de `projections` a validação é positiva e as chaves desconhecidas passam preservadas,
  porque a projeção ainda cresce em T013/T014 (`cte-payload.builder`, `cte_issuance_payloads`) e
  uma allowlist estrita provocaria o mesmo "Indisponível com dado válido" já visto antes.
- **Alíquota convertida por string, nunca por float.** A taxa vem como fração `numeric(9,6)`
  (`'0.045000'`); `toPercentageLabel` desloca a vírgula por manipulação de string e devolve `'4.50'`
  — mesma regra do dinheiro, sem ponto flutuante binário em nenhum ponto do caminho fiscal.
- **Criação só com as notas projetadas.** O diálogo confirma sobre `summary.projectedDocumentIds`, e
  não sobre a seleção original: as notas bloqueadas (por exemplo `CTE_BATCH_DOCUMENT_ALREADY_LINKED`)
  são exibidas agrupadas por motivo mas nunca entram no `POST /cte-batches`, que as recusaria com 409.
- **Perfil manual depende de `settings.manage`.** `GET /cte-emission-profiles` exige essa política;
  quem só tem `cte.manage` vê apenas a opção "Automático (pelo CNPJ do emitente)" — o diálogo não
  finge oferecer uma escolha que a API recusaria.
- **Prévia é `useQuery`, não `useEffect`.** Trocar perfil ou agrupamento muda a `queryKey` e
  recalcula sozinho; o botão de confirmação fica desabilitado enquanto `status` é `loading`,
  `creating` ou não há projeção alguma.

## T012 — Frontend: página de CT-es reescrita

### Contrato antes da implementação

`apps/frontend-transportada/test/cte-batch/table-and-items.contract.ts` (importado por
`test/cte-batch.contract.test.ts`, que já estava na lista explícita do `package.json` desde T011):

1. `listItems` faz `GET /cte-batches/:id/items` autenticado, `cache: 'no-store'` e **sem**
   `idempotency-key` — leitura não é escrita.
2. Adaptador de itens rejeita `companyId`, `xml`, `xml` aninhado no documento, `totalAmount`
   numérico, `data` que não é array e envelope `items` → `CTE_BATCH_INVALID_ITEMS_RESPONSE`.
3. Tabela pura: `nextSortState` asc→desc→neutro (e reinício ao trocar de coluna), `sortBatches`,
   `countActiveFilters`, `batchMatchesFilters` (status multi-valor, nome case-insensitive,
   `itemCountFrom/To`, `createdFrom`).
4. Filtro avançado: grupos E/OU aninhados, grupo sem condição ativa é neutro,
   `CTE_BATCH_CONDITION_FIELD_TYPE.createdAt === 'date'` / `.status === 'option'`,
   `OPERATORS_BY_TYPE.date` contém `between`, `option` não contém `contains`, e trocar o campo
   reseta para `{ operator: 'between', value: '', valueTo: '' }`.
5. Ações e rótulos: gating por permissão/status, `describeItemDocuments` → `001/000000022`,
   `summarizeBatchItems` → `{ authorizedCount: 1, documentCount: 3, pendingCount: 0,
rejectedCount: 1, totalAmount: '90.76' }` e `'0.00'` para lote vazio.

### Implementação

```
src/modules/cte-batch/
  shared/cteBatchItem.types.ts               DTO do item (status string aberta)
  shared/cteBatchItem.validation.ts          adaptador estrito (allowlist de chaves)
  shared/cteBatchClient.service.ts           + listItems(batchId)
  shared/cteBatchTable.service.ts            ordenação, filtros simples, colunas, storage
  shared/cteBatchAdvancedFilter.service.ts   condições E/OU aninhadas
  shared/cteBatchItemActions.service.ts      gating + soma fiscal em BigInt
  hooks/useCteBatchTable.hook.ts             estado da tabela
  hooks/useCteBatchItems.hook.ts             itens + transmitir/reprocessar/baixar
  components/CteBatchFilters.component.tsx
  components/CteBatchAdvancedFilterBuilder.component.tsx
  components/CteBatchColumnsMenu.component.tsx
  components/CteBatchTable.component.tsx
  components/CteBatchItemsPanel.component.tsx
  pages/CteBatchWorkspace.page.tsx           reescrita, sem SYNTHETIC_DOCUMENT_ID
  locales/cteBatch.locale.json + cteBatch.en.locale.json   namespace cteBatch registrado no i18n
  styles/cteBatch.module.css                 apenas design tokens
```

### Execução

```
bun run --cwd apps/frontend-transportada typecheck → sem erro
bun run --cwd apps/frontend-transportada test      → 148 pass / 0 fail
bun run lint                                       → sem warning
make check                                         → 6 + 647 + 114 + 24 + 148 pass / 0 fail
```

### Decisões registradas

- **`SYNTHETIC_DOCUMENT_ID` eliminado.** A página não cria mais lote a partir de um UUID fixo de
  seed; criação passou a ser exclusivamente a ação _Gerar CT-es (N)_ da tabela de Notas (T011).
  Com isso o `createBatchMutation` deixou de ser usado nesta página.
- **Nota → CT-e visível no drill-in.** Cada linha de item lista as notas vinculadas como
  `série/número` (`describeItemDocuments`), com a chave de acesso no `title` — é a ligação N:1
  pedida, respeitando o bloqueio rígido de vínculo duplicado decidido em T009.
- **Status do item é `string` aberta no DTO.** A SEFAZ e o T024 (cancelamento 110111) acrescentam
  estados; o adaptador não pode quebrar a tela ao encontrar um status novo — o gating compara
  contra `CTE_BATCH_ITEM_STATUS` e o rótulo cai no próprio código quando não há tradução.
- **Soma dos valores em BigInt escalado.** `sumFiscalAmounts` converte string `numeric` para
  centavos inteiros e volta; nenhum float binário toca o valor do CT-e, nem em resumo de tela.
- **Contrato de data-tables honrado sem duplicar o `nfe-workspace`.** Ordenação tri-estado,
  filtros multi-valor, simples/avançado com grupos E/OU, seleção em massa com barra de ações,
  contador `{exibidos} de {total}`, limpar filtros e ordem/visibilidade de colunas persistidas em
  `localStorage` versionado (`cte-batch.batches.columns.v1`, leitura em try/catch para SSR).
- **Download do XML é imperativo.** `documentsQuery` do `useCteIssuanceStatus` só habilita com
  `batchId` **e** `batchItemId`; como o painel lista todos os itens, o clique chama
  `listDocuments({ batchId, batchItemId })` na hora e abre o documento cuja `accessKey` bate com a
  do item — sem isso o botão baixava nada.
- **Polling só enquanto há item em voo.** `refetchInterval` de 5 s ativa apenas com item em
  `in_flight`/`pending`/`retry_scheduled`; lote inteiramente autorizado ou rejeitado para de
  consultar a API.

## T013 — `cte-payload.builder.ts`: domínio puro NF-e + perfil + frete → `CteData`

### Contrato antes da implementação

`apps/api-transportada/test/cte-issuance-domain/cte-payload-builder.contract.ts` (novo entrypoint
`test/cte-issuance-domain.contract.test.ts`, registrado na lista explícita do `package.json`), com
fixture reconstruída em `test/cte-issuance-domain/support.ts` a partir da CT-e de referência
`example/exportacao_20_07_2026_13_17_59/CTe-35260761156864000191570010000138081000168240.xml`:

1. **Golden campo a campo** — `cfop 5353`, `natOp` de 60 caracteres, `tpServ 0`, `toma 0`,
   `cMunIni 3554102/Taubate/SP`, `cMunFim 3523701/Itirapua/SP`, remetente e destinatário completos
   (CNPJ, IE, xFant, endereço, fone, email), `vTPrest = vRec = 43.13`,
   `Comp{xNome 'Frete Spani 4,5', vComp 43.13}`, `vCarga 958.48`,
   `proPred 'LAVA ROUPA PO TIXAN 1.6K PRIMAVERA'`, `infQ` `03/UN/8`, `01/PESO BRUTO/101.732`,
   `01/PESO LIQUIDO/92.765`, `infNFe` com a chave `3526…8623`, `rodo/RNTRC 58151044`,
   `compl/xObs 'EMPRESA OPTANTE PELO SIMPLES NACIONAL'` e `ICMS { cst: '90' }`.
2. **CFOP por UF** — remetente SP → destinatário MG usa `cfopInterstate` (`6353`).
3. **CPF** — parte com 11 dígitos vira `cpf` (nunca `cnpj`), sem `ie` quando não há IE.
4. **Agrupamento** — duas notas somam `vCarga 2158.48`, somam as três `infQ` e emitem duas `infNFe`;
   `proPred` é decidido sobre o conjunto, não por nota.
5. **Produto predominante** — `fixed` usa o nome do perfil, `highest_weight` usa o maior peso
   declarado no item; erros `CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT` para `fixed` sem nome e
   para `highest_weight` sem peso em nenhum item.
6. **ICMS** — `00` (`vBC 43.13`, `pICMS 12`, `vICMS 5.18`), `20` com redução de 20 %
   (`vBC 34.50`, `vICMS 4.14`), `40` só com CST, `60` rejeitado
   (`CTE_PAYLOAD_UNSUPPORTED_ICMS`).
7. **Bloqueios** — seleção vazia (`CTE_PAYLOAD_EMPTY_SELECTION`), notas com remetente/destinatário
   divergentes (`CTE_PAYLOAD_INCONSISTENT_PARTIES`) e modal ≠ rodoviário
   (`CTE_PAYLOAD_UNSUPPORTED_MODAL`).

### Implementação

```
src/cte-issuance/domain/
  cte-payload.types.ts     entradas puras (nota, partes, volumes, produtos, perfil, frete, RNTRC)
  cte-payload.error.ts     6 ApiError tipados, todos 422
  cte-cargo.service.ts     infQ somadas + resolução do produto predominante
  cte-payload.builder.ts   buildCtePayload(params): CteData
```

```
bun run --cwd apps/api-transportada test ./test/cte-issuance-domain.contract.test.ts → 18 pass / 0 fail
bun run --cwd apps/api-transportada test                                            → 665 pass / 1 skip / 0 fail
bun run typecheck                                                                   → sem erro
bun run lint                                                                        → sem warning
```

### Decisões registradas

- **Domínio puro, sem I/O e sem float.** O builder não conhece Drizzle, provider nem `Request`:
  recebe a projeção da nota, o perfil e o frete já composto (T002a) e devolve `CteData`. Toda a
  aritmética é BigInt em escala 4 (`MONEY_SCALE`) reescalada meia-acima para 2
  (`FISCAL_MONEY_SCALE`); a conversão para `number` acontece só na última linha, porque o contrato
  do `@adatechnology/fiscal-provider` tipa os campos monetários como `number`.
- **Tipos importados da raiz do pacote.** `CteData`, `CteIcms`, `CteMunicipio`, `CteParticipante` e
  `CteQuantidadeCarga` vêm de `@adatechnology/fiscal-provider` (export público), nunca de
  `src/sefaz/*` — o golden test passa a validar conformidade com o contrato do provider em tempo de
  compilação.
- **`highest_weight` depende de peso por item, que a NF-e não carrega.** `nfeProducts` não tem
  coluna de peso e o layout da NF-e só declara peso no agregado `vol`. O tipo de entrada aceita
  `grossWeight` opcional por produto (preenchível no futuro) e o builder **falha com erro tipado**
  quando o modo está configurado e nenhum item declara peso — inventar rateio de peso seria inventar
  regra fiscal.
- **ICMS CST `60` é configurável mas não parametrizável.** `CteIcms` exige `vBCSTRet`,
  `pICMSSTRet` e `vICMSSTRet` para o CST 60 e o perfil não guarda nenhum dos três; o builder rejeita
  explicitamente em vez de emitir base zerada.
- **CST `90` sem alíquota é o caso do Simples Nacional.** Com `icmsRate = 0` o payload sai como
  `{ cst: '90' }` — exatamente o da CT-e de referência (CRT 1). Se o perfil configurar alíquota, o
  builder emite `vBC`/`pICMS`/`vICMS`.
- **`infQ` só com valor positivo.** Volumes sem peso líquido ou sem quantidade não geram entrada
  zerada.
- **Uma CT-e = um par remetente/destinatário.** Consistente com o agrupamento `sender_recipient` do
  T008; notas divergentes no mesmo item são erro de domínio, não silenciosamente ignoradas.

### Campos da CT-e de referência que dependem do T016

O `CteData` não os expõe e o `CteXmlBuilder` do pacote não os emite — nenhum é contornável na API:

| Campo do XML           | Situação no pacote 0.2.0                                    | Parâmetro do perfil que já existe  |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `ide/retira`           | fixo `0` (`CteXmlBuilder.ts:257`)                           | `pickupIndicator`                  |
| `ide/indIEToma`        | fixo `9` (`CteXmlBuilder.ts:257`)                           | `receiverIeIndicator`              |
| `infCarga/vCargaAverb` | não emitido (`:248`)                                        | `cargoInsuranceDeclared`           |
| `infNFe/dPrev`         | não emitido (`:96`)                                         | `deliveryDays`                     |
| `compl/xEmi`           | não emitido (`:253`)                                        | —                                  |
| `imp/vTotTrib`         | fixo `0.00` (`:240`)                                        | —                                  |
| `infQ/qCarga`          | `toFixed(3)`, a referência usa 4 casas (`:245`)             | —                                  |
| `ICMSSN`/`indSN`       | CST 90 sai como `<ICMS90>` (`:77`), nunca `<ICMSSN><indSN>` | `icmsCst`, regime do perfil fiscal |

A última linha é a mais grave: a CT-e de referência é de optante pelo Simples Nacional e **não pode
ser reproduzida byte a byte** enquanto o `CteXmlBuilder` não emitir `ICMSSN`. O `buildCtePayload`
já entrega o `{ cst: '90' }` correto; o resto é T016, que **depende de autorização** para mexer no
repositório `adatechnology-packages`.

## T014 — `cte_issuance_payloads`: montagem e persistência do payload no `issue`

### Contrato antes da implementação

`apps/api-transportada/test/cte-issuance-application/payload.contract.ts` (registrado no entrypoint
`test/cte-issuance-application.contract.test.ts`) e as suítes de schema
`test/cte-issuance-schema/{tables,aggregator,issuance}.contract.ts`:

1. **Persiste o payload transmissível da tentativa criada** — o `issue` consulta a fonte exatamente
   uma vez (`{batchId, batchItemId, companyId}`) e grava um único registro amarrado ao
   `attempt-001`, com `cfop 5353`, `documentos[0].chave` da NF-e golden, `modal 01` + RNTRC do
   perfil fiscal, remetente pelo CNPJ da golden e `valorTotalPrestacao = valorTotalReceber = 43.13`.
2. **Provider config completa** — `toEqual` estrito sobre as 16 chaves e
   `Object.values(providerConfig).filter((v) => v === '')` vazio: nenhum campo em branco sobra.
3. **Sem material de certificado** — `JSON.stringify(savedPayloads)` não contém `certificado`,
   `certificate`, `senha`, `password` nem `privatekey`.
4. **Fingerprint estável** — duas fixtures independentes produzem o mesmo sha256 de 64 hex.
5. **Bloqueios** — item sem fonte de payload → `CTE_ISSUANCE_PAYLOAD_SOURCE_MISSING` (422) e perfil
   fiscal incompleto (`stateRegistration` vazia) → `CTE_ISSUANCE_EMITTER_INCOMPLETE` (422), ambos
   sem gravar nada.
6. **Reprocesso também grava** — cada tentativa de `reprocess` persiste o seu próprio payload.

### Implementação

- **Tabela `cte_issuance_payloads`** (`src/database/cte-issuance.schema.ts`) — `payload` e
  `provider_config` em `jsonb`, `payload_sha256` com `check ~ '^[0-9a-f]{64}$'`, FKs compostas
  `(company_id, batch_id)`, `(company_id, batch_item_id)`, `(company_id, attempt_id)`, uniques
  `(company_id, id)` e `(company_id, attempt_id)`, índice
  `(company_id, batch_item_id, created_at)`. Migration
  `drizzle/20260727190452_cte_issuance_payloads/` com `rollback.sql` guardado ao lado.
- **`cte-issuance-payload.port.ts`** — `CteIssuancePayloadSource` (charge, emitter, invoices,
  profile), `CteIssuanceProviderConfig` (16 campos, **sem** `certificadoBase64`/`certificadoSenha`)
  e o `CteIssuancePayloadPort` (`findPayloadSource` + `savePayload`).
- **`cte-issuance-payload.service.ts`** — `assembleCteIssuancePayload` valida o perfil fiscal campo
  a campo, chama `buildCtePayload` (T013), compõe a provider config e calcula
  `sha256(JSON.stringify({payload, providerConfig}))`.
- **`cte-issuance-payload.query.ts`** — fonte lida do snapshot do item
  (`fiscalComponents`/`fiscalAmount`), do `cte_emission_profiles` do snapshot, do
  `company_fiscal_profiles` da empresa e das notas via `cte_batch_item_documents` →
  `nfe_documents` + participantes/endereços/produtos/volumes. Toda query filtra `companyId`.
- **`cte-issuance.use-case.ts`** — helper `persistIssuancePayload` chamado logo após a criação da
  tentativa, tanto no `executeIssue` quanto no `executeReprocess`, dentro da mesma unit of work: se
  a montagem falhar, a reserva de número fiscal é desfeita junto.
- **`drizzle-cte-issuance.repository.ts`** — `findPayloadSource`/`savePayload` implementados nas
  duas classes (repositório e transação); o insert usa `onConflictDoNothing` sobre
  `(company_id, attempt_id)`.

### Decisões

- **Ambiente persistido no vocabulário do domínio.** `provider_config.environment` é
  `homologation`/`production`, igual aos checks do banco; o gateway do worker é quem traduz para
  `homologacao`/`producao`. Um único vocabulário no banco, tradução só na borda do provider.
- **Certificado fica fora do registro.** A provider config guarda emitente, série, número e
  ambiente; o worker decripta o certificado por conta própria (T017). É o que torna o payload
  auditável sem violar a regra de nunca persistir material sensível.
- **Valores vêm do snapshot fiscal, não de `cte_batch_item_charges`.** O snapshot já passou por
  `roundChargeToFiscalScale` (2 casas, reconciliado) e é o que a tela mostra; somar as linhas em
  escala 4 poderia divergir em um centavo do total exibido.
- **Série, número e ambiente vêm da tentativa.** A montagem não relê sequência: consome o que a
  reserva devolveu, então o T015 conserta reserva e provider config de uma vez só.
- **Campos ausentes na NF-e viram `null`, não string vazia.** `nfe_participants` não tem telefone,
  e-mail nem nome fantasia e `nfe_products` não tem peso — o payload declara a ausência em vez de
  inventar dado fiscal.
- **Perfil fiscal incompleto é 422, não emissão com campo vazio.** `assertCompleteEmitter` derruba a
  transação antes de qualquer chamada à SEFAZ; é a eliminação por construção dos 10 campos vazios
  que o `toProviderConfig` do worker ainda produzia.

### Verificação

```
bun run typecheck                                  # 4 apps, sem erro
bun run --cwd apps/api-transportada test            # 673 pass · 1 skip · 0 fail (674 testes, 49 arquivos)
bun test ./test/cte-issuance-application.contract.test.ts \
         ./test/cte-issuance-schema.contract.test.ts # 29 pass · 0 fail · 209 asserts
bun run lint                                        # 4 apps, 0 warning
make migration-test                                 # 9 pass · 0 fail (migration + rollback em Postgres descartável)
make check                                          # format:check + lint + typecheck + test + build, tudo verde
```

## T015 — série, número e ambiente fiscais reais no `issue` e na reserva

### Contrato antes da implementação

`test/cte-issuance-application/fiscal-sequence.contract.ts` (registrado em
`test/cte-issuance-application.contract.test.ts`), escrito antes de tocar em `src/`:

1. `issue` consulta `findFiscalSettings({ companyId })` e reserva o número no ambiente e na série
   configurados pela empresa — nada de valor fixo.
2. O ambiente e a série resolvidos carimbam tanto a tentativa (`cte_issuance_attempts`) quanto a
   `providerConfig` do payload transmissível (`environment` / `serie`).
3. Empresa sem sequência fiscal de CT-e configurada → `CTE_ISSUANCE_FISCAL_SEQUENCE_MISSING` / 422,
   sem reserva, sem tentativa e sem payload persistido.
4. `reprocess` **não** reconsulta a configuração: reserva no ambiente e na série da tentativa
   original (`fiscalSettingsQueries` vazio), de modo que uma tentativa de homologação nunca é
   reprocessada em produção.
5. Varredura do código-fonte: nem o use case nem o repositório podem conter
   `fiscalEnvironment: 'homologation',`, `?? 'homologation'`, `environment: 'homologation'`,
   `series: 1n` ou `fiscalSeries: '1'`.

Execução na fase vermelha: `26 tests · 11 pass · 15 fail`.

### Implementação

- `CteIssuanceUnitOfWorkPort` ganhou `findFiscalSettings` e o input de `reserveFiscalNumber` passou a
  exigir `environment` e `series`; novo tipo exportado `CteIssuanceFiscalSettings`.
- `executeIssue` resolve a configuração antes de reservar, propaga `environment`/`series` para a
  reserva e usa o ambiente resolvido no `createIssuance`.
- `executeReprocess` reserva com o `fiscalEnvironment`/`fiscalSeries` da tentativa vigente.
- `normalizeCreateIssuanceResult` perdeu o fallback `?? 'homologation'` — ambiente ausente no
  registro criado agora é estado inválido, não silêncio.
- Novo `src/cte-issuance/infrastructure/cte-issuance-fiscal-settings.query.ts`: ambiente vem de
  `company_fiscal_profiles.environment` e a série da linha mais recente de `fiscal_sequences` para
  `(companyId, environment, model 'cte')` — a mesma regra já usada por `findCompanySettings`.
- `drizzle-cte-issuance.repository.ts`: `findFiscalSettings` nas duas implementações do port
  (repositório e transação) e `createReservationInput` passou a receber ambiente e série do chamador.

### Decisões

- **Reprocesso não migra de ambiente.** Se a empresa trocar de homologação para produção entre a
  emissão e o reprocesso, o reprocesso continua no ambiente original. Misturar ambientes fiscais em
  uma mesma tentativa é proibido pelo contrato do projeto.
- **Sem sequência configurada é 422, não default.** Assumir homologação silenciosamente foi o que
  produziu o bug que esta task remove; a empresa precisa configurar a série em Configurações antes de
  emitir.
- **Série continua `text` na aplicação e `bigint` no banco.** A conversão acontece só na fronteira da
  reserva (`BigInt(input.series)`), preservando o formato que o provider espera.
- **`innerJoin` em vez de `leftJoin`.** Perfil fiscal sem sequência de CT-e devolve `null` (→ 422) em
  vez de lançar erro genérico, porque aqui é entrada de usuário faltando, não inconsistência.

### Verificação

```bash
bun test ./test/cte-issuance-application.contract.test.ts  # 26 pass · 0 fail · 129 asserts
bun run typecheck                                          # 4 apps, sem erro
bun run test  (api-transportada)                           # 678 pass · 1 skip · 0 fail
make check                                                 # format:check + lint + typecheck + test + build verdes
```

## T017 — worker lê o payload persistido, descriptografa o certificado e chama o provider

### Teste de contrato antes da implementação

`apps/worker-transportada/test/cte-issuance-execution-input.contract.test.ts` (6 casos), escrito antes
de qualquer edição de produção:

1. monta a entrada de execução a partir da linha persistida em `cte_issuance_payloads` — a primeira
   chamada do resolver é `findByAttempt({attemptId, companyId})`, `cteData` é exatamente o payload
   persistido, `tenantId` é o `companyId` do envelope e `documentId` é o `batchItemId`;
2. injeta o certificado descriptografado, que a config persistida nunca carrega;
3. payload ausente → `CteIssuanceFatalError` e nenhuma chamada de decrypt;
4. empresa sem certificado ativo de CT-e → `CteIssuanceFatalError`;
5. config persistida sem `serie` → `CteIssuanceFatalError`;
6. efeito completo — o provider fake recebe os 17 campos reais (`environment: 'producao'`, `serie`,
   `numeroCte`, `rntrc`, `crt`, `codigoMunicipio`, endereço do emitente), o `emit` recebe o `cteData`
   e os logs não contêm certificado nem senha.

Fase vermelha: `0 pass · 6 fail`.

### Implementação

- `src/database/cte-issuance-execution.schema.ts` — cópia da tabela `cte_issuance_payloads`; as cópias
  de `company_fiscal_profiles` e `fiscal_sequences` saíram, porque o payload já carrega ambiente e série.
- `src/cte-issuance/infrastructure/drizzle-cte-issuance-payload.repository.ts` (novo) — busca por
  `(companyId, attemptId)`.
- `src/cte-issuance/infrastructure/drizzle-cte-certificate.repository.ts` (novo) — certificado ativo de
  CT-e da empresa, mais recente primeiro.
- `src/cte-issuance/application/cte-issuance-execution-input-resolver.service.ts` — reescrito: valida a
  config persistida com Zod na fronteira, descriptografa o certificado e devolve
  `{config, cteData, documentId, tenantId}`.
- `src/cte-issuance/infrastructure/cte-fiscal-gateway.ts` — `CteFiscalProviderConfig` exportado com os
  17 campos reais; `toProviderConfig` virou mapeamento 1:1 (só traduz `environment`), sem os 10 campos
  vazios fabricados.
- `src/main.ts` — resolver recebe `certificateRepository`, `payloadRepository` e `secretService`.
- Removido `drizzle-cte-issuance-execution-input.repository.ts`.

### Decisões

- **A linha persistida é a única fonte do payload e da config.** O worker só acrescenta o certificado
  descriptografado; não recalcula nada fiscal.
- **Payload ausente, certificado ausente e config incompleta são fatais, não recuperáveis.** O payload é
  gravado na mesma transação da tentativa — a ausência é inconsistência real, então vai para a dead
  letter para auditoria e reprocesso manual, em vez de virar retry infinito.
- **JSONB persistido é validado com Zod na fronteira do worker.** É dado que atravessou processos; o
  contrato de campos exigidos pelo provider é verificado antes de chegar na SEFAZ.
- **Os 16 campos gravados por `composeProviderConfig` (API) batem com o schema do worker** — o `model`
  extra é descartado na validação.

### Verificação

```bash
bun test ./test/cte-issuance-execution-input.contract.test.ts  # 6 pass · 0 fail
bun run --cwd apps/worker-transportada test                    # 120 pass · 0 fail (22 arquivos)
make check                                                     # api 678 · worker 120 · cron 24 · frontend 148 — tudo verde
```

## T018 — write-back de execução no worker

### Teste de contrato antes da implementação

`apps/worker-transportada/test/cte-issuance-write-back.contract.test.ts` (8 casos), escrito antes de
qualquer edição de produção:

Política pura (`resolveCteBatchStatus`):

1. lote com qualquer item ainda não liquidado (`pending`/`in_flight`/`retry_scheduled`) → `in_flight`;
2. lote com todos os itens `authorized` → `done`;
3. lote com qualquer item `rejected`/`failed`/`reconciliation_required`/`cancelled` → `error`;
4. lote sem itens → `submitted`.

Efeito do consumidor:

5. grava `in_flight` **antes** de transmitir e `authorized` depois, com chave e protocolo devolvidos
   pelo provider;
6. rejeição da SEFAZ grava o `errorCode` antes de lançar o erro fatal;
7. falha recuperável grava `retry_scheduled` com a causa (`FiscalTimeoutError`);
8. nenhum campo de certificado ou senha chega ao write-back.

Fase vermelha: `0 pass · 8 fail`.

`apps/worker-transportada/test/cte-issuance-write-back.integration.test.ts` (4 casos, Postgres real,
seed por SQL bruto nas tabelas que o worker não replica): lote `submitted → in_flight`; lote continua
`in_flight` enquanto um irmão não liquidou; lote vai para `error` quando um irmão é rejeitado; três
eventos de tentativa (`in_flight`, `authorized`, `rejected`) com payloads `{accessKey, protocol}` e
`{errorCode: '539'}` e dois eventos de lote (`in_flight` vindo de `submitted`, `error` vindo de
`in_flight`).

### Implementação

- `src/cte-issuance/domain/cte-batch-progress.policy.ts` (novo) — `resolveCteBatchStatus` puro, sem I/O,
  com o conjunto de status liquidados.
- `src/cte-issuance/infrastructure/cte-fiscal-gateway.ts` — `issue` deixou de devolver `void` e devolve
  `CteIssueOutcome` (`ok` com chave/protocolo, `rejected` com código, `error` com causa).
- `src/cte-issuance/application/cte-issuance-consumer.effect.ts` — porta `CteIssuanceWriteBack` com
  `recordInFlight`, `recordAuthorized`, `recordRejected`, `recordRetryScheduled`; o efeito chama a porta
  em volta da transmissão e continua lançando os erros fatal/recuperável que o consumidor já tratava.
- `src/cte-issuance/infrastructure/drizzle-cte-issuance-write-back.repository.ts` (novo) — cada método é
  **uma transação** que atualiza `cte_issuance_attempts` (status + `last_error_code`/`last_error_cause`),
  insere em `cte_issuance_events` e recalcula o status do lote a partir da última tentativa de cada item,
  gravando `cte_batches.status` e um `cte_batch_events` **só quando o status muda de fato**.
- `src/cte-issuance/infrastructure/drizzle-cte-issuance-worker.repository.ts` — `markDeadLettered` agora
  marca a tentativa como `failed` antes de registrar a mensagem processada.
- `src/database/cte-issuance-execution.schema.ts` — cópias de `cte_issuance_attempts`,
  `cte_issuance_events`, `cte_batches`, `cte_batch_items` e `cte_batch_events` (subconjunto de colunas
  usado pelo worker).
- `src/main.ts` — instancia o repositório de write-back e injeta no efeito e no repositório do consumidor.

### Decisões

- **O status do lote é derivado, nunca incremental.** Recalcular a partir da última tentativa de cada
  item torna a transição idempotente sob reentrega de mensagem — o mesmo evento processado duas vezes
  produz o mesmo estado final.
- **`cte_batch_events` só recebe linha quando o status muda.** Evita ruído de auditoria em lotes grandes,
  onde cada item liquidado recalcularia `in_flight` dezenas de vezes.
- **Dead letter só sobrescreve tentativa não liquidada.** Uma tentativa já `rejected` mantém o código da
  SEFAZ; o `failed` é reservado para quem morreu sem resposta fiscal.
- **`cte_batches.version` não é tocado.** É a coluna de trava otimista da API, e lote em trânsito não é
  editável — mexer nela invalidaria edições concorrentes legítimas por um motivo que não é edição.

### Bloqueio registrado — `cte_fiscal_documents` e XML no MinIO (vira T018b)

`SefazCteProvider.emit` devolve apenas `{success, chaveAcesso, protocolo, rawResponse}`: o
`CteSoapClient.parseCteAutorizacaoResponse` não monta o `cteProc` (XML autorizado), diferente do que
`SefazNfeProvider`/`SefazNfceProvider` fazem com o `nfeProc`. Como `cte_fiscal_documents.xml_object_id` é
`NOT NULL` com FK para `stored_objects`, não há como gravar a linha sem o XML, e reconstruí-lo no worker
significaria duplicar internals do pacote fiscal — proibido pela constituição.

Impacto enquanto não for desbloqueado: `findRetrySchedule` continua devolvendo `protocol`/`accessKey`
nulos, o download do XML no frontend não tem origem e o módulo `billing`, que lê `cte_fiscal_documents`,
permanece vazio. A correção é no repositório `adatechnology-packages` e depende de autorização explícita,
mesmo gate da T016.

### Verificação

```bash
bun test ./test/cte-issuance-write-back.contract.test.ts      # 8 pass · 0 fail
bun run --cwd apps/worker-transportada test                   # 128 pass · 0 fail (23 arquivos)
bun test ./test/cte-issuance-write-back.integration.test.ts   # 4 pass · 0 fail (Postgres local)
make check                                                    # api 678 · worker 128 · cron 24 · frontend 148 — tudo verde
```

## T016 — pacote fiscal: `cteProc` no retorno e `retira`/`indIEToma`/`vCargaAverb`/`dPrev` parametrizáveis

Repositório **`adatechnology-packages`** (`packages/backend/fiscal-provider`), autorizado explicitamente
pelo usuário. Escopo unificado com o desbloqueio da T018b porque as duas mudanças tocam o mesmo provider.

### Fase vermelha

`test/contract/fiscal-provider.contract.test.ts` (8 casos novos, todos falhando antes da implementação):

- `assembles the cteProc from the signed CT-e and the SEFAZ protocol`
- `never leaks certificate material into the authorized XML`
- `omits the authorized XML when SEFAZ rejects the CT-e`
- `takes retira, xDetRetira and indIEToma from the caller`
- `falls back to door delivery and non-taxpayer tomador when omitted`
- `emits vCargaAverb after the infQ list, with two decimals`
- `emits dPrev inside infNFe right after the access key`
- `omits vCargaAverb and dPrev when the caller does not provide them`

### Implementação

- `src/sefaz/CteSoapClient.ts` — `parseCteAutorizacaoResponse` passa a extrair o `<protCTe>` cru da
  resposta SOAP em `xmlProtocolo`, o mesmo mecanismo que a NF-e já usava para o `protNFe`.
- `src/providers/SefazCteProvider.ts` — `buildCteProc(signedXml, xmlProtocolo)` monta o `cteProc`
  (CT-e assinado + `protCTe`) e o `emit` devolve `xmlAutorizado`, além de `serie` e `numeroDocumento`,
  paridade com o `SefazNfeProvider`.
- `src/sefaz/CteXmlBuilder.ts` — `retira`, `xDetRetira` e `indIEToma` saem do `ide` cravado e passam a
  vir do `CteData`; `vCargaAverb` entra em `infCarga` depois da lista de `infQ`; `dPrev` entra em
  `infNFe` logo depois da chave.
- `src/types.ts` — `CteData.retira?: '0' | '1'`, `xDetRetira?`, `indIEToma?: '1' | '2' | '9'`,
  `CteData.carga.vCargaAverb?: number`, `CteDocumentoNfe.dPrev?: string`.
- `.changeset/cte-authorized-xml-and-ide-parameters.md` — bump `minor`.

### Decisões

- **O `cteProc` é montado a partir do XML assinado que o próprio provider transmitiu**, não de um
  reparse da resposta: o XML que vale legalmente é exatamente o que foi assinado, e reconstruí-lo
  produziria bytes diferentes da assinatura.
- **`retira` muda de padrão `'0'` para `'1'`.** `'0'` significa que o recebedor busca a carga no
  terminal — é a exceção; entrega no endereço do destinatário é o caso normal. Quebra registrada no
  changeset: quem dependia do comportamento antigo precisa passar `retira: '0'` explicitamente.
- **Nenhuma regra legal nova foi inventada:** os quatro campos já existem no schema CT-e 4.00 e estavam
  apenas cravados em constante.

### Verificação

```bash
bun run test    # 23 pass · 0 fail · 115 expect() — 2 arquivos
bun run check   # tsc --noEmit limpo
```

### Release publicado

O `transportada` resolve `@adatechnology/fiscal-provider` **do registry npm**, não por `file:` — sem
publicar, `xmlAutorizado` chegaria `undefined` e o caminho da T018b degradaria para
`reconciliation_required`. Autorizado pelo usuário, o commit
`e3cfc6a feat(fiscal-provider): CT-e devolve o cteProc e parametriza retira/indIEToma/vCargaAverb/dPrev`
foi para a `main` de `adatechnology-packages`; as duas pipelines (CI e Publish packages) terminaram
verdes e o changesets publicou **`0.3.0-rc.0`** sob a dist-tag `rc` (o repo está em pre mode, então a
`latest` continua `0.2.0`).

O pin exato foi atualizado nos dois apps (`0.2.0` → `0.3.0-rc.0`) junto com os três testes que auditam
a versão (`certificate-validation-gateway.contract.test.ts`, `environment.contract.test.ts`,
`nfe-distribution/gateway.contract.ts`). `make check` verde depois da troca: api 688 · worker 133 ·
cron 24 · frontend 148 · 0 fail.

⚠️ **`indIEToma` continua no default `9` (não contribuinte).** O CT-e de referência em `example/` usa
`indIEToma=1` — tomador contribuinte de ICMS. O campo agora é parametrizável no pacote, mas o
`cte-payload.builder.ts` ainda não o preenche a partir da inscrição estadual do tomador. Registrado
como T021a; precisa fechar antes da T022 (E2E em homologação). O `retira` passou a sair correto sem
mudança no `transportada`: o novo default `'1'` bate com o XML de referência.

## T018b — `cte_fiscal_documents` + XML autorizado no MinIO

### Fase vermelha

```
error: Cannot find module '../src/cte-issuance/infrastructure/cte-fiscal-document-storage.gateway.js'
0 pass · 1 fail
```

`apps/worker-transportada/test/cte-fiscal-document.contract.test.ts` (5 casos): chave/sha256/tamanho do
objeto armazenado sob o prefixo do tenant; XML carregado do provider até o write-back com
`fiscalDocument` completo; autorização sem documento quando o provider não devolve XML; tentativa nunca
falha quando o storage quebra; senha de certificado e material `BASE64CERT` nunca chegam ao storage nem
ao write-back.

`apps/worker-transportada/test/cte-issuance-write-back.integration.test.ts` ganhou um caso (Postgres
real): `recordAuthorized` chamado duas vezes com `objectId` diferente grava **uma** linha em
`cte_fiscal_documents` e **uma** em `stored_objects` com `purpose = 'cte_document'`.

### Implementação

- `src/database/storage.schema.ts` (api) — novo propósito `cte_document` em `STORAGE_OBJECT_PURPOSES` e
  no check constraint; migração `20260727201344_cte_fiscal_document_storage_purpose` com `rollback.sql`
  guardado (cabeçalho de destrutividade + `DO $$` que exige exatamente 1 linha removida do journal).
- `src/database/nfe.schema.ts` e `src/database/cte-issuance-execution.schema.ts` (worker) — cópia do
  propósito novo e da tabela `cte_fiscal_documents`.
- `src/cte-issuance/infrastructure/cte-fiscal-document-storage.gateway.ts` (novo) — grava o XML em
  `tenants/<companyId>/cte-documents/<chave>/authorized.xml` via `storeObject` em modo `create-only`.
- `src/cte-issuance/infrastructure/cte-fiscal-gateway.ts` — `xmlAutorizado` do provider vira
  `authorizedXml` no `CteIssueOutcome`, sem quebrar o isolamento (o gateway continua sem importar o
  pacote fiscal).
- `src/cte-issuance/application/cte-issuance-consumer.effect.ts` — dependência opcional
  `authorizedDocumentStorage` e `storeFiscalDocument`, que **nunca lança**.
- `src/cte-issuance/infrastructure/drizzle-cte-issuance-write-back.repository.ts` — `recordAuthorized`
  recebe `fiscalDocument` e, dentro da mesma transação, insere `stored_objects` e `cte_fiscal_documents`
  com `onConflictDoNothing`.
- `src/main.ts` (worker) — injeta o gateway de storage no efeito.

### Decisões

- **O efeito nunca lança depois da autorização na SEFAZ.** Lançar provocaria retry e reemissão duplicada
  de um CT-e já autorizado. Falha de storage vira log `cte_issuance_authorized_xml_storage_failed` (sem
  XML, sem certificado) e a tentativa continua `authorized`.
- **XML sem storage vira evento `reconciliation_required`, não status.** Gravar esse _status_ na
  tentativa faria `resolveCteBatchStatus` derrubar o lote inteiro para `error` por um problema de
  armazenamento, não fiscal.
- **`create-only` no MinIO + `onConflictDoNothing` nos dois inserts** tornam a reentrega de mensagem
  idempotente ponta a ponta.
- **O write-back recebe só `{accessKey, authorizationProtocol, fiscalEnvironment, fiscalNumber,
fiscalSeries, xml}`** — nunca a config do provider, para que material de certificado não tenha caminho
  até a persistência. Coberto por teste de contrato.

### Verificação

```bash
bun test ./test/cte-fiscal-document.contract.test.ts ./test/cte-fiscal-gateway.contract.test.ts
                                                              # 9 pass · 0 fail
bun run --cwd apps/worker-transportada test                   # 133 pass · 0 fail (24 arquivos)
bun test ./test/cte-issuance-write-back.integration.test.ts    # 5 pass · 0 fail (Postgres local)
make check                                                     # api 678 · worker 133 · cron 24 · frontend 148
make migration-test                                            # 9 pass · 0 fail (migration + rollback)
```

## T019 — `listDocuments` injetado e `:itemId` respeitado nas rotas de issuance

### Fase vermelha

`test/cte-issuance-application/documents.contract.ts` (novo, 7 casos) + fixture estendida em
`test/cte-issuance-application/support.ts`. Antes da implementação:

```
bun test ./test/cte-issuance-application.contract.test.ts   # 26 pass · 7 fail (33 testes)
```

As 7 falhas eram exatamente as esperadas: `listDocuments` não existia no use case e
`findBatchItem` recebia `{batchId, companyId}` sem `batchItemId`.

### Implementação

- `src/cte-issuance/application/cte-issuance.use-case.ts` — `findBatchItem` ganhou
  `batchItemId?: string`; novas portas `listFiscalDocuments` e `CteDocumentDownloadPort`;
  `runListDocuments` valida lote → item → documentos e devolve `{items, nextCursor: null}`.
  `runGetIssuance` e `executeReprocess` passam `input.batchItemId`.
- `src/cte-issuance/infrastructure/drizzle-cte-issuance.repository.ts` — as **duas** cópias de
  `findBatchItem` (repositório e transação) passaram a chamar a mesma `findBatchItemRecord`;
  `listCteFiscalDocuments` faz join `cte_fiscal_documents` × `stored_objects` × `cte_batch_items`.
- `src/cte-issuance/infrastructure/cte-document-download.gateway.ts` (novo) — encapsula
  `createSignedDownload` do provider de storage; URL temporária de 300s.
- `src/storage/infrastructure/nfe-storage-gateway.ts` — `createSignedDownload` exposto no gateway.
- `src/main.ts` — `documentDownload` no use case e `listDocuments` nas dependências da rota.
- `src/cte-issuance/presentation/cte-issuance.routes.ts` — `listDocuments` deixou de ser opcional;
  `emptyDocumentPage()` removido.

### Decisões

- **URL assinada em vez de proxy do XML pela API.** O contrato de resposta já era
  `{downloadUrl, expiresAt}` e o frontend só abre a URL; passar megabytes de XML pelo `Bun.serve`
  não traria benefício e ocuparia o event loop.
- **`bucket` e `objectKey` nunca saem da infraestrutura.** O item devolvido tem exatamente
  `{accessKey, contentType, documentId, downloadUrl, expiresAt, sha256}` — teste de contrato falha se
  o nome do bucket ou um fragmento de XML aparecer no JSON.
- **`findBatchItem` sem `batchItemId` continua válido** porque `issue` é uma operação de lote; só
  `getIssuance`, `reprocess` e `listDocuments` passam o item.
- **Item fora do lote responde 404 `CTE_ISSUANCE_NOT_FOUND`** antes de qualquer consulta a documentos —
  anti-enumeração verificada pelo contrato (`fiscalDocumentQueries` vazio).
- Isolamento por tenant das duas queries novas coberto em
  `test/cte-issuance-schema/document-query-tenant-safety.contract.ts`, que serializa os filtros com
  `PgDialect` e checa `company_id` em ambas as tabelas.

### Verificação

```bash
bun test ./test/cte-issuance-application.contract.test.ts   # 33 pass · 0 fail
bun test ./test/cte-issuance-schema.contract.test.ts        # 11 pass · 0 fail
bun run --cwd apps/api-transportada typecheck               # limpo
make check                                                   # api 688 · worker 133 · cron 24 · frontend 148 · 0 fail
```

## T020 — frontend: acompanhamento de status, chave/protocolo, download e reprocesso

### Fase vermelha

`apps/frontend-transportada/test/cte-issuance/status-tracking.contract.ts` (novo, 5 casos)
registrado no entrypoint `test/cte-issuance.contract.test.ts`. Antes da implementação o módulo não
tinha `createCteIssuanceQueryPlan`, nem namespace i18n `cteIssuance`, nem painel de status:

```
bun test test/cte-issuance.contract.test.ts   # 6 pass · 5 fail (11 testes)
```

Cobertura dos casos:

1. plano de query — habilita issuance só com permissão + `batchId` + `batchItemId`, faz polling de
   5 s apenas em `requested`/`retry_scheduled` e libera documentos apenas em `authorized`.
2. view model expõe `accessKey`, `protocol`, `rejectionCode`, `rejectionCause` e **não** carrega
   `<cteProc`, certificado ou bucket.
3. `openDocumentForAccessKey` abre a URL do documento cuja chave bate e falha alto com
   `CTE_DOCUMENT_DOWNLOAD_UNAVAILABLE` quando não há correspondência.
4. locales PT/EN com conjuntos de chaves idênticos e os 5 estados da timeline traduzidos nos dois
   idiomas; namespace registrado em `i18n.service.ts`.
5. fiação entre seleção do item, painel de status e feedback de reprocesso — sem `localStorage`,
   `sessionStorage` ou payload fiscal no código do módulo.

### Implementação

- `src/modules/cte-issuance/shared/cteIssuancePolling.service.ts` (novo) —
  `createCteIssuanceQueryPlan` puro: decide `issuanceEnabled`, `documentsEnabled` e
  `refetchInterval` (`CTE_ISSUANCE_POLL_INTERVAL_MS = 5000`).
- `src/modules/cte-issuance/shared/cteIssuanceViewModel.service.ts` — passou a projetar
  `accessKey`, `protocol`, `rejectionCode` e `rejectionCause`.
- `src/modules/cte-issuance/shared/cteDocumentDownload.service.ts` — novo
  `openDocumentForAccessKey({accessKey, documents})`.
- `src/modules/cte-issuance/components/CteIssuanceStatusPanel.component.tsx` (novo) — timeline,
  grade de fatos (chave, protocolo, ambiente, atualização, código e causa da rejeição), aviso de
  polling, botões de download e reprocesso, alerta de falha no download.
- `src/modules/cte-issuance/hooks/useCteIssuanceStatus.hook.ts` — consome o plano no `enabled` e no
  `refetchInterval` das duas queries e devolve `timeline` + `viewModel` prontos.
- `src/modules/cte-batch/hooks/useCteBatchItems.hook.ts` — passou a ser dono do item acompanhado
  (`selectItem`/`closeTracking`/`trackedItem`), alimentando `batchItemId`; o download virou mutation
  que lista documentos do item e abre a URL assinada.
- `src/modules/cte-batch/components/CteBatchItemsPanel.component.tsx` — ação "Acompanhar" por linha
  e o painel de status abaixo da tabela.
- `src/modules/cte-issuance/locales/cteIssuance.locale.json` + `.en.locale.json` (novos) e registro
  em `src/modules/shared/i18n/i18n.service.ts`.
- `src/modules/cte-issuance/styles/cteIssuance.module.css` (novo) — só design tokens.

### Decisões

- **Polling derivado do status, não de timer fixo.** O `refetchInterval` é função do estado da
  emissão: para de bater na API assim que o CT-e chega a `authorized`/`rejected`/`failed`.
- **Decisão de habilitar/pollar extraída para função pura.** O React Query não é testável nos
  contratos (sem renderer); a regra vive em `cteIssuancePolling.service.ts` e é exercitada direto.
- **Download nunca passa XML pelo frontend.** A mutation só resolve a URL assinada do documento cuja
  chave de acesso bate com a do item e a abre — nada de conteúdo fiscal em memória ou storage local.
- **Falha de download é ruidosa.** Sem documento correspondente, `CTE_DOCUMENT_DOWNLOAD_UNAVAILABLE`
  sobe e vira alerta no painel, em vez de um clique que não faz nada.
- **`trackedItem` como propriedade simples no retorno do hook** (não spread condicional): com
  `exactOptionalPropertyTypes`, o spread transformaria o retorno em união e quebraria o consumo.

### Verificação

```bash
bun run --cwd apps/frontend-transportada test        # 153 pass · 0 fail (879 expect)
bun run --cwd apps/frontend-transportada typecheck   # limpo
bun run --cwd apps/frontend-transportada lint        # limpo
make check                                            # api 688 · worker 133 · cron 24 · frontend 153 · 0 fail
```

## T021 — retry configurável por empresa (API + worker)

### Fase vermelha

Suítes novas escritas antes da implementação:

- `apps/api-transportada/test/cte-issuance-domain/cte-retry-policy.contract.ts` (6 casos)
- `apps/api-transportada/test/cte-issuance-application/retry-policy.contract.ts` (4 casos),
  registrada em `test/cte-issuance-application.contract.test.ts`
- `apps/api-transportada/test/cte-issuance-schema/retry-query-tenant-safety.contract.ts`,
  registrada em `test/cte-issuance-schema.contract.test.ts`
- `apps/worker-transportada/test/cte-issuance-retry-policy.contract.test.ts` (4 casos), adicionada
  à lista explícita do `package.json`

```
bun test test/cte-issuance-domain.contract.test.ts        # Cannot find module 'cte-retry.policy.js'
bun test test/cte-issuance-retry-policy.contract.test.ts  # Cannot find module 'cte-retry.policy.js'
```

Cobertura dos casos:

1. `createCteRetryPolicy` cai nos padrões (3 tentativas · 5s/30s/300s) com `null`/`undefined` e
   preserva a configuração da empresa quando presente.
2. Configuração inválida (não inteiro, `< 1`, acima dos limites, curva vazia ou com passo não
   positivo) rejeitada com `CTE_RETRY_POLICY_INVALID` (422).
3. `resolveCteRetryDelaySeconds` escala pela curva e repete o último passo quando as tentativas
   passam do tamanho dela.
4. `calculateCteRetryNextAttemptAt` soma o passo correto ao relógio injetado.
5. `isCteRetryExhausted` na fronteira exata de `maxAttempts`.
6. API: `scheduleRetry` persiste `maxAttempts` e `nextAttemptAt` vindos do perfil fiscal da empresa
   (`maxAttempts: 7` → `scheduled`; `maxAttempts: 1` → `exhausted`), e o use case lê as configurações
   filtrando por `companyId`.
7. Tenant-safety: `buildRetryScheduleFilters` emite `company_id = $1 and attempt_id = $2`.
8. Worker: política `[120,600]`/max 5 no `attempt: 1` agenda `2026-07-22T21:10:00.000Z`; max 2 no
   mesmo attempt vai para DLQ; política ausente cai nos padrões.

### Implementação

- `apps/api-transportada/src/cte-issuance/domain/cte-retry.policy.ts` (novo) — fonte única da
  convenção: normalização/validação, `resolveCteRetryDelaySeconds`,
  `calculateCteRetryNextAttemptAt`, `isCteRetryExhausted` e os limites
  (`CTE_RETRY_MAX_ATTEMPTS_LIMIT = 10`, `CTE_RETRY_BACKOFF_STEPS_LIMIT = 10`).
- `apps/api-transportada/src/cte-issuance/domain/cte-retry.error.ts` (novo) —
  `CteRetryPolicyInvalidError` (`CTE_RETRY_POLICY_INVALID`, 422).
- `apps/api-transportada/src/database/company-fiscal-profile.schema.ts` — colunas
  `cte_retry_max_attempts` (default 3) e `cte_retry_backoff_seconds` (`integer[]`, default
  `{5,30,300}`) + dois `CHECK` alinhados aos limites do domínio.
- `apps/api-transportada/drizzle/20260727213825_cte_retry_policy/` — `migration.sql` aditiva e
  `rollback.sql` manual guardado por `ROW_COUNT <> 1`.
- `src/cte-issuance/infrastructure/cte-issuance-fiscal-settings.query.ts` — devolve `retryPolicy`
  já normalizada junto de `environment` e `series`.
- `src/cte-issuance/application/cte-issuance.use-case.ts` — deriva `status`, `maxAttempts` e
  `nextAttemptAt` da política em vez de constantes.
- `src/cte-issuance/infrastructure/drizzle-cte-issuance.repository.ts` — `scheduleRetry` persiste os
  valores recebidos (saíram os `3n` e `Date.now() + 10_000` fixos) e passou a exportar
  `buildRetryScheduleFilters`, usado por `findRetrySchedule` e `countRetries`.
- `apps/worker-transportada/src/cte-issuance/domain/cte-retry.policy.ts` (novo) — cópia da política,
  na mesma convenção da duplicação de schema do worker.
- `apps/worker-transportada/src/cte-issuance/infrastructure/drizzle-cte-retry-policy.repository.ts`
  (novo) — resolve a política por `companyId` a partir de `company_fiscal_profiles`.
- `apps/worker-transportada/src/cte-issuance/application/cte-issuance-worker-message-handler.service.ts`
  — recebe `retryPolicyResolver` em vez de `maxAttempts` fixo.
- `apps/worker-transportada/src/messaging/cte-backoff-policy.ts` — **removido** (backoff fixo morto).
- `apps/worker-transportada/src/runtime/cte-issuance-consumer.service.ts` e `src/main.ts` — injetam
  o repositório de política.

### Decisões

- **Casa da configuração: `company_fiscal_profiles`.** A API já lê essa tabela em todo `issue` e o
  worker já a duplica por cópia — nenhuma query extra e nenhuma tabela nova duplicada.
- **`attemptsMade` = tentativas já consumidas.** Índice do atraso é
  `min(max(attemptsMade - 1, 0), len - 1)` e esgota em `attemptsMade >= maxAttempts`. A API mapeia
  `attemptsMade = attemptNumber - 1` (a tentativa sendo criada ainda não foi consumida) e o worker
  `attemptsMade = params.attempt + 1`. Nos dois lados a primeira retentativa espera o primeiro passo.
- **Off-by-one do worker corrigido de tabela.** Com `maxAttempts: 3` a DLQ agora acontece na 3ª
  entrega (`attempt: 2`), não na 4ª.
- **Tenant-safety de brinde.** `countRetries` filtrava só por `attemptId`; passou a filtrar também
  por `companyId`, com contrato cobrindo o SQL serializado.
- **Limites no banco e no domínio.** Os `CHECK` repetem `1..10` das constantes do domínio para que
  configuração inválida não entre nem por caminho fora da aplicação.
- **Escopo mantido em API + worker.** Expor a política no endpoint de company-settings e no
  formulário do frontend fica como T021b.

### Verificação

```bash
bun run --cwd apps/api-transportada test     # 699 pass · 1 skip · 0 fail
bun run --cwd apps/worker-transportada test  # 137 pass · 0 fail
make check                                   # api 699 · worker 137 · cron 24 · frontend 153 · 0 fail
make migration-test                          # 9 pass · 0 fail (migration + rollback + re-migration)
psql \d company_fiscal_profiles              # colunas e os dois CHECK aplicados no banco local
```

## T021a — `indIEToma` derivado da inscrição estadual do tomador

### Fase vermelha

`apps/api-transportada/test/cte-issuance-domain/cte-payload-receiver-ie.contract.ts` (novo, 7 casos)
registrado em `test/cte-issuance-domain.contract.test.ts`. O caso golden lê o XML de referência de
`example/exportacao_20_07_2026_13_17_59/CTe-3526…8240.xml` e compara `<toma>` e `<indIEToma>` com o
payload construído:

```
bun test test/cte-issuance-domain.contract.test.ts   # 24 pass · 6 fail (30 testes)
```

Cobertura dos casos:

1. golden — `tomador` e `indIEToma` iguais aos do CT-e de referência (`toma 0`, `indIEToma 1`).
2. tomador configurado como destinatário deriva da IE do destinatário, ignorando a do remetente.
3. IE literal `ISENTO` → `2`, mesmo com o perfil declarando contribuinte.
4. tomador sem IE cai no indicador do perfil (`9` e `2`).
5. tomador pessoa física sem IE → `9`, mesmo com o perfil declarando contribuinte.
6. tomador CNPJ sem IE com perfil declarando contribuinte → `CTE_PAYLOAD_RECEIVER_IE_UNAVAILABLE`.
7. tomador expedidor (`1`) ou recebedor (`2`) → `CTE_PAYLOAD_UNSUPPORTED_TAKER`.

### Implementação

- `src/cte-issuance/domain/cte-receiver-ie.policy.ts` (novo) — `resolveTakerParty` (tomador `0` →
  remetente, `3` → destinatário) e `resolveReceiverIeIndicator` com a derivação completa.
- `src/cte-issuance/domain/cte-payload.error.ts` — `CtePayloadUnsupportedTakerError`
  (`CTE_PAYLOAD_UNSUPPORTED_TAKER`, 422) e `CtePayloadReceiverIeUnavailableError`
  (`CTE_PAYLOAD_RECEIVER_IE_UNAVAILABLE`, 422).
- `src/cte-issuance/domain/cte-payload.builder.ts` — passou a emitir `indIEToma` no `CteData`; antes
  o campo saía ausente e o pacote aplicava o default `9`.
- `src/cte-issuance/domain/cte-payload.types.ts` — `CtePayloadProfile.receiverIeIndicator`.
- `src/cte-issuance/infrastructure/cte-issuance-payload.query.ts` — passou a selecionar
  `cte_emission_profiles.receiver_ie_indicator`, que já existia na tabela e na API mas nunca chegava
  ao payload.

### Decisões

- **Dado concreto vence configuração.** A IE do tomador na NF-e é evidência direta da condição
  fiscal: IE numérica → `1`, IE `ISENTO` → `2`. O `receiver_ie_indicator` do perfil só decide quando
  não há IE nenhuma.
- **Pessoa física sem IE → `9` sem consultar o perfil.** CPF sem inscrição não é contribuinte de
  ICMS; deixar o perfil declarar `1` aqui produziria CT-e rejeitada.
- **CNPJ sem IE com perfil declarando contribuinte é erro, não fallback.** `indIEToma=1` exige a IE
  do tomador; escolher `9` silenciosamente mudaria a declaração fiscal do documento. Falha em 422
  para o operador completar o cadastro ou corrigir o perfil.
- **Tomador expedidor/recebedor recusado.** O payload só carrega remetente e destinatário; emitir
  `<toma>1</toma>` ou `<toma>2</toma>` sem os grupos `exped`/`receb` geraria um CT-e inválido.
- **Golden lê o XML de `example/`, não uma constante.** O valor esperado vem do arquivo de
  referência, então divergência de leitura do XML aparece no teste.

### Verificação

```bash
bun test test/cte-issuance-domain.contract.test.ts   # 31 pass · 0 fail
make check                                           # api 706 · worker 137 · cron 24 · frontend 153 · 0 fail
```

## T022a — `POST /cte-batches/:id/issue` devolvia sempre 409 `CTE_ISSUANCE_INVALID_STATE`

### Sintoma

Qualquer tentativa de emissão respondia `409 CTE_ISSUANCE_INVALID_STATE`, mesmo com lote em
`draft`, item vinculado e `Idempotency-Key` novo. Nenhuma mensagem chegava ao worker.

### Causa

`normalizeCreateIssuanceResult` exige `fiscalEnvironment`, `fiscalSeries` e `fiscalNumber` no
retorno de `createIssuance`, mas o `mapIssuanceAttempt` do repositório Drizzle não devolvia nenhum
dos três. O port tipava o retorno como um objeto largo, então o compilador não acusava a lacuna, e
o fixture de teste fazia spread do próprio input — devolvia campos que a produção nunca devolveria,
escondendo o defeito atrás de 47 testes verdes.

### Correção

- `src/cte-issuance/application/cte-issuance.use-case.ts` — novo tipo exportado
  `CteIssuanceCreatedAttempt`; o port passou a declarar `Promise<CteIssuanceCreatedAttempt>` e a
  normalização lê os campos direto do retorno, sem reconstruí-los.
- `src/cte-issuance/infrastructure/cte-issuance-attempt.mapper.ts` (novo) — mapper extraído do
  repositório, único ponto que converte a linha de `cte_issuance_attempts` no contrato da aplicação.
  `fiscalNumber` é `bigint` no banco e sai como string.
- `src/cte-issuance/infrastructure/drizzle-cte-issuance.repository.ts` — passou a usar o mapper.
- `test/cte-issuance-application/support.ts` — o fixture deixou de espelhar o input e passou a
  montar a linha persistida e chamar `mapCteIssuanceAttempt`, exercitando o mapping de produção.

### Decisões

- **O tipo do port é o contrato.** A lacuna existia porque o retorno era estruturalmente livre;
  tipar `createIssuance` transforma o mesmo defeito em erro de compilação.
- **Fixture não inventa dados.** Fixture que faz spread do input testa a si mesmo. O fixture agora
  passa pelo mapper real, então divergência entre banco e aplicação quebra o teste.

### Verificação

```bash
bun test test/cte-issuance-infrastructure.contract.test.ts   # 4 pass · 0 fail
bun test test/cte-issuance-application.contract.test.ts \
         test/cte-issuance-infrastructure.contract.test.ts \
         test/cte-issuance-http.contract.test.ts             # 51 pass · 0 fail
bun run typecheck && bun run lint                            # limpos
```

E2E em homologação, lote `61503236-4ff0-4612-a7b0-3f94b08fd6a7`:
`POST /cte-batches/:id/issue` → **HTTP 202**; worker consumiu a mensagem, carregou o certificado A1,
montou e assinou o CT-e e transmitiu à SEFAZ. A tentativa parou em `rejected` com `HTTP_400` — causa
diagnosticada e registrada em T022b, fora do escopo desta task.

## T022b — diagnóstico do `HTTP_400` da SEFAZ (bloqueio de T022)

### Evidência

Certificado, mTLS e endpoint estão corretos: `CTeStatusServicoV4` respondeu
`ok: true · "Serviço em Operação."` com a mesma configuração e o mesmo cliente HTTP.

Sondagem do `CTeRecepcaoSincV4` de SP homologação (`Microsoft-IIS/10.0`, `x-aspnet-version 4.0.30319`):

| Variação                                                                                                | Resultado                                                             |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| SOAP 1.1                                                                                                | `HTTP 500` + `soap12:Upgrade` — o serviço exige SOAP 1.2              |
| SOAP 1.2, `soapAction` citado / sem aspas / operação errada / sem header / sem `action` no content-type | `HTTP 400`, `content-length: 0`                                       |
| SOAP 1.2 + `cteDadosMsg` com XML embutido                                                               | `HTTP 400`, corpo vazio                                               |
| SOAP 1.2 + `cteDadosMsg` com XML escapado                                                               | `HTTP 200` · cStat **244** "Falha na descompactação da área de dados" |
| SOAP 1.2 + `cteDadosMsg` com Base64 puro                                                                | `HTTP 200` · cStat **244**                                            |
| SOAP 1.2 + `cteDadosMsg` com **GZip + Base64**                                                          | `HTTP 200` · cStat **243** "XML Mal Formado"                          |

O WSDL do serviço (obtido com o certificado cliente) fecha o diagnóstico:

```xml
<s:element name="cteDadosMsg" type="s:string" />
<soap12:operation soapAction="http://www.portalfiscal.inf.br/cte/wsdl/CTeRecepcaoSincV4/cteRecepcao" />
```

`cteDadosMsg` é `string`, não `any` — por isso o ASP.NET rejeita o XML embutido antes de qualquer
validação fiscal, com 400 e corpo vazio.

O cStat 243 restante vem do próprio XML. Diff da árvore gerada contra o CT-e autorizado de
referência (`example/exportacao_20_07_2026_13_17_59/CTe-*.xml`, mesmo CNPJ):

- `infCTe` gerado × `infCte` no schema
- `versao="4.00"` em `<CTe>` gerado × em `<infCte>` no schema
- `enderRem` gerado × `enderReme` no schema
- ausentes: `infRespTec` (obrigatório no CT-e 4.00) e `infCTeSupl/qrCodCTe`

### Situação

Os quatro defeitos estão em `@adatechnology/fiscal-provider` (`CteSoapClient.ts`,
`CteXmlBuilder.ts`, `SefazXmlSigner.ts`), fora deste repositório. A correção aguarda autorização
explícita do usuário + ADR, conforme o precedente de T016.

### Correção — autorizada pelo usuário ("Autorizo corrigir o pacote + ADR")

Registrada em [ADR-0013](../../docs/adr/0013-cte-4-00-fixes-in-fiscal-provider.md). Cada defeito foi
provado contra `homologacao.nfe.fazenda.sp.gov.br/CTeWS/WS/CTeRecepcaoSincV4.asmx` com o certificado
real e corrigido com teste de contrato escrito antes da implementação
(`test/contract/cte-sefaz-wire.contract.test.ts`, 30 → 42 testes, 0 falhas).

Sequência real de veredictos da SEFAZ, um por defeito:

| Veredicto SEFAZ                          | Causa                                                        | Correção                            |
| ---------------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| `HTTP 400`, corpo vazio                  | `cteDadosMsg` é `xsd:string`                                 | GZip + Base64 no `CteSoapClient.ts` |
| cStat 243                                | `infCTe`, `versao` em `<CTe>`, `enderRem`                    | nomes do schema 4.00                |
| `cStat` vazio → `SEFAZ_UNKNOWN`          | parser buscava `retCTeSinc`                                  | `cteRecepcaoResult > retCTe`        |
| cStat 215 `versaoModal`                  | `<infModal versao=…>`                                        | `versaoModal="4.00"`                |
| cStat 215 `qCarga`                       | `TDec_1104` exige 4 casas                                    | `qCarga.toFixed(4)`                 |
| cStat 215 `ICMS90 incompleto`            | CRT 1 (Simples) usava `ICMS90`                               | grupo `ICMSSN`                      |
| cStat 215 `cMun vazio`                   | `nfe_addresses.city_code` NULL (defeito de dados, ver T022d) | backfill pontual                    |
| cStat 215 `nCT`/`TNF`                    | zeros à esquerda em `serie`/`nCT`                            | padding só na chave de acesso       |
| cStat 646 / 649                          | razão social de remetente/destinatário em homologação        | literal fixo da SEFAZ nas 4 partes  |
| cStat 850                                | faltava `infCTeSupl/qrCodCTe`                                | grupo + `Signature` após ele        |
| **cStat 100 — Autorizado o uso do CT-e** | —                                                            | —                                   |

`infRespTec` não é exigido: a SEFAZ autorizou sem ele.

## T022c — vazamento de certificado e senha em `createFiscalProvider`

Autorizado pelo usuário no mesmo trabalho ("Corrigir junto, no mesmo trabalho"). `FiscalProviderFactory.ts`
deixou de serializar a config; a mensagem de erro do caso exaustivo carrega apenas o discriminante
`model`. Registrado em [ADR-0013](../../docs/adr/0013-cte-4-00-fixes-in-fiscal-provider.md).

## T022 — E2E em homologação com a NF-e de referência

### Resultado

CT-e **autorizado** em homologação pelo caminho do produto (API → outbox → worker → SEFAZ →
persistência), com a NF-e de referência `35260705868574001090550020008526741408978623`:

```
POST /cte-batches/61503236-4ff0-4612-a7b0-3f94b08fd6a7/items/b7cdbb42-…/reprocess  → HTTP 202
cStat 100 · "Autorizado o uso do CT-e."
chave      35260761156864000191570010000000031844361565
protocolo  135260001960948
autorizado 2026-07-27T23:51:30.896Z
```

`cte_fiscal_documents` guardou o documento com `status=authorized`, XML autorizado em storage
(`xml_object_id=bf06ce09-…`, `xml_sha256=4dd54c6c6c9ea764…`).

### Intervenções manuais feitas para destravar o E2E — não são comportamento do produto

1. **`nfe_addresses.city_code`** — todas as 867 linhas estão NULL porque a migração
   `20260727151037_nfe_address_city_code` é posterior à importação de 2026-07-24. O parser e a
   escrita estão corretos hoje (verificado com `importarNfeXml` sobre o XML preservado: emitente
   3554102 TAUBATE, destinatário 3523701 ITIRAPUA) e reimportar não conserta
   (`onConflictDoNothing` em `[companyId, accessKey]`). Foi aplicado `UPDATE` pontual só nas duas
   linhas do documento de referência. Backfill real registrado como **T022d**.
2. **Numeração fiscal** — as sondas de diagnóstico autorizaram os números 2 e 3 direto na SEFAZ,
   fora do produto. Como rejeição não consome numeração, a reserva do item (`reservation_key`
   `…:reprocess`) replicava o número já queimado e a SEFAZ devolvia cStat 539. A reserva e
   `fiscal_sequences` foram avançadas por SQL para o próximo número livre.

### Defeito encontrado durante o E2E — registrado como T022e

O consumidor CT-e não registra idempotência em `processed_messages` (a tabela só tem linhas de
`nfe-import-worker`). A mensagem da tentativa `83e0ae27-…` foi entregue 4 vezes (23:51:30, :36, :41,
:46); a primeira autorizou e as três seguintes **retransmitiram à SEFAZ**, colhendo cStat 539. O
resultado da última reentrega sobrescreveu a tentativa para `rejected/539`, embora
`cte_fiscal_documents` esteja `authorized` — estado final inconsistente com efeito fiscal externo
repetido.

### Publicação do pacote corrigido — `@adatechnology/fiscal-provider@0.3.0-rc.1`

As correções de CT-e 4.00 deixaram de existir só no `dist` local. O repositório de pacotes publica
por CI (`.github/workflows/publish.yml`: `changeset version` + `changeset publish` no push em
`main`), então o bump manual do `package.json` foi revertido e a versão saiu do changeset.

```
commit d9ec4c1  feat(fiscal-provider): CT-e 4.00 autorizado na SEFAZ SP
                8 arquivos (5 src, 2 test, 1 changeset) — nenhum pacote não relacionado foi tocado
CI run  30316679167  Publish packages — success
npm     dist-tags { latest: '0.2.0', rc: '0.3.0-rc.1' }
```

Gates antes do commit: `bun run check` limpo, `bun test` 42 pass / 0 fail no pacote.

`api-transportada` e `worker-transportada` passaram de `0.3.0-rc.0` para `0.3.0-rc.1`, e o artefato
baixado do npm carrega as correções (`qrCodCTe`, `getCteQrCodeUrl` e o literal de homologação
presentes em `dist/index.js`) — o E2E não depende mais de sincronizar o `dist` à mão.

Continua no canal `rc`: o repo de pacotes está em `changesets` pre mode e sair do pre mode
versionaria e publicaria pacotes não relacionados que estão em andamento (ver ADR-0013).

### T022d — Backfill de `nfe_addresses.city_code`

Reprocessa o XML fiscal preservado no storage e preenche apenas as linhas com `city_code` NULL,
casando participante por papel (`emitter`/`recipient`/`carrier`/`pickup`/`delivery`). Não reimporta,
não reescreve nada além da coluna faltante e nunca infere `companyId` do XML — o tenant vem do
argumento obrigatório `--company-id`.

Arquivos:

```
src/nfe-imports/domain/nfe-participant-role.constant.ts               papéis + resolvePartyByRole
src/nfe-imports/application/nfe-address-city-code-backfill.service.ts serviço puro, paginado, DI
src/nfe-imports/infrastructure/drizzle-nfe-address-city-code-backfill.repository.ts
src/nfe-imports/infrastructure/nfe-import-storage.gateway.ts          createNfeXmlObjectReader
src/nfe-imports/nfe-address-city-code-backfill.main.ts                composition root + CLI
test/nfe-address-city-code-backfill/backfill.contract.ts              7 testes (escritos antes)
test/nfe-address-city-code-backfill.contract.test.ts                  entrypoint (no package.json)
```

Teste de contrato escrito antes da implementação (7 casos): preenche por papel; deixa intacto o
endereço cujo participante não tem código de município; ignora XML de evento; segue adiante quando a
leitura de um documento falha; pagina até esvaziar conferindo a sequência exata de cursores; não
atravessa a fronteira de tenant; no-op quando não há pendência.

Isolamento: todo `innerJoin` iguala também `company_id`, o filtro e o `UPDATE` carregam
`eq(nfeAddresses.companyId, …)`, e o `UPDATE` é guardado por `isNull(city_code)` dentro de transação
— por isso a reexecução é idempotente por construção.

Execução real (`transportada-local-postgres-1`, empresa `00000000-0000-4000-8000-000000000001`):

```
set -a; . ./.env; set +a
bun run --cwd apps/worker-transportada backfill:nfe-address-city-code -- \
  --company-id=00000000-0000-4000-8000-000000000001
```

|        | `city_code` NULL | total |
| ------ | ---------------- | ----- |
| antes  | 865              | 867   |
| depois | 289              | 867   |

576 endereços preenchidos. As **289 restantes são todas de papel `carrier`** e são estruturais, não
lacuna do backfill: o grupo `<transporta>` da NF-e carrega apenas `xEnder`/`xMun`/`UF` — não existe
`cMun` para transportador (confirmado lendo `parseCarrierAddress` no `dist/index.js` publicado). É
exatamente o caso coberto pelo teste #2.

Sanidade dos dados: municípios de SP conferem com o IBGE nas amostras (TAUBATE 3554102, FRANCA
3516200, SAO CARLOS 3548906) e `select count(*) … where city_code !~ '^[0-9]{7}$'` devolveu `0`.

Idempotência comprovada na segunda e terceira execução — 289/867 inalterado e o resultado:

```json
{ "addressesUpdated": 0, "documentsFailed": 0, "documentsScanned": 289, "documentsSkipped": 289 }
```

Gates do worker: `typecheck` limpo, `lint` limpo, `bun run test` **144 pass / 0 fail em 26 arquivos**.

### T022e — Idempotência do consumidor CT-e

Arquivos:

- `apps/api-transportada/src/database/cte-issuance.schema.ts` (tabela `cteProcessedMessages`)
- `apps/api-transportada/drizzle/20260728004715_cte_processed_messages/{migration,rollback}.sql`
- `apps/api-transportada/test/cte-issuance-schema/processed-messages.contract.ts` (novo)
- `apps/api-transportada/test/cte-issuance-schema/{tables,aggregator}.contract.ts` +
  `test/database-migration/static-migration.contract.ts` (listas explícitas)
- `apps/worker-transportada/src/database/processing.schema.ts` (cópia do schema)
- `apps/worker-transportada/src/cte-issuance/infrastructure/drizzle-cte-issuance-worker.repository.ts`
- `apps/worker-transportada/src/cte-issuance/infrastructure/drizzle-cte-issuance-write-back.repository.ts`
- `apps/worker-transportada/src/cte-issuance/infrastructure/drizzle-cte-settled-attempt.repository.ts` (novo)
- `apps/worker-transportada/src/cte-issuance/application/cte-issuance-consumer.effect.ts`
- `apps/worker-transportada/src/cte-issuance/domain/cte-batch-progress.policy.ts`
- `apps/worker-transportada/src/main.ts`
- `apps/worker-transportada/test/cte-issuance-idempotency/settled-attempt.contract.ts` +
  `test/cte-issuance-idempotency.contract.test.ts` (novos)
- `apps/worker-transportada/test/cte-issuance-idempotency.integration.test.ts` (novo)
- `apps/worker-transportada/test/cte-issuance-write-back.integration.test.ts`

#### Causa provada, não suposta

`processed_messages` carrega uma FK composta para o outbox de importação:

```
processed_messages_company_event_fk FOREIGN KEY (company_id, event_id)
  REFERENCES processing_outbox(company_id, event_id)
```

O trilho CT-e publica em `cte_issuance_outbox`, não em `processing_outbox`. Insert com um `event_id`
real do outbox de CT-e, dentro de transação revertida:

```
ERROR:  insert or update on table "processed_messages" violates foreign key constraint
        "processed_messages_company_event_fk"
DETAIL:  Key (company_id, event_id)=(00000000-0000-4000-8000-000000000001,
         46341291-59eb-4f72-8c00-9d969e6ff8a7) is not present in table "processing_outbox".
```

Logo `markProcessed` sempre lançava. O erro do driver não é `CteIssuanceRecoverableError` nem
`CteIssuanceFatalError`, então escapava do `handler.handle`, o provider dava nack e a **reentrega
retransmitia à SEFAZ**. Corroborado pelo ledger em produção local:

```
consumer_name      | count
-------------------+------
nfe-import-worker  |   12
```

Nenhuma linha do consumidor CT-e — exatamente o sintoma descrito na task.

Segundo defeito, independente: `#apply` do write-back atualizava `cte_issuance_attempts` **sem
guarda de status**. É por isso que a reentrega sobrescrevia `authorized` com `rejected/539`. Só
`recordFailed` filtrava por `NON_SETTLED_STATUSES`.

#### Decisão: ledger dedicado

Optamos por `cte_processed_messages` (migração puramente expansiva) em vez de derrubar a FK de
`processed_messages` — o trilho de importação continua com a integridade referencial que já tinha. A
tabela nova **não referencia outbox nenhum de propósito**: amarrar o ledger a um outbox específico
foi o que quebrou. Só há FK para `companies`, e o teste de contrato afirma isso explicitamente.

Unicidade de idempotência: `(company_id, consumer_name, event_id)`; a gravação usa
`onConflictDoNothing` sobre essa chave. Isolamento de tenant coberto pela suíte
`cte-issuance-schema/tenant-safety.contract.ts` (a tabela entrou na lista de exports auditados).

#### Correções

1. `DrizzleCteIssuanceWorkerRepository` grava e lê em `cte_processed_messages`.
2. Write-back: `#apply` filtra por `inArray(status, NON_SETTLED_STATUSES)` e usa `.returning()` —
   nenhuma linha atualizada ⇒ retorno antecipado, sem evento e sem sobrescrita.
3. Defesa em profundidade: `settledAttemptGuard` no efeito consulta o status **antes** de resolver o
   input de execução, então uma tentativa já liquidada não descriptografa certificado nem toca na
   SEFAZ.

#### Testes

Contrato (`cte-issuance-idempotency.contract.test.ts`, 6 testes): a policy classifica exatamente
`authorized · rejected · failed · reconciliation_required · cancelled` como liquidados e deixa
`pending · in_flight · retry_scheduled` abertos; o efeito não chega à SEFAZ nem grava write-back
quando liquidado; consulta o status antes de resolver o input; transmite normalmente quando aberto;
segue transmitindo quando não há guarda ligada.

Integração contra Postgres real (`cte-issuance-idempotency.integration.test.ts`, 4 casos): persiste
marcador de um `event_id` que **nunca existiu em `processing_outbox`** — é a regressão que teria
pegado a FK; um único marcador ao processar duas vezes; marcador de dead-letter com
`{ "reason": "cte rejected" }`; nunca reporta mensagem de outra empresa como processada.

`cte-issuance-write-back.integration.test.ts` ganhou
`never overwrites an authorized attempt when a redelivery reports rejection`: `recordInFlight` →
`recordAuthorized` → `recordRejected('539')` deixa o status em `authorized` e os eventos de emissão
em exatamente `['in_flight', 'authorized']`.

#### Gates

```
make check              EXIT=0 — 712 / 150 / 24 / 153 / 6 pass, 0 fail
make worker-integration EXIT=0 — 30 pass / 0 fail em 8 arquivos
make migration-test     EXIT=0 — 9 pass / 0 fail
```

`rollback.sql` exercitado no banco local (`BEGIN · DROP TABLE · DO · COMMIT`) e a migração
reaplicada em seguida — `\d cte_processed_messages` confirma as 8 colunas, os dois uniques e a única
FK para `companies`. O cabeçalho do rollback registra que ele é destrutivo: perder os marcadores faz
uma reentrega voltar a retransmitir à SEFAZ.

### T022f — Grupo `ICMS45` para CST 40/41/51

Arquivos (repositório `adatechnology-packages`):

- `packages/backend/fiscal-provider/src/sefaz/CteXmlBuilder.ts`
- `packages/backend/fiscal-provider/test/contract/cte-sefaz-wire.contract.test.ts`
- `.changeset/cte-icms45-schema-group.md`

Arquivos (este monorepo):

- `docs/adr/0014-cte-icms45-group.md` (nova)
- `docs/adr/0013-cte-4-00-fixes-in-fiscal-provider.md` (pendência apontada para a ADR-0014)

#### Verificação contra o schema, antes de mexer

XSD oficial `PL_CTe_400`, arquivo `cteTiposBasico_v4.00.xsd`, `complexType TImp`:

```
xs:choice → ICMS00 | ICMS20 | ICMS45 | ICMS60 | ICMS90 | ICMSOutraUF | ICMSSN
```

`grep -c ICMS40` no schema do CT-e devolve **0**. `ICMS45` está documentado como "ICMS Isento, não
Tributado ou diferido" e enumera `CST` em `40 | 41 | 51` — as três CST usam o mesmo grupo, e o nome
do grupo não muda com a CST. `ICMS40` é grupo da NF-e, onde existe e carrega `orig`.

#### Prova por validação de XSD

CT-e assinado gerado pelo próprio `buildCteXml` (CRT 3) e validado com `xmllint` contra
`cte_v4.00.xsd` e todos os importados:

```
antes (CST 41)
  Element 'ICMS40': This element is not expected. Expected is one of
  ( ICMS00, ICMS20, ICMS45, ICMS60, ICMS90, ICMSOutraUF, ICMSSN ).
  cte-41-antes.xml fails to validate

depois
  cte-40.xml validates
  cte-41.xml validates
  cte-51.xml validates
```

Antes de assinar, o único erro restante era `Missing child element(s). Expected is ( Signature )` —
ou seja, todo o conteúdo de `infCte` já validava; a assinatura entra no `signCteXml`.

#### Alcance real do defeito

Não é caso remoto: `CTE_ICMS_CSTS` (`src/database/cte-emission-profile.schema.ts`) já aceita
`['00','20','40','41','51','60','90']`, com check constraint no banco. Perfil de emissão com CST
40/41/51 é configurável hoje pela API — só não estourou porque a transportadora em uso é CRT 1 e
desvia antes para `ICMSSN`.

#### Correção

`CteXmlBuilder.ts`, dois pontos: o `case '40' | '41' | '51'` e o `default` (CST desconhecida →
CST 41). O `<ICMS40>` de `SefazXmlBuilder.ts` é da NF-e e não foi tocado.

Testes de contrato escritos antes: `test.each(['40','41','51'])` afirmando
`<ICMS><ICMS45><CST>xx</CST></ICMS45></ICMS>` e ausência total da string `ICMS40`, mais um caso para
o `default`. Vermelho de 4 testes antes da correção.

#### Gates

```
fiscal-provider:  bun run check limpo · bun run test 46 pass / 0 fail · bun run build ok
transportada:     make check EXIT=0 — 712 / 150 / 24 / 153 / 6 pass, 0 fail
```

#### Release — `@adatechnology/fiscal-provider@0.3.0-rc.2`

Autorizado pelo usuário. Commit `b57fa97` no repositório de pacotes com exatamente 3 arquivos
(`CteXmlBuilder.ts`, `cte-sefaz-wire.contract.test.ts`, `.changeset/cte-icms45-schema-group.md`),
rebaseado sobre `origin/main` e empurrado para `main`.

O bump manual do `package.json` para `rc.2`, feito antes, foi revertido: `publish.yml` roda
`pnpm changeset version` no próprio CI e commita `chore(release): version packages` de volta na
`main` — versionar à mão colide com esse fluxo. É a razão de o `package.json` versionado marcar
`0.3.0-rc.0` enquanto o npm já estava em `rc.1`.

```
gh run 30319832257  Publish packages  success
  ✓ Build all packages · ✓ Version packages · ✓ Commit version bump · ✓ Publish packages

npm view @adatechnology/fiscal-provider dist-tags
  { latest: '0.2.0', rc: '0.3.0-rc.2' }
```

`dist` instalado nas duas apps: 2 ocorrências de `ICMS45` (os dois pontos do CT-e) e 1 de `ICMS40`
(a da NF-e, correta). Antes: 0 e 6.

Dependência subida de `0.3.0-rc.1` para `0.3.0-rc.2` em `apps/api-transportada/package.json` e
`apps/worker-transportada/package.json`. Os três contract tests que fixam a versão exata do pacote
auditado acusaram a divergência e foram atualizados — `certificate-validation-gateway.contract.test.ts`
(API), `environment.contract.test.ts` e `nfe-distribution/gateway.contract.ts` (worker).

```
make check EXIT=0 — 712 / 150 / 24 / 153 / 6 pass, 0 fail
```

### T021b — Política de retry exposta em `/company-settings` (API + frontend)

Teste de contrato antes da implementação: a bateria ficou vermelha em `101 pass / 18 fail` com o
`cteRetry` já presente nos fixtures e ausente no schema Zod, e só depois o código foi escrito.

**API.** `cteRetry` é bloco **obrigatório** de primeiro nível no corpo do `PATCH` e no `data` do
`GET`/`PATCH`, ao lado de `cte` e `profile`. Obrigatório e não opcional de propósito: campo ausente
nunca pode reverter silenciosamente a política da empresa para o default do domínio.

- `company-settings.schema.ts` — bloco `.strict()` limitado pelas constantes do domínio
  (`CTE_RETRY_MAX_ATTEMPTS_LIMIT`, `CTE_RETRY_BACKOFF_STEPS_LIMIT`) mais um teto `int4`
  (`MAX_DATABASE_INTEGER`), rejeitando fracionário, string decimal, curva vazia, passo ≤ 0 e
  propriedade desconhecida com 400 antes do use case.
- `update-company-settings.use-case.ts` — reafirma via `createCteRetryPolicy`, convertendo
  `CteRetryPolicyInvalidError` em `InvalidCompanySettingsError` (400) para que um throw do domínio
  não vire 500; a política entra no **fingerprint de idempotência** (dois payloads de retry
  distintos sob a mesma chave conflitam em vez de replicar a resposta antiga) e no snapshot de
  auditoria (`cteRetryMaxAttempts`, `cteRetryBackoffSeconds`).
- `drizzle-company-settings.mutation.ts` — as duas colunas são escritas **explicitamente** no
  insert e no update: o spread `...input.settings.profile` não as cobre.
- `serializeSettings()` emite `cteRetry` e `cteRetry: null` no estado vazio.

**Frontend.** `isSettingsResponse` ganhou `'cteRetry'` na allowlist exata e o guard
`isCteRetryPolicy` (1..10 passos, inteiros positivos, `maxAttempts` 1..10) — resposta com chave
extra, curva vazia, passo string ou `maxAttempts` fora da faixa é rejeitada como
`COMPANY_SETTINGS_RESPONSE_INVALID`. Novo `CteRetryFields.component.tsx` (adicionar/remover passo),
`cleanUpdate` reenvia a política, e os limites/defaults ficam em
`shared/companySettings.constant.ts` — o frontend não importa o domínio da API.

```
bun test company-settings-application + company-settings-http   119 pass · 0 fail · 433 expect
bun test company-settings (frontend)                             19 pass · 0 fail · 130 expect
make check EXIT=0 — 726 / 150 / 24 / 155 / 6 pass, 0 fail
```

### T021c — `retira`/`xDetRetira` configuráveis por perfil de emissão

`cte_emission_profiles.pickup_indicator` era persistido e exposto na API mas **nunca chegava ao
`CteData`**. O default `'1'` do `CteXmlBuilder` (`data.retira ?? '1'`) coincidia com o CT-e de
referência e escondia a configuração ignorada: qualquer empresa que marcasse retirada no destino
emitia `<retira>1</retira>` mesmo assim. Não existia coluna alguma para o `xDetRetira`.

**Semântica confirmada no pacote** (`fiscal-provider/src/types.ts:470`): `retira` = "Recebedor retira
no aeroporto/filial/porto/estação de destino? `'0'`=sim, `'1'`=não"; `xDetRetira` "só faz sentido com
`retira='0'`" e cabe em 160 caracteres. O rótulo do frontend dizia "Coleta no remetente" com
`0 — Não` / `1 — Sim` — invertido nos dois eixos; corrigido para "Recebedor retira no destino" com
`0 — Sim` / `1 — Não`, e a constante local virou `RECEIVER_PICKUP_AT_DESTINATION`.

**Banco.** Migração `20260728015716_cte_pickup_details` adiciona `pickup_details text NOT NULL
DEFAULT ''` guardada por CHECK `length(pickup_details) <= 160 and (pickup_indicator = '0' or
length(pickup_details) = 0)` — perfil que não é retirada no destino não consegue guardar detalhe nem
por caminho lateral. `rollback.sql` manual ao lado, com `DELETE` do journal validado por
`GET DIAGNOSTICS` (falha se remover ≠ 1 linha).

**Payload.** `cte-payload.builder.ts` passa a emitir `retira: profile.pickupIndicator` sempre e
`xDetRetira` **apenas** quando `pickupIndicator === '0'` **e** o detalhe é não vazio — uma linha
legada inconsistente não consegue produzir `xDetRetira` inválido. O CT-e de referência continua
saindo com `retira='1'` e sem `xDetRetira`.

**Boundary.** `cte-emission-profile-request.schema.ts` valida `max(160)` + `.refine(...)` de coerência,
devolvendo 400 antes do use case (o `createCalls` fica vazio). O frontend espelha a regra em
`toProfileBody` (`pickupIndicator !== '0'` → envia `''`), com `pickupDetails` na allowlist exata de
`isSettings`, no draft default e no formulário fiscal.

```
bun test test/database-migration.contract.test.ts        3 pass · 1 skip · 0 fail
make migration-test                                      9 pass · 0 fail · 129 expect (migra → rollback → migra → rollback)
bun test cte-profiles (frontend)                         9 pass · 0 fail · 72 expect
make check EXIT=0 — 732 / 150 / 24 / 156 / 6 pass, 0 fail
```

### T023 — Remoção de item do lote em rascunho

`DELETE /cte-batches/:id/items/:itemId` (policy `cte.manage`) desfaz o vínculo do item e devolve as
notas à seleção. A elegibilidade da prévia deriva de `cte_batch_item_documents` × lotes não
cancelados (`findActiveBatchLinks`), então apagar as linhas de vínculo é o que torna a nota elegível
de novo — o teste `turns the freed notes eligible again in the preview` compartilha o mesmo `Map` de
links entre a unidade de trabalho e o leitor da prévia: antes da remoção as duas notas voltam
`blocked` com `CTE_BATCH_DOCUMENT_ALREADY_LINKED`, depois voltam como 2 projeções e `blocked: []`.

**Concorrência.** Sob READ COMMITTED, ler o status e depois deletar não trava a linha do lote: um
`submit` concorrente caberia no meio. `touchBatch` faz `UPDATE cte_batches SET updated_at=now(),
version=version+1 WHERE company_id=… AND id=… AND status='draft'` e, se nenhuma linha casar, lança
409 `CTE_BATCH_INVALID_STATE` — trava a linha e serializa remoções simultâneas. Lote fora de `draft`
(inclusive `submitted`) é recusado com o mesmo 409 antes de qualquer delete.

**Ordem de remoção.** Todas as FKs para `cte_batch_items` são `onDelete('restrict')`, então a
exclusão vai documentos → cobranças → item, todas escopadas por `companyId`. A linha de
`freight_calculations` é **preservada de propósito**: é o snapshot de auditoria do cálculo, não um
dado do vínculo. O evento `updated` (nome permitido pelo CHECK de `cte_batch_events`) registra
`{operation: 'item_removed', itemId, documentIds, status: 'draft'}` com as notas liberadas.

**Isolamento de tenant.** Os filtros viraram builders exportados
(`buildBatchItemRemovalFilters`/`buildBatchItemDocumentFilters`/`buildBatchItemChargeFilters`) e o
SQL gerado é verificado em `test/cte-batch-schema/item-removal-tenant-safety.contract.ts` — company,
batch e item em cada `WHERE`, params na ordem esperada.

**CORS.** `/cte-batches/:id/items/:itemId` é o primeiro caminho de lote com DELETE: `allowedMethods`
devolve `DELETE` e `allowedHeaders` devolve apenas `Authorization` (DELETE sem corpo). O preflight só
passa nesse caminho — `DELETE` em `/cte-batches/:id` e `Authorization, Content-Type` no item
continuam recusados.

`itemId` fora do formato UUID v4 morre no roteador com 404 `NOT_FOUND`, sem tocar na aplicação;
contexto somente-leitura recebe 403 `FORBIDDEN`; item de outra empresa/lote recebe 404
`CTE_BATCH_ITEM_NOT_FOUND`.

```
bun test cte-batch-schema + application + http + cors   119 pass · 0 fail · 660 expect
make check EXIT=0 — 752 / 150 / 24 / 156 / 6 pass, 0 fail
```

### T024 — Cancelamento fiscal do CT-e autorizado (evento 110111)

`POST /cte-batches/:id/items/:itemId/cancel` (policy `cte.cancel`, `Idempotency-Key` obrigatória)
deixou de ser só uma mudança de status local: agora abre uma tentativa `attemptKind: 'cancel'` na
trilha assíncrona existente (`cte-issuance.v1`) e o worker executa o evento 110111 na SEFAZ via
`SefazCteProvider.cancel`. Nenhuma topologia nova de RabbitMQ — só o tipo de evento
(`transportada.cte.item.cancel.requested`) e o `attemptKind` alargaram.

**Pacote.** `parseCteEventoResponse` passou a devolver `xmlEvento` (`<procEventoCTe>`), decisão
registrada em `docs/adr/0015-cte-cancellation-event-110111.md` — sem isso não há XML do evento para
preservar e o requisito "persistência do XML do evento" seria impossível sem reconstruir SOAP no
nosso lado.

**Banco** (`20260728105408_cte_cancellation_event`, com `rollback.sql` ao lado). Seis colunas em
`cte_fiscal_documents`: `cancellation_justification`, `cancellation_requested_at`,
`cancellation_protocol`, `cancelled_at`, `cancellation_xml_object_id`, `cancellation_xml_sha256`.
As invariantes ficam no banco, não só no código: justificativa `>= 15` caracteres (exigência do
`xJust`), sha256 em `^[0-9a-f]{64}$`, `object_id` e `sha256` nulos ou preenchidos juntos, FK
composta `(company_id, cancellation_xml_object_id) → stored_objects` (o XML do evento não escapa do
tenant) e `status='cancelled'` só é aceito com protocolo, justificativa e `cancelled_at`
preenchidos. Os CHECKs de `cte_issuance_events.event_name` e de
`cte_issuance_outbox.attempt_kind`/`event_type` foram estendidos para `cancel_requested`,
`cancelled`, `cancel` e o novo tipo de evento.

**API.** `executeCancel` recusa antes de gastar uma tentativa: item não autorizado → 409
`CTE_ISSUANCE_NOT_CANCELLABLE`; sem protocolo, chave de acesso ou reserva → 422
`CTE_ISSUANCE_CANCELLATION_UNAVAILABLE` (a SEFAZ exige os três no 110111); justificativa curta → 400.
A tentativa de cancelamento **reusa a reserva da emissão autorizada** (série/número), não consome
numeração nova. `requestCancellation` grava intenção + justificativa no documento fiscal e o outbox
recebe o evento.

**Worker.** `resolveCancellationInput` lê `cte_fiscal_documents` por `(companyId, batchItemId)` para
achar chave, protocolo de autorização e justificativa — a tentativa de cancelamento não persiste
payload próprio, então a config do provedor vem do payload da tentativa **autorizada** apontada por
`attempt_id`. Gateway mapeia `{success, protocolo, xmlEvento}` → `{status:'ok', protocol, eventXml}`,
`errorCode` → `{status:'rejected', rejection:{code}}` e exceção → `{status:'error', cause}`.

**Estados após a SEFAZ.** Aceite: XML do evento em `tenants/<companyId>/cte-documents/<chave>/
cancellation.xml` (ao lado do `authorized.xml`), `stored_objects` + documento fiscal em `cancelled`
com protocolo e sha256, tentativa `cancelled`. Falha do MinIO **não** desfaz o cancelamento — a
liquidação acontece com `reconciliation_required` no lote de eventos, porque reprocessar duplicaria
um evento já homologado. Recusa da SEFAZ: tentativa `rejected` com o cStat e a intenção é
**liberada** (`cancellation_requested_at`/`cancellation_justification` voltam a NULL) para permitir
nova solicitação. Falha de transporte: `retry_scheduled` mantendo a intenção.

⚠️ Retries esgotados caem em `recordFailed`, que **preserva** a intenção de cancelamento — o item
fica marcado como "cancelamento pedido" sem estar cancelado, e exige conferência manual na SEFAZ
antes de nova tentativa. Consciente: apagar a intenção sem saber se o evento chegou seria pior.

**Autorização.** A rota nasceu em `cte.submit` e foi corrigida para `cte.cancel` — a permissão já
existia em `authorization.policy.ts`, só o perfil `fiscal` a tem e nenhuma rota a exigia. Cancelar
um documento autorizado é irreversível na SEFAZ; quem transmite (`operator`, `company-admin`) não
herda esse poder. Provado pelo contrato HTTP: contexto com `cte.submit` sozinho recebe 403 antes de
alcançar a aplicação.

**Progresso do lote.** `resolveCteBatchStatus` passou a tratar `cancelled` como liquidação
bem-sucedida (`['authorized','cancelled'] → done`), não mais como erro — cancelar é uma operação
concluída, não uma falha do lote.

**CORS.** `/cte-batches/:id/items/:itemId/cancel` é POST com corpo e chave de idempotência; o
predicado do caminho de item foi estreitado para o formato terminal `/items/<id>`, então sub-recursos
(`/cancel`, `/reprocess`) caem no ramo POST (`Authorization, Content-Type, Idempotency-Key`) e o
DELETE do item continua liberando só o Bearer. `DELETE` em `/items/<id>/cancel` é recusado com 403.

```
bun test cte-issuance-schema + application + http + cors (API)   122 pass · 0 fail · 625 expect
bun test test/cte-cancellation.contract.test.ts (worker)          16 pass · 0 fail ·  35 expect
make migration-test                                                9 pass · 0 fail · 129 expect
make check EXIT=0 — 784 / 166 / 24 / 156 / 6 pass, 0 fail
```

## T025 — frontend: remover item de lote em rascunho e cancelar CT-e autorizado

### Fase vermelha

Contratos escritos antes da implementação, distribuídos pelos quatro arquivos já registrados nos
entrypoints `test/cte-batch.contract.test.ts` e `test/cte-issuance.contract.test.ts` (nenhum arquivo
novo — a lista explícita do `package.json` não mudou):

- `test/cte-batch/table-and-items.contract.ts` — gates `canRemoveItem` / `canCancelItem` e as
  fronteiras da `xJust` em `validateCancellationJustification`.
- `test/cte-batch/client-and-queries.contract.ts` — `DELETE /cte-batches/:id/items/:itemId`.
- `test/cte-batch/presentation-boundaries.contract.ts` — payload mínimo do cancelamento.
- `test/cte-batch/permissions-and-states.contract.ts` — `removeItem` atrás de `cte.manage`.
- `test/cte-issuance/permissions-and-states.contract.ts` — `cancelItem` atrás de `cte.cancel` e
  `cancelled` como estado terminal.

Falhas observadas antes de cada implementação, na ordem em que apareceram:

```
TypeError: client.removeItem is not a function
TypeError: validateCancellationJustification is not a function
TypeError: canRemoveItem is not a function
TypeError: drafts.createItemCancelDraft is not a function
TypeError: forbiddenController.removeItem is not a function
expect(received).toBe(expected)   canCancelCte   Expected: false  Received: undefined
Error: CTE_ISSUANCE_RESPONSE_INVALID   (status 'cancelled' recusado pelo validador)
```

### Implementação

**Permissões espelhadas da rota.** `cteBatchItemActions.service.ts` ganhou
`CTE_CANCEL_PERMISSION = 'cte.cancel'`, `canRemoveItem` (exige `cte.manage` **e** lote em `draft`) e
`canCancelItem` (exige `cte.cancel`, item `authorized`, `accessKey` e `authorizationProtocol` não
nulos). O protocolo entra no gate porque o evento 110111 exige `nProt` — CT-e autorizado sem
protocolo não vira cancelamento, viraria erro na SEFAZ.

O gate visual não é a única barreira: `createCteBatchController.removeItem` rejeita com
`CTE_BATCH_FORBIDDEN` sem `cte.manage`, e `createCteIssuanceController.cancelItem` rejeita com
`CTE_ISSUANCE_FORBIDDEN` sem `cte.cancel`. O contrato prova que um contexto com `cte.submit`
sozinho — quem transmite — não cancela e não chega a tocar o client (`mutationCount` fica em 0).

**`xJust` validada no navegador.** `validateCancellationJustification` devolve
`required`/`tooShort`/`tooLong`/`null` usando os mesmos limites da rota (15/255 depois do trim). Em
`confirmCancellation` a validação roda **antes** de gerar a chave de idempotência — formulário
recusado não queima chave.

**Payload mínimo.** `createItemCancelDraft` devolve exclusivamente `{ justification }` e lança
`CTE_BATCH_INVALID_DRAFT` para qualquer chave extra, inclusive `companyId` e `protocol`: o tenant
vem do contexto autenticado, nunca do payload do cliente.

**Deriva de allowlist corrigida.** `cteIssuanceResponse.validation.ts` recusava
`status: 'cancelled'` — o painel de acompanhamento quebraria no primeiro cancelamento bem-sucedido,
mesma família do bug de allowlist já registrado no projeto. O status entrou na allowlist e no tipo
`CteIssuanceStatus`; o view model trata `cancelled` como terminal: sem polling, sem reprocesso, sem
download.

**Camada de dados.** `cteBatchClient.service.ts` passou a aceitar `DELETE` e expõe `removeItem`;
`cteIssuanceClient.service.ts` expõe `cancelItem` (POST com `Idempotency-Key`). As mutações
invalidam `cte-batch-items` e `cte-batches` no sucesso.

**UI.** `CteBatchItemsPanel` ganhou o botão de remover por linha (só em rascunho, com `cte.manage`)
e o botão de cancelar (só em item autorizado com protocolo, com `cte.cancel`), mais o formulário de
justificativa com `maxLength=255`, `aria-invalid`/`aria-describedby`, mensagem de erro por chave
(`cancellation.required` / `tooShort` / `tooLong`) e alerta de falha da remoção. Estilos novos em
`cteBatch.module.css` usam apenas tokens `var(--space-*)` / `var(--color-*)`; textos novos em
`cteBatch.locale.json` e `cteBatch.en.locale.json` com os mesmos conjuntos de chaves.

### Fase verde

```
bun test test/cte-batch.contract.test.ts test/cte-issuance.contract.test.ts
  33 pass · 0 fail · 319 expect
bun run --cwd apps/frontend-transportada test    163 pass · 0 fail · 948 expect
bunx tsc --noEmit                                 TYPECHECK_OK
make check EXIT=0 — 784 / 166 / 24 / 163 / 6 pass, 0 fail
```

⚠️ Duas armadilhas de tipagem registradas para as próximas tasks do frontend: (1) alargar um union
no runtime não basta — `CteIssuanceViewModel['status']` precisava do `'cancelled'` explícito, o teste
passava e o `tsc --noEmit` falhava; (2) os `type` estruturais locais no fim de cada arquivo de
contrato descrevem a superfície do módulo e precisam ser atualizados junto com a fonte, senão o
typecheck reprova um teste verde.

## T026 (parcial) — emissão de MDF-e no `@adatechnology/fiscal-provider`

T026 estava bloqueada porque o pacote fiscal não tinha MDF-e. O usuário autorizou apenas a criação
do **método de emissão**; a modelagem do manifesto no TMS e o ciclo encerrar/cancelar continuam fora
de escopo, sem ADR.

### Contrato antes da implementação

`test/contract/mdfe-sefaz-wire.contract.test.ts` (no repo `adatechnology-packages`) foi escrito
primeiro e rodou vermelho (`Cannot find module '../../src/sefaz/MdfeXmlBuilder'`). Ele fixa o
contrato de fio inteiro: XML, assinatura, envelope SOAP e parsing da resposta.

### Fatos verificados (nada inferido)

- SVRS é o **autorizador nacional único** do MDF-e — a UF do emitente não muda o endpoint.
- A recepção assíncrona (`MDFeRecepcao` + `MDFeRetRecepcao`) foi desativada em 2024-06-30;
  `MDFeRecepcaoSinc` é obrigatória. O corpo é o `<MDFe>` **nu** em GZip+Base64 dentro de
  `<mdfeDadosMsg>` — sem o wrapper `enviMDFe`.
- Layout 3.00, modelo 58, `<infModal versaoModal="3.00">`.
- `<modal>` no MDF-e é **um dígito** (`1` = rodoviário) — diverge do `01` do CT-e.
- `tot.qCarga` é `TDec_1104` (**4 casas**), `tot.vCarga` é `TDec_1302` (2 casas).
- QR code em `<infMDFeSupl><qrCodMDFe>` como **CDATA**, irmão de `infMDFe` e **antes** da `Signature`.
- `respSeg` conferido no `mdfeTiposBasico.xsd` (linhas 771-790): `1` emitente, `2` contratante.

### Arquivos

```
src/sefaz/MdfeConstants.ts          endpoints SVRS, namespaces WSDL, métodos SOAP, URL do QR code
src/sefaz/MdfeXmlBuilder.ts         XML MDF-e 3.00 + chave de acesso (44) + cDV
src/sefaz/SefazXmlSigner.ts         signMdfeXml — XML-DSig RSA-SHA1, Signature no fim do <MDFe>
src/sefaz/MdfeSoapClient.ts         MDFeRecepcaoSinc (GZip+Base64) e MDFeStatusServico
src/providers/SefazMdfeProvider.ts  emit / cancel / testConnection + wrapper mdfeProc
src/types.ts                        MdfeConfig, MdfeData e enums (tipo de carga, rodado, carroceria…)
src/FiscalProviderFactory.ts        model 'mdfe' → SefazMdfeProvider
src/index.ts                        exports públicos
```

`cancel()` devolve `MDFE_EVENTO_NAO_SUPORTADO` **sem tocar na rede** — recusar é mais seguro do que
transmitir um evento fiscal não verificado. O teste de contrato fixa esse comportamento.

### Fase verde

```
bun test test/contract/mdfe-sefaz-wire.contract.test.ts   27 pass · 0 fail · 76 expect
bun run test:contract                                     77 pass · 0 fail · 273 expect
bun run check                                             TYPECHECK_OK
bun run build                                             CJS dist/index.js 255.61 KB — build success
```
