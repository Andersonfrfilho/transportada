# Plan — spec 227

Sem backend e sem migration. Duas mudanças por app.

## Remover o prazo (D1)

`offlineAttachments.service.ts`: sai o bloco `ATTACHMENT_DISCARD_AFTER_MS` →
`discardStaleAttachments`. `pendingQueue.service.ts`: sai o `continue` que ignorava anexo antigo na
contagem. `useDriverTrip.hook.ts`: o efeito de abertura passa a `refreshQueueView()` →
`recoverProofPhotos()`. Nas duas apps.

## Descarte com ciência no app novo (D2, D3)

Cópia por valor do legado (ADR-0075 §7): `queueDiscard.service.ts`, `isEventQueueItemDiscardable` em
`eventQueueView.service.ts`, `discardRejected` no hook, `onDiscard` + estado de confirmação em
`DriverEventQueue.page.tsx`, chaves `eventQueue.discard.*` nos dois locales e quatro classes de CSS.

## Riscos

- O selo e a contagem agora incluem anexo antigo: motorista que tinha lixo velho invisível passa a
  vê-lo. É o objetivo.
- Item recusado por 5xx não tem "Descartar" (D3); sai quando uma tentativa manual sobe.
