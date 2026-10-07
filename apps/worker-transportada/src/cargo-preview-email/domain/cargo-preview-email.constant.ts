/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (ADR-0094 §10): os limites do ramo "prévia" do e-mail encaminhado. O teto do anexo é o
 * do upload (`CARGO_PREVIEW_OBJECT_MAX_BYTES`); o do e-mail inteiro é o do anexo em base64 mais folga.
 */
import { MIME_HEADER_LIMITS } from '../../contractor-mail/domain/contractor-mail.constant.js'
import type { CargoPreviewEmailRejectionCode } from '../../shared/cargo-preview.constant.js'

export const PREVIEW_INBOUND_TOKEN_PATTERN = /^[a-z2-7]{26}$/u

/** O mesmo HMAC/derivação do token de conversa não vale aqui: o propósito entra no hash. */
export const PREVIEW_INBOUND_TOKEN_PURPOSE = 'transportada:cargo-preview-inbound:v1'

/** 960 KiB de planilha em base64 (+33%) e os cabeçalhos do encaminhamento cabem com folga em 2 MiB. */
export const PREVIEW_EMAIL_MAX_RAW_BYTES = 2 * 1024 * 1024

/**
 * A janela de e-mails por contratante tem dois contadores. Os que passaram do DKIM do encaminhador custam
 * leitura de planilha e prévia: 20 em 5 minutos. Os que ficaram antes dele custam só uma linha de recusa, e
 * só este teto, mais alto, impede que a tabela seja inundada por quem conhece o endereço: 100 em 5 minutos
 * (no máximo ~29 mil linhas por dia por contratante, contra as 5 760 do outro contador). O excesso deixa uma
 * única linha `RATE_LIMITED` por janela.
 */
export const PREVIEW_EMAIL_INTAKE_RATE_LIMIT = {
  maxAuthenticated: 20,
  maxUnauthenticated: 100,
  windowSeconds: 300,
} as const

export const PREVIEW_EMAIL_MIME_LIMITS = {
  maxHeadersSize: MIME_HEADER_LIMITS.maxSectionBytes,
  maxNestingDepth: 6,
} as const

/** O bloco encaminhado de um cliente de e-mail: o marcador está perto do topo e o cabeçalho é curto. */
export const FORWARDED_BLOCK_LIMITS = { maxHeaderLines: 12, maxScanLines: 200 } as const

export const PREVIEW_EMAIL_FALLBACK_FILE_NAME = 'previa.xlsx'

/** Os códigos de recusa que mais de um ponto do ramo grava; o resto mora ao lado de quem o decide. */
export const PREVIEW_EMAIL_REJECTION = {
  forwarderDkimNotAligned: 'FORWARDER_DKIM_NOT_ALIGNED',
  forwarderDkimUnverifiable: 'FORWARDER_DKIM_UNVERIFIABLE',
  forwarderNotAllowed: 'FORWARDER_NOT_ALLOWED',
  mimeUnreadable: 'MIME_UNREADABLE',
  originalSenderAmbiguous: 'ORIGINAL_SENDER_AMBIGUOUS',
  originalSenderMissing: 'ORIGINAL_SENDER_MISSING',
  originalSenderNotAllowed: 'ORIGINAL_SENDER_NOT_ALLOWED',
  previewNotEnabled: 'PREVIEW_NOT_ENABLED',
  rateLimited: 'RATE_LIMITED',
  rawEmailTooLarge: 'RAW_EMAIL_TOO_LARGE',
  tooManyOpenPreviews: 'TOO_MANY_OPEN_PREVIEWS',
} as const satisfies Record<string, CargoPreviewEmailRejectionCode>
