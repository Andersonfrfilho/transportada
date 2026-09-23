/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T26 (RF28): `GET /occurrence-charges/report` — a resposta é entrada não confiável, e
 * o guard recusa forma inesperada em vez de deixar `undefined` vazar para a tela de dinheiro.
 */
import { describe, expect, it } from 'bun:test'

import { DELIVERY_CHARGE_TYPES } from '@/modules/extra-charges/shared/extraCharges.types'
import {
  ExtraChargeResponseError,
  toOccurrenceChargeReportPage,
} from '@/modules/extra-charges/shared/extraChargesResponse.validation'

import chargesEnLocale from '@/modules/extra-charges/locales/extraCharges.en.locale.json'
import chargesLocale from '@/modules/extra-charges/locales/extraCharges.locale.json'

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

  /**
   * B1 da revisão da T30: a linha do relatório é **sempre** `returned_goods` hoje, e o cast cego
   * deixava o valor passar sem rótulo — a tabela imprimia `chargeType.returned_goods`.
   */
  it('aceita returned_goods, que é o tipo que esta tela lista', () => {
    const payload = buildPayload()
    payload.data[0].chargeType = 'returned_goods'
    payload.totals.byChargeType[0].chargeType = 'returned_goods'

    expect(toOccurrenceChargeReportPage(payload).items[0]?.chargeType).toBe('returned_goods')
  })

  it('recusa tipo de cobrança fora do vocabulário, em vez de deixar o cast afirmar', () => {
    const payload = buildPayload()
    payload.data[0].chargeType = 'mercadoria_devolvida'

    expect(() => toOccurrenceChargeReportPage(payload)).toThrow(ExtraChargeResponseError)
  })

  it('recusa situação fora do vocabulário', () => {
    const payload = buildPayload()
    payload.data[0].status = 'quase_aprovada'

    expect(() => toOccurrenceChargeReportPage(payload)).toThrow(ExtraChargeResponseError)
  })
})

/** Tipo sem rótulo vira chave crua na tela — o filtro e a coluna leem a mesma lista. */
describe('rótulo de cada tipo de cobrança (revisão T30 B1)', () => {
  for (const chargeType of DELIVERY_CHARGE_TYPES) {
    it(`tem rótulo pt-BR e inglês para ${chargeType}`, () => {
      expect(chargesLocale.chargeType[chargeType]).toBeString()
      expect(chargesEnLocale.chargeType[chargeType]).toBeString()
    })
  }
})
