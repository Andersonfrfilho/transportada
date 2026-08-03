# Evidências — Feature 014

## Diagnóstico que originou a feature (2026-07-29)

Levantado no ambiente local com `make dev` no ar, antes de qualquer task. Nenhuma linha de código
de produção foi alterada nesta etapa.

### Defeito 1 — o perfil de emissão nunca chega à tela

Sonda Playwright autenticada contra a stack local, com captura de rede no diálogo "Gerar CT-es":

```
200 /api/cte-emission-profiles?limit=25&statusEq=active
:: {"data":[{... "icmsBaseReductionRate":"0" ... "icmsRate":"0" ...
     "freightRule":{"percentage":"0.045000", ...},
     "id":"c59f7008-2501-4b4c-82b9-f8bd87b183b3",
     "matchers":[{"matchRole":"sender","taxId":"05868574001090"}],
     "name":"Spani 4,5% - homologacao","status":"active","version":"2"}],
   "page":{"nextCursor":null}}

profileOptions: ["Automático (pelo CNPJ do emitente)"]
```

A API responde 200 com o perfil ativo, e mesmo assim o seletor fica só com "Automático". Repetido
com 3s de espera após abrir o diálogo para descartar corrida de carregamento — mesmo resultado.

Adapter do frontend rodado isoladamente contra esse payload exato:

```
THROW CTE_PROFILES_RESPONSE_INVALID
onlyKeys true   everyKeys true   extra []   missing []
FALHOU icmsBaseReductionRate "0"
FALHOU icmsRate "0"
```

Falha só nesses dois campos. `RATE_PATTERN = /^(?:0|1)\.[0-9]{6}$/` exige seis casas.

Origem do `"0"`, medida etapa a etapa contra o mesmo banco:

```
psql   → icms_rate | icms_base_reduction_rate
         0.000000  | 0.000000
         numeric(9,6), default '0'::numeric

bun:sql cru
       → {"icms_rate":"0.000000","icms_base_reduction_rate":"0.000000","amostra":"0.045000"}
         tipos string string

drizzle-orm/bun-sql + cteEmissionProfiles
       → icmsRate= "0" string
         icmsBaseReductionRate= "0"
```

O banco guarda a escala; o `numeric()` do Drizzle a descarta na leitura. `mapProfile` e
`serializeProfile` são passagem direta — nenhum dos dois altera o valor.

Contratos divergentes sobre a mesma grandeza:

| lado                    | expressão                              | aceita `"0"` |
| ----------------------- | -------------------------------------- | ------------ |
| API (entrada, Zod)      | `/^(?:0\|0\.[0-9]{6}\|1\|1\.000000)$/` | sim          |
| Frontend (saída, guard) | `/^(?:0\|1)\.[0-9]{6}$/`               | não          |

Alcance do defeito — a tela de administração cai pelo mesmo motivo:

```
profilesPageText: "ADMINISTRAÇÃO / PERFIS DE EMISSÃO DE CT-E / ... /
                   Perfis cadastrados / Não foi possível carregar os perfis / Novo perfil"
```

Processo servindo a API durante a medição, para descartar a hipótese de binário órfão:

```
PID 59084  PPID 59081  qua 29 jul 11:36:33 2026  bun --watch ./src/main.ts
```

### Defeito 2 — o diálogo nasce fora da área visível

Geometria colhida no navegador logo após clicar em "Gerar CT-es":

```json
{
  "overlayPosition": "fixed",
  "overlayRect": { "x": 72, "y": 182, "width": 1368, "height": 2331.578125 },
  "dialogRect": { "x": 276, "y": 1197.296875, "width": 960, "height": 300.984375 },
  "viewport": { "height": 900, "width": 1440 },
  "scrollY": 0,
  "pageHeight": 2514,
  "transformedAncestors": [
    "DIV.application-page-transition transform=matrix(1, 0, 0, 1, 0, 0) filter=none backdrop=none contain=none willChange=auto"
  ]
}
```

Com a página no topo, o diálogo cai ~300px abaixo da dobra. `transform` diferente de `none` no
ancestral cria containing block para descendentes `position: fixed`, então `inset: 0` cobre os
2331px da div de transição em vez da viewport.

Lacunas de acessibilidade observadas no mesmo componente: sem portal, sem trava de scroll do body,
sem focus trap, Escape tratado por `onKeyDown` num `div role="presentation"`.

### Defeito 3 — bloqueio comunicado tarde demais

"Já vinculada a outro CT-e" só aparece dentro do diálogo, calculado pelo preview. A condição já é
conhecida quando a linha é listada.

### Hipótese descartada

`cte_emission_profile_components` está vazia (0 linhas), mas isso **não** explica projeção zerada:
o valor do frete sai de `ruleSnapshot.percentage` sobre o total da nota, com piso e teto opcionais
(`freight-calculation-engine.service.ts:107`). Componentes são linhas de cobrança adicionais e são
opcionais. A projeção veio vazia porque a única nota selecionada estava bloqueada.

### Descartado por medição

- Divergência de tenant: perfil e membership `company-admin` na mesma empresa
  `00000000-0000-4000-8000-000000000001`.
- Permissão: `company-admin` concede `settings.manage`, que é o que habilita `profilesQuery`.
- Corrida de carregamento: reproduzido com espera explícita.

Arquivos de sonda usados no diagnóstico foram removidos ao final
(`test/cte-dialog-probe.spec.ts`, `playwright.probe.config.ts`, `test-results/`).

## T001 — Escala fixa na borda de leitura do perfil de emissão

### Teste antes da implementação

`test/cte-profiles-infrastructure/decimal-scale.contract.ts` + entrypoint
`test/cte-profiles-infrastructure.contract.test.ts`, adicionado à lista explícita do
`apps/api-transportada/package.json`. Vermelho como projetado:

```
 3 pass
 5 fail
Ran 8 tests across 1 file.

expect(received).toBe(expected)   Expected: "0.000000"   Received: "0"
expect(received).toBe(expected)   Expected: "12.5000"    Received: "12.5"
expect(received).toBe(expected)   Expected: "0.045000"   Received: "0.045"
expect(received).toBe(expected)   Expected: "35.5000"    Received: "35.5"
(fail) refuses a rate carrying more precision than the contract scale
```

Os 3 que já passavam são justamente os casos que o defeito não alcança: nulos preservados e valor
que já chega com a escala do contrato.

### Implementação

`src/cte-profiles/infrastructure/cte-emission-profile.mapper.ts` normaliza na borda de leitura com
`normalizeDecimal` de `src/shared/decimal.service.ts` — string→string sobre `bigint`, sem `Number`
e sem `toFixed`. `PERCENTAGE_SCALE` (6) para `icmsRate`, `icmsBaseReductionRate`,
`freightRule.percentage` e `components[].rate`; `MONEY_SCALE` (4) para `freightRule.minimumAmount`,
`freightRule.maximumAmount` e `components[].amount`. Nulos seguem nulos. Precisão acima da escala
do contrato passa a ser recusada com `CTE_PROFILE_INVALID_DECIMAL_SCALE` em vez de ser truncada em
silêncio.

O guard do frontend não foi tocado — quem estava fora do contrato era a serialização da API.

### Verde

```
bun test ./test/cte-profiles-infrastructure.contract.test.ts
 8 pass  0 fail  16 expect() calls

bun test (suíte completa da api-transportada)
 1058 pass  1 skip  0 fail  5102 expect() calls  ·  60 arquivos
```

### Verificação no sistema rodando

Sonda autenticada contra o `make dev` no ar, depois do reload do `bun --watch`:

```json
{
  "profileOptions": ["Automático (pelo CNPJ do emitente)", "Spani 4,5% - homologacao"],
  "profilesPageText": "ADMINISTRAÇÃO / PERFIS DE EMISSÃO DE CT-E / Perfis cadastrados /
                       Nome Situação Prioridade Percentual Agrupamento Ações /
                       Spani 4,5% - homologacao  ATIVO  1  4,5%  Um CT-e por nota /
                       Editar Desativar / Novo perfil"
}
```

O seletor de perfil passou a listar o perfil de 4,5% e a tela de administração, que exibia
"Não foi possível carregar os perfis", agora renderiza a tabela com o percentual correto. Arquivos
de verificação removidos ao final (`test/t001-verify.spec.ts`, `playwright.verify.config.ts`).

### Gates

`bun run typecheck` limpo · `bun run lint` limpo nas 4 apps · `bun run format:check` limpo ·
`bun test` da api-transportada 1058 pass / 0 fail.

## T002 — Escala fixa também na borda de entrada

### Vermelho

Teste de contrato escrito antes da correção
(`apps/api-transportada/test/cte-profiles-http/decimal-scale.contract.ts`, registrado na lista
explícita de `apps/api-transportada/package.json` via
`test/cte-profiles-http.contract.test.ts`):

```
bun test ./test/cte-profiles-http.contract.test.ts
 17 pass  4 fail
```

As 4 falhas são exatamente os casos de taxa (`icmsRate: "0"`, `icmsBaseReductionRate: "1"`,
`freightRule.percentage: "0"`, componente `rate: "1"`) — aceitos com 201 quando deviam ser 400. O
caso de dinheiro (`minimumAmount: "900"`) já passava: `MONEY_DECIMAL` sempre exigiu 4 casas.

### Correção

`src/cte-profiles/presentation/cte-emission-profile-request.schema.ts`, duas linhas:

```ts
const MONEY_DECIMAL = /^(?:0|[1-9][0-9]{0,14})\.[0-9]{4}$/ // grupo redundante removido
const RATE_DECIMAL = /^(?:0\.[0-9]{6}|1\.000000)$/ // era /^(?:0|0\.[0-9]{6}|1|1\.000000)$/
```

Entrada e saída passam a descrever uma forma só: taxa com 6 casas, dinheiro com 4. Nenhum outro
arquivo mudou — as regex já alimentavam `componentSchema.rate`, `settingsSchema.icmsRate`,
`settingsSchema.icmsBaseReductionRate`, `freightRuleSchema.percentage` e
`freightRuleSchema.minimumAmount/maximumAmount`.

O frontend não precisou mudar: `cteProfilesDecimal.service.ts` já emite `toRateFraction` com 6 casas
e `toMoneyDecimal` com 4 (`ZERO_RATE = '0.000000'`, `DEFAULT_FREIGHT_PERCENTAGE = '0.045000'`), então
a borda mais estreita não recusa nenhum payload que a UI produza.

### Verde

```
bun test ./test/cte-profiles-http.contract.test.ts
 21 pass  0 fail

bun test (suíte completa da api-transportada)
 1064 pass  1 skip  0 fail  ·  60 arquivos
```

### Verificação no sistema rodando

Sonda autenticada contra o `make dev` no ar. Dois `PATCH /api/cte-emission-profiles/:id` com corpo
completo e válido, diferindo só em `icmsRate`, contra um id inexistente
(`00000000-0000-4000-8000-0000000009ff`) — a validação roda no `parse`, antes do repositório, então
nada é gravado em nenhum dos casos:

```json
{
  "escalaFixa": { "status": 404, "body": "{\"error\":{\"code\":\"CTE_PROFILE_NOT_FOUND\"…}}" },
  "semEscala": { "status": 400, "body": "{\"error\":{\"code\":\"INVALID_REQUEST\"…}}" }
}
```

`icmsRate: "0.120000"` atravessa a validação e só para no repositório (404); `icmsRate: "0"` é
recusado na borda com 400 `INVALID_REQUEST`. Arquivos de sonda removidos ao final
(`test/t002-verify.spec.ts`, `playwright.verify.config.ts`, `test-results/`).

### Gates

`bun run typecheck` limpo · `bun run lint` limpo nas 4 apps · `bun run format:check` limpo ·
`bun test` da api-transportada 1064 pass / 0 fail.

## T003 — Contrato do frontend sobre o payload real da API

### Payload real capturado

Sonda autenticada contra o `make dev` no ar,
`GET /api/cte-emission-profiles?statusEq=active` → 200. Trecho decisivo do corpo:

```json
{
  "data": [
    {
      "icmsRate": "0.000000",
      "icmsBaseReductionRate": "0.000000",
      "freightRule": { "percentage": "0.045000", "minimumAmount": null, "maximumAmount": null },
      "status": "active",
      "version": "2"
    }
  ],
  "page": { "nextCursor": null }
}
```

São exatamente as grandezas que a API devolvia como `"0"` antes da T001 e que o guard do frontend
recusava. O corpo foi congelado em
`apps/frontend-transportada/test/cte-profiles/api-payload.contract.ts`: chaves, enums e escalas
decimais verbatim; nome do perfil, rótulo de cobrança e CNPJ do matcher neutralizados, para não
versionar dado identificável de cliente. Nada do que o teste verifica depende desses três campos.

### Vermelho

Arquivo novo registrado na lista explícita via `test/cte-profiles.contract.test.ts` (o entrypoint já
constava no `package.json`):

```
bun test test/cte-profiles.contract.test.ts
 11 pass  2 fail
 TypeError: buildProfileSelectOptions is not a function
```

As duas asserções de payload já passavam — é a T001/T002 sustentando. As duas falhas são a lista do
`SelectMenu`, que não existia como função pura: a montagem estava embutida no JSX de
`CteEmissionDialog.component.tsx`, fora do alcance de teste de contrato.

### Implementação

`src/modules/nfe-workspace/shared/cteEmission.service.ts` ganhou `buildProfileSelectOptions({
automaticLabel, profiles })`, devolvendo a opção automática seguida de um item por perfil.
`CteEmissionDialog.component.tsx` passou a consumi-la em vez de montar o array no corpo do
componente — o rótulo traduzido continua vindo do `t('cteEmission.profileAutomatic')`, e o
componente deixou de importar `AUTOMATIC_PROFILE_ID`.

### Verde

```
bun test test/cte-profiles.contract.test.ts
 13 pass  0 fail

bun run test (suíte declarada do frontend)
 211 pass  0 fail  ·  12 arquivos
```

O teste cobre quatro coisas: o payload real é aceito e devolve o perfil ativo; taxa fora da escala
(`"0"` em `icmsRate` e em `icmsBaseReductionRate`) é recusada com `CTE_PROFILES_RESPONSE_INVALID`;
a lista do seletor é "Automático" + o nome de cada perfil; e, com a listagem ainda vazia, sobra só a
opção automática.

### Verificação no sistema rodando

Depois da refatoração, sonda autenticada abriu o diálogo de emissão a partir da seleção de uma nota
e leu os `[role="option"]` do seletor de perfil:

```json
{ "options": ["Automático (pelo CNPJ do emitente)", "Spani 4,5% - homologacao"] }
```

Arquivos de sonda removidos ao final (`test/t003-capture.spec.ts`, `test/t003-verify.spec.ts`,
`playwright.capture.config.ts`, `playwright.verify.config.ts`, `test-results/`).

### Gates

`bun run typecheck` limpo · `bun run lint` limpo nas 4 apps · `bun run format:check` limpo ·
`bun run test` do frontend 211 pass / 0 fail.

## T004 — Diálogo de emissão em portal, com trava de scroll, foco preso e Escape

### Causa provada, não suposta

`.application-page-transition` carrega `animation: page-enter 180ms ease both`, e o keyframe termina
em `transform: translateY(0)`. Com `fill-mode: both` esse `transform` fica aplicado para sempre, o
que torna o elemento **bloco de contenção**: qualquer descendente `position: fixed` — o overlay de
emissão — passa a se posicionar contra ele, não contra a viewport.

### Vermelho

Dois testes de aceite novos em `apps/frontend-transportada/test/responsive.smoke.spec.ts`, na trilha
Playwright (não há ambiente de DOM na trilha `bun test` do frontend):

```
1) o diálogo de emissão é montado fora da árvore transformada da página
   expect(placement.insidePageTransition).toBe(false)
   Expected: false   Received: true

2) o diálogo de emissão recebe foco, trava o scroll do corpo e fecha no Escape
   expect.poll(document.activeElement?.closest('[role="dialog"]') !== null).toBe(true)
   Expected: true    Received: false
```

Para chegar até essas asserções foi preciso primeiro fazer o workspace de NF-e carregar sob mock —
`test/nfe-workspace-smoke.helper.ts` semeava a identidade só via rota `**/auth/me`, que o modo de
bypass do smoke nunca chama (ele lê `sessionStorage['transportada.smoke-auth-me']`), e o fixture de
documento não tinha os campos exigidos por `isNfeDocumentListItem` (emitente/destinatário completos,
`number`, `series`). Corrigidos os dois, mais o `GET /nfe-imports/distribution`, que precisa da forma
de status de distribuição e não da de resumo de importação.

### Implementação

- `src/modules/nfe-workspace/hooks/useModalDialog.hook.ts` (novo): trava `document.body.style.overflow`
  enquanto aberto, foca o diálogo ao abrir, devolve o foco anterior ao fechar, fecha no Escape e
  prende o Tab/Shift+Tab nos limites da lista de focáveis.
- `components/CteEmissionDialog.component.tsx`: render via `createPortal(..., document.body)`, com
  `ref`, `tabIndex={-1}` e o `onKeyDown` do hook. `nfeWorkspace.module.css` não precisou mudar — no
  `body` o `position: fixed` do overlay já passa a valer contra a viewport.

### Verde

`bun run smoke` — 23 passed / 0 failed (as 21 anteriores continuam verdes, mais as 2 novas).

### Verificação no sistema rodando

Sonda autenticada contra a stack de `make dev`, com dados reais (não mock), 1440×900:

```json
{
  "activeInsideDialog": true,
  "bodyOverflow": "hidden",
  "dialogRect": { "top": 299.5, "bottom": 600.48, "height": 300.98 },
  "insidePageTransition": false,
  "overlayParent": "BODY",
  "overlayPosition": "fixed",
  "scrollY": 0,
  "viewportHeight": 900
}
```

O overlay é filho de `BODY`, `position: fixed`, fora da árvore transformada; o foco está dentro do
diálogo; o corpo está com scroll travado; e o retângulo do diálogo cabe inteiro na viewport com
`scrollY: 0`. O Escape fechou o diálogo. Sonda removida ao final (`test/t004-live.spec.ts`,
`playwright.live.config.ts`, `test-results/`).

### Gates

`bun run typecheck` limpo · `bun run lint` limpo nas 4 apps · `bun run format:check` limpo ·
`bun run test` do frontend 211 pass / 0 fail · `bun run smoke` 23 pass / 0 fail.

## T005 — Smoke autenticado medindo a geometria do diálogo

### Teste antes da implementação

`apps/frontend-transportada/test/responsive.smoke.spec.ts` —
`o retângulo do diálogo de emissão cabe na viewport de 1440x900`. Viewport 1440×900, lista de 40
notas mockadas, seleção da **última** linha (a lista longa é o que expõe o defeito) e medição do
retângulo do diálogo em dois momentos: com a página rolada (`scrollY > 0`) e depois de voltar ao
topo (`scrollY === 0`). Em ambos, `top >= 0`, `left >= 0`, `bottom <= innerHeight`,
`right <= innerWidth`, mais `assertNoHorizontalOverflow`.

O helper `test/nfe-workspace-smoke.helper.ts` ganhou `documentCount` opcional (padrão 1, sem efeito
nos testes existentes) e `buildDocumentPage`, que replica a nota-modelo variando `id`, `accessKey` e
`number`.

### Vermelho

Primeira versão do teste media com uma nota só e passava mesmo com o `createPortal` removido: com a
página curta o retângulo cabe na viewport por acidente, e a asserção não discriminava. Corrigido
para 40 notas + rolagem. Revertendo o `createPortal` para `return (` inline:

```
✘ o retângulo do diálogo de emissão cabe na viewport de 1440x900
  expect(received).toBeLessThanOrEqual(expected)
  Expected: <= 900
  Received:    1561.484375   (geometry.bottom)
```

O `position: fixed` resolve contra `.application-page-transition` e o diálogo cai 661px abaixo da
área visível — a reprodução exata do que o usuário via.

### Verde

Com o `createPortal` restaurado, `bun run smoke -- -g "cabe na viewport"` → 1 passed. Suíte completa
`bun run smoke` → **24 passed / 0 failed**.

### Gates

`bun run typecheck` limpo · `bun run lint` limpo nas 4 apps · `bun run format:check` limpo ·
`bun run --cwd apps/frontend-transportada test` 211 pass / 0 fail · `bun run smoke` 24 pass / 0 fail.

## T006 — Regra de bloqueio no domínio, exposta na listagem de notas

### Desenho (🧠)

A regra já existia em `src/cte-batches/domain/cte-batch-eligibility.policy.ts`, mas a ordem
"elegibilidade → vínculo" estava espalhada dentro de `cte-batch-selection.service.ts`. Extraí
`resolveDocumentBlock({ document, linkedBatchId })`, que devolve um resultado discriminado
(`blocked` **ou** `chargeable`) e preserva a ordem original: uma nota inelegível **e** já vinculada
reporta a inelegibilidade, não o vínculo. O serviço de preview passou a consumir essa função —
não há segunda implementação. A listagem de notas importa a mesma função do domínio de
`cte-batches`; a dependência é pura, sem I/O e sem ciclo.

### Teste antes da implementação

- `test/cte-batch-domain/document-block.contract.ts` (novo, com entrypoint
  `test/cte-batch-domain.contract.test.ts` **adicionado à lista explícita do `package.json`**):
  libera nota elegível e solta, bloqueia nota vinculada carregando o `batchId`, prova que a
  elegibilidade responde antes do vínculo e percorre os seis motivos de inelegibilidade
  (`notAuthorized`, `summaryOnly`, `missingTotal`, `missingParty`, `missingMunicipality`,
  `missingWeight`).
- `test/nfe-schema/document-block-tenant-safety.contract.ts` (novo, importado por
  `test/nfe-schema.contract.test.ts`) — **tenant-safety obrigatório, a task muda query**: monta o
  SQL das duas queries novas via `PgDialect` e exige `nfe_volumes.company_id = $`,
  `cte_batch_item_documents.company_id = $`, o `in` sobre os documentos da página e
  `cte_batches.status <> 'cancelled'`, conferindo a ordem exata dos parâmetros.
- `test/nfe-http/listing-and-detail.contract.ts` — a listagem devolve `cteBlockReason: null` para
  nota livre e `'CTE_BATCH_DOCUMENT_ALREADY_LINKED'` para nota vinculada.

### Vermelho

```
24 pass · 3 fail · 2 errors
error: Export named 'resolveDocumentBlock' not found in module cte-batch-eligibility.policy.ts
error: Export named 'buildDocumentGrossWeightFilters' not found in module drizzle-nfe-document.repository.ts
(fail) exposes the CT-e block reason ... — Expected -1 / Received +20 (cteBlockReason ausente)
```

### Implementação

- `src/cte-batches/domain/cte-batch-eligibility.policy.ts` — `DocumentBlock`,
  `DocumentBlockDecision`, `resolveDocumentBlock`.
- `src/cte-batches/application/cte-batch-selection.service.ts` — passa a delegar; as duas etapas
  inline saíram.
- `src/nfe-documents/infrastructure/drizzle-nfe-document.repository.ts` — `loadBlockContext`
  carrega peso bruto agregado (`sum(nfe_volumes.gross_weight)` agrupado por documento) e o vínculo
  ativo (`selectDistinctOn` sobre `cte_batch_item_documents` com `innerJoin` em `cte_batches`),
  ambos em uma consulta por página, sem N+1, ambos escopados por `companyId`. `mapSummary` calcula
  `cteBlockReason` pela função do domínio.
- `application/nfe-document.types.ts` e `presentation/nfe-documents.routes.ts` — campo
  `cteBlockReason: string | null` no contrato e na serialização.

### Verde

`bun test` da API: **1071 pass · 1 skip · 0 fail** em 61 arquivos.

### Verificação no sistema rodando

Mesma decisão aplicada aos dados reais do banco local:

```
852674/2|CTE_BATCH_DOCUMENT_ALREADY_LINKED
856858/2|CTE_BATCH_DOCUMENT_ALREADY_LINKED
859621/2|CTE_BATCH_DOCUMENT_ALREADY_LINKED
859709/2|null
859726/2|null
```

São exatamente as três notas que o usuário poderia selecionar sem saber do bloqueio. A verificação
ponta a ponta pelo navegador fica no T007, quando a tabela passa a mostrar o motivo.

### Gates

`bunx tsc --noEmit` limpo · `bun run lint` limpo nas 4 apps · `bun run format:check` limpo ·
`bun test` da API 1071 pass / 0 fail.

## T007 — Bloqueio visível na tabela de notas, linha bloqueada fora da seleção

### Desenho

A regra fiscal já foi resolvida no T006 e chega pronta na listagem (`cteBlockReason`). A tabela
**não reimplementa** a regra: só lê o motivo que a API resolveu. Para o lane puro do frontend poder
testar a seleção sem DOM, as regras saíram como funções puras exportadas do próprio módulo do hook
(`isDocumentBlocked`, `countBlockedDocuments`, `toggleDocumentSelection`,
`toggleAllDocumentSelection`), no mesmo padrão de `evaluateAdvancedFilter` e `reorderColumns`.

### Teste antes da implementação

- `test/nfe-workspace/cte-block-indicator.contract.ts` (novo, importado por
  `test/nfe-workspace.contract.test.ts`, cujo entrypoint já está na lista explícita do
  `package.json`): o cliente carrega `cteBlockReason` do payload de listagem; um payload com
  `cteBlockReason: 7` é rejeitado com `NFE_WORKSPACE_RESPONSE_INVALID`; `isDocumentBlocked` /
  `countBlockedDocuments`; `toggleDocumentSelection` recusa a linha bloqueada e continua alternando
  as livres; `toggleAllDocumentSelection` deixa a bloqueada de fora e, ao limpar, não toca no que
  veio de outra página.
- `test/responsive.smoke.spec.ts` — `a nota bloqueada mostra o motivo, fica fora da seleção e é
contada na barra`: 3 notas, 1 bloqueada; o motivo traduzido aparece, o checkbox da linha está
  desabilitado, o "selecionar todas" marca 2 e a barra mostra `1 bloqueada fora da seleção`.
  O helper `test/nfe-workspace-smoke.helper.ts` ganhou `blockedDocumentCount` (padrão 0, sem efeito
  nos testes existentes).

### Vermelho

```
SyntaxError: Export named 'isDocumentBlocked' not found in module
  src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook.ts
```

Smoke provado discriminante: com `git stash push -- src/modules/nfe-workspace` o teste novo falha em
`expect(page.getByText('Já vinculada a outro CT-e')).toBeVisible()`; `git stash pop` restaurou.

### Implementação

- `shared/nfeWorkspaceClient.service.ts` — `NfeDocumentListItem.cteBlockReason: null | string` e a
  checagem correspondente em `isNfeDocumentListItem` (nullable string, nada de coerção).
- `hooks/useNfeDocumentTable.hook.ts` — as quatro funções puras acima; `allSelected` / `someSelected`
  passam a ser calculados só sobre as linhas selecionáveis; o hook expõe `blockedCount`.
- `components/NfeDocumentTable.component.tsx` — badge com o motivo traduzido ao lado do status,
  checkbox `disabled` com `aria-label` "Nota bloqueada para CT-e" e o motivo no `title`, e a barra de
  seleção mostrando as bloqueadas quando `blockedCount > 0`.
- Locales pt-BR e en — `documents.blockedRow` e `documents.blockedCount`. O motivo em si reusa as
  chaves `cteEmission.blockReason.<CODE>` que já existiam nos dois arquivos, sem string duplicada.
- `styles/nfeWorkspace.module.css` — `.selectionBlocked`.
- Fixtures `test/nfe-workspace/nfe-workspace.fixture.ts` e
  `test/nfe-workspace/advanced-filter-and-columns.contract.ts` ganharam o campo novo — o
  `Equal<NfeDocumentListPage, NfeDocumentListPageContract>` de `module-imports.contract.ts` obriga.

### Verde

`bun run test` do frontend: **216 pass / 0 fail** em 12 arquivos. `bun run smoke`: **25 passed**.

### Verificação no sistema rodando

Sonda autenticada contra a stack de `make dev`, sem mock, dados reais, 1440×900, buscando a nota
`852674` — uma das três que o T006 mostrou vinculadas a lote não cancelado:

```json
[
  {
    "blocked": true,
    "label": "Nota bloqueada para CT-e",
    "text": "852674207/07/2026COMERCIAL ZARAGOZA IMP EXP LTDAAVENIDA DOM "
  }
]
```

A linha exibe "Já vinculada a outro CT-e" e o checkbox chega desabilitado — o usuário não consegue
mais selecionar a nota e descobrir o bloqueio só no diálogo. Sonda removida ao final
(`test/t007-live.spec.ts`, `playwright.live.config.ts`, `test-results/`).

### Gates

`bunx tsc --noEmit` limpo · `bun run lint` limpo nas 4 apps · `bun run format:check` limpo ·
`bun run test` do frontend 216 pass / 0 fail · `bun run smoke` 25 pass / 0 fail.

## T008 — Perfil aplicado visível no diálogo e caminho para os perfis de emissão

### Desenho

O diálogo já mostrava o nome do perfil, mas o rótulo secundário vinha de `resolvedBy`, que só diz
`auto` ou `manual` — não diz **por que** aquele perfil respondeu pela projeção. A API já resolve isso
em `emission-profile-resolution.policy.ts` e devolve `matchedBy`
(`manual` | `recipient_tax_id` | `sender_tax_id`), que subsome `resolvedBy`
(`resolvedBy = matchedBy === 'manual' ? 'manual' : 'auto'`). O frontend passa a exibir `matchedBy` e
não reimplementa a regra.

O caminho para Administração → Perfis de emissão de CT-e saiu como função pura
(`navigateToCteProfiles`) sobre uma porta `WorkspaceNavigator`, porque o shell não tem router: a
troca de tela é `pushState` + `sessionStorage` + `popstate` manual em `src/main.tsx`. Sem o
`dispatchPopState` a URL muda e a tela não. Com a porta, o lane puro testa a ordem das três chamadas
sem DOM.

### Teste antes da implementação

- `test/nfe-workspace/cte-emission-profile-access.contract.ts` (novo, importado por
  `test/nfe-workspace.contract.test.ts`, cujo entrypoint já está na lista explícita do
  `package.json`): cada linha de `summarizePreview` carrega `matchedBy`, `profileId`, `profileName` e
  `resolvedBy` (projeção automática por remetente e projeção escolhida à mão);
  `canReachCteProfiles` só libera com `settings.manage`; `navigateToCteProfiles` chama
  `pushPath` → `rememberWorkspace` → `dispatchPopState`, nessa ordem.
- `test/responsive.smoke.spec.ts` — `o diálogo mostra o perfil aplicado e leva aos perfis de emissão
em um clique` (com `settings.manage`: a célula de perfil traz o nome **e** "casou pelo CNPJ do
  remetente"; o clique fecha o diálogo, abre "Perfis de emissão de CT-e" e leva a URL para
  `/cte-profiles`) e `sem settings.manage o diálogo não oferece o caminho para os perfis` (o botão
  não existe). `test/nfe-workspace-smoke.helper.ts` passou a aceitar `settings.manage` no tipo de
  permissões.

### Vermelho

```
error: Cannot find module '../../src/modules/nfe-workspace/shared/cteProfilesNavigation.service'
  from test/nfe-workspace/cte-emission-profile-access.contract.ts
```

Smoke provado discriminante: com
`git stash push -- src/modules/nfe-workspace/components/CteEmissionDialog.component.tsx` o teste novo
falha em `toContainText('casou pelo CNPJ do remetente')` — valor recebido
`"Perfil de emissao smokecteEmission.resolvedBy.auto"`; `git stash pop` restaurou.

### Implementação

- `shared/cteProfilesNavigation.service.ts` (novo) — `CTE_PROFILES_ROUTE`, `CTE_PROFILES_WORKSPACE`,
  `canReachCteProfiles`, `navigateToCteProfiles` e `createBrowserWorkspaceNavigator`. A permissão vem
  de `SETTINGS_MANAGE_PERMISSION` do módulo `cte-profiles` — importada, não redeclarada. O nome
  `CTE_PROFILES_PATH` já existia no mesmo módulo para o caminho **da API**
  (`/cte-emission-profiles`), daí o nome distinto para a rota de tela.
- `shared/cteEmission.service.ts` — `CteEmissionRow` ganhou `matchedBy` e `profileId`, preenchidos por
  `summarizePreview` a partir de `projection.profile`.
- `hooks/useCteEmissionDialog.hook.ts` — expõe `canManageProfiles` e `openProfileSettings` (fecha o
  diálogo e navega).
- `components/CteEmissionDialog.component.tsx` — a célula de perfil mostra o motivo do casamento e,
  só com `settings.manage`, o botão "Ajustar perfis de emissão" abaixo do seletor.
- Locales pt-BR e en — `cteEmission.manageProfiles` e o bloco `cteEmission.matchedBy` no lugar de
  `cteEmission.resolvedBy` (o campo `resolvedBy` continua na linha porque vem da API, só não é mais
  o que se exibe).
- `styles/nfeWorkspace.module.css` — `.cteEmissionProfileLink`.
- `test/nfe-workspace/cte-emission-dialog.contract.ts` — a asserção de forma exata da linha passou a
  incluir `matchedBy` e `profileId`.

### Verde

`bun run test` do frontend: **219 pass / 0 fail** em 12 arquivos. `bun run smoke`: **27 passed**.

### Verificação no sistema rodando

Sonda autenticada contra a stack de `make dev`, sem mock, dados reais, 1440×900. O usuário
`local-user` tem papel `company-admin`, que concede `settings.manage`:

```json
{
  "hasProfileLink": true,
  "profileCell": "Spani 4,5% - homologacaocasou pelo CNPJ do remetente"
}
```

Após o clique, `PROBE_PATH=/cte-profiles` e a tela "Perfis de emissão de CT-e" renderizada. Ou seja:
o diálogo diz qual perfil respondeu **e** por que, e leva à administração em um clique. Sonda removida
ao final (`test/t008-live.spec.ts`, `playwright.live.config.ts`, `test-results/`).

### Gates

`bunx tsc --noEmit` limpo · `bun run lint` limpo · `bun run format:check` limpo ·
`bun run test` do frontend 219 pass / 0 fail · `bun run smoke` 27 pass / 0 fail.

## Fora das tasks numeradas — um botão só para transmitir (2026-08-01)

Pedido direto do usuário: _"o melhor seria deixar apenas um botão de transmitir não tem porque ter
esse passo"_. O fluxo tinha dois comandos para o mesmo efeito — "Enviar para emissão" (`draft →
submitted`) e depois "Transmitir". Entre um e outro o lote ficava num estado que o operador não sabia
nomear. Opção escolhida na pergunta: fechar o rascunho **no backend, dentro da transação que já
existe** na emissão.

### Backend

`executeIssue` passou a validar o estado do lote — antes não validava nada, a regra vivia só no
frontend. Aceita `draft`, `submitted` e `error`; qualquer outro (`cancelled`, `done`, `in_flight`)
responde 409 `CTE_BATCH_INVALID_STATE`. Quando o lote está em `draft`, `submitDraftBatch` grava o
registro de submissão (`pending`), move o status por CAS otimista
(`where status = 'draft'`, `version + 1`) e registra o evento `submitted` — tudo na mesma unidade de
trabalho da emissão, antes da reserva de numeração e do outbox.

O write ficou **inline** no `drizzle-cte-issuance.repository.ts` (helper `submitDraftBatchRecord`
compartilhado pela classe de repositório e pela de transação via `Queryable`) em vez de chamar o
módulo `cte-batches`: aquele repositório abre a própria transação, e transação aninhada na mesma raiz
trava o pool de 10 conexões em `idle in transaction`.

`cte_batch_events` não tem coluna de ator e o `createBatchEvent` existente descarta o `userId` que
recebe — por isso o evento novo carrega `userId` dentro do payload JSON, para a trilha de auditoria
não sumir.

Contrato antes da implementação: `test/cte-issuance-application/issue-from-draft.contract.ts`, 6
testes — rascunho fechado na mesma transação (`executedTransactions === ['cte-issuance']`), lote já
`submitted` e lote em `error` intocados, e os três estados terminais rejeitados com 409 sem reserva de
numeração e sem outbox.

### Frontend

`canSubmitBatch` e `collectSubmittableGroups` deixaram de existir; `TRANSMITTABLE_STATUSES` passou a
incluir `draft`. Os dois botões "Enviar para emissão" (barra de itens e barra de lotes) saíram, junto
com `submitSelection`, `submitBatchMutation`, `onSubmit` das ações de linha e
`canSubmitSelectedBatch` do view-model. A página de workspace injeta `issueBatch` na fila de
transmissão em massa, então a barra de progresso e seu contrato continuam valendo. `transmitMutation`
agora invalida também `CTE_BATCHES_QUERY_KEY`, porque transmitir muda o status do lote.

Locales: `actions.submit` e `cteItems.submitSelection` removidos das duas línguas; a seção
`transmission` inteira reescrita para não falar mais em "enviar".

Contrato novo `test/cte-batch/single-transmission.contract.ts` (5 testes) substituiu
`item-submission.contract.ts`: seleção de rascunho transmite, `done`/desconhecido bloqueia,
`CTE_MANAGE` sozinho não transmite, os helpers de submissão estão `undefined` no módulo, nenhum dos
cinco arquivos de tela cita botão de submissão, e as chaves de locale batem.

### Deixado de pé de propósito

A rota `POST /cte-batches/:id/submit` e o método `submitBatch` do `cteBatchClient.service.ts`
continuam existindo — a API ainda serve a rota e `client-and-queries.contract.ts` ainda a exercita.
Nenhuma tela chama. Remover é decisão separada, com deprecação de rota.

### Gates

```
$ bun test test/cte-issuance-application.contract.test.ts   → 66 pass · 0 fail
$ bun run --cwd apps/api-transportada test                  → 1411 pass · 1 skip · 0 fail
$ bun run --cwd apps/frontend-transportada test             → 545 pass · 0 fail · 3002 expect()
$ bun run lint / typecheck / format:check                   → limpos
```

## T012 — transmissão que mente: erro sem descrição e reautenticação no meio do comando

### Sintoma relatado

Selecionar CT-es, clicar em "Transmitir" e cair na aba de lotes sem nada acontecer. Na aba de lotes,
o painel mostrou `0 transmitido(s) · 3 com erro` com três linhas
`CT-e 2026-08-02 #N — CTE_ISSUANCE_REQUEST_FAILED`, enquanto as mesmas três linhas da tabela
exibiam **Concluído**.

### O que o banco disse

Os três lotes de 2026-08-02 percorreram `created → submitted → in_flight → done` e as tentativas em
`cte_issuance_attempts` estão todas `authorized` (homologação, série 1). **O servidor emitiu.** A
mensagem `0 transmitido(s) · 3 com erro` era falsa.

### Causa

Duas, somadas:

1. `getAccessToken()` chamava `keycloak.login()` — navegação de página inteira — sempre que
   `updateToken` falhava. Toda requisição em voo era abortada e a volta do login caía na aba padrão
   (Lotes). Reproduzido ao vivo: clicar em "Transmitir" produziu
   `POST /realms/.../token → 400` seguido de redirect ao Keycloak, **sem nenhum**
   `POST /api/cte-batches/.../issue`.
2. `authorizedRequest` descartava o corpo da resposta: tanto `fetch` que estourou quanto
   `!response.ok` viravam a mesma string `CTE_ISSUANCE_REQUEST_FAILED`. O envelope
   `{"error":{"code","message"}}` da API nunca era lido.

### Correção

- **Identidade** — `getAccessToken()` não navega mais: limpa o token, avisa os assinantes de
  `onSessionExpired` e lança `IDENTITY_SESSION_EXPIRED`. Reautenticar virou `restartAuthentication()`
  explícito, comandado pelo banner do shell ("Sua sessão expirou… Entrar novamente"). `initialize()`
  segue redirecionando, que é onde redirect é o comportamento certo.
- **Cliente CT-e** — em `!response.ok` lê `{error:{code}}` e propaga o código real; genérico só
  quando o corpo não traz envelope. `fetch` que estoura em POST vira
  `CTE_ISSUANCE_REQUEST_UNCONFIRMED`, não "falhou": com chave de idempotência, resposta perdida
  significa "não sei", nunca "não aconteceu". GET continua `CTE_ISSUANCE_REQUEST_FAILED`.
- **Aba de CT-es** — o `Promise.all` de transmissão engolia a recusa em silêncio. Passou a usar a
  mesma fila `submitCteBatches`, expõe `transmitErrorCode` e invalida as queries em `onSettled`
  (recusa parcial também precisa reler o status).
- **Mensagens** — `resolveCteBatchSubmissionReasonKey` mapeia cada código que a transmissão pode
  devolver para `transmission.reasons.*` nas duas línguas; `progress.failed` passou de
  `{{name}} — {{code}}` para `{{name}} — {{reason}}`, com o código preservado dentro do texto
  genérico para suporte.

### Contratos

- `test/keycloak-auth-provider.test.ts`: expiração não navega, notifica e desassina o ouvinte,
  `restartAuthentication()` é o único caminho que chama `login`.
- `test/cte-issuance/request-failures.contract.ts` (5 testes): código da API preservado, fallback sem
  envelope, POST sem resposta vira `UNCONFIRMED`, GET continua `FAILED`, erro de identidade passa
  intacto.
- `test/cte-batch/transmission-feedback.contract.ts` (5 testes): mapa de motivos cobre os códigos
  reais da API, fallback preserva `{{code}}`, as duas línguas têm todas as chaves, o texto de
  não-confirmado não afirma falha, e as duas barras de seleção renderizam o motivo.

### Gates

```
$ bun run --cwd apps/frontend-transportada test  → 558 pass · 0 fail · 3087 expect()
$ bun run lint / typecheck / format:check        → limpos
```

### Em aberto

Não ficou provado se as três requisições das 15:27 morreram por abort de navegação ou por status
não-ok — o log do Vite não registra nada naquele minuto, o que favorece o abort sem fechar a
questão. As duas hipóteses têm a mesma correção. Segundo achado, fora deste escopo:
`allowedMethods()` em `apps/api-transportada/src/http/cors.service.ts` não lista `/issue`, então o
preflight anuncia só `GET` para `POST /cte-batches/:id/issue` (inofensivo hoje, porque POST é
CORS-safelisted e o dev é same-origin).

## T013 — lote continua "Submetido" e reoferece Transmitir

### Sintoma

Na aba **CT-es** o operador seleciona, aperta **Transmitir**, e na aba **Lotes** o lote aparece em
`Submetido`; ao selecioná-lo, o botão **Transmitir** volta a ser oferecido.

### Diagnóstico

Duas causas independentes, ambas verificadas no banco da stack local:

1. **A transmissão tinha dado certo.** `CT-e 2026-08-02 #4` foi criado às `19:11:32.156` e chegou a
   `done` às `19:11:41.15` — nove segundos. `Submetido` era foto velha da tela, não falha.
2. **Nada relia a listagem.** `batchesQuery` (`useCteBatchWorkspace.hook.ts`) e a query de itens
   (`cteBatchItems.query.ts`) só buscavam por invalidação. Quem move `submitted → in_flight → done`
   é o worker, sem interação do usuário: sem releitura a tela morre no estado intermediário.
3. **O botão era reoferecido.** `TRANSMITTABLE_STATUSES` incluía `'submitted'`, e a API aceitava
   reemitir lote em `submitted` (`ISSUABLE_BATCH_STATUSES`). Segunda pressão dentro da janela de
   nove segundos criava outra tentativa, com **outra reserva de número fiscal** — duplicaria o CT-e.

### Correção

- `cteBatchItemActions.service.ts`: `TRANSMITTABLE_STATUSES` passa a `['draft', 'error']`. Lote em
  voo não aceita novo comando; quem termina a transição é o worker.
- `cteBatchProgress.service.ts` (novo): `resolveCteBatchProgressInterval` /
  `resolveCteItemProgressInterval` devolvem `CTE_BATCH_PROGRESS_INTERVAL_MS` (3 s) enquanto houver
  lote em `submitted`/`in_flight` ou item em `pending`/`in_flight`/`retry_scheduled`, e `false`
  quando não houver — o polling se desliga sozinho.
- `useCteBatchWorkspace.hook.ts` e `cteBatchItems.query.ts`: `refetchInterval` ligado aos
  resolvedores.
- `cte-issuance.use-case.ts`: `executeIssue` recusa com `CTE_ISSUANCE_ALREADY_IN_FLIGHT` (409)
  quando a última tentativa do item ainda está em `requested` (que cobre o `in_flight` do banco).
  A trava não vale para `retry_scheduled` — retentativa é retransmissão legítima, não duplicata.
  O caminho legado `POST /submit` → `/issue` continua funcionando: lote em `submitted` sem
  tentativa aberta segue emitindo.
- `cteBatchSubmissionQueue.service.ts` + as duas locales: novo motivo `alreadyInFlight`.

### Contratos

- `test/cte-batch/transmission-progress.contract.ts` (5 testes, novo): `canTransmitBatch` e
  `canTransmitSelection` recusam `submitted`/`in_flight` e aceitam `draft`/`error`; os dois
  resolvedores só devolvem intervalo enquanto há transição pendente; as duas queries têm o
  `refetchInterval` ligado.
- `test/cte-issuance-application/issue-from-draft.contract.ts` (2 testes novos): segunda emissão com
  tentativa em voo é 409 `CTE_ISSUANCE_ALREADY_IN_FLIGHT`, sem reserva e sem outbox; tentativa em
  `retry_scheduled` continua emitindo.
- Contratos que codificavam a regra antiga foram corrigidos, não removidos:
  `single-transmission.contract.ts` e `table-and-items.contract.ts` agora exigem a recusa de lote
  submetido; `transmission-feedback.contract.ts` cobre o código novo.

### Falha antes da correção

Com a trava neutralizada (`if (false as boolean)`), o contrato da API falha como esperado:

```
(fail) refuses a second issuance while the current attempt is still in flight
error: Expected ApiError to be thrown   → 67 pass · 1 fail
```

### Gates

```
$ bun run --cwd apps/frontend-transportada test  → 563 pass · 0 fail · 3115 expect()
$ bun run --cwd apps/api-transportada test       → 1413 pass · 1 skip · 0 fail · 6414 expect()
$ bun run lint / typecheck / format:check        → limpos
$ bun run build                                  → ok (PWA 11 entradas)
```

Stack local com o código novo em pé: `/health/ready` 200 e o Vite já serve
`cteBatchProgress.service.ts`.

## T014 — modal "Gerar fatura" recortava a lista do select de prazo

### Sintoma

Na aba **Lotes** de `/cte-batches`, ao abrir **Gerar fatura** e clicar no select **Prazo**, a lista
de opções aparecia cortada na borda inferior do modal: "5 dias" visível, "10 dias" pela metade e o
resto inalcançável.

### Diagnóstico

O painel flutuante era `position: absolute` dentro do próprio campo, e o modal
(`.billingDialog`) tem `max-height: 92vh` com `overflow-y: auto`. Um elemento absoluto é recortado
pelo ancestral com `overflow` — a lista morria na borda do diálogo. O mesmo valia para o
`date-picker` ao lado dele e para qualquer select dentro de tabela com `overflow-x: auto`.

### Correção

- `src/components/ui/floatingLayer.service.ts` (novo, puro): `resolveFloatingLayerPosition` decide
  acima/abaixo, limita a altura ao espaço visível (mínimo rolável) e prende as bordas na viewport,
  com suporte a `align: 'end'`.
- `src/components/ui/useFloatingLayer.hook.ts` (novo): mede o gatilho por `getBoundingClientRect`,
  publica `--floating-layer-top/left/min-width/max-height`, reposiciona em `scroll` (com captura) e
  `resize`, e fecha ao clicar fora entendendo o portal como "dentro".
- `select`, `date-picker` e `date-range-picker` passaram a renderizar o painel em portal no
  `document.body`, com `position: fixed` — saem de qualquer ancestral com `overflow`.
- `Escape` no select aberto agora para de propagar: fechava a lista e o modal de uma vez só.

### Contratos

- `test/design-system/floating-layer.contract.ts` (9 testes novos): abre abaixo com espaço; vira
  para cima quando não cabe; nunca ultrapassa o espaço visível nem some abaixo do mínimo; prende as
  duas bordas laterais; respeita `align: 'end'`; o serviço não toca em `window`/`document`; os três
  componentes usam o hook e o portal; os dois CSS posicionam pelas mesmas custom properties.

### Falha antes da correção

```
$ bun test test/design-system.contract.test.ts   → 66 pass · 9 fail
error: Cannot find module '@/components/ui/floatingLayer.service'
Expected to contain: "position: fixed"   (select.module.css ainda em position: absolute)
```

### Gates

```
$ bun run --cwd apps/frontend-transportada test  → 572 pass · 0 fail · 3159 expect()
$ bun run lint / typecheck / format:check        → limpos
$ bun run build                                  → ok (PWA 11 entradas)
```

Vite da stack local já serve `useFloatingLayer.hook.ts`, `floatingLayer.service.ts` e o `select.tsx`
com portal. A conferência visual no modal depende da sessão logada do operador.
