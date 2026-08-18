import type { DeploymentEnvironment } from '@/modules/shared/deploymentEnvironment.service'
import { CNPJ_PATTERN, normalizeTaxId } from '@/modules/shared/taxId.service'

import { isRecord, isString } from './nfseInvoiceGuards.validation'
import {
  NFSE_CREDENTIAL_STATUSES,
  NFSE_FISCAL_ENVIRONMENTS,
  type NfseCredentialStatus,
  type NfseFiscalEnvironment,
} from './nfseSettings.types'

export const NFSE_CREDENTIAL_BLOCK_REASON = {
  API_TOKEN_REQUIRED: 'apiTokenRequired',
  MUNICIPAL_REGISTRATION_REQUIRED: 'municipalRegistrationRequired',
  TAX_ID_INVALID: 'taxIdInvalid',
} as const
export type NfseCredentialBlockReason =
  (typeof NFSE_CREDENTIAL_BLOCK_REASON)[keyof typeof NFSE_CREDENTIAL_BLOCK_REASON]

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

export const NFSE_CREDENTIAL_PRESENCE = {
  ABSENT: 'absent',
  INACTIVE: 'inactive',
  READY: 'ready',
  TOKEN_MISSING: 'tokenMissing',
} as const
export type NfseCredentialPresence =
  (typeof NFSE_CREDENTIAL_PRESENCE)[keyof typeof NFSE_CREDENTIAL_PRESENCE]

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
  const taxId = normalizeTaxId(draft.taxId)
  if (!CNPJ_PATTERN.test(taxId)) {
    return { reason: NFSE_CREDENTIAL_BLOCK_REASON.TAX_ID_INVALID, status: 'blocked' }
  }

  const apiToken = draft.apiToken.trim()
  if (apiToken.length === 0) {
    return { reason: NFSE_CREDENTIAL_BLOCK_REASON.API_TOKEN_REQUIRED, status: 'blocked' }
  }

  // Vai no `X-AUTH-IM` de toda chamada: em branco o provedor responde 200 com `cadastro: null`, e a
  // credencial só se revela inválida na primeira emissão.
  const municipalRegistration = draft.municipalRegistration.trim()
  if (municipalRegistration.length === 0) {
    return {
      reason: NFSE_CREDENTIAL_BLOCK_REASON.MUNICIPAL_REGISTRATION_REQUIRED,
      status: 'blocked',
    }
  }

  return {
    body: {
      apiToken,
      fiscalEnvironment: draft.fiscalEnvironment,
      municipalRegistration,
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

/**
 * O campo de situação é do formulário, não do ambiente: sem credencial nenhuma ele nasce em "Ativa",
 * e quem lê a tela conclui que existe uma credencial ativa. Quem responde pelo ambiente é isto — a
 * ausência, o segredo que falta e a credencial desligada são estados distintos, e os três impedem a
 * emissão do mesmo jeito.
 */
export function resolveNfseCredentialPresence(summary: unknown): NfseCredentialPresence {
  if (!isRecord(summary)) return NFSE_CREDENTIAL_PRESENCE.ABSENT
  // Sem segredo gravado não há o que ativar: o token vem antes da situação.
  if (summary.apiTokenConfigured !== true) return NFSE_CREDENTIAL_PRESENCE.TOKEN_MISSING
  if (readStatus(summary.status) !== 'active') return NFSE_CREDENTIAL_PRESENCE.INACTIVE
  return NFSE_CREDENTIAL_PRESENCE.READY
}

/**
 * Quem escolhe o ambiente fiscal de partida é a instalação, não um literal: abrindo sempre em
 * homologação, a tela de produção mostrava campo vazio com credencial gravada — e campo vazio se lê
 * como "não salvou". Só a instalação de produção nasce apontada para a credencial que emite.
 */
export function resolveDefaultNfseFiscalEnvironment(
  deployment: DeploymentEnvironment,
): NfseFiscalEnvironment {
  return deployment === 'production' ? 'production' : 'homologation'
}

function readEnvironment(value: unknown): NfseFiscalEnvironment {
  const known = NFSE_FISCAL_ENVIRONMENTS.find((candidate) => candidate === value)
  return known ?? EMPTY_NFSE_CREDENTIAL_DRAFT.fiscalEnvironment
}

function readStatus(value: unknown): NfseCredentialStatus {
  const known = NFSE_CREDENTIAL_STATUSES.find((candidate) => candidate === value)
  return known ?? EMPTY_NFSE_CREDENTIAL_DRAFT.status
}
