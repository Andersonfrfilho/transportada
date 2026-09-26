/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { QueuedAttachment } from './offlineAttachments.service'

/**
 * Pedido do usuário (26/09): toda foto sai leve do aparelho. O canhoto subia no tamanho da câmera
 * (3–5 MB) e a API recusa acima de 2 MB — a foto ficava presa na fila como recusada. Só a **foto**
 * reduz: assinatura já é PNG pequeno, e PDF anexado não é imagem.
 */
export function shouldReduceProofFile(input: { file: File; kind: string }): boolean {
  return input.kind === 'photo' && input.file.type.startsWith('image/')
}

/**
 * Troca o arquivo do anexo ainda na fila pela versão reduzida, pela `attachmentKey` — no molde de
 * `applyAttachmentLocation`. Anexo que já saiu da fila fica como está: nada a trocar.
 */
export function replaceAttachmentBlob(input: {
  attachmentKey: string
  blob: Blob
  fileName: string
  items: readonly QueuedAttachment[]
}): readonly QueuedAttachment[] {
  return input.items.map((item) =>
    item.attachmentKey === input.attachmentKey
      ? { ...item, blob: input.blob, fileName: input.fileName }
      : item,
  )
}
