/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isOccurrencePdfMimeType } from './occurrencePhotoImage.service'
import type { OccurrenceAttachment } from './trip.types'

/**
 * Spec 161 T24 (RF14/D2): a grade nunca passa de cinco fotos — o teto existe justamente para
 * dispensar "ver mais" e paginação.
 */
export const OCCURRENCE_ATTACHMENT_GRID_LIMIT = 5

export function capOccurrenceAttachments(
  attachments: readonly OccurrenceAttachment[],
): readonly OccurrenceAttachment[] {
  return attachments.slice(0, OCCURRENCE_ATTACHMENT_GRID_LIMIT)
}

export type OccurrenceAttachmentDisplay =
  | Readonly<{ kind: 'document'; url: string }>
  | Readonly<{ kind: 'expired' }>
  | Readonly<{ isThumbnail: boolean; kind: 'image'; src: string }>
  | Readonly<{ kind: 'unavailable' }>

/**
 * Spec 161 T24 (RF9/RF10/RF11/RF32/RF32b, CA6b): decide o que a grade desenha para um anexo.
 * `expired: true` nunca vira `<img>` (D11) — some antes de olhar para as URLs. A miniatura é o
 * que a lista pede; o original só entra aqui quando não há miniatura (foto de WhatsApp, D14) —
 * abrir a foto em tela cheia usa sempre o original, resolvido à parte por
 * `resolveOccurrenceAttachmentOriginal`.
 */
export function resolveOccurrenceAttachmentDisplay(
  attachment: OccurrenceAttachment,
): OccurrenceAttachmentDisplay {
  if (attachment.expired) return { kind: 'expired' }
  /** PDF não tem miniatura e nunca vira `<img>`: o ícone `document` é o que a leitura desenha. */
  if (isOccurrencePdfMimeType(attachment.mimeType)) {
    return attachment.downloadUrl === undefined
      ? { kind: 'unavailable' }
      : { kind: 'document', url: attachment.downloadUrl }
  }
  if (attachment.thumbnailUrl !== undefined) {
    return { isThumbnail: true, kind: 'image', src: attachment.thumbnailUrl }
  }
  if (attachment.downloadUrl !== undefined) {
    return { isThumbnail: false, kind: 'image', src: attachment.downloadUrl }
  }
  return { kind: 'unavailable' }
}

/** RF11: a foto em tela cheia é sempre o original — nunca a miniatura. */
export function resolveOccurrenceAttachmentOriginal(
  attachment: OccurrenceAttachment,
): null | string {
  return attachment.downloadUrl ?? null
}
