/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const CRYPTOGRAPHIC_CONFIGURATION_ERROR_CODE = 'INVALID_CRYPTOGRAPHIC_CONFIGURATION' as const

export class CryptographicConfigurationError extends Error {
  readonly code = CRYPTOGRAPHIC_CONFIGURATION_ERROR_CODE

  constructor() {
    super('Cryptographic configuration is invalid')
    this.name = 'CryptographicConfigurationError'
  }
}
