/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  LOOKUP_ID,
  REFUSED_VIEW,
} from '../fixtures/nfe-access-key-lookup.fixture.js'
import { captureApiError } from '../fixtures/nfe-import-use-case.fixture.js'

type GetUseCase = { execute(input: Record<string, unknown>): Promise<unknown> }

async function createGetUseCase(reader: {
  findById(input: Record<string, unknown>): Promise<unknown>
}): Promise<GetUseCase> {
  const module = (await import(
    '../../src/nfe-access-key-lookups/application/get-access-key-lookup.use-case.js'
  )) as { createGetAccessKeyLookupUseCase(dependencies: { reader: typeof reader }): GetUseCase }
  return module.createGetAccessKeyLookupUseCase({ reader })
}

describe('get access key lookup application contract', () => {
  test('reads by company and id, never by id alone', async () => {
    const calls: Record<string, unknown>[] = []
    const useCase = await createGetUseCase({
      async findById(input) {
        calls.push(input)
        return REFUSED_VIEW
      },
    })

    const result = await useCase.execute({ context: COMPANY_CONTEXT, lookupId: LOOKUP_ID })

    expect(result).toEqual(REFUSED_VIEW)
    expect(calls).toEqual([{ companyId: COMPANY_CONTEXT.companyId, lookupId: LOOKUP_ID }])
  })

  test('404 NFE_ACCESS_KEY_LOOKUP_NOT_FOUND when there is no lookup for that company', async () => {
    const useCase = await createGetUseCase({ findById: async () => null })

    const error = await captureApiError(() =>
      useCase.execute({ context: COMPANY_CONTEXT, lookupId: LOOKUP_ID }),
    )

    expect(error.status).toBe(404)
    expect(error.code).toBe('NFE_ACCESS_KEY_LOOKUP_NOT_FOUND')
  })
})
