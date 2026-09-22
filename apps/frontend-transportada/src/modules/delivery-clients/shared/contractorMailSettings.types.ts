/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do que a API devolve — o bundle não carrega código de lá. */
export type ContractorMailSettingsStatus = 'pending' | 'active' | 'failed'

/**
 * Nunca carrega `apiKey`/`webhookSigningSecret`: os dois só voltam como booleano, porque vivem
 * selados juntos e nunca meio configurados (spec 143, RF10).
 */
export type ContractorMailSettingsSummary = Readonly<{
  apiKeyConfigured: boolean
  id: string
  lastWebhookAt: string | null
  replyDomain: string
  senderAddress: string
  senderName: string
  /** Spec 150 T401: não-nulo é "pronto para enviar" — chave aceita e domínio do remetente verificado. */
  sendingVerifiedAt: string | null
  status: ContractorMailSettingsStatus
  version: string
  webhookId: string
  webhookSecretConfigured: boolean
}>

export const CONTRACTOR_MAIL_SETTINGS_SUMMARY_KEYS = [
  'apiKeyConfigured',
  'id',
  'lastWebhookAt',
  'replyDomain',
  'senderAddress',
  'senderName',
  'sendingVerifiedAt',
  'status',
  'version',
  'webhookId',
  'webhookSecretConfigured',
] as const

/** Ordem fixa — é a ordem em que o painel imprime a lista de verificação (RF12). */
export const CONTRACTOR_MAIL_CHECK_KEYS = [
  'api_key',
  'sender_domain',
  'reply_mx',
  'webhook_received',
  'test_sent',
  'test_replied',
  'test_dkim',
] as const
export type ContractorMailCheckKey = (typeof CONTRACTOR_MAIL_CHECK_KEYS)[number]

export const CONTRACTOR_MAIL_CHECK_STATUSES = ['ok', 'pending', 'failed'] as const
export type ContractorMailCheckStatus = (typeof CONTRACTOR_MAIL_CHECK_STATUSES)[number]

/** `not_configured` cobre a empresa sem configuração; os demais nomeiam a causa exata do item. */
export const CONTRACTOR_MAIL_CHECK_REASONS = [
  'not_configured',
  'ok',
  'credential_unavailable',
  'provider_unauthorized',
  'provider_unreachable',
  'provider_unexpected_response',
  'sender_domain_not_found',
  'sender_domain_not_verified',
  'mx_absent',
  'mx_unreachable',
  'webhook_never_received',
  'test_not_sent',
  'test_not_replied',
  'dkim_not_aligned',
  'dkim_unverifiable',
  'dkim_absent',
] as const
export type ContractorMailCheckReason = (typeof CONTRACTOR_MAIL_CHECK_REASONS)[number]

export const CONTRACTOR_MAIL_CHECK_ITEM_KEYS = ['key', 'reason', 'status'] as const

export type ContractorMailCheckItem = Readonly<{
  key: ContractorMailCheckKey
  reason: ContractorMailCheckReason
  status: ContractorMailCheckStatus
}>

export const CONTRACTOR_MAIL_TEST_EMAIL_RESULT_KEYS = ['threadId'] as const

export type ContractorMailTestEmailResult = Readonly<{ threadId: string }>
