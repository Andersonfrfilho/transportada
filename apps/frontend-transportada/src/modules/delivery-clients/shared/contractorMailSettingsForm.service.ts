/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ContractorMailSettingsSaveBody } from './contractorMailSettingsClient.service'
import type { ContractorMailSettingsSummary } from './contractorMailSettings.types'

/** `resposta.<domínio>` precisa ser subdomínio — piso de três rótulos, igual à regra da API. */
const HOSTNAME_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
const REPLY_DOMAIN_PATTERN = new RegExp(`^${HOSTNAME_LABEL}(?:\\.${HOSTNAME_LABEL}){2,}$`)
const WEBHOOK_SECRET_PREFIX = 'whsec_'

export const CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON = {
  REPLY_DOMAIN_INVALID: 'replyDomainInvalid',
  SECRETS_REQUIRED_FIRST_SAVE: 'secretsRequiredFirstSave',
  SENDER_ADDRESS_REQUIRED: 'senderAddressRequired',
  SENDER_NAME_REQUIRED: 'senderNameRequired',
  WEBHOOK_SECRET_INVALID: 'webhookSecretInvalid',
} as const
export type ContractorMailSettingsBlockReason =
  (typeof CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON)[keyof typeof CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON]

/**
 * A chave de API e o segredo do webhook são campos **só de escrita**: em branco quer dizer "não
 * mexer", nunca "apagar" — o corpo omite o campo (RF10). O rascunho nasce sempre vazio nos dois,
 * mesmo com configuração existente, porque a API nunca devolve o valor de volta.
 */
export type ContractorMailSettingsDraft = Readonly<{
  apiKey: string
  replyDomain: string
  senderAddress: string
  senderName: string
  webhookSigningSecret: string
}>

export type ContractorMailSettingsSubmission =
  | Readonly<{ body: ContractorMailSettingsSaveBody; status: 'ready' }>
  | Readonly<{ reason: ContractorMailSettingsBlockReason; status: 'blocked' }>

export const EMPTY_CONTRACTOR_MAIL_SETTINGS_DRAFT: ContractorMailSettingsDraft = {
  apiKey: '',
  replyDomain: '',
  senderAddress: '',
  senderName: '',
  webhookSigningSecret: '',
}

/** Os dois segredos nascem sempre vazios: são de escrita, e a API nunca os devolve de volta. */
export function toContractorMailSettingsDraft(
  summary: ContractorMailSettingsSummary | null | undefined,
): ContractorMailSettingsDraft {
  if (summary === null || summary === undefined) return EMPTY_CONTRACTOR_MAIL_SETTINGS_DRAFT
  return {
    apiKey: '',
    replyDomain: summary.replyDomain,
    senderAddress: summary.senderAddress,
    senderName: summary.senderName,
    webhookSigningSecret: '',
  }
}

/**
 * `existingVersion` ausente é a primeira configuração: os dois segredos são obrigatórios (a linha
 * nasceria sem envelope, senão), e não há versão para citar. Presente é a atualização otimista — o
 * `PUT` manda a versão lida, e um `409` do servidor (a configuração mudou em outra aba) recarrega a
 * consulta em vez de sobrescrever por cima.
 */
export function buildContractorMailSettingsSubmission(input: {
  readonly draft: ContractorMailSettingsDraft
  readonly existingVersion: string | undefined
}): ContractorMailSettingsSubmission {
  const { draft, existingVersion } = input
  const senderAddress = draft.senderAddress.trim()
  if (senderAddress.length === 0) {
    return {
      reason: CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON.SENDER_ADDRESS_REQUIRED,
      status: 'blocked',
    }
  }

  const senderName = draft.senderName.trim()
  if (senderName.length === 0) {
    return { reason: CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON.SENDER_NAME_REQUIRED, status: 'blocked' }
  }

  const replyDomain = draft.replyDomain.trim().toLowerCase()
  if (!REPLY_DOMAIN_PATTERN.test(replyDomain)) {
    return { reason: CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON.REPLY_DOMAIN_INVALID, status: 'blocked' }
  }

  const apiKey = draft.apiKey.trim()
  const webhookSigningSecret = draft.webhookSigningSecret.trim()
  if (webhookSigningSecret.length > 0 && !webhookSigningSecret.startsWith(WEBHOOK_SECRET_PREFIX)) {
    return {
      reason: CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON.WEBHOOK_SECRET_INVALID,
      status: 'blocked',
    }
  }

  const isFirstSave = existingVersion === undefined
  if (isFirstSave && (apiKey.length === 0 || webhookSigningSecret.length === 0)) {
    return {
      reason: CONTRACTOR_MAIL_SETTINGS_BLOCK_REASON.SECRETS_REQUIRED_FIRST_SAVE,
      status: 'blocked',
    }
  }

  return {
    body: {
      ...(apiKey.length === 0 ? {} : { apiKey }),
      ...(existingVersion === undefined ? {} : { expectedVersion: existingVersion }),
      replyDomain,
      senderAddress,
      senderName,
      ...(webhookSigningSecret.length === 0 ? {} : { webhookSigningSecret }),
    },
    status: 'ready',
  }
}

/** A URL que o painel mostra para colar no Resend — montada com o `apiBaseUrl` que o app já usa. */
export function buildContractorMailWebhookUrl(input: {
  readonly apiUrl: string
  readonly webhookId: string
}): string {
  return `${input.apiUrl}/public/inbound-emails/${input.webhookId}`
}
