# Tasks

## Fase 1 — A faixa

> 🤖 Modelo: `sonnet` (nenhuma task 🧠 — as decisões estão fechadas na spec)

- [x] **T1.1** Contrato **antes** do código: `stale-pending.contract.ts` (registrado em
      `driver-trip.contract.test.ts`) — evidência: vermelho (módulo `stalePending.service` inexistente).
- [x] **T1.2** Serviço, faixa, textos, CSS e ligação nas duas telas — evidência: T1.1 verde, typecheck e
      lint em exit 0.
- [x] **T1.3** Prova por mutação — evidência em `evidence.md`.
- [x] **T1.4** 🧠 Revisão de design: prints da faixa e da tela de pendências com a data, 375 px, claro e
      escuro, com um item envelhecido no IndexedDB do próprio app.
- [ ] **T1.5** Publicar em staging depois da aprovação do usuário nos prints.
