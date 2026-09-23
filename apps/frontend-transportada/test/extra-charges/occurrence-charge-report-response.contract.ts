/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T26 (RF28): `GET /occurrence-charges/report` — a resposta é entrada não confiável, e
 * o guard recusa forma inesperada em vez de deixar `undefined` vazar para a tela de dinheiro.
 */
import { describe, expect, it } from 'bun:test'

import {
  ExtraChargeResponseError,
  toOccurrenceChargeReportPage,
} from '@/modules/extra-charges/shared/extraChargesResponse.validation'

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        accessKey: null,
        amount: '10.0000',
        chargeType: 'unloading',
        chargedOn: '2026-09-01',
        contractorId: 'contractor-1',
        hasSettlement: false,
        id: 'row-1',
        noteNumber: '123',
        noteSeries: '1',
        occurrenceId: 'occurrence-1',
        status: 'approved',
        tripDocumentId: 'document-1',
      },
    ],
    page: { nextCursor: null },
    totals: {
      byChargeType: [{ amount: '10.0000', chargeType: 'unloading', count: 1 }],
      totalAmount: '10.0000',
      totalCount: 1,
    },
    ...overrides,
  }
}

describe('toOccurrenceChargeReportPage (spec 164 T26)', () => {
  it('lê a página com linhas e totais', () => {
    const page = toOccurrenceChargeReportPage(buildPayload())

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.hasSettlement).toBe(false)
    expect(page.totals.totalAmount).toBe('10.0000')
    expect(page.nextCursor).toBeNull()
  })

  it('recusa payload sem `data`', () => {
    expect(() => toOccurrenceChargeReportPage({ page: { nextCursor: null }, totals: {} })).toThrow(
      ExtraChargeResponseError,
    )
  })

  it('recusa linha sem `hasSettlement` booleano', () => {
    const payload = buildPayload()
    // @ts-expect-error -- forma inválida de propósito, para provar que o guard recusa
    payload.data[0].hasSettlement = 'sim'

    expect(() => toOccurrenceChargeReportPage(payload)).toThrow(ExtraChargeResponseError)
  })
})
