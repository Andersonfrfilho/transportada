/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DigitalCertificateIdempotencyConflictError,
  DigitalCertificateOperationFailedError,
  DigitalCertificateProfileMissingError,
  DigitalCertificateRejectedError,
  DigitalCertificateUnavailableError,
} from '../domain/digital-certificate.error.js'
import type { CertificateValidationOutcome } from './certificate-validation.port.js'
import type { DigitalCertificateResult } from './digital-certificate.port.js'
import { persistDigitalCertificateRotation } from './digital-certificate-rotation.service.js'
import { resolveDigitalCertificateReplay } from './digital-certificate-replay.service.js'
import type {
  ReplaceDigitalCertificateDependencies,
  ReplaceDigitalCertificateInput,
  ReplaceDigitalCertificateUseCase,
  ValidatedCertificate,
} from './replace-digital-certificate.types.js'

const TEXT_DECODER = new TextDecoder('utf-8', { fatal: true })
const TEXT_ENCODER = new TextEncoder()
const OPERATION = 'digital-certificate.replace'

type AcceptedCertificateOutcome = CertificateValidationOutcome & {
  readonly certificateCnpj: string
  readonly expiresAt: Date
  readonly validFrom: Date
}

export function createReplaceDigitalCertificateUseCase(
  input: ReplaceDigitalCertificateDependencies,
): ReplaceDigitalCertificateUseCase {
  return {
    async execute(request) {
      return (await executeReplace({ dependencies: input, request })).certificate
    },
    executeWithOutcome: (request) => executeReplace({ dependencies: input, request }),
  }
}

async function executeReplace(input: {
  readonly dependencies: ReplaceDigitalCertificateDependencies
  readonly request: ReplaceDigitalCertificateInput
}): Promise<{ readonly certificate: DigitalCertificateResult; readonly replayed: boolean }> {
  try {
    return await replaceDigitalCertificate(input)
  } catch (error) {
    if (isExpectedError(error)) throw error
    throw new DigitalCertificateOperationFailedError()
  } finally {
    input.request.certificate.fill(0)
    input.request.password.fill(0)
  }
}

async function replaceDigitalCertificate(input: {
  readonly dependencies: ReplaceDigitalCertificateDependencies
  readonly request: ReplaceDigitalCertificateInput
}): Promise<{ readonly certificate: DigitalCertificateResult; readonly replayed: boolean }> {
  const companyId = input.request.context.companyId
  const fingerprint = await input.dependencies.fingerprintService.create({
    fields: [
      input.request.certificate,
      input.request.password,
      TEXT_ENCODER.encode(input.request.purpose),
    ],
    operation: OPERATION,
  })
  const replay = await resolveDigitalCertificateReplay({
    fingerprint,
    lookup: { companyId, idempotencyKey: input.request.idempotencyKey, operation: OPERATION },
    repository: input.dependencies.repository,
  })
  if (replay !== null) return { certificate: replay, replayed: true }

  const validated = await validateAndEncrypt({ ...input, companyId, fingerprint })
  return await input.dependencies.repository.execute((transaction) =>
    persistDigitalCertificateRotation({ request: input.request, transaction, validated }),
  )
}

async function validateAndEncrypt(input: {
  readonly companyId: string
  readonly dependencies: ReplaceDigitalCertificateDependencies
  readonly fingerprint: string
  readonly request: ReplaceDigitalCertificateInput
}): Promise<ValidatedCertificate> {
  const profile = await input.dependencies.repository.findCompanyProfile({
    companyId: input.companyId,
  })
  if (profile === null) throw new DigitalCertificateProfileMissingError()
  const certificateBase64 = Buffer.from(input.request.certificate).toString('base64')
  const password = decodePassword(input.request.password)
  const outcome = input.dependencies.certificateValidationGateway.validate({
    certificateBase64,
    password,
  })
  const acceptedOutcome = acceptOutcome({ expectedCnpj: profile.cnpj, outcome })
  const certificateId = input.dependencies.createCertificateId()
  const secretEnvelope = await input.dependencies.secretService.encrypt({
    certificateBase64,
    certificateId,
    companyId: input.companyId,
    password,
    purpose: input.request.purpose,
  })
  return {
    certificateId,
    companyId: input.companyId,
    expiresAt: acceptedOutcome.expiresAt,
    fingerprint: input.fingerprint,
    secretEnvelope,
    validatedCnpj: acceptedOutcome.certificateCnpj,
    validFrom: acceptedOutcome.validFrom,
  }
}

function acceptOutcome(input: {
  readonly expectedCnpj: string
  readonly outcome: CertificateValidationOutcome
}): AcceptedCertificateOutcome {
  const { outcome } = input
  if (!outcome.valid || outcome.rejectionCodes.length > 0) {
    throw new DigitalCertificateRejectedError()
  }
  if (outcome.certificateCnpj !== input.expectedCnpj) {
    throw new DigitalCertificateRejectedError()
  }
  if (
    !isValidDate(outcome.validFrom) ||
    !isValidDate(outcome.expiresAt) ||
    outcome.validFrom.getTime() >= outcome.expiresAt.getTime()
  ) {
    throw new DigitalCertificateRejectedError()
  }
  return outcome as AcceptedCertificateOutcome
}

function isValidDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime())
}

function decodePassword(password: Uint8Array): string {
  try {
    return TEXT_DECODER.decode(password)
  } catch {
    throw new DigitalCertificateRejectedError()
  }
}

function isExpectedError(error: unknown): boolean {
  return (
    error instanceof DigitalCertificateRejectedError ||
    error instanceof DigitalCertificateProfileMissingError ||
    error instanceof DigitalCertificateUnavailableError ||
    error instanceof DigitalCertificateIdempotencyConflictError
  )
}
