/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

const API_ROOT = '../../../api-transportada/'
const MIRRORED_FILES = [
  'src/occurrence-conversation/domain/contractor-reply.policy.ts',
  'src/shared/occurrence-contractor-reply.constant.ts',
  'test/occurrence-conversation/contractor-reply.contract.ts',
] as const

/** Spec 248 CA03: the API and the worker decide the reply by the same table, in a copy by value. */
describe('contractor reply parity (spec 248 CA03)', () => {
  for (const file of MIRRORED_FILES) {
    test(`${file} is byte-identical in both apps`, async () => {
      const [worker, api] = await Promise.all([
        readFile(new URL(`../../${file}`, import.meta.url), 'utf8'),
        readFile(new URL(`${API_ROOT}${file}`, import.meta.url), 'utf8'),
      ])

      expect(worker).toBe(api)
    })
  }
})
