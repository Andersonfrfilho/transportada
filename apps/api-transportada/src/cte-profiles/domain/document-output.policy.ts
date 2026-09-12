/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteOutputDocument } from '../../database/cte-emission-profile.schema.js'
import type { NfseEmissionProfileStatus } from '../../database/nfse.schema.js'
import { CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE } from './cte-profile.error.js'
import type { EmissionProfileNoMatchReason } from './emission-profile-resolution.policy.js'

/** O perfil que rege a nota, reduzido ao que decide o documento de saída. */
export type DocumentOutputProfile = Readonly<{
  nfseEmissionProfileId: string | null
  /** Lido na mesma consulta que carrega o perfil de CT-e; nulo quando ele não aponta para nenhum. */
  nfseProfileStatus: NfseEmissionProfileStatus | null
  outputDocument: CteOutputDocument
}>

export type DocumentOutputClassification =
  | Readonly<{ output: 'cte' }>
  | Readonly<{ nfseProfileId: string; output: 'nfse' }>
  | Readonly<{ output: 'blocked'; reason: string }>
  | Readonly<{ output: 'no_profile'; reason: EmissionProfileNoMatchReason }>

type DocumentVerdicts = Readonly<{
  cteBlockReason: string | null
  nfseBlockReason: string | null
}>

export type ClassifyDocumentOutputParams = DocumentVerdicts &
  (
    | Readonly<{ noProfileReason?: undefined; profile: DocumentOutputProfile }>
    | Readonly<{ noProfileReason: EmissionProfileNoMatchReason; profile: null }>
  )

/**
 * Para qual documento fiscal a nota vai (spec 144 D3). **Não refaz elegibilidade**: recebe os dois
 * vereditos que a listagem já calcula — `resolveDocumentBlock` e `resolveNfseDocumentBlock` — e
 * escolhe qual deles vale pelo documento que o perfil manda emitir. Uma segunda conta ao lado
 * delas faria a tela e o bot discordarem da mesma nota.
 *
 * Nota sem perfil não cai em CT-e por padrão: escolher o documento por omissão é inventar regra.
 */
export function classifyDocumentOutput(
  params: ClassifyDocumentOutputParams,
): DocumentOutputClassification {
  if (params.profile === null) return { output: 'no_profile', reason: params.noProfileReason }
  if (params.profile.outputDocument === 'cte') {
    return params.cteBlockReason === null
      ? { output: 'cte' }
      : { output: 'blocked', reason: params.cteBlockReason }
  }

  const { nfseEmissionProfileId, nfseProfileStatus } = params.profile
  if (nfseEmissionProfileId === null || nfseProfileStatus !== 'active') {
    return { output: 'blocked', reason: CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE }
  }
  if (params.nfseBlockReason !== null) return { output: 'blocked', reason: params.nfseBlockReason }
  return { nfseProfileId: nfseEmissionProfileId, output: 'nfse' }
}
