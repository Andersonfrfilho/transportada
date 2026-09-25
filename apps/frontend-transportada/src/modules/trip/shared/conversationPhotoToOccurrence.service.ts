/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T702d (P7): a foto que o motorista mandou pela conversa vira foto da ocorrência. Nada de
 * rota nova: a foto é baixada pela URL temporária, reduzida pelo mesmo compressor da foto da
 * ocorrência (spec 161, até 400 KB + miniatura) e anexada pela rota que já existe — com o teto de
 * cinco, a etapa de separação e a retenção de cinco anos que ela já aplica. O objeto da conversa não
 * é reaproveitado de propósito: a expurga da foto da ocorrência apagaria bytes que a conversa ainda
 * mostra.
 */
import type { OccurrenceConversationAttachment } from '@/modules/occurrence-conversation/shared/occurrenceConversation.types'

import type { OccurrencePhotoAttachment } from './occurrencePhotoImage.service'

/** A chave do anexo: o segundo clique (ou o reenvio depois de uma queda) é o mesmo pedido. */
export function conversationPhotoIdempotencyKey(attachmentId: string): string {
  return `conversation-photo:${attachmentId}`
}

/** Só foto, e só na ocorrência de separação com a nota da viagem — é o que a rota da 161 aceita. */
export function isForwardableToOccurrence(
  attachment: Pick<OccurrenceConversationAttachment, 'contentType'>,
  occurrence: Readonly<{ stage: 'delivery' | 'separation' | null; tripDocumentId: null | string }>,
): boolean {
  return (
    attachment.contentType.startsWith('image/') &&
    occurrence.stage === 'separation' &&
    occurrence.tripDocumentId !== null
  )
}

export async function attachConversationPhotoToOccurrence(input: {
  readonly attach: (request: {
    readonly documentId: string
    readonly file: Blob
    readonly idempotencyKey: string
    readonly occurrenceId: string
    readonly thumbnail?: Blob
    readonly tripId: string
  }) => Promise<Readonly<{ id: string; position: number }>>
  readonly attachment: OccurrenceConversationAttachment
  readonly build: (file: File) => Promise<OccurrencePhotoAttachment>
  readonly download: (url: string) => Promise<Blob>
  readonly occurrence: Readonly<{ occurrenceId: string; tripDocumentId: string; tripId: string }>
}): Promise<Readonly<{ id: string; position: number }>> {
  const bytes = await input.download(input.attachment.url)
  const file = new File([bytes], input.attachment.fileName, { type: input.attachment.contentType })
  const photo = await input.build(file)
  return input.attach({
    documentId: input.occurrence.tripDocumentId,
    file: photo.original,
    idempotencyKey: conversationPhotoIdempotencyKey(input.attachment.id),
    occurrenceId: input.occurrence.occurrenceId,
    ...(photo.thumbnail === undefined ? {} : { thumbnail: photo.thumbnail }),
    tripId: input.occurrence.tripId,
  })
}
