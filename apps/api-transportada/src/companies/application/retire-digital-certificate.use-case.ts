/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type {
  DigitalCertificateMetadata,
  DigitalCertificateRepositoryPort,
} from './digital-certificate.port.js'

type RetireInput = Readonly<{
  context: CompanyContext
  correlationId: string
  purpose: 'cte'
}>

export type RetireDigitalCertificateUseCase = Readonly<{
  execute(input: RetireInput): Promise<DigitalCertificateMetadata | null>
}>

export function createRetireDigitalCertificateUseCase(
  input: Readonly<{
    repository: DigitalCertificateRepositoryPort
  }>,
): RetireDigitalCertificateUseCase {
  return {
    execute: async (request) =>
      input.repository.execute(async (transaction) => {
        const retired = await transaction.retireActiveCertificate({
          companyId: request.context.companyId,
          purpose: request.purpose,
        })
        if (retired === null) return null
        await transaction.appendAudit({
          action: 'digital-certificate.retired',
          actorUserId: request.context.userId,
          afterSnapshot: certificateSnapshot(retired),
          beforeSnapshot: certificateSnapshot({ ...retired, status: 'active' }),
          companyId: request.context.companyId,
          correlationId: request.correlationId,
          entityId: retired.id,
          entityType: 'digital-certificate',
        })
        return retired
      }),
  }
}

function certificateSnapshot(
  input: Readonly<{
    expiresAt: Date
    purpose: 'cte'
    status: 'active' | 'retired'
    validFrom: Date
    version: bigint
  }>,
): Readonly<Record<string, string>> {
  return {
    expiresAt: input.expiresAt.toISOString(),
    purpose: input.purpose,
    status: input.status,
    validFrom: input.validFrom.toISOString(),
    version: input.version.toString(),
  }
}
