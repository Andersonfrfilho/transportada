# Tasks

> 🤖 Modelo: `sonnet` — fix de escopo fechado pela spec, três apps, sem migration.

- [x] T001 Contratos antes, vermelho visto (evidência em `evidence.md`):
      `apps/api-transportada/test/trip-delivery-proof/proof-body-limit.contract.ts` (rota HTTP
      inteira: 1,1 MB → 413, 1000 KiB → 422, 950 KiB → 201),
      `apps/frontend-driver/test/driver-trip/proof-photo-recovery.contract.ts` e
      `apps/frontend-transportada/test/driver-trip/proof-photo-recovery.contract.ts` (régua, corrida,
      recuperação, teto). Entrypoints: `trip-delivery-proof.contract.test.ts` e
      `driver-trip.contract.test.ts` das duas apps.
- [x] T002 API: `DELIVERY_PROOF_MAX_BYTES = OFFICE_PROOF_MAX_BYTES` (D5).
- [x] T003 App do motorista: `encodeImageToJpeg`/`loadImageFromFile` expostos em
      `occurrencePhotoImage.service.ts` (a ocorrência segue em 1600/400 KiB);
      `proofPhotoReduction.service.ts` com a régua do canhoto e o teto (D1);
      `proofPhotoRecovery.service.ts` com a redução por item e a varredura (D3);
      `pendingReduction` e o pulo na drenagem em `offlineAttachments.service.ts` (D2); hook ligando
      marca na captura, varredura no boot e antes de cada drenagem.
- [x] T004 `/fila`: `rejectionCauseLabel.service.ts` e `eventQueue.cause.tooLarge` nos dois
      locales (D4). "2 MB" corrigido nos comentários.
- [x] T005 Legado `/minha-viagem`: a mesma régua (sobre `fieldDeliveryImage.service.ts`), a mesma
      trava e a mesma recuperação (D6).
- [x] T006 Gates: `check` e `smoke` da app do motorista, os dois comandos da API e
      `tsc`/`lint`/`test` do painel. Evidência em `evidence.md`.
