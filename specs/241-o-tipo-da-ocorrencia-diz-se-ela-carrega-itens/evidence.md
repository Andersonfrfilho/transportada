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

### T1.5 — Produtos no cadastro de tipos (RF10, RF12) e mensagens por código (CA10, painel)

Contratos primeiro:

- `test/company-settings/occurrence-type-items-mode-body.contract.ts` — o corpo real do `PUT`
  (`createTripClient` com `fetch` dublado): Produtos Desligado, foto desligada, sem soltar a nota →
  `itemsMode: 'off'`, `redeliveryPolicy: 'unset'`, `flow: 'document'`, sem itens; sem `itemsMode` no
  input a chave não vai no corpo ("não mexa").
- `test/trip-hooks/occurrence-type-items-mode-panel.contract.ts` — `OccurrenceTypeCatalogPanel`
  montado no DOM, com o `Select` de verdade: listagem sem `itemsMode` não mostra Produtos; com ele
  mostra a escolha gravada; tipo Desligado esconde a política de reentrega e o "um ou vários";
  trocar para Desligado grava `itemsMode: 'off'` + `redeliveryPolicy: 'unset'` no mesmo `PUT` (o tipo
  tinha `blocked`); voltar a Opcional mantém a política gravada; as outras gravações não mandam
  `itemsMode`; **CA10**: cadastro novo com Etapa "Na rua" e Produtos Desligado esconde a política e
  grava o corpo exato da segunda via; política já escolhida na tela some e o corpo leva `unset`;
  sem listagem com `itemsMode` o cadastro novo não oferece nem manda Produtos.
- `test/trip/occurrence-items-mode-feedback.contract.ts` — `OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED` e
  `OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY` resolvem para chave de `trip.feedback.*` (o mecanismo
  da 240: `TRIP_FEEDBACK_KEY_BY_ERROR` + `resolveTripFeedbackKey`; não existe `getApiErrorCode()` nesta
  app), com texto pt-BR e en.

Vermelho, antes do código (`src/` revertido aos arquivos do HEAD, contratos novos mantidos):

```text
(fail) corpo do PUT de tipo de ocorrência (spec 241) > Produtos Desligado, foto desligada, sem soltar a nota: itemsMode off e política unset
(fail) mensagens dos códigos de itens por tipo (spec 241) > OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED vira occurrenceTypeItemsNotAllowed, com texto nos dois idiomas
(fail) mensagens dos códigos de itens por tipo (spec 241) > OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY vira occurrenceTypeItemsOffRedeliveryPolicy, com texto nos dois idiomas
(fail) mensagens dos códigos de itens por tipo (spec 241) > o texto do registro manda ligar Produtos no cadastro; o do cadastro manda desligar a política
 6692 pass
 4 fail
--- lote DOM (bun run test:hooks) ---
(fail) cadastro de tipos: Produtos (spec 241 RF10) > listagem com itemsMode: Produtos aparece no tipo, com a escolha gravada
(fail) cadastro de tipos: Produtos (spec 241 RF10) > tipo Desligado: a política de reentrega e o "um ou vários" somem
(fail) cadastro de tipos: Produtos (spec 241 RF10) > trocar para Desligado grava itemsMode off e redeliveryPolicy unset no mesmo PUT (RF12)
(fail) cadastro de tipos: Produtos (spec 241 RF10) > voltar para Opcional grava itemsMode optional e mantém a política já gravada
(fail) cadastro de tipos: criar a prorrogação (spec 241 CA10) > Produtos Desligado, sem foto, sem soltar a nota: o corpo é o da segunda via, sem política
 407 pass
 5 fail
```

Mutação da política escondida (CA10), depois do código: tirar do painel as duas trocas
`value === 'off' ? unset : …` (edição) e `isItemsOff ? unset : redeliveryPolicy` (cadastro novo) deixa
o contrato vermelho; restaurado, verde:

```text
(fail) cadastro de tipos: Produtos (spec 241 RF10) > trocar para Desligado grava itemsMode off e redeliveryPolicy unset no mesmo PUT (RF12)
  Expected: "unset"
  Received: "blocked"
(fail) cadastro de tipos: criar a prorrogação (spec 241 CA10) > política já escolhida some com Produtos Desligado: o corpo leva unset, não o que estava na tela
 7 pass
 2 fail
--- restaurado ---
 9 pass
 0 fail
```

Implementação: `OccurrenceTypeItemsModeSelect` (`Select` do design system com a dica, Desligado /
Opcional); `OccurrenceTypeCatalogPanel` mostra Produtos só quando a listagem trouxe `itemsMode`
(`hasItemsModeSupport`), esconde política de reentrega e "um ou vários" com Desligado, troca para
Desligado envia `redeliveryPolicy: 'unset'` no mesmo `PUT`, e mostra a recusa do servidor
(`saveFeedbackKey`, via `resolveTripFeedbackKey`) num alerta — antes o painel engolia o erro de
gravação. O `PUT` (`tripClient.service.ts`) manda `itemsMode` só quando presente. As demais gravações
do painel continuam sem `itemsMode` (ausente é "não mexa", RF4) e mandam `redeliveryPolicy` como a
242 corrigiu. Os testes de DOM do lote dependem de `stubVisibleLayout()` (o `Select` fecha a camada de
gatilho com retângulo zerado) e não registram `beforeEach`/`afterEach` próprios, que no lote viram
globais.

Textos novos — `companySettings.occurrenceTypeCatalog.*`:
`itemsMode` "Produtos" / "Products"; `itemsModeOff` "Desligado" / "Off"; `itemsModeOptional`
"Opcional" / "Optional"; `itemsModeHint` "Desligado: a ocorrência não carrega produtos — o registro
não mostra o seletor e a reentrega não se aplica. Opcional: quem registra pode apontar os produtos."
(en: "Off: the occurrence carries no products — registration shows no selector and redelivery does
not apply. Optional: whoever registers may point at products."). `trip.feedback.*`:
`occurrenceTypeItemsNotAllowed` "Este tipo de ocorrência não carrega produtos. Registre sem escolher
itens; se ele precisa de produtos, ligue Produtos no cadastro do tipo. Nada foi gravado." (en: "This
occurrence type does not carry products. Register it without choosing items; if it needs products,
turn Products on in the type setup. Nothing was saved."); `occurrenceTypeItemsOffRedeliveryPolicy`
"Tipo sem produtos não abre tratativa: deixe a reentrega como indefinida ou volte Produtos para
Opcional. Nada foi gravado." (en: "A type without products does not open a case: leave redelivery
unset or switch Products back to Optional. Nothing was saved.").

Limites conhecidos: com a lista de tipos **vazia** o cadastro novo não oferece Produtos (não há como
saber se a API já conhece o campo); um tipo com `itemsMode: 'required'` (da 239) não ganha o controle
de Produtos nem some a política — a 239 decide como o painel o trata.

### T1.6 — gates do painel

Comandos, com a árvore no HEAD da T1.5:

```text
$ bun run --cwd apps/frontend-transportada test
 6696 pass / 0 fail  (Ran 6696 tests across 32 files)
 413 pass / 0 fail   (lote DOM, Ran 413 tests across 1 file)
$ bun run typecheck                      → 0 erros (TS)
$ (apps/frontend-transportada) bun run lint → 0 erros, 16 avisos já existentes
$ bun run format:check                   → All matched files use Prettier code style!
```

Contrato do painel contra a resposta da API **atual** (sem nenhum campo novo), onde cada caso já está
provado: guards — `occurrence-items-mode-tolerance.contract.ts` (tipo sem `itemsMode`, feed/detalhe/
lista da nota sem `occurrenceTypeId`/`typeItemsMode`/`typeAllowsMultipleItems`); Corrigir —
`occurrence-correction-button.contract.tsx` ("resposta sem `typeItemsMode` lê `optional`") e a tabela
CA05; registro — `occurrence-register-items-mode.contract.ts` ("tipo sem `itemsMode` mostra o
seletor"); correção — `occurrence-correction-single-item.contract.ts` ("resposta sem o campo lê
vários"); cadastro — `occurrence-type-items-mode-panel.contract.ts` ("listagem sem `itemsMode`: nada
de Produtos, a política segue ali").

Com a API atual, o que muda na tela é só o previsto no plano: Corrigir passa a aparecer para a
ocorrência sem itens (lê `optional`) e a API atual aceita a correção como hoje.

Não feito nesta sessão, por instrução: nenhum push, deploy ou mudança em `apps/api-transportada`.
`docs/ai-context/frontend-transportada.md` é da T3.3. T1.5 e T0.3 não dependem uma da outra.
