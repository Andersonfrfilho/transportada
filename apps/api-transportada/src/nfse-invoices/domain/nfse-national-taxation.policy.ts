/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  NFSE_NATIONAL_PROVIDER_API_VERSION,
  type NfseProviderApiVersion,
} from '../../shared/nfse-provider-api-version.constant.js'
import { NfseNationalTaxationCodeMissingError } from './nfse-issuance.error.js'

export type NfseNationalTaxation = {
  readonly nationalTaxationCode: string
  readonly simplesNationalRate: string
}

export function requiresNationalTaxation(
  providerApiVersion: NfseProviderApiVersion | undefined,
): boolean {
  return providerApiVersion === NFSE_NATIONAL_PROVIDER_API_VERSION
}

/** Ausente ou em branco é o mesmo que ausente: a prefeitura recusa a nota sem os dois. */
export function resolveNationalTaxation(source: {
  readonly nationalTaxationCode?: unknown
  readonly simplesNationalRate?: unknown
}): NfseNationalTaxation {
  const { nationalTaxationCode, simplesNationalRate } = source
  if (!isFilledText(nationalTaxationCode) || !isFilledText(simplesNationalRate)) {
    throw new NfseNationalTaxationCodeMissingError()
  }
  return { nationalTaxationCode, simplesNationalRate }
}

function isFilledText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
