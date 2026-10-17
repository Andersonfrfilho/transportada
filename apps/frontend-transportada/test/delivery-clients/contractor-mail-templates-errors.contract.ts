/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  contractorMailTemplateErrorLocaleKey,
  isMailTemplateVersionConflict,
} from '../../src/modules/delivery-clients/shared/contractorMailTemplateErrors.service'

describe('contractor mail template error map', () => {
  test('maps every known server code to a locale key', () => {
    expect(contractorMailTemplateErrorLocaleKey('CONTRACTOR_MAIL_TEMPLATE_ARCHIVED')).toBe(
      'mailTemplates.errorArchived',
    )
    expect(contractorMailTemplateErrorLocaleKey('CONTRACTOR_MAIL_TEMPLATE_NAME_TAKEN')).toBe(
      'mailTemplates.errorNameTaken',
    )
    expect(contractorMailTemplateErrorLocaleKey('CONTRACTOR_MAIL_TEMPLATE_NOT_FOUND')).toBe(
      'mailTemplates.errorNotFound',
    )
    expect(contractorMailTemplateErrorLocaleKey('CONTRACTOR_MAIL_TEMPLATE_VERSION_CONFLICT')).toBe(
      'mailTemplates.errorVersionConflict',
    )
    expect(contractorMailTemplateErrorLocaleKey('INVALID_REQUEST')).toBe(
      'mailTemplates.errorInvalidRequest',
    )
  })

  test('falls back to the generic message for an unknown code', () => {
    expect(contractorMailTemplateErrorLocaleKey('SOMETHING_NEW')).toBe('mailTemplates.errorGeneric')
  })

  test('flags only the version conflict code', () => {
    expect(isMailTemplateVersionConflict('CONTRACTOR_MAIL_TEMPLATE_VERSION_CONFLICT')).toBe(true)
    expect(isMailTemplateVersionConflict('CONTRACTOR_MAIL_TEMPLATE_ARCHIVED')).toBe(false)
  })
})
