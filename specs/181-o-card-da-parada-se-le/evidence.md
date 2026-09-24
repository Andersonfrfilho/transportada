# Evidência — Feature 181

## Fase 1 — Os selos dizem coisas diferentes (T101 + T102)

**Por que um commit só:** T101 é o teste que prova o defeito (`hasOpenOccurrenceMarker(document)`
e `document.openOccurrenceCase === true` são a mesma condição, renderizada duas vezes); T102 é a
correção que faz esse teste passar. Um commit isolado só com T101 deixaria a suíte vermelha —
contrário ao gate de fechamento (`bun test` precisa fechar em 0 fail). Testado e implementado juntos.

### O que mudou

- `TripStopList.component.tsx` (`TripStopDocumentRow`): os dois selos de ocorrência
  ("Ocorrência aberta" clicável + "Ocorrência em tratativa" com tooltip, ambos nascidos da mesma
  leitura de `document.openOccurrenceCase`) viram **um** selo clicável, com o tooltip
  `occurrence.openCaseHint` e o texto `occurrence.openCase`. O selo de pipeline
  (`separationStatusBadge`) passa a compor o motivo da devolução traduzido junto
  ("Devolvida · Ausente"), via `t('stops.separationStatusWithReason', ...)`, com queda para o
  próprio código quando a tradução não existe (`migration` legado).
- `tripDocument.service.ts`: nova função pura `tripDocumentReturnReasonCode(document)` — decide
  **se** há motivo a anexar (só nota `returned` com `returnReason` preenchido); a composição da
  tradução fica no componente, como já acontecia com `fiscalStatusLabel`.
- `trip.locale.json` / `trip.en.locale.json`: removida a chave órfã `stops.openOccurrenceDocument`
  ("Ocorrência aberta" — só usada no selo que se fundiu); adicionada
  `stops.separationStatusWithReason` = `"{{status}} · {{reason}}"` (mesmo padrão de separador de
  `deliveryProof.productLine`).
- `test/trip/occurrence-marker.contract.ts`: assertiva sobre a chave removida trocada pela chave do
  selo fundido (describe count inalterado — só o texto do `it` mudou).
- `test/trip/document-status-badges.contract.ts` (novo): contrato de T101 (um selo só, clicável,
  com a dica de que a nota segue liberada) e T102 (função pura de motivo + composição traduzida).

### Gates

```
bunx tsc --noEmit                                                     → 0 erros
bunx eslint src/modules/trip test/trip --max-warnings=0                → 0 problemas
bun test ./test/trip.contract.test.ts --timeout 120000                → 1571 pass, 0 fail
  (baseline 1564 pass + 7 testes novos = 1571; nenhuma regressão)
```

### Commit

`git log -1 --oneline` após o commit desta fase: ver histórico do worktree.

## Fase 2 — O card ganha estrutura (T201 + T202 + T203)

**Por que um commit só:** T201 é o teste da estrutura nova (âncora tipográfica + blocos rotulados +
grade); T202 é a implementação que faz esse teste passar (mesma razão da Fase 1 — commit isolado só
com o teste deixaria a suíte vermelha). T203 (ordem das ações) entrou no mesmo commit por tocar o
mesmo bloco JSX imediatamente adjacente — separar exigiria reabrir o mesmo trecho duas vezes sem
ganho de rastreabilidade.

### O que mudou

- `trip.module.css`: `.stopDocumentRow` deixou de ser `display: flex; flex-wrap: wrap` (diagnóstico
  item 1 da `proposta-ux.md`) e virou `display: grid` — cabeçalho, grade de dados, ações e
  expansões, cada um sua própria linha. `.stopDocumentLabel` ganhou `font-weight: 600` (mesma
  âncora de `.stopLabel`, RF5/CA05). Classes novas: `.stopDocumentHead` (checkbox + número +
  selos), `.stopDocumentCheckboxColumn` (largura fixa `var(--control-height-compact)` — âncora de
  varredura vertical, RF10), `.stopDocumentBadgeRow` (faixa de selos), `.stopDocumentGrid`
  (`repeat(auto-fit, minmax(12rem, 1fr))` — RF4), `.stopDocumentGroup`/`.stopDocumentGroupLabel`
  (bloco rotulado), `.stopDocumentToggle`/`.stopDocumentDetailGroup` (expansão, mesmo molde de
  `tripTimeline.module.css` `.itemToggle`/`.itemDetailGroup` da spec 180).
- `TripStopList.component.tsx` (`TripStopDocumentRow`): reorganizado em cabeçalho (checkbox em
  coluna própria + número com âncora + faixa de selos: pipeline, ocorrência, fiscal,
  destino-de-entrega) → grade rotulada (bloco "Carga": mercadoria + frete + data; bloco
  "Destinatário": só o nome de quem recebe) → ações → duas expansões ao pé. Telefone, contratante e
  regra de frete saíram da frente do card e foram para uma expansão nova ("Detalhes da nota"),
  reusando o padrão `aria-expanded`/`aria-controls`/chevron da spec 180 (T304, adiantado aqui por
  nascer junto da grade). O botão "Comprovante" ganhou o mesmo padrão de disclosure (antes era só
  um `onClick` sem estado de acessibilidade).
- T203: dentro de `.rowActions`, "Marcar entregue" passou a vir antes de "Devolver" — o acerto
  fácil numa nota carregada não deve competir de posição com a devolução.
- `test/trip/document-row-structure.contract.ts` (novo): contrato de T201 — âncora tipográfica,
  fim do `flex-wrap` sem eixo, existência do cabeçalho/faixa/grade, coluna fixa do checkbox, blocos
  rotulados de dinheiro e pessoas.

### Gates

```
bunx tsc --noEmit                                                     → 0 erros
bunx eslint src/modules/trip test/trip --max-warnings=0                → 0 problemas
bun test ./test/trip.contract.test.ts --timeout 120000                → 1578 pass, 0 fail
  (1571 da fase anterior + 7 testes novos = 1578; nenhuma regressão)
```

## Fase 3 — O detalhe abre sob demanda (T301 + T303)

T302 (reusar o padrão de disclosure da spec 180) e T304 (contratante/regra fiscal/contato para a
expansão) já saíram prontos da Fase 2, junto da grade nova — ficaram registrados lá porque nasceram
no mesmo trecho de JSX. Esta fase fecha o que sobrou: `TripDeliveryProof.component.tsx` parava de
despejar produtos e ocorrências incondicionalmente (RF7).

### O que mudou

- `TripDeliveryProof.component.tsx`: os três estados (`not-delivered`, `returned`, `delivered-*`)
  chamavam `<TripDocumentProducts products={products} /> {occurrences}` direto, sempre. Os três
  passam a chamar um `<TripDeliveryProofDetail>` novo, que decide: produto zero → só o aviso
  `deliveryProof.withoutProducts`, sem disclosure vazio (CA07); produto ≥ 1 → botão
  `aria-expanded`/`aria-controls`/chevron com a contagem no rótulo fechado
  (`deliveryProof.productsToggle`, "N produtos na nota", CA06). Ocorrências ganham o mesmo padrão de
  botão, sempre oferecido — o conteúdo de `TripOccurrences` (registrar + histórico) é da spec
  164/166/167, fora do escopo desta feature, então não há como saber se está "vazio" sem tocar
  nessa lógica; a decisão consciente foi manter a expansão sempre disponível em vez de arriscar
  esconder o formulário de registro. Ganhou a prop `documentId`, para os dois `id` de
  `aria-controls` serem estáveis por nota — threading feito em `TripDetail.component.tsx`
  (`TripDeliveryProofLoader`).
- `test/trip/delivery-proof-panel.contract.ts`: a asserção que checava `<TripDocumentProducts` cru
  na fatia "not-delivered" passou a checar `<TripDeliveryProofDetail` — o dado continua alcançável
  em todo estado, só que atrás da expansão agora (describe count inalterado).
- `test/trip/delivery-proof-disclosure.contract.ts` (novo): contrato de T301 — uma chamada direta
  só de `TripDocumentProducts` (dentro da expansão), rótulo fechado com contagem, nota sem produto
  sem disclosure vazio, duas expansões com `aria-controls`/`aria-expanded`, ids estáveis por nota.
- ⚠️ **Gap pré-existente, não deste commit:** `trip.en.locale.json` não tem a seção `deliveryProof`
  inteira (só `deliveryProofSettings`, seção diferente) — as chaves novas (`productsToggle`,
  `occurrencesToggle`/`Collapse`) não entraram no en por não haver onde encaixar sem também
  traduzir as ~13 chaves já existentes em pt-BR sem par em en, fora do escopo desta task. Sinalizado
  para tarefa separada.

### Gates

```
bunx tsc --noEmit                                                     → 0 erros
bunx eslint src/modules/trip test/trip --max-warnings=0                → 0 problemas
bun test ./test/trip.contract.test.ts --timeout 120000                → 1583 pass, 0 fail
  (1578 da fase anterior + 5 testes novos = 1583; nenhuma regressão)
```

## Fase 4 — A seleção em massa deixa de se esconder (T401 + T402)

O mecanismo (`TripDocumentSelectionController`, devolução em lote com a nota que falha
permanecendo marcada, `TripStateActions`) **já funcionava** e não foi tocado — a task pede achá-lo,
não reescrevê-lo. A parte de T402 sobre "a caixa ganha lugar próprio no card reorganizado" já saiu
pronta da Fase 2: `.stopDocumentCheckboxColumn` (largura fixa `var(--control-height-compact)`,
sempre a primeira coisa no cabeçalho da nota, antes do número e dos selos) é exatamente a âncora de
varredura vertical que RF10 pede. A barra que diz quantas notas estão marcadas
(`.selectionBar`/`stops.selectionCount`) e o bloco que diz o que fazer com elas
(`<TripStateActions>`) já nascem lado a lado, assim que `selection.selectedIds.size > 0` — não havia
o que reescrever aí também. Esta fase fecha com o teste que prova as três garantias (RF10/RF11/RF12)
em conjunto, sem alterar comportamento.

### O que mudou

- `test/trip/document-selection-anchor.contract.ts` (novo): prova que a caixa da nota vem sempre
  antes do número e dos selos dentro de uma coluna de largura fixa (RF10/CA09); que a caixa da
  parada continua usando `allSelected`/`someSelected`/`indeterminate` sobre as notas dela (RF12/
  CA11, regressão — nada mudou aqui, só ficou provado); e que a contagem e as ações em massa
  aparecem juntas assim que há seleção (RF11/CA10).

### Gates

```
bunx tsc --noEmit                                                     → 0 erros
bunx eslint src/modules/trip test/trip --max-warnings=0                → 0 problemas
bun test ./test/trip.contract.test.ts --timeout 120000                → 1587 pass, 0 fail
  (1583 da fase anterior + 4 testes novos = 1587; nenhuma regressão)
```

## T502 — revisão de design com print: **não fechada**

O spec de prints existe (`apps/frontend-transportada/test/spec-181-prints.smoke.spec.ts`) e roda
verde nos quatro cenários (375px e desktop, claro e escuro). **Os prints foram descartados**: eles
não mostram o card.

Causa: `mockTripWorkspaceApi` monta a viagem com `stops: []` — o dublê da tela do escritório nunca
teve paradas. Sem parada não há card de nota, e o seletor caiu no bloco de "Sugerir roteiro". Print
verde de conteúdo errado é pior que print nenhum, porque passa por evidência.

O único dublê com paradas é `driver-trip-smoke.helper.ts`, que é o app do **motorista** — outra tela,
não serve.

**Para fechar:** estender `trip-smoke.helper.ts` com uma viagem que tenha ao menos uma parada e uma
nota, cobrindo os estados que a spec reorganizou (carregada, devolvida com motivo, com ocorrência em
tratativa, sem perfil de emissão). Aí os quatro prints passam a valer.

⚠️ Registrado também o caminho que **não** funciona: servir o build em porta alternativa e
fotografar pelo navegador. O app redireciona para a URL do `.env` (53000), então o que aparece é a
árvore de outra sessão. Três tentativas em 23/09 antes de conferir `window.location.href`.
