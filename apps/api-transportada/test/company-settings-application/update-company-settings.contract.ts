/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_ID,
  COMPANY_SETTINGS,
  EXPECTED_FINGERPRINT_FIELDS,
  EXPECTED_SETTINGS_RESULT,
  IDEMPOTENCY_KEY,
  OTHER_COMPANY_ID,
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
  expectOnlyAuthenticatedCompany,
} from '../fixtures/company-settings-unit-of-work.fixture'

describe('update company settings application contract', () => {
  test('derives every persistence and audit scope from CompanyContext', async () => {
    const unitOfWork = new CompanySettingsUnitOfWorkFixture()
    const fingerprint = createFingerprintFixture()
    const useCase = await createUpdateCompanySettingsUseCaseFixture({
      fingerprintService: fingerprint.port,
      unitOfWork,
    })
    const attackerInput = {
      ...UPDATE_COMPANY_SETTINGS_INPUT,
      companyId: OTHER_COMPANY_ID,
      settings: {
        ...COMPANY_SETTINGS,
        companyId: OTHER_COMPANY_ID,
      },
    } as UpdateCompanySettingsInput

    expect(await useCase.execute(attackerInput)).toEqual(EXPECTED_SETTINGS_RESULT)
    expectOnlyAuthenticatedCompany(unitOfWork)
    expect(unitOfWork.audits).toHaveLength(1)
    expect(unitOfWork.audits[0]).toMatchObject({
      actorUserId: UPDATE_COMPANY_SETTINGS_INPUT.context.userId,
      companyId: COMPANY_ID,
      correlationId: UPDATE_COMPANY_SETTINGS_INPUT.correlationId,
    })
    expect(unitOfWork.idempotencyRecords[0]?.companyId).toBe(COMPANY_ID)
  })

  test('normalizes fingerprint fields in a fixed order before starting effects', async () => {
    const unitOfWork = new CompanySettingsUnitOfWorkFixture()
    const fingerprint = createFingerprintFixture()
    const useCase = await createUpdateCompanySettingsUseCaseFixture({
      fingerprintService: fingerprint.port,
      unitOfWork,
    })

    await useCase.execute(UPDATE_COMPANY_SETTINGS_INPUT)

    expect(fingerprint.inputs).toHaveLength(1)
    expect(fingerprint.inputs[0]?.operation).toBe('company-settings.update')
    expect(fingerprint.inputs[0]?.fields.map((field) => new TextDecoder().decode(field))).toEqual([
      ...EXPECTED_FINGERPRINT_FIELDS,
    ])
  })

  test('replays the stored safe response without another mutation or audit', async () => {
    const unitOfWork = new CompanySettingsUnitOfWorkFixture()
    const fingerprint = createFingerprintFixture()
    const useCase = await createUpdateCompanySettingsUseCaseFixture({
      fingerprintService: fingerprint.port,
      unitOfWork,
    })

    const first = await useCase.execute(UPDATE_COMPANY_SETTINGS_INPUT)
    const replay = await useCase.execute(UPDATE_COMPANY_SETTINGS_INPUT)

    expect(replay).toEqual(first)
    expect(unitOfWork.saveInputs).toHaveLength(1)
    expect(unitOfWork.audits).toHaveLength(1)
    expect(unitOfWork.idempotencyRecords).toHaveLength(1)
  })

  test('rejects reuse of the idempotency key for a different normalized intent', async () => {
    const unitOfWork = new CompanySettingsUnitOfWorkFixture()
    const fingerprint = createFingerprintFixture()
    const useCase = await createUpdateCompanySettingsUseCaseFixture({
      fingerprintService: fingerprint.port,
      unitOfWork,
    })
    await useCase.execute(UPDATE_COMPANY_SETTINGS_INPUT)

    const error = await captureApiError(() =>
      useCase.execute({
        ...UPDATE_COMPANY_SETTINGS_INPUT,
        settings: {
          ...COMPANY_SETTINGS,
          profile: { ...COMPANY_SETTINGS.profile, tradeName: 'Different intent' },
        },
      }),
    )

    expect(error).toEqual(
      expect.objectContaining({
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'Idempotency key cannot be reused',
        status: 409,
      }),
    )
    expect(Object.keys(error).sort()).toEqual(['code', 'headers', 'name', 'status'])
    for (const sensitive of [IDEMPOTENCY_KEY, COMPANY_ID, COMPANY_SETTINGS.profile.cnpj]) {
      expect(String(error)).not.toContain(sensitive)
      expect(JSON.stringify(error)).not.toContain(sensitive)
    }
    expect(unitOfWork.saveInputs).toHaveLength(1)
    expect(unitOfWork.audits).toHaveLength(1)
  })

  test('rolls back settings and idempotency when append-only audit persistence fails', async () => {
    const unitOfWork = new CompanySettingsUnitOfWorkFixture()
    unitOfWork.auditError = new Error('audit persistence unavailable')
    const useCase = await createUpdateCompanySettingsUseCaseFixture({
      fingerprintService: createFingerprintFixture().port,
      unitOfWork,
    })

    await expect(useCase.execute(UPDATE_COMPANY_SETTINGS_INPUT)).rejects.toThrow(
      'audit persistence unavailable',
    )
    expect(unitOfWork.settings).toBeNull()
    expect(unitOfWork.saveInputs).toEqual([])
    expect(unitOfWork.audits).toEqual([])
    expect(unitOfWork.idempotencyRecords).toEqual([])
  })

  test('rolls back settings and audit when idempotency persistence fails', async () => {
    const unitOfWork = new CompanySettingsUnitOfWorkFixture()
    unitOfWork.idempotencyError = new Error('idempotency persistence unavailable')
    const useCase = await createUpdateCompanySettingsUseCaseFixture({
      fingerprintService: createFingerprintFixture().port,
      unitOfWork,
    })

    await expect(useCase.execute(UPDATE_COMPANY_SETTINGS_INPUT)).rejects.toThrow(
      'idempotency persistence unavailable',
    )
    expect(unitOfWork.settings).toBeNull()
    expect(unitOfWork.saveInputs).toEqual([])
    expect(unitOfWork.audits).toEqual([])
    expect(unitOfWork.idempotencyRecords).toEqual([])
  })
})
