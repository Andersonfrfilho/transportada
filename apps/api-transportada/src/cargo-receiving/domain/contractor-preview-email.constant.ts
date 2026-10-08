/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10): as faixas e os nomes da entrada da prévia por e-mail no perfil. O banco repete
 * as faixas das listas em CHECK; aqui elas viram mensagem de entrada antes de chegar lá.
 */

export const PREVIEW_ALLOWLIST_LIMITS = {
  entryMaxLength: 254,
  entryMinLength: 3,
  /** Teto do que se aceita LER antes da validação por entrada: o corpo hostil não vira milhares de recusas. */
  inputEntryMaxLength: 254 * 4,
  inputMaxEntries: 20 * 5,
  maxEntries: 20,
  maxReportedIssues: 25,
} as const

export const PREVIEW_ALLOWLIST_KIND = { forwarder: 'forwarder', sender: 'sender' } as const
export type PreviewAllowlistKind =
  (typeof PREVIEW_ALLOWLIST_KIND)[keyof typeof PREVIEW_ALLOWLIST_KIND]

/** Os nomes dos campos do corpo e das respostas; a recusa da API aponta por eles. */
export const PREVIEW_ALLOWLIST_FIELD = {
  forwarder: 'forwarderAllowlist',
  sender: 'senderAllowlist',
} as const
export type PreviewAllowlistField =
  (typeof PREVIEW_ALLOWLIST_FIELD)[keyof typeof PREVIEW_ALLOWLIST_FIELD]

export const PREVIEW_ALLOWLIST_ISSUE = {
  forbiddenCharacter: 'forbiddenCharacter',
  nonAscii: 'nonAscii',
  notADomain: 'notADomain',
  notAMailbox: 'notAMailbox',
  tooLong: 'tooLong',
  tooShort: 'tooShort',
} as const
export type PreviewAllowlistIssueReason =
  (typeof PREVIEW_ALLOWLIST_ISSUE)[keyof typeof PREVIEW_ALLOWLIST_ISSUE]

export const PREVIEW_EMAIL_INTAKE_LIMIT = { default: 20, max: 50 } as const

/** Trilha em `audit_logs`: ator, alvo, IP e hora — nunca o token nem o hash. */
export const PREVIEW_EMAIL_AUDIT = {
  allowlistsSaved: 'contractor-receiving-profile.preview-allowlists-saved',
  entityType: 'contractor-receiving-profile',
  inboundTokenGenerated: 'contractor-receiving-profile.inbound-token-generated',
  permission: 'settings.manage',
  targetType: 'contractor',
} as const
