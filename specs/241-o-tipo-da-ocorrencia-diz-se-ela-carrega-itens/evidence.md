# Evidência — Feature 241

## Fase 0

### T0.2 — a 239 ainda não criou `items_mode`

Conferido em `origin/staging` = `83813b1758b09e6e070e8b63679ed244374c086a` (2026-10-03):

```text
$ git grep -n -i -E "items_mode|itemsMode" origin/staging -- apps packages
(nenhuma linha; saída vazia)
```

Nem `items_mode` nem `itemsMode` existem em `apps/` ou `packages/`. Logo a 241 vai antes da 239 e
cria a coluna com `DEFAULT 'optional'`. A 239 (só em `work/spec-239`, sem código) **precisará** tirar
o `ADD COLUMN items_mode` da migration dela e o default `off` do plano. **Registrado, não
executado**: a spec da 239 não foi editada aqui.

### T0.3 — medição em staging e produção: PENDENTE, pede autorização

Medir em produção (Postgres-Hqfu) é ação em produção e exige o usuário; esta sessão não a executou.
As três perguntas, só leitura, sobre `company_occurrence_types`:

1. Quantos tipos têm o nome exato da segunda via do boleto e **qual `redelivery_policy` cada um tem**
   (a migration a zera para `unset`; política ≠ `unset` avisa o usuário antes da etapa 2).
2. O nome "Cliente pediu prorrogação do boleto" já existe?
3. Quantos tipos renomeados ficariam de fora do `UPDATE` da migration?

Status: **pendente, pede autorização.** Task T0.3 segue desmarcada.

## Fase 1 — Painel tolerante (etapa 1)

### T1.1 — guards tolerantes

Contrato: `test/trip/occurrence-items-mode-tolerance.contract.ts` (importado por
`test/trip.contract.test.ts`, que já está na lista do `package.json`).

Vermelho, antes do código (mesmo contrato, `src/` intocado):

```text
(fail) tipo do cadastro: itemsMode > presente (off e optional) é lido como veio
(fail) feed e detalhe: occurrenceTypeId, typeItemsMode, typeAllowsMultipleItems > forma errada em qualquer das três recusa o item
(fail) lista da nota: typeItemsMode e typeAllowsMultipleItems > aceita e preserva as chaves presentes
 7 pass
 3 fail
```

Verde depois: `-t "itemsMode|feed e detalhe|lista da nota: typeItems"` → 10 pass, 0 fail.
`bun run --cwd apps/frontend-transportada test` → 6676 pass + 397 pass (lote DOM), 0 fail;
`bun run typecheck` → sem erros.

Decisão: `itemsMode` do tipo do cadastro **não** ganha padrão no adaptador (ausente continua ausente) —
é o que permite à T1.5 oferecer o controle só quando a API o trouxer. `typeItemsMode` e
`typeAllowsMultipleItems` ausentes são lidos como `optional`/`true` por quem os usa
(`DEFAULT_OCCURRENCE_ITEMS_MODE`). `required` é aceito na leitura (vocabulário da coluna) e tratado
como "carrega itens"; a escrita só aceita `off | optional`.

### T1.2 — RF7 em `resolveOccurrenceCorrectionActions` (CA05)

Contrato primeiro: `test/trip/occurrence-correction-actions.contract.ts` ganhou `typeItemsMode` na
entrada e o bloco "Corrigir por tipo (spec 241 CA05)" (tabela de sete casos); os testes da 240 que
dependiam de "sem itens ⇒ sem Corrigir" passaram a declarar `typeItemsMode: 'off'`.
`test/trip/occurrence-correction-button.contract.tsx` (DOM do componente) ganhou os casos `off`,
`optional` e resposta sem o campo (API anterior lê `optional`).

Vermelho, antes do código:

```text
Expected: "enabled"
Received: "hidden"
(fail) ... > Corrigir por tipo (spec 241 CA05) > optional, sem itens, nunca corrigida (a avaria da nota inteira): Corrigir aparece e Cancelar continua
Expected: "enabled"
Received: "hidden"
(fail) ... > Corrigir por tipo (spec 241 CA05) > required, sem itens: Corrigir aparece e Cancelar continua
 33 pass
 2 fail
```

Implementação: `canCorrect = typeItemsMode !== 'off' || hasItems || wasCorrected`
(`tripOccurrenceDetail.service.ts`); o componente passa
`occurrence.typeItemsMode ?? DEFAULT_OCCURRENCE_ITEMS_MODE`.

Verde: `bun run --cwd apps/frontend-transportada test` → 6685 pass + 397 pass (lote DOM), 0 fail;
`bun run typecheck` sem erros; lint da app 0 erros (16 avisos já existentes).

### T1.3 — mutação: voltar o RF7 para `hasItems || wasCorrected`

Mutação em `tripOccurrenceDetail.service.ts` (`canCorrect = input.hasItems || input.wasCorrected`),
`bun run --cwd apps/frontend-transportada test`:

```text
(fail) Corrigir e Cancelar: ... > Corrigir por tipo (spec 241 CA05) > optional, sem itens, nunca corrigida (a avaria da nota inteira): Corrigir aparece e Cancelar continua
(fail) Corrigir e Cancelar: ... > Corrigir por tipo (spec 241 CA05) > required, sem itens: Corrigir aparece e Cancelar continua
(fail) botão Corrigir no detalhe da ocorrência (spec 240 T2.1) > tipo optional sem itens (a avaria da nota inteira) tem Corrigir e Cancelar
(fail) botão Corrigir no detalhe da ocorrência (spec 240 T2.1) > resposta sem typeItemsMode (API anterior) lê optional: Corrigir aparece sem itens
 6681 pass
 4 fail
```

Restaurado o arquivo (`git status` limpo na fonte): 6685 pass + 397 pass (lote DOM), 0 fail.

### T1.4 — RF8 (registro) e RF9 (correção com seleção única)

Contratos primeiro:

- `test/trip/occurrence-items-mode.contract.ts` — comportamento puro de
  `occurrenceItemsMode.service.ts` (leitura de `itemsMode`, limpeza da seleção ao trocar para `off`,
  primeira escolha para item único). Vermelho antes: `Cannot find module
'@/modules/trip/shared/occurrenceItemsMode.service'`.
- `test/trip-hooks/occurrence-register-items-mode.contract.ts` — `TripOccurrences` montado no DOM:
  tipo `optional` e tipo sem `itemsMode` mostram o seletor de produtos; tipo `off` não mostra; trocar
  de `optional` para `off` esconde e voltar mostra (usa o `Select` do design system de verdade).
- `test/trip-hooks/occurrence-correction-single-item.contract.ts` — o formulário de correção abre em
  seleção única com `typeAllowsMultipleItems: false`; com `true` ou campo ausente, seleção múltipla.

Vermelho do lote DOM, antes do código (`bun run test:hooks`):

```text
(fail) registro de ocorrência por tipo (spec 241 RF8, CA06) > tipo off não mostra o seletor de produtos
(fail) registro de ocorrência por tipo (spec 241 RF8, CA06) > trocar de optional para off esconde o seletor, e voltar o mostra
(fail) formulário de correção e o teto de um item (spec 241 RF9) > tipo de item único abre a correção em seleção única
 401 pass
 3 fail
```

Implementação: `TripOccurrences.component.tsx` esconde `OccurrenceProductSelect` e
`OccurrenceItemQuantities` quando o tipo é `off` e troca a seleção por
`resolveItemsOnTypeChange` (a regra da 166, "item único fica com o primeiro", passou para o serviço);
`TripOccurrenceCorrectionForm` recebe `allowsMultipleItems`, vindo de
`occurrence.typeAllowsMultipleItems ?? true`. `SeparationOccurrenceDialog` só empresta a moldura e
hospeda `TripOccurrences`, então o RF8 vale por ele sem mudança própria. Um teste de fonte da 166
(`occurrence-item-quantity-field.contract.ts`) procurava `productCodes.slice(0, 1)` no componente; a
regra mudou de lugar e ele passou a procurar `resolveItemsOnTypeChange`, com o comportamento coberto
pelo contrato puro acima.

Verde: `bun run --cwd apps/frontend-transportada test` → 6691 pass + 404 pass (lote DOM), 0 fail;
`bun run typecheck` sem erros; lint da app 0 erros.
