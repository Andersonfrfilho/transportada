/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createCteRetryPolicy } from '../../cte-issuance/domain/cte-retry.policy.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ApiError } from '../../shared/api.error.js'
import {
  CompanyProfileCertificateCnpjMismatchError,
  InvalidCompanySettingsError,
} from '../domain/company-settings.error.js'
import type {
  CompanySettingsInput,
  CompanySettingsResult,
  CompanySettingsTransactionPort,
  CompanySettingsUnitOfWorkPort,
  IdempotencyFingerprintPort,
} from './company-settings.port.js'

const OPERATION = 'company-settings.update'
const TEXT_ENCODER = new TextEncoder()

type UpdateCompanySettingsInput = {
  readonly context: CompanyContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly settings: CompanySettingsInput
}

export function createUpdateCompanySettingsUseCase(input: {
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly unitOfWork: CompanySettingsUnitOfWorkPort
}): {
  readonly execute: (request: UpdateCompanySettingsInput) => Promise<CompanySettingsResult>
} {
  return {
    execute: (request) => executeUpdate(input, request),
  }
}

async function executeUpdate(
  dependencies: {
    readonly fingerprintService: IdempotencyFingerprintPort
    readonly unitOfWork: CompanySettingsUnitOfWorkPort
  },
  request: UpdateCompanySettingsInput,
): Promise<CompanySettingsResult> {
  assertSettingsInvariants(request.settings)
  const companyId = request.context.companyId
  const fingerprint = await dependencies.fingerprintService.create({
    fields: createFingerprintFields(companyId, request.settings),
    operation: OPERATION,
  })
  return dependencies.unitOfWork.execute((transaction) =>
    executeTransaction(transaction, request, companyId, fingerprint),
  )
}

async function executeTransaction(
  transaction: CompanySettingsTransactionPort,
  request: UpdateCompanySettingsInput,
  companyId: string,
  fingerprint: string,
): Promise<CompanySettingsResult> {
  const idempotency = await transaction.findIdempotency({
    companyId,
    idempotencyKey: request.idempotencyKey,
    operation: OPERATION,
  })
  if (idempotency !== null) {
    if (idempotency.fingerprint !== fingerprint) throw createIdempotencyConflict()
    return idempotency.response
  }
  return await persistUpdate(transaction, request, companyId, fingerprint)
}

async function persistUpdate(
  transaction: CompanySettingsTransactionPort,
  request: UpdateCompanySettingsInput,
  companyId: string,
  fingerprint: string,
): Promise<CompanySettingsResult> {
  await assertProfileCnpjMatchesActiveCertificate(transaction, companyId, request.settings)
  const before = await transaction.findByCompanyId?.({ companyId })
  const response = await transaction.saveSettings({ companyId, settings: request.settings })
  await transaction.appendAudit({
    action: 'company-settings.updated',
    actorUserId: request.context.userId,
    afterSnapshot: createAuditSnapshot(response),
    beforeSnapshot: before === null || before === undefined ? null : createAuditSnapshot(before),
    companyId,
    correlationId: request.correlationId,
    entityId: companyId,
    entityType: 'company-fiscal-profile',
  })
  await transaction.saveIdempotency({
    companyId,
    fingerprint,
    idempotencyKey: request.idempotencyKey,
    operation: OPERATION,
    response,
  })
  return response
}

function createIdempotencyConflict(): ApiError {
  return new ApiError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key cannot be reused',
    status: 409,
  })
}

async function assertProfileCnpjMatchesActiveCertificate(
  transaction: CompanySettingsTransactionPort,
  companyId: string,
  settings: CompanySettingsInput,
): Promise<void> {
  const activeCertificateCnpj = await transaction.findActiveCertificateCnpj({ companyId })
  if (activeCertificateCnpj !== null && activeCertificateCnpj !== settings.profile.cnpj) {
    throw new CompanyProfileCertificateCnpjMismatchError()
  }
}

function assertSettingsInvariants(settings: CompanySettingsInput): void {
  if (
    settings.cte.series <= 0n ||
    settings.cte.nextNumber <= 0n ||
    (settings.expectedVersion !== null && settings.expectedVersion <= 0n)
  ) {
    throw new InvalidCompanySettingsError()
  }
  assertRetryPolicyInvariants(settings)
}

function assertRetryPolicyInvariants(settings: CompanySettingsInput): void {
  try {
    createCteRetryPolicy(settings.cteRetry)
  } catch {
    throw new InvalidCompanySettingsError()
  }
}

function createFingerprintFields(
  companyId: string,
  settings: CompanySettingsInput,
): readonly Uint8Array[] {
  const values = [
    companyId,
    settings.expectedVersion?.toString() ?? '',
    settings.profile.legalName,
    settings.profile.tradeName,
    settings.profile.cnpj,
    settings.profile.stateRegistration,
    settings.profile.municipalRegistration,
    settings.profile.taxRegime,
    settings.profile.rntrc,
    settings.profile.street,
    settings.profile.number,
    settings.profile.complement,
    settings.profile.district,
    settings.profile.city,
    settings.profile.state,
    settings.profile.postalCode,
    settings.profile.cityIbgeCode,
    settings.profile.phone,
    settings.profile.email,
    settings.cte.environment,
    settings.cte.series.toString(),
    settings.cte.nextNumber.toString(),
    settings.cteRetry.maxAttempts.toString(),
    settings.cteRetry.backoffSeconds.join(','),
    settings.mdfe.insuranceResponsibility,
    settings.mdfe.insurerName,
    settings.mdfe.insurerTaxId,
    settings.mdfe.insurancePolicy,
    settings.mdfe.bankCode,
    settings.mdfe.bankBranch,
    settings.mdfe.pixKey,
  ]
  return values.map((value) => TEXT_ENCODER.encode(value))
}

function createAuditSnapshot(settings: CompanySettingsResult): Readonly<Record<string, string>> {
  return {
    cteRetryBackoffSeconds: settings.cteRetry.backoffSeconds.join(','),
    cteRetryMaxAttempts: settings.cteRetry.maxAttempts.toString(),
    environment: settings.cte.environment,
    nextNumber: settings.cte.nextNumber.toString(),
    profileVersion: settings.profile.version.toString(),
    sequenceVersion: settings.cte.version.toString(),
    series: settings.cte.series.toString(),
  }
}
