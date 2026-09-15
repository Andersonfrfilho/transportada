/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  buildContractorContactSubmission,
  CONTRACTOR_CONTACT_VALIDATION_ERROR,
  normalizeContractorContactEmail,
  validateContractorContactEmail,
} from '../../src/modules/delivery-clients/shared/contractorContacts.validation'

describe('contractor contacts validation (spec 150 T301, spec 143 T017)', () => {
  test('an empty email is required', () => {
    expect(validateContractorContactEmail('')).toBe(
      CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_REQUIRED,
    )
    expect(validateContractorContactEmail('   ')).toBe(
      CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_REQUIRED,
    )
  })

  test('a malformed email is invalid', () => {
    expect(validateContractorContactEmail('not-an-email')).toBe(
      CONTRACTOR_CONTACT_VALIDATION_ERROR.EMAIL_INVALID,
    )
  })

  test('a well-formed email passes', () => {
    expect(validateContractorContactEmail('contato@example.com.br')).toBeUndefined()
  })

  test('normalization trims and lowercases, matching the server', () => {
    expect(normalizeContractorContactEmail('  Contato@Example.com.BR  ')).toBe(
      'contato@example.com.br',
    )
  })

  test('the submission carries the normalized email when the draft is valid', () => {
    const submission = buildContractorContactSubmission({
      canDecide: true,
      email: '  Contato@Example.com.BR  ',
      receivesOccurrences: false,
    })

    expect(submission).toEqual({
      canDecide: true,
      email: 'contato@example.com.br',
      receivesOccurrences: false,
    })
  })

  test('an invalid draft never builds a submission', () => {
    expect(
      buildContractorContactSubmission({
        canDecide: false,
        email: 'not-an-email',
        receivesOccurrences: true,
      }),
    ).toBeUndefined()
  })
})
