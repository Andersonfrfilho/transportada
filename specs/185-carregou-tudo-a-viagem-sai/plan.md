# Plan — Feature 185

Caminhos relativos a `apps/api-transportada/src/` na API e `apps/frontend-transportada/src/` no
frontend, salvo indicação. Linhas são do mapeamento de 24/09 — confira antes de editar.

## D1 — Uma conta de "carga fechada", pura

`trips/domain/dispatch-readiness.policy.ts` (novo):

```ts
resolveDispatchReadiness({ documents }): {
  isCargoClosed: boolean          // toda viva loaded/delivered ou deixada para trás, e ≥1 loaded
  leftBehind: readonly { tripDocumentId, occurrenceTypeName }[]
  toLoad: readonly { tripDocumentId, separationStatus }[]   // pending/separated que não ficam
}
```

Entrada: notas vivas (`released_at is null`, fora `returned`) com status e, por nota, se há
ocorrência aberta de separação **de nota inteira** (`product_code = ''` e sem itens —
`occurrence-scope.policy.ts:38-52`) de tipo com `leaves_document_behind = true`. Nota `loaded` com
essa ocorrência continua carga (ela foi carregada).

A leitura dessas notas é uma query única (sem N+1) no repositório de despacho, ao lado de
`readPreconditions` (`trips/infrastructure/drizzle-trip-route.repository.ts:139-150`).

## D2 — Catálogo: `leaves_document_behind`

- Coluna `company_occurrence_types.leaves_document_behind boolean not null default false`
  (`database/trip.schema.ts:1898-1975`) + CHECK `stage = 'separation' or not leaves_document_behind`.
- Migration aditiva + `rollback.sql` (drop column). `make migration-test`.
- GET (`trips/infrastructure/delivery-proof-read.support.ts:745-763`) devolve; PUT
  (`trips/presentation/occurrence.schema.ts:272-312`) aceita opcional; `saveOccurrenceType` (:795-812)
  no molde de `attachmentMode`: ausente = não mexe. **Não** repetir o defeito de `redeliveryPolicy`.
- Tipo de entrega com `true` → 422 código novo em `shared/errors/codes.ts`.

## D3 — O despacho libera o que fica para trás, sem `force`

`dispatch-trip.use-case.ts:98-109` hoje exige `force` se houver não carregada. Passa a:

1. ler a prontidão (D1);
2. gates de roteiro e agendamento como hoje (`TRIP_HAS_NO_ROUTE`, `TRIP_HAS_UNSCHEDULED_STOPS`);
3. `toLoad` não vazio: sem `force` nem `loadRemaining` → 409 `TRIP_HAS_UNLOADED_DOCUMENTS` (como
   hoje); com `loadRemaining` → transiciona as de `toLoad` para `loaded` **na mesma transação**,
   antes do `dispatch()`; com `force` → comportamento de hoje (libera);
4. `leftBehind` é liberado sempre, por `releaseUnloadedDocuments` restrito a esses ids
   (`drizzle-trip-route.repository.ts:522-590`), com o motivo "Ocorrência: <tipo>" no snapshot.

`dispatch()` (:400-470) já roda numa transação com `FOR NO KEY UPDATE` e compare-and-set; as notas
de `loadRemaining` são travadas antes da viagem (ADR-0068 §2). Separar e carregar dentro do
despacho reusa a transição de nota (`trip-state.policy.ts` `checkTripDocumentTransition`) em vez de
escrever status à mão, e grava o evento de nota como o lote faz.

Rota: `POST /trips/:id/dispatch` body ganha `loadRemaining?: boolean` (mutuamente exclusivo com
`force` → 400). Documentar no OpenAPI.

## D4 — O gatilho automático

`trips/application/try-auto-dispatch-trip.use-case.ts` (novo), factory `createTryAutoDispatchTrip`:

- recebe `{ tripId, companyId, actorUserId, channel }`;
- se a viagem não está em `separating|loading|route_planned`, retorna `undefined`;
- lê D1; `!isCargoClosed` → `undefined`;
- chama `dispatchTrip` sem `force`/`loadRemaining`; erros `TripHasUnscheduledStopsError` e
  `TRIP_HAS_NO_ROUTE` viram `{ outcome: 'blocked', code, details }` (catch local permitido:
  fallback gracioso, code-standart §7); sucesso → `{ outcome: 'dispatched' }`; `unchanged` →
  `{ outcome: 'dispatched' }`.

Roda **depois** do commit da escrita da nota (transação própria): gate recusado não desfaz a carga.
Chamado por:

| Escrita                         | Onde                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| carregar nota                   | `trips/application/transition-trip-document.use-case.ts:88` (via `trip-lifecycle.use-case.ts:72-90`) |
| lote                            | `trips/application/transition-trip-documents-batch.use-case.ts:96-189`                               |
| WhatsApp (individual e "todas") | `main.ts:937-946`, `:962-971` — reusam os dois use cases acima                                       |
| ocorrência de separação         | `trips/application/register-trip-occurrence.use-case.ts:256-353`                                     |

A resposta HTTP de cada um ganha `autoDispatch` opcional. WhatsApp: mensagem de retorno cita
"viagem despachada" ou o bloqueio.

## D5 — Sem "Conferir carga"

`trips/domain/trip-allowed-actions.policy.ts`: `confirmLoad` sai da lista oferecida. A rota
`confirm-load` e `checkFieldStart` ficam. Contrato `allowed-actions` atualizado.

## D6 — Frontend

- `modules/trip/components/TripHeaderActions.component.tsx:112-121`: "Despachar" abre confirmação
  "Separar e carregar N notas e despachar?" (N = `toLoad` calculado no cliente pela mesma regra —
  função pura em `modules/trip/shared/dispatchReadiness.service.ts`, contrato espelhando D1) e chama
  `dispatch({ loadRemaining: true })`. Sem pendentes: confirmação simples. O diálogo de forçar com
  motivo sai daqui.
- Botão "Conferir carga" some (`TripHeaderActions` :94, :244) — segue a capacidade; remover o ramo.
  App do motorista: `modules/driver-trip` (procurar `confirmLoad`).
- `trip.constant.ts:89-149` `TRIP_FEEDBACK_KEY_BY_ERROR`: `TRIP_HAS_UNSCHEDULED_STOPS` e o motivo
  `TRIP_HAS_NO_ROUTE` com frases próprias; a de agendamento lista as paradas (`details.stopIds` →
  rótulo da parada).
- Mutations de carregar (linha e lote) leem `autoDispatch`: `dispatched` → aviso "Viagem
  despachada" + invalidação da viagem; `blocked` → frase do bloqueio.
- Catálogo de ocorrências (`OccurrenceTypeCatalogPanel.component.tsx`): `Checkbox` "A viagem segue
  sem a nota" só em tipo de separação.
- `TripProcessFlow`: fase "Despachada" depois de "Carregada".

## Testes

- Domínio: D1 tabela de casos (vivas, liberadas, devolvidas, ocorrência total/parcial, tipo
  desmarcado, zero carregadas).
- Contrato de rota: `loadRemaining` × `force` 400; `autoDispatch` na resposta; `allowed-actions`.
- Integração (banco): CA01–CA06, CA09 (duas cargas concorrentes).
- Frontend: contratos dos serviços puros + fonte dos componentes; prints (web.md §15).
