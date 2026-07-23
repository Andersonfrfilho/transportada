/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export class WorkerCryptographicConfigurationError extends Error {
  override readonly name = 'WorkerCryptographicConfigurationError'

  constructor() {
    super('Invalid worker cryptographic configuration')
  }
}
