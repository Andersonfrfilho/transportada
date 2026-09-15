/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { NFE_DOCUMENT_STATUS_INVARIANT_BROKEN } from '../../src/nfe-documents/domain/nfe-document-status.constant.js'
import { NfeDocumentStatusInvariantError } from '../../src/nfe-documents/domain/nfe-document-status.error.js'

const COMPANY_ID = 'a2fb6f1e-3f4b-4a4f-9a1e-0c74dbdc3a11'

describe('NfeDocumentStatusInvariantError (spec 149, revisão final)', () => {
  test('carries the stable code, the step and the company in the message', () => {
    const error = new NfeDocumentStatusInvariantError({
      companyId: COMPANY_ID,
      step: 'apply-status-change',
    })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('NfeDocumentStatusInvariantError')
    expect(error.code).toBe(NFE_DOCUMENT_STATUS_INVARIANT_BROKEN)
    expect(error.context).toEqual({ companyId: COMPANY_ID, step: 'apply-status-change' })
    expect(error.message).toBe(
      `${NFE_DOCUMENT_STATUS_INVARIANT_BROKEN} {"companyId":"${COMPANY_ID}","step":"apply-status-change"}`,
    )
  })
})
