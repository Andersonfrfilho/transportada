# Tasks

## Fase 1 — Servidor indisponível não recusa o item

> 🤖 Modelo: `sonnet` (nenhuma task 🧠 — a decisão do `500` está fechada em D1)

- [x] **T1.1** Contrato **antes** da implementação no app novo —
      `apps/frontend-driver/test/driver-trip/retryable-status.contract.ts` (+ a linha em
      `driver-trip.contract.test.ts`) — evidência: vermelho pelo motivo certo (12 falhas, só os casos
      de indisponibilidade).
- [x] **T1.2** `isRetryableStatus` + `status` no `RESPONSE_INVALID` não-OK —
      `apps/frontend-driver/src/modules/driver-trip/shared/driverTripClient.service.ts` — evidência:
      T1.1 verde.
- [x] **T1.3** Contrato do legado, vermelho primeiro —
      `apps/frontend-transportada/test/driver-trip/retryable-status.contract.ts`.
- [x] **T1.4** Mesma classificação no legado (`toOutcome` exportado, `isRetryableStatus` no cliente) —
      evidência: T1.3 verde.

## Fase 2 — Ocorrência de nota sem foto vai pela fila

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Atualizar os contratos de roteamento antes do código —
      `occurrence-registration.contract.ts`, `occurrence.contract.ts` — evidência: vermelho.
- [x] **T2.2** Roteamento, cartão, página, cliente e locales (ver plan.md) — evidência: T2.1 verde e
      `grep registerDocumentOccurrence` vazio.
- [x] **T2.3** Sem rede o texto fica na fila; o reenvio repete a chave —
      `occurrence.contract.ts` — evidência: verde.

## Fase 3 — Fechamento

> 🤖 Modelo: `sonnet`

- [x] **T3.1** Prova por mutação (6 mutações) — evidência em `evidence.md`.
- [x] **T3.2** `typecheck`, `lint`, `bun run test` das duas apps e `prettier --check` —
      evidência em `evidence.md`.
- [x] **T3.3** 🧠 Revisão de design e usabilidade com o print do cartão da parada: a ocorrência de
      nota agora mostra o selo "na fila"/"enviada" em vez de "registrada às HH:MM"; conferir no
      preview local (`motorista-local` + `motorista-api-demo`) antes de subir a staging.
      — Feita em 02/10: o preview achou a cópia "com foto" (D7), corrigida; prints em `prints/`.
