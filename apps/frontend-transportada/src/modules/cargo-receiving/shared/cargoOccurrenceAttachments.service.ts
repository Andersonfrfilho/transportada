/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CargoOccurrenceAttachment,
  CargoOccurrenceView,
  CargoOccurrencesView,
} from './cargoOccurrence.types'

/** A assinatura anterior só vale como `src` enquanto faltar mais do que isto: a miniatura não pode morrer na tela. */
export const CARGO_ATTACHMENT_URL_SAFETY_MARGIN_MS = 2 * 60_000

type StabilizeInput = Readonly<{
  next: CargoOccurrencesView
  now: number
  previous: CargoOccurrencesView | undefined
}>

function isStillSafe(input: Readonly<{ attachment: CargoOccurrenceAttachment; now: number }>) {
  const { attachment, now } = input
  if (attachment.expired || attachment.expiresAt === undefined) return false
  return Date.parse(attachment.expiresAt) - now > CARGO_ATTACHMENT_URL_SAFETY_MARGIN_MS
}

function inheritUrls(
  input: Readonly<{
    next: CargoOccurrenceAttachment
    now: number
    previous: CargoOccurrenceAttachment | undefined
  }>,
) {
  const { next, now, previous } = input
  if (previous === undefined || next.expired || !isStillSafe({ attachment: previous, now })) {
    return next
  }
  return {
    ...next,
    ...(previous.downloadUrl === undefined ? {} : { downloadUrl: previous.downloadUrl }),
    ...(previous.expiresAt === undefined ? {} : { expiresAt: previous.expiresAt }),
    ...(previous.thumbnailUrl === undefined ? {} : { thumbnailUrl: previous.thumbnailUrl }),
  }
}

function stabilizeOccurrence(
  input: Readonly<{
    now: number
    occurrence: CargoOccurrenceView
    previous: CargoOccurrenceView | undefined
  }>,
): CargoOccurrenceView {
  const { now, occurrence, previous } = input
  if (previous === undefined) return occurrence
  const previousById = new Map(
    previous.attachments.map((attachment) => [attachment.id, attachment]),
  )
  return {
    ...occurrence,
    attachments: occurrence.attachments.map((attachment) =>
      inheritUrls({ next: attachment, now, previous: previousById.get(attachment.id) }),
    ),
  }
}

/**
 * Cada leitura traz URLs assinadas NOVAS, e a lista é relida a cada 20 s: com o `src` trocado a cada vez, o
 * navegador baixava todas as miniaturas de novo. Mesmo anexo (`id`) e assinatura anterior com folga: a URL de antes
 * fica, e o resto da leitura (tratativa, marcação, contagens) é sempre o novo.
 */
export function stabilizeOccurrenceAttachments(input: StabilizeInput): CargoOccurrencesView {
  const { next, now, previous } = input
  if (previous === undefined) return next
  const previousById = new Map(
    previous.occurrences.map((occurrence) => [occurrence.id, occurrence]),
  )
  return {
    ...next,
    occurrences: next.occurrences.map((occurrence) =>
      stabilizeOccurrence({ now, occurrence, previous: previousById.get(occurrence.id) }),
    ),
  }
}
