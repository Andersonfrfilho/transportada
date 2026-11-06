/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCheckAccessKeysUseCase } from '../../src/nfe-documents/application/check-access-keys.use-case.js'
import {
  ACCESS_KEY,
  COMPANY_CONTEXT,
  DOCUMENT_ID,
  OTHER_ACCESS_KEY,
} from '../fixtures/nfe-access-key-lookup.fixture.js'

describe('check access keys application contract', () => {
  test('asks the reader once, by company, and answers in input order with null for the unknown', async () => {
    const calls: Record<string, unknown>[] = []
    const useCase = createCheckAccessKeysUseCase({
      reader: {
        async findDocumentIdsByAccessKeys(params) {
          calls.push({ ...params })
          return new Map([[OTHER_ACCESS_KEY, DOCUMENT_ID]])
        },
      },
    })

    const result = await useCase.execute({
      accessKeys: [ACCESS_KEY, OTHER_ACCESS_KEY],
      context: COMPANY_CONTEXT,
    })

    expect(calls).toEqual([
      { accessKeys: [ACCESS_KEY, OTHER_ACCESS_KEY], companyId: COMPANY_CONTEXT.companyId },
    ])
    expect(result).toEqual([
      { accessKey: ACCESS_KEY, documentId: null },
      { accessKey: OTHER_ACCESS_KEY, documentId: DOCUMENT_ID },
    ])
  })
})
