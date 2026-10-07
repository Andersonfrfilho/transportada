# Plan — spec 229

Só front-end do app do motorista. Sem backend, sem migration.

- `shared/stalePending.service.ts`: `resolveStalePending` (puro, sobre o `queueView` que a tela já tem)
  e `formatQueuedAt`.
- `components/DriverStalePendingNotice.component.tsx`: a faixa. Locale `stalePending.notice` (pt/en,
  singular e plural). CSS `.stalePendingNotice`.
- `DriverTripWorkspace.page.tsx`: calcula `stalePending` a cada render e mostra a faixa acima do banner
  "N aguardando envio". `DriverEventQueue.page.tsx`: a hora do item passa por `formatQueuedAt`.

## Riscos

- O cálculo usa `Date.now()` no render: a faixa aparece quando a tela redesenha (a viagem relê a cada
  30 s), não no segundo exato em que o item completa 24 h. Aceito.
- A faixa e o banner "N aguardando envio" levam ao mesmo lugar e aparecem juntos; é redundância
  deliberada (o banner conta tudo, a faixa destaca o antigo).
