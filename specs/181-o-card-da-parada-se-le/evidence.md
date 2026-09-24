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
