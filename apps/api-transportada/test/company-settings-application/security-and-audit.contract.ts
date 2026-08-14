/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error'
import {
  COMPANY_ID,
  COMPANY_SETTINGS,
  OTHER_COMPANY_ID,
  SECRET_SENTINEL,
  UPDATE_COMPANY_SETTINGS_INPUT,
  type UpdateCompanySettingsInput,
} from '../fixtures/company-settings-application.fixture'
import {
  captureApiError,
  createUpdateCompanySettingsUseCaseFixture,
} from '../fixtures/company-settings-use-case.fixture'
import {
  CompanySettingsUnitOfWorkFixture,
  createFingerprintFixture,
} from '../fixtures/company-settings-unit-of-work.fixture'

describe('company settings security and audit contract', () => {
  test('persists only allowlisted audit and idempotency data', async () => {
    const unitOfWork = new CompanySettingsUnitOfWorkFixture()
    const useCase = await createUpdateCompanySettingsUseCaseFixture({
      fingerprintService: createFingerprintFixture().port,
      unitOfWork,
    })
    const inputWithUnexpectedSecrets = {
      ...UPDATE_COMPANY_SETTINGS_INPUT,
      certificateBase64: SECRET_SENTINEL,
      password: SECRET_SENTINEL,
      secretEnvelope: SECRET_SENTINEL,
    } as UpdateCompanySettingsInput

    await useCase.execute(inputWithUnexpectedSecrets)

    const persisted = JSON.stringify(
      {
        audits: unitOfWork.audits,
        idempotency: unitOfWork.idempotencyRecords,
      },
      (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
    )
    expect(persisted).not.toContain(SECRET_SENTINEL)
    expect(unitOfWork.audits[0]).toEqual({
      action: 'company-settings.updated',
      actorUserId: UPDATE_COMPANY_SETTINGS_INPUT.context.userId,
      afterSnapshot: {
        cteRetryBackoffSeconds: '10,60,900',
        cteRetryMaxAttempts: '5',
        environment: 'homologation',
        nextNumber: '13809',
        profileVersion: '1',
        sequenceVersion: '1',
        series: '1',
      },
      beforeSnapshot: null,
      companyId: COMPANY_ID,
      correlationId: UPDATE_COMPANY_SETTINGS_INPUT.correlationId,
      entityId: COMPANY_ID,
      entityType: 'company-fiscal-profile',
    })
    expect(Object.keys(unitOfWork.idempotencyRecords[0] ?? {}).sort()).toEqual([
      'companyId',
      'fingerprint',
      'idempotencyKey',
      'operation',
      'response',
    ])
  })

  test('returns one generic conflict without enumerating an existing CNPJ owner', async () => {
    const unitOfWork = new CompanySettingsUnitOfWorkFixture()
    const { CompanyFiscalProfileConflictError } = await import(
      '../../src/companies/domain/company-settings.error.js'
    )
    unitOfWork.saveError = new CompanyFiscalProfileConflictError()
    const useCase = await createUpdateCompanySettingsUseCaseFixture({
      fingerprintService: createFingerprintFixture().port,
      unitOfWork,
    })

    const error = await captureApiError(() => useCase.execute(UPDATE_COMPANY_SETTINGS_INPUT))

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'FISCAL_SETTINGS_CONFLICT',
      message: 'Company fiscal settings conflict',
      status: 409,
    })
    expect(Object.keys(error).sort()).toEqual(['code', 'details', 'headers', 'name', 'status'])
    for (const sensitive of [COMPANY_SETTINGS.profile.cnpj, COMPANY_ID, OTHER_COMPANY_ID]) {
      expect(String(error)).not.toContain(sensitive)
      expect(JSON.stringify(error)).not.toContain(sensitive)
    }
  })

  test.each([
    {
      code: 'FISCAL_SETTINGS_VERSION_CONFLICT',
      errorName: 'CompanySettingsVersionConflictError',
      message: 'Company fiscal settings version conflict',
    },
    {
      code: 'FISCAL_SEQUENCE_LOCKED',
      errorName: 'FiscalSequenceLockedError',
      message: 'Fiscal sequence is locked',
    },
  ])('keeps $errorName conflict details safe', async ({ code, errorName, message }) => {
    const unitOfWork = new CompanySettingsUnitOfWorkFixture()
    const errors = (await import(
      '../../src/companies/domain/company-settings.error.js'
    )) as Readonly<Record<string, new () => Error>>
    const ConflictError = errors[errorName]
    if (!ConflictError) throw new Error('Expected company settings conflict error')
    unitOfWork.saveError = new ConflictError()
    const useCase = await createUpdateCompanySettingsUseCaseFixture({
      fingerprintService: createFingerprintFixture().port,
      unitOfWork,
    })

    const error = await captureApiError(() => useCase.execute(UPDATE_COMPANY_SETTINGS_INPUT))

    expect(error).toMatchObject({ code, message, status: 409 })
    expect(Object.keys(error).sort()).toEqual(['code', 'details', 'headers', 'name', 'status'])
    expect(JSON.stringify(error)).not.toContain(COMPANY_ID)
    expect(unitOfWork.settings).toBeNull()
    expect(unitOfWork.audits).toEqual([])
    expect(unitOfWork.idempotencyRecords).toEqual([])
  })
})
