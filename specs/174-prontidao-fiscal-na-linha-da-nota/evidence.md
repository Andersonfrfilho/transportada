# Evidência — spec 174, prontidão fiscal na linha da nota

Branch `feat/occurrence-item-readability`, base `088f5a0d3` (`origin/staging`), worktree
`/private/tmp/claude-502/.../wtdesign`.

## O que mudou

- `apps/frontend-transportada/src/modules/trip/components/TripStopList.component.tsx`: a linha da
  nota (`TripStopDocumentRow`) ganhou o selo de estado fiscal (ícone `@/components/ui/icon` +
  texto, explicação por `@/components/ui/tooltip`) e a ação "Gerar CT-e" própria da nota, com a
  mesma regra de aceitação do lote (`canGenerateCteForDocument`). `TripStopDocumentActions` recebeu
  `canSubmitCte`, `fiscalReadinessByDocumentId`, `isGeneratingCte`, `onGenerateCte`.
- `apps/frontend-transportada/src/modules/trip/components/TripFiscalReadinessPanel.component.tsx`:
  removida a lista de notas pendentes (`readinessList`/`pending`) e a prop `documents`, que só
  existia para nomear as linhas dessa lista. O painel manteve resumo, estado, dispensa de MDF-e e o
  disparo de lote da viagem inteira — inalterados.
- `apps/frontend-transportada/src/modules/trip/components/TripDetail.component.tsx`: monta
  `fiscalReadinessByDocumentId` a partir de `workspace.fiscalReadiness.documents` e repassa
  `canSubmitCte`/`isGeneratingCte`/`onGenerateCte` para `documentActions`; parou de passar
  `documents` para o painel.
- `apps/frontend-transportada/src/modules/trip/shared/cteSelection.service.ts`: nova
  `canGenerateCteForDocument`, que reusa `PENDING_CTE_REASONS` — a mesma lista que já decide a
  seleção em massa.
- `apps/frontend-transportada/src/modules/trip/styles/trip.module.css`: `.fiscalStatusBadge`,
  `.fiscalStatusBadgeAlert` (rejeição/cancelamento) e `.fiscalStatusText` (corte por CSS da
  mensagem longa da SEFAZ).
- Locales (`trip.locale.json`, `trip.en.locale.json`): `readiness.reason.city_unknown` e
  `readiness.reason.nfse_expected` (faltavam — a lista removida os usava sem tradução) e
  `actions.generateCte`.
- Testes: `test/trip/fiscal-readiness-row.contract.ts` (novo, registrado em
  `test/trip.contract.test.ts`) cobre `canGenerateCteForDocument` e as garantias de fonte (tooltip
  em vez de `title`, ação por nota, permissão, remoção da lista do painel).
  `test/trip/document-identity.contract.ts` foi ajustado: a asserção de que a prontidão fiscal usa
  `tripDocumentLabel` migrou para a linha da parada, que é quem nomeia a nota agora (RF5).

## O que ficou fora, de propósito

- `TripDetail.component.tsx`, `TripHeaderActions.component.tsx`, `TripPendingMeasurements*`,
  `trip-financials/**`, `company-settings/**`, API — território de outras sessões (spec 168 e
  outras), não tocados.
- Marcador de ocorrência aberta da spec 173 (`hasOpenOccurrenceMarker`,
  `stop.hasOpenOccurrence`, `openOccurrenceBadge`) preservado sem alteração.
- A seleção em massa e "Gerar CT-e de N notas marcadas" (`TripStateActions`,
  `selectPendingCteDocumentIds`) não foram tocados — já existiam e já filtram.
- **Reason `ok` não ganha selo na linha** (nem quando o documento espera CT-e e já o tem):
  decisão de leitura do caso extremo "viagem inteira pronta → a lista não mostra selo nenhum" —
  ausência de selo é sinal de sucesso, e mostrar "CT-e autorizado" em toda nota de uma viagem
  100% pronta seria a mesma repetição de que a spec está tirando a tela.

## Gates (de `apps/frontend-transportada`)

```
$ bun run typecheck
$ tsc --noEmit
(saída vazia — sem erro)

$ bun run lint
$ eslint .
(saída vazia — sem erro)

$ bun run test
...
4989 pass
0 fail
38577 expect() calls
Ran 4989 tests across 29 files.
...
(bun run test:hooks)
44 pass
0 fail
164 expect() calls
Ran 44 tests across 1 file.
```

Os "act(...)" warnings do `test:hooks` são ruído pré-existente do harness de hooks sem DOM real —
não vêm desta mudança (nenhum arquivo de `test/trip-hooks/**` foi tocado) e não afetam o resultado
(0 fail).

## O que NÃO rodou, e por quê

- **CA07 (revisão de design com print, 375px e desktop)**: não rodei o `make dev`/preview neste
  worktree para tirar print real da tela — o ambiente desta sessão não tem a infra Docker deste
  monorepo disponível de forma isolada dentro do prazo desta tarefa, e o worktree é compartilhado
  com outras sessões ativas (spec 168 e outras), o que tornou arriscado subir `make up`/`make dev`
  aqui sem coordenação. Documentando como pendência explícita: falta o print em 375px e desktop
  mostrando o selo fiscal na linha da nota (contraste normal e linha marcada) antes de considerar a
  CA07 fechada. Recomendo rodar isso numa sessão com a infra local disponível, ou pedir para o
  orquestrador (`main`) tirar o print depois que os territórios dos outros agentes também
  fecharem, para evitar layout quebrado por trabalho alheio ainda incompleto.
- Testes de integração/E2E da API não rodaram — a tarefa é só frontend e não toca
  `apps/api-transportada`.

## Hash

Gates rodados em `088f5a0d32d5732eaeaedbbecfb0a52a99c82fe4` (base) + as mudanças acima, ainda não
commitadas nesta sessão.
