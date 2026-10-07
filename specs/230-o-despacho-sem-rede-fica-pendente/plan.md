# Plan — spec 230

Só front-end do app do motorista. Sem backend, sem migration: a rota `/dispatch` não muda.

- `driverTrip.types.ts`: novo `DriverFieldReport` `dispatch`.
- `driverTripClient.service.ts`: `reportPath`/`reportBody` ganham `dispatch`; `dispatchTrip` sai.
- `eventQueueView.service.ts`: o item da fila carrega `tripId` quando é despacho.
- `DriverTripWorkspace.page.tsx`: o botão chama `driverTrip.report(...)` (sem esperar GPS); `isDispatchQueued`
  / `isDispatchRejected` saem da fila e derivam `isTripAwaitingDispatch`; `isDispatching` e
  `dispatchFailed` (estado local) saem.
- Locales: `dispatch.queued`, `eventQueue.kind.dispatch`. `DriverEventQueue.page.tsx`: rótulo do tipo.

## Testes

Contrato `dispatch-queue.contract.ts` (rota, corpo, resultados, ordem na drenagem, visão, ligação da
tela); `dispatch.contract.ts` ajustado. Smoke: viagem `route_planned` no dublê, despacho sem sinal →
pendente → libera o campo → sobe antes do resto; despacho com sinal; despacho recusado.

## Riscos

- Despacho pendente + itens de campo atrás: se o servidor recusar o despacho (viagem cancelada,
  reatribuída), o que veio depois é recusado também. Visível na tela de pendências, item a item.
- O motorista pode sair achando que despachou: o aviso e o selo existem para impedir isso; o escritório
  só vê a viagem despachada quando o item sobe.
