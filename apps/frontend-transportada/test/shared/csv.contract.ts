/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { escapeCsvField } from '../../src/modules/shared/csv.service'

/**
 * T14 item 2: dado de XML fiscal de terceiro (`productCode`/`cartonGtin` da NF-e) alimenta os
 * exports de CSV sem validação de conteúdo — só de shape. Um campo começando com `=`/`+`/`-`/`@`
 * ou tab/CR é fórmula para o Excel, e `escapeField` antigo só duplicava aspas.
 */
describe('escapeCsvField (T14 item 2)', () => {
  test.each([['='], ['+'], ['-'], ['@'], ['\t'], ['\r']])(
    'neutraliza campo que começa com %p, gatilho de fórmula',
    (trigger) => {
      const malicious = `${trigger}cmd|'/C calc'!A1`
      expect(escapeCsvField(malicious)).toBe(`"'${malicious.replace(/"/g, '""')}"`)
    },
  )

  test('não mexe em campo normal, só escapa aspas internas', () => {
    expect(escapeCsvField('Ribeirão Preto/SP')).toBe('"Ribeirão Preto/SP"')
    expect(escapeCsvField('linha com "aspas"')).toBe('"linha com ""aspas"""')
  })

  test('não neutraliza um sinal de menos no meio do campo, só no início', () => {
    expect(escapeCsvField('PROD-9')).toBe('"PROD-9"')
  })
})
