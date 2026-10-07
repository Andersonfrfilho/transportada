/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6 (ADR-0094 §10): os limites do ramo "prévia" do e-mail encaminhado. O teto do anexo é o
 * do upload (`CARGO_PREVIEW_OBJECT_MAX_BYTES`); o do e-mail inteiro é o do anexo em base64 mais folga.
 */
export const PREVIEW_INBOUND_TOKEN_PATTERN = /^[a-z2-7]{26}$/u

/** O mesmo HMAC/derivação do token de conversa não vale aqui: o propósito entra no hash. */
export const PREVIEW_INBOUND_TOKEN_PURPOSE = 'transportada:cargo-preview-inbound:v1'

/** 960 KiB de planilha em base64 (+33%) e os cabeçalhos do encaminhamento cabem com folga em 2 MiB. */
export const PREVIEW_EMAIL_MAX_RAW_BYTES = 2 * 1024 * 1024

/** No máximo isto de e-mails por contratante nesta janela; o excesso é ignorado, sem registro. */
export const PREVIEW_EMAIL_INTAKE_RATE_LIMIT = { maxIntakes: 20, windowSeconds: 300 } as const

export const PREVIEW_EMAIL_MIME_LIMITS = {
  maxHeadersSize: 64 * 1024,
  maxNestingDepth: 6,
} as const

/** O bloco encaminhado de um cliente de e-mail: o marcador está perto do topo e o cabeçalho é curto. */
export const FORWARDED_BLOCK_LIMITS = { maxHeaderLines: 12, maxScanLines: 200 } as const

export const RFC822_MIME_TYPE = 'message/rfc822'
export const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04] as const
export const PREVIEW_EMAIL_IDEMPOTENCY_PREFIX = 'email:'
export const PREVIEW_EMAIL_FALLBACK_FILE_NAME = 'previa.xlsx'
