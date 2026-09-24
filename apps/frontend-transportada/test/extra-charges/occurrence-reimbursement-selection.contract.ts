/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T26 (RF32): a soma da seleção nunca passa por `number`, e o período do fechamento é
 * calculado a partir das linhas marcadas — recusando seleção vazia, mista entre contratantes ou
 * sem contratante identificado.
 */
import { describe, expect, it } from 'bun:test'

import type { OccurrenceChargeReportRow } from '@/modules/extra-charges/shared/extraCharges.types'
import {
  resolveSelectionPeriod,
  SELECTION_PERIOD_ERROR,
  sumSelectedReimbursementAmounts,
  toggleReimbursementRow,
} from '@/modules/extra-charges/shared/occurrenceReimbursementSelection.service'

function row(overrides: Partial<OccurrenceChargeReportRow> = {}): OccurrenceChargeReportRow {
  return {
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
    ...overrides,
  }
}

describe('toggleReimbursementRow (spec 164 T26)', () => {
  it('marca e desmarca a linha', () => {
    const marked = toggleReimbursementRow(new Set(), 'row-1')
    expect(marked.has('row-1')).toBe(true)

    const unmarked = toggleReimbursementRow(marked, 'row-1')
    expect(unmarked.has('row-1')).toBe(false)
  })
})

describe('sumSelectedReimbursementAmounts (spec 164 T26)', () => {
  it('soma só as linhas marcadas, em decimal exato (dez vezes R$0,10 bate R$1,00)', () => {
    const rows = Array.from({ length: 10 }, (_, index) => row({ amount: '0.10', id: `r${index}` }))
    const selected = new Set(rows.map((entry) => entry.id))

    expect(sumSelectedReimbursementAmounts(rows, selected)).toBe('1.00')
  })

  it('sem seleção, o total é zero', () => {
    expect(sumSelectedReimbursementAmounts([row()], new Set())).toBe('0.00')
  })
})

describe('resolveSelectionPeriod (spec 164 T26)', () => {
  it('recusa seleção vazia', () => {
    expect(resolveSelectionPeriod([row()], new Set())).toBe(SELECTION_PERIOD_ERROR.EMPTY)
  })

  it('recusa seleção com mais de um contratante', () => {
    const rows = [row({ contractorId: 'a', id: 'r1' }), row({ contractorId: 'b', id: 'r2' })]
    expect(resolveSelectionPeriod(rows, new Set(['r1', 'r2']))).toBe(
      SELECTION_PERIOD_ERROR.MIXED_CONTRACTOR,
    )
  })

  it('recusa linha sem contratante identificado', () => {
    const rows = [row({ contractorId: null, id: 'r1' })]
    expect(resolveSelectionPeriod(rows, new Set(['r1']))).toBe(
      SELECTION_PERIOD_ERROR.MISSING_CONTRACTOR,
    )
  })

  it('cobre o intervalo das datas marcadas, do mesmo contratante', () => {
    const rows = [
      row({ chargedOn: '2026-09-05', id: 'r1' }),
      row({ chargedOn: '2026-09-01', id: 'r2' }),
      row({ chargedOn: '2026-09-20', id: 'r3' }),
    ]
    expect(resolveSelectionPeriod(rows, new Set(['r1', 'r2', 'r3']))).toEqual({
      chargeIds: ['r1', 'r2', 'r3'],
      contractorId: 'contractor-1',
      periodEnd: '2026-09-20',
      periodStart: '2026-09-01',
    })
  })

  it('leva a lista de ids marcados — o fechamento passa a ser por seleção, não por período inteiro', () => {
    const rows = [row({ id: 'r1' }), row({ id: 'r2' }), row({ id: 'r3' })]
    const result = resolveSelectionPeriod(rows, new Set(['r1', 'r3']))
    if (typeof result === 'string') throw new Error('expected a SelectionPeriod')
    expect(result.chargeIds).toEqual(['r1', 'r3'])
  })
})
