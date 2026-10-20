/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T2: o texto que a thread do pdf.js lê de um PDF de verdade é o que a conferência do boleto
 * espera — o boleto confirma, o DANFE não, e um arquivo ilegível vira texto vazio (nunca exceção).
 */
import { describe, expect, test } from 'bun:test'

import { readPdfTextInThread } from '../../src/aggregate-attachment/infrastructure/threaded-extraction.gateway.js'
import { checkBoletoDocument } from '../../src/occurrence-conversation/domain/contractor-reply-document.policy.js'
import { buildBoletoPdf, buildNotePdf } from '../fixtures/boleto-pdf.fixture.js'

const NOTE = { number: '912453', totalValue: '1.00' }

describe('texto do PDF para a conferência do boleto (spec 276 T2)', () => {
  test('o boleto lido na thread confirma pela linha e pelo número', async () => {
    const text = await readPdfTextInThread(buildBoletoPdf('912453'))

    expect(checkBoletoDocument({ note: NOTE, text })).toEqual({
      confirmed: true,
      matchedBy: 'number',
    })
  })

  test('o DANFE lido na thread não tem linha digitável', async () => {
    const text = await readPdfTextInThread(buildNotePdf('912453'))

    expect(checkBoletoDocument({ note: NOTE, text })).toEqual({
      confirmed: false,
      missing: 'payment_line',
    })
  })

  test('bytes que não são PDF viram texto vazio', async () => {
    expect(await readPdfTextInThread(new TextEncoder().encode('%PDF-1.4 quebrado'))).toBe('')
  })
})
