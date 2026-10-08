/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const NFSE_PROVIDER_API_VERSIONS = ['v2', 'v3'] as const
export type NfseProviderApiVersion = (typeof NFSE_PROVIDER_API_VERSIONS)[number]

export const DEFAULT_NFSE_PROVIDER_API_VERSION: NfseProviderApiVersion = 'v2'
export const NFSE_NATIONAL_PROVIDER_API_VERSION: NfseProviderApiVersion = 'v3'
