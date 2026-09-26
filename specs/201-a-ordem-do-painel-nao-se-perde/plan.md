# Plano técnico — Spec 201

## Contexto e premissas

- Spec pequena, separada da 192 na revisão de 2026-09-25. Aplica a regra da spec 111 (D3/D4: a ordem
  é por chave de parada; ordem trocada nasce sem horário previsto) à sugestão de viagem única.
- Premissa conferida: o aceite de viagem única **reordena a viagem existente**, não cria viagem
  (`route-suggestion.use-case.ts:140-190`); escreve pela mesma porta do painel
  (`createTripStopOrderWriter` → `reorderTripStops`, `trip-stop-order.adapter.ts`), que não carrega o
  ator — a 192 acrescenta o ator ao mudar essa porta; a 201 não depende disso.
- Conferido: o aceite de viagem única não grava ETA (`writeEstimatedArrivals` só no compositor
  multi-veículo, `main.ts:2674`); o reorder dele não congela rota (`main.ts:2629` não passa
  `routeFreezer`) — quem congela é o `planRoute` com a `routeChoice`.

## Arquitetura e arquivos afetados

**API (`apps/api-transportada`)**

- `src/routing/presentation/route-suggestion-request.schema.ts:63-67`: `stopIds: z.array(z.uuid()).min(1).max(200).optional()`.
- `src/routing/application/route-suggestion.use-case.ts` (`accept`): valida o conjunto contra
  `found.stops` antes de qualquer escrita; usa a ordem enviada.
- `src/routing/domain/routing.error.ts` + `src/shared/errors/codes.ts`:
  `RouteSuggestionStopSetMismatchError` (`422 ROUTE_SUGGESTION_STOP_SET_MISMATCH`).

**Painel (`apps/frontend-transportada`)**

- `src/modules/routing/components/RouteSuggestionPanel.component.tsx:21`: `onAccept(order: readonly string[] | null)`.
- `RouteSuggestionSection.component.tsx:42`, `hooks/useRouteSuggestion.hook.ts:113`,
  `shared/routeSuggestionClient.service.ts:105-108`: corpo com `stopIds` só quando houver ordem manual.
- `src/modules/trip/components/TripStopList.component.tsx:153`: `KeyboardSensor` +
  `sortableKeyboardCoordinates`; anúncios traduzidos (locales `trip`).
- (T3, condicional) `useTripWorkspace.hook.ts`, `tripClient.service.ts:1258-1265`:
  `expectedStopOrderVersion`.

## Contratos/API/eventos

```
POST /trips/:id/route-suggestions/:suggestionId/accept     trip.manage
  body  { routeChoice?, stopIds?: uuid[1..200] }  .strict()
  422   ROUTE_SUGGESTION_STOP_SET_MISMATCH   (conjunto ≠ o da sugestão; nada escrito)
```

Resposta inalterada.

## Dados, migration e rollback

Sem migration.

## Segurança e tenant

Mesma política (`trip.manage`) e mesmo escopo de empresa do aceite de hoje. Contrato negativo: sugestão
de outra empresa segue `404`.

## Idempotência e concorrência

O aceite já é idempotente por `decide` (sugestão só passa a `accepted` uma vez) e escreve a ordem antes
de decidir (`route-suggestion.use-case.ts:159-163`). A validação nova vem antes de tudo, então não muda
a ordem das escritas.

## Observabilidade

Sem log novo; o `422` sai pelo filtro global.

## Estratégia de testes

- Contrato da rota (schema) e integração do aceite: CA01–CA04.
- Nota datada em `specs/079-a-viagem-se-acompanha-pela-tela/spec.md:18` (o teclado passou a existir
  na 201).
- Painel (sem DOM): hook e cliente (CA05); texto-fonte do sensor (CA06).

## Riscos

- Ordem de deploy: a API tem de estar em staging antes do front (T2 depois da T1 publicada).
- Choque com a 192, que mexe em `reorderTripStops` e no adaptador: rebase antes de cada task, e a
  T1 confere o estado de `trip-stop-order.adapter.ts` contra `origin/staging`.
