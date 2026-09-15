/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_SETTINGS_PERSISTENCE_FAILURE,
  CompanySettingsPersistenceError,
} from '../../src/companies/domain/company-settings-persistence.error'
import { describeErrorForLog } from '../../src/logging/error-descriptor.service'

describe('company settings persistence failure in the log', () => {
  test('names the failure and carries our message, never data', () => {
    const descriptor = describeErrorForLog(
      new CompanySettingsPersistenceError(
        COMPANY_SETTINGS_PERSISTENCE_FAILURE.sequenceNotPersisted,
      ),
    )

    expect(descriptor).toEqual({
      errorName: 'CompanySettingsPersistenceError',
      message: 'Company fiscal sequence could not be persisted',
    })
  })
})
