/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type NfseProviderApiVersion = 'v2' | 'v3'

const DEFAULT_PROVIDER_API_VERSION: NfseProviderApiVersion = 'v2'
const PROVIDER_API_VERSION_FIELD = 'providerApiVersion'

export type NfseIssuanceAttemptHistoryEntry = {
  readonly attemptNumber: bigint
  readonly payload?: unknown
  readonly providerConfig: unknown
}

/** A API grava a versão na tentativa de emissão; ausente ou desconhecida é a v2 de antes da v3. */
export function parseProviderApiVersion(providerConfig: unknown): NfseProviderApiVersion {
  if (typeof providerConfig !== 'object' || providerConfig === null) {
    return DEFAULT_PROVIDER_API_VERSION
  }
  const version = (providerConfig as Record<string, unknown>)[PROVIDER_API_VERSION_FIELD]
  return version === 'v3' ? 'v3' : DEFAULT_PROVIDER_API_VERSION
}

/** Consulta, cancelamento e documentos seguem a versão da última emissão da nota. */
export function resolveLatestIssuanceApiVersion(
  history: readonly NfseIssuanceAttemptHistoryEntry[],
): NfseProviderApiVersion {
  let latest: NfseIssuanceAttemptHistoryEntry | undefined
  for (const entry of history) {
    if (latest === undefined || entry.attemptNumber > latest.attemptNumber) latest = entry
  }
  return latest === undefined
    ? DEFAULT_PROVIDER_API_VERSION
    : parseProviderApiVersion(latest.providerConfig)
}

/** A tentativa de vínculo guarda o `id_nota` do portal, não o de uma emissão feita aqui. */
export function isExternalLinkAttempt(providerConfig: unknown): boolean {
  if (typeof providerConfig !== 'object' || providerConfig === null) return false
  return (providerConfig as Record<string, unknown>)['externalLink'] === true
}

/** O valor congelado da última emissão, quando ela é um vínculo; é o que o portal tem de confirmar. */
export function resolveLatestExternalLinkServiceAmount(
  history: readonly NfseIssuanceAttemptHistoryEntry[],
): string | undefined {
  let latest: NfseIssuanceAttemptHistoryEntry | undefined
  for (const entry of history) {
    if (latest === undefined || entry.attemptNumber > latest.attemptNumber) latest = entry
  }
  if (latest === undefined || !isExternalLinkAttempt(latest.providerConfig)) return undefined
  if (typeof latest.payload !== 'object' || latest.payload === null) return undefined
  const amount = (latest.payload as Record<string, unknown>)['serviceAmount']
  return typeof amount === 'string' ? amount : undefined
}

/**
 * O `id_nota` da nota só vale para a v3 se foi a v3 que o gerou. Sem coluna de origem, a prova é
 * que toda emissão anterior foi v3; qualquer dúvida manda nota nova (a chave de idempotência
 * protege a duplicação).
 */
export function canReuseProviderDocumentId(input: {
  readonly attemptNumber: bigint
  readonly history: readonly NfseIssuanceAttemptHistoryEntry[]
}): boolean {
  const priorAttempts = input.history.filter((entry) => entry.attemptNumber < input.attemptNumber)
  if (priorAttempts.length === 0) return false
  if (priorAttempts.some((entry) => isExternalLinkAttempt(entry.providerConfig))) return false
  return priorAttempts.every((entry) => parseProviderApiVersion(entry.providerConfig) === 'v3')
}
