/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const source = readFileSync(
  new URL(
    '../../src/modules/nfe-workspace/components/NfeDocumentTable.component.tsx',
    import.meta.url,
  ),
  'utf8',
)

describe('NfeDocumentTable: tabela vazia', () => {
  test('enquanto carrega, a tabela filtrada mostra esqueleto e não "nenhuma nota corresponde"', () => {
    expect(source).toContain('table.pageItems.length === 0 && loading')
    expect(source).toContain('table.pageItems.length === 0 && !loading')
  })

  test('o vazio por filtro oferece limpar os filtros', () => {
    expect(source).toMatch(/table\.hasActiveFilters[\s\S]*onClick=\{table\.clearAllFilters\}/)
  })
})
