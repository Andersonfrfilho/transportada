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

## T502 — revisão de design com print: **fechada**

A causa registrada na tentativa anterior era dupla, e as duas foram corrigidas.

**1) O dublê não tinha parada.** `mockTripWorkspaceApi` (`trip-smoke.helper.ts`) só sabia montar
viagem com `stops: []` — sem parada não há card de nota nenhum para fotografar. Ganhou um quarto
modo, `'stop-card-states'`, com uma parada (`Barracão Sintético`) e três notas cobrindo os quatro
eixos de selo que a spec 181 reorganizou:

- `901/1` — **carregada**, simples, com as três ações de campo liberadas via `allowed-actions`
  (`fieldDelivery`/`fieldOccurrence`/`fieldReturn`) e `trip.report-on-behalf` na lista de permissões
  da spec de prints: é o botão "Marcar entregue" que só aparece com a capacidade **e** a permissão
  juntas.
- `902/1` — **devolvida com motivo** (`separationStatus: 'returned'`, `returnReason:
  'recipient_absent'`): o selo compõe "Devolvida · Ausente" (RF3/CA03), e por ter `returnedAt`
  também expõe o toggle "Comprovante" (a outra expansão do card).
- `903/1` — **ocorrência em tratativa** (`openOccurrenceCase: true`) e **sem perfil de emissão**
  (`fiscalReadiness.reason: 'no_profile'`) ao mesmo tempo — os outros dois eixos de selo (RF2/CA02 e
  a prontidão fiscal) — mais contato e regra de frete para o toggle "Detalhes da nota" (T304) e
  mercadoria (`nfeTotalValue`) para o grupo "Carga" da linha.

Os tipos `TripDocumentDetailContract`/`TripStopDetailContract` (`test/trip/trip.fixture.ts`) só
tinham `cteAuthorized`/`fiscalStatus` além dos campos de sempre — ganharam, de forma aditiva, os
mesmos campos opcionais que `TripDocumentDetail`/`TripStopDetail` do app já tinham (`contact`,
`freightAmount`, `freightRuleName`, `freightSource`, `nfeIssuedAt`, `nfeNumber`, `nfeSeries`,
`nfeTotalValue`, `openOccurrenceCase`, `hasOpenOccurrence`). Nenhum uso existente desses tipos
(`occupancy-optional.contract.ts`, o próprio `trip-smoke.helper.ts`) preenchia esses campos, então a
extensão não muda nenhum teste que já passava.

**2) O seletor caiu no bloco errado.** `page.locator('section', { hasText: 'Paradas' })` não mirava
no rótulo de verdade da seção (`stops.title` = "Cargas da viagem" — "Paradas" não aparece ali).
Substituído por `page.locator('#trip-stops-title').locator('xpath=ancestor::section[1]')`, que sobe
do título ao `<section>` mais próximo. A primeira tentativa de correção, `section:has(#trip-stops-
title)`, ainda errava: `:has()` também casava a `<section>` externa que envolve a página inteira
(ela também "tem" o título como descendente), trazendo junto o aviso de geocodificação do mapa da
rota logo abaixo ("Sem localização no mapa: Barracão Sintético") — só apareceu ao rodar o smoke, não
no code review.

Os quatro prints foram abertos e conferidos um a um (não só "smoke verde"): todos mostram a parada
com as três notas, os selos de pipeline (`CARREGADA`/`DEVOLVIDA · AUSENTE`/`PENDENTE`), o selo de
ocorrência em tratativa, o selo "sem perfil de emissão", o resumo "1 nota com ocorrência" no
cabeçalho da parada, os grupos "Carga"/"Frete"/"Emissão"/"Destinatário" e os dois toggles de
expansão ("Comprovante"/"Detalhes da nota") — nas duas larguras e nos dois temas.

```
bunx tsc --noEmit                                                              → 0 erros
bunx eslint test --max-warnings=0                                              → 0 problemas
bun test ./test/trip.contract.test.ts                                         → 1587 pass, 0 fail
PLAYWRIGHT_TEST_MATCH=spec-181-prints.smoke.spec.ts bun run smoke              → 4 passed
bun run smoke (suíte inteira, sem PLAYWRIGHT_TEST_MATCH)                       → 59 passed, 1 failed*
```

\* A falha (`responsive.smoke.spec.ts:1449` — distribuição multi-veículo) não tem nada a ver com
esta mudança: não usa `trip-smoke.helper.ts` nem a viagem de `stops`. Isolada com
`-g "distribuição multi-veículo"`, passou (1 passed) — instabilidade da suíte sob carga (já
registrada em memória de sessão), não regressão desta task.

Prints em `specs/181-o-card-da-parada-se-le/prints/`: `card-parada-mobile-light.png`,
`card-parada-mobile-dark.png`, `card-parada-desktop-light.png`, `card-parada-desktop-dark.png`.

⚠️ Continua registrado o caminho que **não** funciona: servir o build em porta alternativa e
fotografar pelo navegador. O app redireciona para a URL do `.env` (53000), então o que aparece é a
árvore de outra sessão. Três tentativas em 23/09 antes de conferir `window.location.href`.
