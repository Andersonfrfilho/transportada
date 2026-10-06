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
const GLOBAL_STYLES = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8')

function readRule(source: string, selector: string): string {
  const start = source.indexOf(selector)
  return source.slice(start, source.indexOf('}', start))
}

function readDeclaration(rule: string, property: string): string {
  return new RegExp(`${property}:\\s*([^;]+);`, 'u').exec(rule)?.[1] ?? ''
}

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

describe('revisão do painel: a página não passa da largura da tela a 320px', () => {
  /** Medido a 320px: a trilha implícita da grade crescia até o `Select` mais largo (326px), e a casca ia a 360px. */
  it('a casca, o painel, o formulário e o campo usam uma coluna que encolhe', () => {
    for (const selector of ['.shell {', '.panel {', '.batchForm {', '.field {']) {
      const start = STYLES.indexOf(selector)
      const rule = STYLES.slice(start, STYLES.indexOf('}', start))
      expect(rule.includes('grid-template-columns: minmax(0, 1fr)')).toBe(true)
    }
  })

  /**
   * O `h1` global é de 3,5rem a 9rem em caixa alta, como na staging; "RESSARCIMENTOS" tem ~370px e só
   * estoura a tela no celular. A mudança fica abaixo de 40rem; dali em diante o corpo é o do h1
   * global, nos dois pontos em que ele muda, lido do `index.css` para o espelho não divergir.
   */
  it('o título quebra no celular e, de 40rem em diante, é o h1 global', () => {
    const globalBase = readRule(GLOBAL_STYLES, '\nh1 {')
    const globalWide = readRule(
      GLOBAL_STYLES.slice(
        GLOBAL_STYLES.indexOf('@media (min-width: 64rem)', GLOBAL_STYLES.indexOf('\nh1 {')),
      ),
      '\n  h1 {',
    )
    const base = readRule(STYLES, '.header h1 {')
    const narrow = readRule(
      STYLES.slice(STYLES.indexOf('@media (min-width: 40rem)')),
      '.header h1 {',
    )
    const wide = readRule(STYLES.slice(STYLES.indexOf('@media (min-width: 64rem)')), '.header h1 {')

    expect(base).toContain('max-width: none')
    expect(base).toContain('overflow-wrap: anywhere')
    expect(base).toContain('font-size: clamp(2rem, 13vw')
    for (const property of ['max-width', 'font-size']) {
      expect(readDeclaration(globalBase, property)).not.toBe('')
      expect(readDeclaration(narrow, property)).toBe(readDeclaration(globalBase, property))
    }
    expect(readDeclaration(globalWide, 'font-size')).not.toBe('')
    expect(readDeclaration(wide, 'font-size')).toBe(readDeclaration(globalWide, 'font-size'))
    for (const overridden of ['font-weight', 'text-transform', 'line-height', 'margin']) {
      expect(base + narrow + wide).not.toContain(overridden)
    }
  })
})
