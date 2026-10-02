# Tasks

## Fase 1 — Despacho pela fila

> 🤖 Modelo: `sonnet` (nenhuma task 🧠 — as decisões estão fechadas na spec)

- [x] **T1.1** Contrato **antes** do código: `dispatch-queue.contract.ts` (registrado em
      `driver-trip.contract.test.ts`) — evidência: vermelho (o tipo `dispatch` não existia).
- [x] **T1.2** Tipo, cliente, visão da fila, tela e textos — evidência: T1.1 verde, typecheck e lint em
      exit 0.
- [x] **T1.3** Dublê do smoke com viagem `route_planned`, rota `/dispatch` e recusa; smokes de
      comportamento (sem sinal, com sinal, recusado) — evidência: 29 passed.
- [x] **T1.4** Prova por mutação — evidência em `evidence.md` (uma mutação sobreviveu e gerou o smoke de
      recusa).
- [x] **T1.5** 🧠 Revisão de design: prints do botão, do estado pendente e da tela de pendências, 375 px,
      claro e escuro.
- [ ] **T1.6** Publicar em staging depois da aprovação do usuário nos prints.
