/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  COMPANY_ID,
  EXPECTED_SETTINGS_RESULT,
  OTHER_COMPANY_ID,
} from '../fixtures/company-settings-application.fixture'
import {
  createGetCompanySettingsUseCaseFixture,
  type CompanySettingsReaderPort,
} from '../fixtures/company-settings-use-case.fixture'

describe('get company settings application contract', () => {
  test('reads only the company from authenticated CompanyContext', async () => {
    const lookupCompanyIds: string[] = []
    const repository: CompanySettingsReaderPort = {
      async findByCompanyId({ companyId }) {
        lookupCompanyIds.push(companyId)
        return companyId === COMPANY_ID ? structuredClone(EXPECTED_SETTINGS_RESULT) : null
      },
    }
    const useCase = await createGetCompanySettingsUseCaseFixture({ repository })
    const attackerInput = {
      companyId: OTHER_COMPANY_ID,
      context: COMPANY_CONTEXT,
    } as { readonly context: typeof COMPANY_CONTEXT }

    const result = await useCase.execute(attackerInput)

    expect(result).toEqual(EXPECTED_SETTINGS_RESULT)
    expect(lookupCompanyIds).toEqual([COMPANY_ID])
    expect(result).not.toHaveProperty('secretEnvelope')
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('certificateBase64')
  })

  test('returns an empty result without probing another tenant', async () => {
    const lookupCompanyIds: string[] = []
    const repository: CompanySettingsReaderPort = {
      async findByCompanyId({ companyId }) {
        lookupCompanyIds.push(companyId)
        return null
      },
    }
    const useCase = await createGetCompanySettingsUseCaseFixture({ repository })

    expect(await useCase.execute({ context: COMPANY_CONTEXT })).toBeNull()
    expect(lookupCompanyIds).toEqual([COMPANY_ID])
  })
})
