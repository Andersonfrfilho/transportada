/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../src/shared/api.error'
import type { UpdateCompanySettingsInput } from './company-settings-application.fixture'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'
import type {
  CompanySettingsUnitOfWorkPort,
  IdempotencyFingerprintPort,
  SafeCompanySettingsResult,
} from './company-settings-unit-of-work.fixture'

type UpdateCompanySettingsUseCase = {
  execute(input: UpdateCompanySettingsInput): Promise<SafeCompanySettingsResult>
}

type CreateUpdateCompanySettingsUseCase = (input: {
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly unitOfWork: CompanySettingsUnitOfWorkPort
}) => UpdateCompanySettingsUseCase

export type CompanySettingsReaderPort = {
  findByCompanyId(input: { readonly companyId: string }): Promise<SafeCompanySettingsResult | null>
}

type GetCompanySettingsUseCase = {
  execute(input: { readonly context: CompanyContext }): Promise<SafeCompanySettingsResult | null>
}

type CreateGetCompanySettingsUseCase = (input: {
  readonly repository: CompanySettingsReaderPort
}) => GetCompanySettingsUseCase

export async function createGetCompanySettingsUseCaseFixture(input: {
  readonly repository: CompanySettingsReaderPort
}): Promise<GetCompanySettingsUseCase> {
  const module = (await import(
    '../../src/companies/application/get-company-settings.use-case.js'
  )) as {
    readonly createGetCompanySettingsUseCase: CreateGetCompanySettingsUseCase
  }
  return module.createGetCompanySettingsUseCase(input)
}

export async function createUpdateCompanySettingsUseCaseFixture(input: {
  readonly fingerprintService: IdempotencyFingerprintPort
  readonly unitOfWork: CompanySettingsUnitOfWorkPort
}): Promise<UpdateCompanySettingsUseCase> {
  const module = (await import(
    '../../src/companies/application/update-company-settings.use-case.js'
  )) as {
    readonly createUpdateCompanySettingsUseCase: CreateUpdateCompanySettingsUseCase
  }
  return module.createUpdateCompanySettingsUseCase(input)
}

export async function captureApiError(operation: () => Promise<unknown>): Promise<ApiError> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('Expected operation to fail')
}
