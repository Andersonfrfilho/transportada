# Tasks — Spec 205 (o registro tardio pesa como foto atrasada)

> 🤖 Modelo: `sonnet` para a execução; decisões D1–D5 já tomadas no `spec.md`.

- [x] **T1** Tolerância do painel primeiro (RF8): `lateRegistration` opcional nos validadores da
      linha do tempo e do comprovante (`hasKeys`), com contrato em
      `apps/frontend-transportada/test/trip/late-registration-tolerance.contract.ts`.
- [x] **T2** Contratos da API antes da implementação, vistos vermelhos:
  - `test/trip-delivery-proof/late-registration.contract.ts` (importado em
    `test/trip-delivery-proof.contract.test.ts`): política, parse dos três corpos, rotas `/me`,
    caso de uso do comprovante, baixa com dublê, idempotência.
  - `test/integration/me-trip.integration.ts` (já em `test:integration`): fluxo inteiro contra
    Postgres — evento, comprovante, nota, linha do tempo, leitura do comprovante e replay.
- [x] **T3** Migration aditiva `late_registration` em `trip_stop_events` e `trip_delivery_proofs`,
      com `rollback.sql`, `snapshot.json`, `make migration-test` e `db:generate` = `no_changes`
      (`20260926003822_late_registration`, depois da `20260926002743` da spec 193).
- [x] **T4** Implementação: schemas `.strict()` dos três corpos, rotas `/me`, baixa, comprovante,
      política de pontualidade, linha do tempo e leitura do comprovante.
- [x] **T5** Gates em primeiro plano: os dois comandos de teste da API, `bun run typecheck`,
      `bun run lint`, testes do painel. Evidência em `evidence.md`.
- [x] **T6** Achado da revisão da 206 (D6): a última baixa sem "Cheguei" preenche a chegada em todo
      canal — integração vista vermelha (CHECK `trip_stops_completed_requires_arrived_check`) e
      verde depois.
