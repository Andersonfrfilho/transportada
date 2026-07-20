/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  DigitalCertificateCursor,
  DigitalCertificateMetadata,
  DigitalCertificateListingRepositoryPort,
} from './digital-certificate.port.js'

export function createListDigitalCertificatesUseCase(input: {
  readonly repository: DigitalCertificateListingRepositoryPort
}): {
  readonly execute: (request: {
    readonly context: CompanyContext
    readonly cursor?: DigitalCertificateCursor
    readonly limit: number
  }) => Promise<{
    readonly items: readonly DigitalCertificateMetadata[]
    readonly nextCursor?: DigitalCertificateCursor
  }>
} {
  return {
    execute: (request) =>
      input.repository.list({
        companyId: request.context.companyId,
        ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
        limit: request.limit,
      }),
  }
}
