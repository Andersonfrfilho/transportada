/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'

export function expectApiErrorCode(execute: () => unknown, code: string): void {
  try {
    execute()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe(code)
    return
  }

  throw new Error(`Expected the call to fail with ${code}`)
}
