/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 237 T4.6b (ADR-0094 §10): a entrada da prévia por e-mail encaminhado, no perfil do contratante.
 * ⚠️ Cópia por valor do que a API devolve e das faixas que ela aplica — o bundle não carrega código de lá, e
 * mudar uma faixa ou um código lá obriga a mudar aqui (contratos de paridade leem os arquivos da API).
 */

export const PREVIEW_EMAIL_ALLOWLIST_LIMITS = {
  entryMaxLength: 254,
  entryMinLength: 3,
  maxEntries: 20,
} as const

/** Quem encaminha (endereço exato) e o remetente original do contratante (endereço ou domínio exato). */
export const PREVIEW_ALLOWLIST_KIND = { forwarder: 'forwarder', sender: 'sender' } as const
export type PreviewAllowlistKind =
  (typeof PREVIEW_ALLOWLIST_KIND)[keyof typeof PREVIEW_ALLOWLIST_KIND]

export const PREVIEW_ALLOWLIST_FIELD = {
  forwarder: 'forwarderAllowlist',
  sender: 'senderAllowlist',
} as const

export type PreviewEmailLists = Readonly<{
  forwarderAllowlist: readonly string[]
  senderAllowlist: readonly string[]
}>

/** O que a ficha lê: nunca o token nem o hash — só se há endereço ativo e desde quando. */
export type PreviewEmailSettings = PreviewEmailLists &
  Readonly<{
    contractorId: string
    hasInboundToken: boolean
    inboundTokenSetAt: string | null
  }>

export const PREVIEW_EMAIL_SETTINGS_KEYS = [
  'contractorId',
  'forwarderAllowlist',
  'hasInboundToken',
  'inboundTokenSetAt',
  'senderAllowlist',
] as const

/** Os códigos que o CHECK da migration admite; a tabela mostra o código cru de um que ainda não conhece. */
export const PREVIEW_EMAIL_REASON_CODES = [
  'ATTACHMENT_AMBIGUOUS',
  'ATTACHMENT_MISSING',
  'ATTACHMENT_NOT_A_WORKBOOK',
  'ATTACHMENT_TOO_LARGE',
  'FORWARDER_DKIM_NOT_ALIGNED',
  'FORWARDER_DKIM_UNVERIFIABLE',
  'FORWARDER_FROM_MISMATCH',
  'FORWARDER_NOT_ALLOWED',
  'MIME_UNREADABLE',
  'ORIGINAL_SENDER_AMBIGUOUS',
  'ORIGINAL_SENDER_MISSING',
  'ORIGINAL_SENDER_NOT_ALLOWED',
  'PREVIEW_NOT_ENABLED',
  'RATE_LIMITED',
  'RAW_EMAIL_TOO_LARGE',
  'TOO_MANY_OPEN_PREVIEWS',
] as const
export type PreviewEmailReasonCode = (typeof PREVIEW_EMAIL_REASON_CODES)[number]

export const PREVIEW_EMAIL_OUTCOMES = ['accepted', 'rejected'] as const
export type PreviewEmailOutcome = (typeof PREVIEW_EMAIL_OUTCOMES)[number]

/**
 * O registro de um e-mail encaminhado: só código e resultado — nunca endereço, nome, assunto nem corpo. O
 * resultado e o motivo são texto: a API pode ganhar um código e a tabela não pode cair por isso.
 */
export type PreviewEmailIntake = Readonly<{
  outcome: string
  previewId: string | null
  reasonCode: string | null
  receivedAt: string
}>

export const PREVIEW_EMAIL_INTAKE_KEYS = [
  'outcome',
  'previewId',
  'reasonCode',
  'receivedAt',
] as const

/** O endereço completo e o token saem UMA vez, na resposta de quem gerou. */
export type GeneratedInboundAddress = Readonly<{ address: string; token: string }>

export const GENERATED_ADDRESS_KEYS = ['address', 'token'] as const

/** Quantas recusas a ficha pede: a API devolve no máximo 50, e a tabela é para diagnóstico, não histórico. */
export const PREVIEW_EMAIL_INTAKE_PAGE_SIZE = 20

export const buildPreviewEmailPath = (contractorId: string): string =>
  `/contractors/${contractorId}/receiving-profile/preview-email`

export const buildInboundTokenPath = (contractorId: string): string =>
  `/contractors/${contractorId}/receiving-profile/inbound-token`

export const buildEmailIntakesPath = (contractorId: string): string =>
  `/contractors/${contractorId}/receiving-profile/email-intakes?limit=${PREVIEW_EMAIL_INTAKE_PAGE_SIZE}`
