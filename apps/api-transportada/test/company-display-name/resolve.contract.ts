/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveCompanyDisplayName } from '../../src/companies/domain/company-display-name.policy.js'

const LEGAL_NAME = 'TRANSPORTADORA SINTETICA LTDA'
const TRADE_NAME = 'Sintetica Transportes'

describe('resolveCompanyDisplayName', () => {
  test('uses the trade name when the company chose it', () => {
    expect(
      resolveCompanyDisplayName({
        displayNameMode: 'trade_name',
        legalName: LEGAL_NAME,
        tradeName: TRADE_NAME,
      }),
    ).toBe(TRADE_NAME)
  })

  test('uses the legal name when the company chose it', () => {
    expect(
      resolveCompanyDisplayName({
        displayNameMode: 'legal_name',
        legalName: LEGAL_NAME,
        tradeName: TRADE_NAME,
      }),
    ).toBe(LEGAL_NAME)
  })

  test('defaults to the trade name when no choice reached the reader', () => {
    expect(resolveCompanyDisplayName({ legalName: LEGAL_NAME, tradeName: TRADE_NAME })).toBe(
      TRADE_NAME,
    )
  })

  test('falls back to the legal name when the trade name is blank', () => {
    expect(
      resolveCompanyDisplayName({
        displayNameMode: 'trade_name',
        legalName: LEGAL_NAME,
        tradeName: '   ',
      }),
    ).toBe(LEGAL_NAME)
  })

  test('falls back to the trade name when the legal name is blank', () => {
    expect(
      resolveCompanyDisplayName({
        displayNameMode: 'legal_name',
        legalName: '',
        tradeName: TRADE_NAME,
      }),
    ).toBe(TRADE_NAME)
  })

  test('trims the chosen name', () => {
    expect(
      resolveCompanyDisplayName({
        displayNameMode: 'legal_name',
        legalName: `  ${LEGAL_NAME} `,
        tradeName: TRADE_NAME,
      }),
    ).toBe(LEGAL_NAME)
  })
})
