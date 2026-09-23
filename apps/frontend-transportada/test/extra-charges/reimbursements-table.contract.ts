/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Revisão de design da spec 164 (T30): a tabela de ressarcimentos. B2 — sete colunas em 375px
 * empurravam a página inteira para o lado, contra `docs/frontend/responsive.md`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

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
