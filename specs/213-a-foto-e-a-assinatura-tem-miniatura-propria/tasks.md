# Tasks — Spec 213

> 🤖 Modelo: `sonnet` (correção de tela, sem decisão de arquitetura nova).

## T1 — Contrato vermelho, depois a correção

- Contrato (`test/driver-trip/proof-two-attachments.contract.ts`, importado em
  `test/driver-trip.contract.test.ts`): anexar foto e assinatura mantém as duas — cada uma com a
  própria chamada de `showPhoto` (`previewByKind[kind]`, nunca uma `photoPreview` compartilhada);
  remover a assinatura preserva o anexo de foto (`attached.photo` intacto); o lightbox abre pelo
  `kind` clicado (`openImageKind`), nunca por um `attachedKind` global.
- Implementação em `DriverStopCard.component.tsx` (`DeliveryProofSection`): duas instâncias de
  `usePhotoPreviewUrl()`, `attachedKey` por kind, `renderAttachedThumbnail(kind)` chamado uma vez
  por foto e uma vez por assinatura, `handleRemove(kind)` e `openImageKind`.
- Fecha com `bun run typecheck`, `bun run lint` e `bun run test` (dentro de
  `apps/frontend-driver`), e evidência em `evidence.md`.

## T2 — Revisão de design (web.md §15)

- Print do comprovante com foto e assinatura anexadas ao mesmo tempo, mostrando as duas
  miniaturas lado a lado, comparadas com o cartão vizinho (mesmo cartão, `stopMeta`, ícones).
- Registrar a limitação do `isProofQueued` por nota (não por kind) explicitamente na resposta ao
  usuário, sem inventar dado sobre a fila.
