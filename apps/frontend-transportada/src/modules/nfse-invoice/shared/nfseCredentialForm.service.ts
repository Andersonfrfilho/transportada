import { isRecord, isString } from './nfseInvoiceGuards.validation'
import {
  NFSE_CREDENTIAL_STATUSES,
  NFSE_FISCAL_ENVIRONMENTS,
  type NfseCredentialStatus,
  type NfseFiscalEnvironment,
} from './nfseSettings.types'

export const NFSE_CREDENTIAL_BLOCK_REASON = {
  API_TOKEN_REQUIRED: 'apiTokenRequired',
  TAX_ID_INVALID: 'taxIdInvalid',
} as const
export type NfseCredentialBlockReason =
  (typeof NFSE_CREDENTIAL_BLOCK_REASON)[keyof typeof NFSE_CREDENTIAL_BLOCK_REASON]

const TAX_ID_PATTERN = /^\d{14}$/

export type NfseCredentialDraft = Readonly<{
  apiToken: string
  fiscalEnvironment: NfseFiscalEnvironment
  municipalRegistration: string
  status: NfseCredentialStatus
  taxId: string
}>

export type NfseCredentialBody = Readonly<{
  apiToken: string
  fiscalEnvironment: NfseFiscalEnvironment
  municipalRegistration: string
  status: NfseCredentialStatus
  taxId: string
}>

export type NfseCredentialSubmission =
  | Readonly<{ body: NfseCredentialBody; status: 'ready' }>
  | Readonly<{ reason: NfseCredentialBlockReason; status: 'blocked' }>

export const EMPTY_NFSE_CREDENTIAL_DRAFT: NfseCredentialDraft = {
  apiToken: '',
  fiscalEnvironment: 'homologation',
  municipalRegistration: '',
  status: 'active',
  taxId: '',
}

/**
 * O campo do token é de escrita: em branco quer dizer "não mexer", nunca "apagar". Como a rota de
 * gravação exige o token, o caminho honesto é não mandar corpo nenhum e dizer isso na tela — o
 * segredo já gravado continua onde está.
 */
export function buildNfseCredentialSubmission(
  draft: NfseCredentialDraft,
): NfseCredentialSubmission {
  const taxId = draft.taxId.replace(/\D/g, '')
  if (!TAX_ID_PATTERN.test(taxId)) {
    return { reason: NFSE_CREDENTIAL_BLOCK_REASON.TAX_ID_INVALID, status: 'blocked' }
  }

  const apiToken = draft.apiToken.trim()
  if (apiToken.length === 0) {
    return { reason: NFSE_CREDENTIAL_BLOCK_REASON.API_TOKEN_REQUIRED, status: 'blocked' }
  }

  return {
    body: {
      apiToken,
      fiscalEnvironment: draft.fiscalEnvironment,
      municipalRegistration: draft.municipalRegistration.trim(),
      status: draft.status,
      taxId,
    },
    status: 'ready',
  }
}

/**
 * O rascunho é montado campo a campo a partir do resumo: se um dia a API passar a devolver o token,
 * ele não entra no estado da tela por espalhamento.
 */
export function toNfseCredentialDraft(summary: unknown): NfseCredentialDraft {
  if (!isRecord(summary)) return EMPTY_NFSE_CREDENTIAL_DRAFT

  return {
    apiToken: '',
    fiscalEnvironment: readEnvironment(summary.fiscalEnvironment),
    municipalRegistration: isString(summary.municipalRegistration)
      ? summary.municipalRegistration
      : '',
    status: readStatus(summary.status),
    taxId: isString(summary.taxId) ? summary.taxId : '',
  }
}

function readEnvironment(value: unknown): NfseFiscalEnvironment {
  const known = NFSE_FISCAL_ENVIRONMENTS.find((candidate) => candidate === value)
  return known ?? EMPTY_NFSE_CREDENTIAL_DRAFT.fiscalEnvironment
}

function readStatus(value: unknown): NfseCredentialStatus {
  const known = NFSE_CREDENTIAL_STATUSES.find((candidate) => candidate === value)
  return known ?? EMPTY_NFSE_CREDENTIAL_DRAFT.status
}
