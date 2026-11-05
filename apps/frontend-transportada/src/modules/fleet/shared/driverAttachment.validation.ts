/* Copyright (c) 2026 Ada Technology. MIT License. */

/** A ordem é a da tela: o documento que a ficha mais usa primeiro. */
export const DRIVER_ATTACHMENT_TYPES = [
  'cnh',
  'identity_document',
  'address_proof',
  'other',
] as const
export type DriverAttachmentType = (typeof DRIVER_ATTACHMENT_TYPES)[number]

/** Só o que `fleet.read` enxerga: que o documento existe, de que tipo, quando e de quem. Sem conteúdo. */
export type DriverAttachment = Readonly<{
  createdAt: string
  /** Há leitura da CNH ainda por decidir; o que foi lido só vem por `fleet.manage`. */
  hasSuggestion: boolean
  id: string
  type: DriverAttachmentType
  uploadedBy: Readonly<{ id: string; name: null | string }>
}>

/**
 * O teto do transporte da API (`FLEET_DRIVER_ATTACHMENT_MAX_BYTES`): conferir aqui poupa a ida, e a API
 * recusa do mesmo jeito. Os dois números andam juntos.
 */
export const DRIVER_ATTACHMENT_MAX_BYTES = 1_572_864

export const DRIVER_ATTACHMENT_ACCEPT = 'application/pdf,image/jpeg,image/png'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isDriverAttachmentType(value: unknown): value is DriverAttachmentType {
  return (DRIVER_ATTACHMENT_TYPES as readonly unknown[]).includes(value)
}

function isDriverAttachment(value: unknown): value is DriverAttachment {
  if (!isRecord(value) || !isRecord(value.uploadedBy)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.hasSuggestion === 'boolean' &&
    isDriverAttachmentType(value.type) &&
    typeof value.uploadedBy.id === 'string' &&
    (value.uploadedBy.name === null || typeof value.uploadedBy.name === 'string')
  )
}

/** `{ data: anexo[] }`. */
export function isDriverAttachmentListResponse(
  value: unknown,
): value is Readonly<{ data: readonly DriverAttachment[] }> {
  return isRecord(value) && Array.isArray(value.data) && value.data.every(isDriverAttachment)
}

/** `{ data: { url } }` — o link assinado de vida curta; nunca o corpo do arquivo. */
export function isDriverAttachmentRevealResponse(
  value: unknown,
): value is Readonly<{ data: Readonly<{ url: string }> }> {
  return isRecord(value) && isRecord(value.data) && typeof value.data.url === 'string'
}

/** `{ data: anexo }` — o que a API devolve ao anexar. */
export function isDriverAttachmentResponse(
  value: unknown,
): value is Readonly<{ data: DriverAttachment }> {
  return isRecord(value) && isDriverAttachment(value.data)
}
