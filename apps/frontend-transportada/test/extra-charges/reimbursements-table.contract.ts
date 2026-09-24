/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão de design da spec 164 (T30): a tabela de ressarcimentos. B2 — sete colunas em 375px
 * empurravam a página inteira para o lado, contra `docs/frontend/responsive.md`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { OccurrenceChargeReportRow } from '@/modules/extra-charges/shared/extraCharges.types'
import {
  resolveRowIneligibility,
  resolveSelectedContractorId,
  ROW_INELIGIBILITY,
} from '@/modules/extra-charges/shared/occurrenceReimbursementSelection.service'

import chargesEnLocale from '@/modules/extra-charges/locales/extraCharges.en.locale.json'
import chargesLocale from '@/modules/extra-charges/locales/extraCharges.locale.json'

function row(overrides: Partial<OccurrenceChargeReportRow> = {}): OccurrenceChargeReportRow {
  return {
    accessKey: null,
    amount: '10.0000',
    chargeType: 'returned_goods',
    chargedOn: '2026-09-01',
    contractorId: 'contractor-1',
    hasSettlement: false,
    id: 'row-1',
    noteNumber: '1',
    noteSeries: '1',
    occurrenceId: 'occurrence-1',
    status: 'approved',
    tripDocumentId: 'document-1',
    ...overrides,
  }
}

const PAGE = readFileSync(
  new URL(
    '../../src/modules/extra-charges/pages/OccurrenceReimbursementsWorkspace.page.tsx',
    import.meta.url,
  ),
  'utf8',
)
const STYLES = readFileSync(
  new URL('../../src/modules/extra-charges/styles/extraCharges.module.css', import.meta.url),
  'utf8',
)

describe('B2: a tabela rola dentro do próprio contêiner', () => {
  it('a tabela nasce dentro do contêiner de rolagem', () => {
    expect(PAGE).toContain('<div className={styles.tableScroll}>')
    expect(PAGE.indexOf('styles.tableScroll')).toBeLessThan(PAGE.indexOf('styles.table}'))
  })

  it('o contêiner rola na horizontal e encolhe dentro da grade', () => {
    const rule = STYLES.slice(
      STYLES.indexOf('.tableScroll {'),
      STYLES.indexOf('}', STYLES.indexOf('.tableScroll {')),
    )

    expect(rule).toContain('overflow-x: auto')
    expect(rule).toContain('min-width: 0')
  })
})

/** A linha inelegível se anuncia na linha, em vez de o operador descobrir no rodapé. */
describe('a linha que não pode entrar diz por quê', () => {
  it('linha sem contratante é inelegível de saída', () => {
    expect(resolveRowIneligibility(row({ contractorId: null }), null)).toBe(
      ROW_INELIGIBILITY.MISSING_CONTRACTOR,
    )
  })

  it('linha de outro contratante é inelegível depois da primeira marcação', () => {
    expect(resolveRowIneligibility(row({ contractorId: 'contractor-2' }), 'contractor-1')).toBe(
      ROW_INELIGIBILITY.OTHER_CONTRACTOR,
    )
  })

  it('sem nada marcado, qualquer linha com contratante é elegível', () => {
    expect(resolveRowIneligibility(row(), null)).toBeNull()
  })

  it('o contratante da seleção sai da primeira linha marcada', () => {
    const rows = [
      row({ contractorId: null, id: 'a' }),
      row({ contractorId: 'contractor-9', id: 'b' }),
    ]

    expect(resolveSelectedContractorId(rows, new Set(['b']))).toBe('contractor-9')
    expect(resolveSelectedContractorId(rows, new Set())).toBeNull()
  })

  it('a página desabilita o checkbox da linha inelegível, com o motivo ao lado', () => {
    expect(PAGE).toContain('disabled={ineligibility !== null}')
    expect(PAGE).toContain('<Tooltip label={ineligibilityLabel}>')
    expect(PAGE).toContain('ineligibleMissingContractor')
    expect(PAGE).toContain('ineligibleOtherContractor')
  })

  it('"selecionar todas" marca só as elegíveis', () => {
    expect(PAGE).toContain('eligibleRows.forEach((row) => controller.toggleRow(row.id))')
  })
})

/** "(1 linhas)" era o plural do i18next que ninguém tinha ligado. */
describe('o total selecionado usa plural', () => {
  it('tem as duas formas nos dois locales', () => {
    expect(chargesLocale.reimbursements.totals.selectedTotal_one).toContain('linha)')
    expect(chargesLocale.reimbursements.totals.selectedTotal_other).toContain('linhas)')
    expect(chargesEnLocale.reimbursements.totals.selectedTotal_one).toContain('row)')
    expect(chargesEnLocale.reimbursements.totals.selectedTotal_other).toContain('rows)')
  })
})
