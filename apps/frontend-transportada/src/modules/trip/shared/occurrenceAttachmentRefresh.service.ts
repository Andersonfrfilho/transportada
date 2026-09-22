/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OccurrenceAttachment } from './trip.types'

/**
 * A URL assinada do anexo vive cinco minutos (`DOWNLOAD_EXPIRES_IN_SECONDS` da API). Uma tela
 * aberta por mais tempo — ou uma lista carregada antes de um deploy — segue com a URL velha, o
 * `<img>` responde 403 e a foto vira "não foi possível carregar" para sempre. Aqui mora a decisão
 * de buscar as URLs de novo, e o teto que impede a busca de virar laço.
 */

/** Uma única busca automática por foto: a segunda falha é do servidor, e aí quem decide é o usuário. */
export const OCCURRENCE_ATTACHMENT_REFRESH_LIMIT = 1

export type OccurrenceAttachmentRefreshReason = 'error' | 'expired'

/**
 * `expiresAt` ausente significa que a API não disse até quando vale — não se inventa vencimento.
 * Data ilegível também não vence: recusar o que não se sabe ler apagaria foto boa.
 */
export function isOccurrenceAttachmentUrlExpired(
  attachment: OccurrenceAttachment,
  now: number,
): boolean {
  if (attachment.expiresAt === undefined) return false
  const expiresAt = Date.parse(attachment.expiresAt)
  return Number.isNaN(expiresAt) ? false : expiresAt <= now
}

/**
 * O que fazer com um anexo agora: `null` é não buscar nada.
 *
 * ⚠️ `attachment.expired` (retenção de cinco anos vencida, D11) **nunca** pede busca — o objeto não
 * existe mais no bucket, e insistir só produziria requisição para um 404 garantido.
 */
export function resolveOccurrenceAttachmentRefresh(
  input: Readonly<{
    attachment: OccurrenceAttachment
    attemptCount: number
    hasErrored: boolean
    now: number
  }>,
): null | OccurrenceAttachmentRefreshReason {
  if (input.attachment.expired) return null
  if (input.attemptCount >= OCCURRENCE_ATTACHMENT_REFRESH_LIMIT) return null
  if (input.hasErrored) return 'error'
  if (isOccurrenceAttachmentUrlExpired(input.attachment, input.now)) return 'expired'
  return null
}

/**
 * O anexo recém-buscado que substitui este, pela identidade — a lista devolvida traz as cinco
 * fotos da ocorrência, e cada célula fica só com a sua. Sem correspondência, nada muda: apagar a
 * foto porque a releitura veio curta seria trocar uma falha visível por uma silenciosa.
 */
export function findOccurrenceAttachmentById(
  attachments: readonly OccurrenceAttachment[],
  id: string,
): OccurrenceAttachment | undefined {
  return attachments.find((attachment) => attachment.id === id)
}
