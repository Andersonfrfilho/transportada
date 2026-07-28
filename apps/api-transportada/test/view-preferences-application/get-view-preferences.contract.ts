/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createGetViewPreferencesUseCase } from '../../src/view-preferences/application/get-view-preferences.use-case.js'
import type { ViewPreferencesReaderPort } from '../../src/view-preferences/application/view-preferences.port.js'
import {
  COMPANY_CONTEXT,
  COMPANY_ID,
  OTHER_COMPANY_ID,
  OTHER_USER_ID,
  SAMPLE_PREFERENCES,
  USER_ID,
  VIEW_KEY,
} from '../fixtures/view-preferences-application.fixture'

describe('get view preferences application contract', () => {
  test('reads only the company and user from the authenticated context', async () => {
    const lookups: Array<{ companyId: string; userId: string; viewKey: string }> = []
    const repository: ViewPreferencesReaderPort = {
      async find(input) {
        lookups.push(input)
        return input.companyId === COMPANY_ID && input.userId === USER_ID
          ? {
              preferences: structuredClone(SAMPLE_PREFERENCES),
              updatedAt: '2026-07-24T00:00:00.000Z',
            }
          : null
      },
    }
    const useCase = createGetViewPreferencesUseCase({ repository })

    const attackerInput = {
      companyId: OTHER_COMPANY_ID,
      context: COMPANY_CONTEXT,
      userId: OTHER_USER_ID,
      viewKey: VIEW_KEY,
    } as { readonly context: typeof COMPANY_CONTEXT; readonly viewKey: string }

    const result = await useCase.execute(attackerInput)

    expect(result?.preferences).toEqual(SAMPLE_PREFERENCES)
    expect(lookups).toEqual([{ companyId: COMPANY_ID, userId: USER_ID, viewKey: VIEW_KEY }])
  })

  test('returns null without probing another tenant when absent', async () => {
    const lookups: Array<{ companyId: string; userId: string; viewKey: string }> = []
    const repository: ViewPreferencesReaderPort = {
      async find(input) {
        lookups.push(input)
        return null
      },
    }
    const useCase = createGetViewPreferencesUseCase({ repository })

    expect(await useCase.execute({ context: COMPANY_CONTEXT, viewKey: VIEW_KEY })).toBeNull()
    expect(lookups).toEqual([{ companyId: COMPANY_ID, userId: USER_ID, viewKey: VIEW_KEY }])
  })
})
