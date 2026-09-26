# Tasks — Spec 203 (o attach nunca descarta)

> 🤖 Modelo: `sonnet`. Task única, sem fases — é o P0 citado nas specs 193/194/195/196.

- [x] **T1.1** Testes antes, vistos falhar (função/chave inexistentes):
  - `apps/frontend-driver/test/driver-trip/proof-attach-queue-first.contract.ts` (novo, importado
    em `test/driver-trip.contract.test.ts`): `attach()` sem `return` nenhum, `onProof` incondicional
    para foto e assinatura, aviso `role="status"` com `proofFields.pendingField`, wiring do
    `updateProofFields`/`onProofFieldsUpdate` até a página.
  - `apps/frontend-driver/test/driver-trip/offline-attachments.contract.ts` (estendido):
    `applyAttachmentReceiverFields` — atualiza só o documento certo, foto e assinatura juntas, não
    apaga campo já preenchido quando o novo vem `undefined`, sem grupo não altera nada.
- [x] **T1.2** Implementação:
  - `DriverStopCard.component.tsx`: `attach()` chama `onProof` sempre, antes de `blockedByFields`;
    novo `handleReceiverFieldBlur` chama `onProofFieldsUpdate` no blur dos campos de recebedor,
    só depois de `attached.photo || attached.signature`; os três avisos de campo faltante trocam
    `role="alert"` → `role="status"` e a chave de locale `requiredField` → `pendingField`; novo tipo
    `DriverProofFieldsUpdate`; prop `onProofFieldsUpdate?` roteada por `DriverStopCardProps` →
    `DocumentRowProps` → `DeliveryProofSectionProps` (conditional spread por causa de
    `exactOptionalPropertyTypes`).
  - `offlineAttachments.service.ts`: `applyAttachmentReceiverFields` (pura, casa por `documentId`).
  - `useDriverTrip.hook.ts`: `updateProofFields`, exposto em `DriverTripController`.
  - `DriverTripWorkspace.page.tsx`: `handleProofFieldsUpdate` conecta o hook ao `DriverStopCard`.
  - `driverTrip.locale.json` / `driverTrip.en.locale.json`: `proofFields.pendingField` (pt/en),
    `requiredField` removida.
- [x] **T1.3** Gates em primeiro plano — `bun run --cwd apps/frontend-driver check` (lint,
      typecheck, test, build) e `bun run --cwd apps/frontend-driver smoke` (porta 53112, sem tocar
      53200/53901). Números em `evidence.md`.
- [x] **T1.4** Legado (`apps/frontend-transportada`) conferido, **não** corrigido — mesmo defeito
      em `DriverStopCard.component.tsx:448-453`; registrado no `spec.md` e no relatório da sessão.

## Fora desta task

- **Campo preenchido depois de o anexo já ter subido** (grupo não existe mais em
  `attachmentStore`): fica para a spec 193 (D5), que cria o
  `PATCH /me/trips/current/documents/:documentId/proof/receiver`.
