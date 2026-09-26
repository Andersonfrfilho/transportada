# Feature 213 — A foto e a assinatura têm miniatura própria

> Registrada em 2026-09-26, a partir de um defeito relatado pelo usuário: "anexei uma foto e uma
> assinatura; em vez de ter duas miniaturas, uma entrou no lugar da outra."
>
> **Numeração.** Conferida em 2026-09-26 com `git log --all --format=%h -- 'specs/21*'` e `ls specs`:
> a última é a 212. Esta é a **213**.

## Assunto já tratado em

- **207**: deu ao comprovante "Concluir", "Ver" e "Remover" — é a task que introduziu o estado hoje
  singular (`attachedKind`, `attachedKey`, `isRemoved`, `isImageOpen`) em
  `DeliveryProofSection` (`DriverStopCard.component.tsx`). 207 já fechou e está em produção
  (commit `8f01f00e8`); este defeito é posterior a ela, não uma task pendente dela.
- **211**: soma até 4 fotos de mercadoria (`kind: 'cargo'`) por nota — ainda só spec, sem código.
  A comparação confirma que o comprovante já é modelado, no banco e na fila, como **anexos
  distintos por nota** (`attachmentKey`, `kind: 'photo' | 'signature'`); só a tela do motorista
  colapsava os dois em um estado só.

## Problema, medido no código

Em `DeliveryProofSection` (`apps/frontend-driver/src/modules/driver-trip/components/DriverStopCard.component.tsx`):

- `usePhotoPreviewUrl()` era chamado **uma vez**, e guardava uma única URL `blob:`; anexar a
  assinatura depois da foto revogava a URL da foto e a substituía.
- `attachedKind`, `attachedKey` e `isImageOpen` eram singulares — só o anexo anexado por último
  tinha miniatura, texto, "Ver" e "Remover" na tela, mesmo com os dois na fila.
- `handleRemove()` zerava os dois kinds de uma vez (`setAttached({ photo: false, signature: false
})`), então "Remover" na única miniatura visível também apagava o outro anexo, sem ele nunca ter
  tido uma tela própria.

A fila (`eventQueueView.service.ts`), a API e `removeQueuedAttachmentByKey` já tratavam os dois como
itens independentes por `attachmentKey` — o defeito era só na renderização.

## Resultado

- Duas instâncias de `usePhotoPreviewUrl()` (uma por kind) — cada anexo revoga só a própria URL.
- `attachedKey: { photo?: string; signature?: string }`; `attachedKind` e `isRemoved` saem, porque
  `attached[kind]` já basta para decidir se aquele kind tem anexo.
- `renderAttachedThumbnail(kind)` — chamada uma vez por foto e uma vez por assinatura: cada uma com
  a própria miniatura, texto ("Foto do canhoto anexada" / "Assinatura colhida"), "Ver" e "Remover".
  Quando só um existe, só um aparece.
- `openImageKind: 'photo' | 'signature' | undefined` — o lightbox abre a imagem do kind clicado.
- `handleRemove(kind)` remove só aquele anexo, pela própria `attachmentKey`; o outro fica intacto.
- `attach()` continua sem apagar o outro kind (já não apagava; ficou explícito por não haver mais
  estado compartilhado entre os dois).

## Limitação registrada, sem inventar dado

`isProofQueued` (decide se "Remover" aparece) continua **por nota**, não por kind: a fila
(`eventQueueView.service.ts`) agrupa os anexos órfãos (`kind: 'proof'`) por evento/`documentId`, sem
expor se especificamente a foto ou a assinatura daquele documento ainda está na fila. Corrigir isso
exigiria mudar o agrupamento da fila (`buildEventQueueView`), fora do escopo deste defeito de tela —
registrado aqui para uma spec futura decidir se vale a pena.

## Fora do escopo

- Mudar `eventQueueView.service.ts` para expor o `kind` do anexo pendente (limitação acima).
- Qualquer coisa da spec 211 (fotos de mercadoria) — que ainda não tem código.
