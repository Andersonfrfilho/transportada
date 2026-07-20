/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DigitalCertificateResult,
  DigitalCertificateTransactionPort,
} from './digital-certificate.port.js'
import { DigitalCertificateRejectedError } from '../domain/digital-certificate.error.js'
import type {
  ReplaceDigitalCertificateInput,
  ValidatedCertificate,
} from './replace-digital-certificate.types.js'
import { resolveDigitalCertificateReplay } from './digital-certificate-replay.service.js'

export async function persistDigitalCertificateRotation(input: {
  readonly request: ReplaceDigitalCertificateInput
  readonly transaction: DigitalCertificateTransactionPort
  readonly validated: ValidatedCertificate
}): Promise<DigitalCertificateResult> {
  const replay = await resolveDigitalCertificateReplay({
    fingerprint: input.validated.fingerprint,
    lookup: {
      companyId: input.validated.companyId,
      idempotencyKey: input.request.idempotencyKey,
      operation: 'digital-certificate.replace',
    },
    repository: input.transaction,
  })
  if (replay !== null) return replay

  const profile = await input.transaction.lockCompanyProfile({
    companyId: input.validated.companyId,
  })
  if (profile?.cnpj !== input.validated.validatedCnpj) {
    throw new DigitalCertificateRejectedError()
  }
  return await rotateAndRecord(input)
}

async function rotateAndRecord(input: {
  readonly request: ReplaceDigitalCertificateInput
  readonly transaction: DigitalCertificateTransactionPort
  readonly validated: ValidatedCertificate
}): Promise<DigitalCertificateResult> {
  const rotation = await input.transaction.replaceCertificate({
    certificateId: input.validated.certificateId,
    companyId: input.validated.companyId,
    createdByUserId: input.request.context.userId,
    expiresAt: input.validated.expiresAt,
    fingerprint: input.validated.fingerprint,
    purpose: input.request.purpose,
    secretEnvelope: input.validated.secretEnvelope,
    validatedCnpj: input.validated.validatedCnpj,
    validFrom: input.validated.validFrom,
  })
  await input.transaction.appendAudit({
    action: 'digital-certificate.replaced',
    actorUserId: input.request.context.userId,
    afterSnapshot: createCertificateSnapshot(rotation.result),
    beforeSnapshot:
      rotation.previous === null ? null : createCertificateSnapshot(rotation.previous),
    companyId: input.validated.companyId,
    correlationId: input.request.correlationId,
    entityId: input.validated.certificateId,
    entityType: 'digital-certificate',
  })
  await input.transaction.saveIdempotency({
    companyId: input.validated.companyId,
    fingerprint: input.validated.fingerprint,
    idempotencyKey: input.request.idempotencyKey,
    operation: 'digital-certificate.replace',
    response: rotation.result,
  })
  return rotation.result
}

function createCertificateSnapshot(
  certificate: DigitalCertificateResult,
): Readonly<Record<string, string>> {
  return {
    expiresAt: certificate.expiresAt.toISOString(),
    purpose: certificate.purpose,
    status: certificate.status,
    validFrom: certificate.validFrom.toISOString(),
    version: certificate.version.toString(),
  }
}
