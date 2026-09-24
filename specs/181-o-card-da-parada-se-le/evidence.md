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
