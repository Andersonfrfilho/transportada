import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'

import '@/modules/shared/i18n/i18n.service'
import { NfeTripReportExportAction } from '@/modules/nfe-workspace/components/NfeTripReportExportAction.component'
import {
  EMPTY_FILTERS,
  type UseNfeDocumentTableResult,
} from '@/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'

import { renderWithQueryClient } from './renderHook.helper'

function buildTable(overrides: Partial<UseNfeDocumentTableResult>): UseNfeDocumentTableResult {
  return {
    activeConditionCount: 0,
    filteredDocuments: [],
    filters: EMPTY_FILTERS,
    mode: 'simple',
    savedConditionCount: 0,
    searchTerm: '',
    selectedCount: 0,
    selectedIds: new Set<string>(),
    ...overrides,
  } as unknown as UseNfeDocumentTableResult
}

describe('NfeTripReportExportAction (spec 253 revisão final)', () => {
  test('conjunto filtrado vazio desabilita os dois botões e diz o motivo', async () => {
    const table = buildTable({ filters: { ...EMPTY_FILTERS, dateFrom: '2026-01-01' } })
    const view = await renderWithQueryClient(createElement(NfeTripReportExportAction, { table }))
    const buttons = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    expect(buttons).toHaveLength(2)
    expect(buttons.every((button) => button.disabled)).toBe(true)
    expect(document.body.textContent).toContain('Nenhuma nota para exportar')
    view.unmount()
  })
})
