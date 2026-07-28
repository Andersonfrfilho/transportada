/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createSaveViewPreferencesUseCase } from '../../src/view-preferences/application/save-view-preferences.use-case.js'
import type { ViewPreferencesWriterPort } from '../../src/view-preferences/application/view-preferences.port.js'
import {
  COMPANY_CONTEXT,
  COMPANY_ID,
  OTHER_COMPANY_ID,
  OTHER_USER_ID,
  SAMPLE_PREFERENCES,
  USER_ID,
  VIEW_KEY,
} from '../fixtures/view-preferences-application.fixture'

describe('save view preferences application contract', () => {
  test('persists under the company and user from the authenticated context only', async () => {
    const writes: Array<{
      companyId: string
      preferences: Record<string, unknown>
      userId: string
      viewKey: string
    }> = []
    const repository: ViewPreferencesWriterPort = {
      async save(input) {
        writes.push(input)
        return { preferences: input.preferences, updatedAt: '2026-07-24T00:00:00.000Z' }
      },
    }
    const useCase = createSaveViewPreferencesUseCase({ repository })

    const attackerInput = {
      companyId: OTHER_COMPANY_ID,
      context: COMPANY_CONTEXT,
      preferences: SAMPLE_PREFERENCES,
      userId: OTHER_USER_ID,
      viewKey: VIEW_KEY,
    } as {
      readonly context: typeof COMPANY_CONTEXT
      readonly preferences: Record<string, unknown>
      readonly viewKey: string
    }

    const result = await useCase.execute(attackerInput)

    expect(result.preferences).toEqual(SAMPLE_PREFERENCES)
    expect(writes).toEqual([
      {
        companyId: COMPANY_ID,
        preferences: SAMPLE_PREFERENCES,
        userId: USER_ID,
        viewKey: VIEW_KEY,
      },
    ])
    expect(writes[0]?.companyId).not.toBe(OTHER_COMPANY_ID)
    expect(writes[0]?.userId).not.toBe(OTHER_USER_ID)
  })
})
