# Feature 201 — A ordem do painel não se perde

Nasceu da revisão da spec 192 (2026-09-25): dois defeitos do painel que a 192 achou e que não são
dela. Nenhuma decisão de produto nova — aplica o precedente da spec 111 à viagem única.

## Problema e resultado

Medido no código em 25/09/2026:

1. **O aceite da sugestão de roteiro descarta a ordem arrumada à mão.** No painel da viagem, as setas
   do `RouteSuggestionPanel` trocam a ordem só na tela (`RouteSuggestionPanel.component.tsx:72-73`,
   :142-149, :217-234): o estado local `order` muda o mapa, a lista e apaga as estimativas. Mas
   `onAccept` não tem argumento (:21), `RouteSuggestionSection.component.tsx:42` chama
   `controller.accept()` e `useRouteSuggestion.hook.ts:113` manda só os ids
   (`routeSuggestionClient.service.ts:105-108`, `POST .../route-suggestions/:suggestionId/accept` sem
   corpo). O aceite **reordena a viagem que já existe** na ordem do solver
   (`route-suggestion.use-case.ts:155-168`, via `createTripStopOrderWriter`,
   `trip-stop-order.adapter.ts`) e replaneja a rota (:175-180). A API nem aceitaria a ordem:
   `acceptRouteSuggestionSchema` é `{ routeChoice? }.strict()` (`route-suggestion-request.schema.ts:63-67`).
   O comentário da :69 do painel ("a proposta só vira escrita quando alguém a aceita") promete o
   contrário do que acontece. A proposta multi-veículo já resolveu isso na spec 111
   (`stopOrderByVehicle`).
2. **O arraste das paradas não tem teclado.** `TripStopList.component.tsx:153` registra só
   `PointerSensor`; `KeyboardSensor`/`sortableKeyboardCoordinates` não existem no repositório. A alça
   tem `aria-label` (`stops.reorderHandle`, :308-316), então o leitor de tela anuncia um controle que o
   teclado não opera. A spec 079 (`spec.md:18`) afirma que o `@dnd-kit` foi "escolhido por
   acessibilidade de teclado" — a 201 torna isso verdade e corrige a frase com nota datada.

**Resultado:** o aceite leva a ordem que o operador arrumou; o arraste funciona por teclado (Espaço,
setas, Espaço; `Esc` cancela).

## Fora do escopo

- Qualquer mudança depois do despacho (é a spec 192).
- Mover parada entre viagens na sugestão de viagem única.
- A versão da ordem (`expectedStopOrderVersion`) no `PATCH` do painel — só entra se a 192 já estiver
  em staging (T3, condicional).

## Histórias priorizadas

### P1 — O aceite respeita a ordem arrumada

**Given** uma sugestão pronta para a viagem em `route_planned` **When** o operador troca duas paradas
pelas setas e aceita **Then** a viagem fica na ordem que ele arrumou, e a rota congelada é a dessa
ordem.

### P2 — Reordenar sem mouse

**Given** a lista de paradas de uma viagem editável **When** o operador foca a alça, aperta Espaço,
usa as setas e aperta Espaço **Then** a parada muda de lugar e a ordem é gravada, como no arraste.

## Requisitos funcionais

- **RF1** `POST /trips/:id/route-suggestions/:suggestionId/accept` aceita `stopIds?: uuid[]` além de
  `routeChoice?` (`.strict()` mantido). Presente: tem de ser o mesmo conjunto das paradas da sugestão
  (sem repetição), senão `422 ROUTE_SUGGESTION_STOP_SET_MISMATCH` **antes** de qualquer escrita e antes
  de a sugestão ser consumida. Ausente: o comportamento de hoje.
- **RF2** Com `stopIds`, a escrita usa essa ordem e o `planRoute` do aceite
  (`route-suggestion.use-case.ts:175-180`) congela a rota **dessa** ordem. O aceite de viagem única não
  grava ETA hoje — `writeEstimatedArrivals` só é chamado pelo compositor multi-veículo
  (`main.ts:2674`, `trip-composer.adapter.ts:141`) — e a 201 não muda isso.
- **RF2a** O texto "a distância será recalculada quando a proposta for aceita"
  (`routing.locale.json:15`, `reorderedEstimates`) passa a ser verdade; a regra da 079 T024 (número
  velho nunca ao lado de ordem nova, `test/routing/reorder-proposal.contract.ts:53`) continua.
- **RF3** O painel manda `stopIds` só quando `order !== null` (houve toque nas setas); sem toque, o corpo
  de hoje.
- **RF4** `TripStopList` registra `KeyboardSensor` com `sortableKeyboardCoordinates` ao lado do
  `PointerSensor`, e os anúncios de acessibilidade do dnd-kit em pt-BR/en.
- **RF5** (condicional à 192 em staging) o `PATCH /trips/:id/stops/order` do painel manda
  `expectedStopOrderVersion` lido do detalhe; `409 STOP_ORDER_VERSION_CONFLICT` recarrega a viagem e
  avisa.

## Requisitos não funcionais

- A API sobe **antes** do front (corpo `.strict()`: o front novo contra a API velha daria `400`).
- Nenhuma escrita parcial: conjunto errado não consome a sugestão nem toca na viagem.

## Casos extremos e falhas

- A viagem ganhou ou perdeu parada entre a sugestão e o aceite: o `reorderTripStops` já recusa com
  `422 TRIP_STOP_SET_MISMATCH` (`reorder-trip-stops.use-case.ts:62-68`) e a sugestão fica `ready`.
- Viagem despachada entre a sugestão e o aceite: `409 ROUTE_SUGGESTION_TRIP_DISPATCHED`, como hoje.
- Parada da sugestão com `stopId` nulo (`route-suggestion.use-case.ts:155-157` filtra): fora do
  conjunto comparado, como hoje.

## Critérios de aceite

- **CA01** Aceite com `stopIds` em outra ordem → viagem na ordem enviada; sugestão `accepted`.
- **CA02** Aceite com `stopIds` faltando ou sobrando parada → `422`, viagem intacta, sugestão `ready`.
- **CA03** Aceite sem corpo → ordem do solver (regressão).
- **CA04** A rota congelada no aceite com `stopIds` é a da ordem enviada (a distância gravada difere da
  proposta do solver quando a ordem muda), com a `routeChoice` pedida.
- **CA05** Hook do painel: com setas tocadas, o cliente manda `stopIds`; sem, manda o corpo de hoje.
- **CA06** Contrato de texto-fonte: `KeyboardSensor` e `sortableKeyboardCoordinates` no
  `TripStopList`.

## Dúvidas

Nenhuma bloqueante.
