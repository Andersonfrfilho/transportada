/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { CTE_BATCH_ID, loadFutureModule } from './cte-batch.fixture'

const EXPORT_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemExport.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const OTHER_BATCH_ID = '00000000-0000-4000-8000-000000000801'

/** Espelha a allowlist de `exportFiltersSchema` na API — chave fora dela devolve 400. */
const ALLOWED_FILTER_KEYS: readonly string[] = [
  'batchId',
  'batchIdIn',
  'cteNumberGte',
  'cteNumberIn',
  'cteNumberLte',
  'invoiceNumberGte',
  'invoiceNumberIn',
  'invoiceNumberLte',
  'issuedFrom',
  'issuedUntil',
  'statusIn',
]

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('CT-e batch XML export contract', () => {
  test('exporta a seleção de lotes por filtro de lotes, restrito a autorizados', async () => {
    const { CTE_EXPORT_MAX_BATCHES, buildCteBatchExportRequest } =
      await loadFutureModule<CteBatchExportModule>(EXPORT_MODULE)

    expect(CTE_EXPORT_MAX_BATCHES).toBe(100)

    const body = buildCteBatchExportRequest({ selectedBatchIds: [CTE_BATCH_ID, OTHER_BATCH_ID] })
    expect(body).toEqual({
      filters: { batchIdIn: [CTE_BATCH_ID, OTHER_BATCH_ID], statusIn: ['authorized'] },
    })
    expect(
      Object.keys(body.filters ?? {}).filter((key) => !ALLOWED_FILTER_KEYS.includes(key)),
    ).toEqual([])
    // A empresa é a do contexto autenticado: mandá-la no corpo derruba a requisição em 400.
    expect(Object.keys(body)).not.toContain('companyId')

    expect(() => buildCteBatchExportRequest({ selectedBatchIds: [] })).toThrow(
      'CTE_EXPORT_EMPTY_SELECTION',
    )

    const above = Array.from(
      { length: CTE_EXPORT_MAX_BATCHES + 1 },
      (_value, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    )
    expect(() => buildCteBatchExportRequest({ selectedBatchIds: above })).toThrow(
      'CTE_EXPORT_BATCH_LIMIT_EXCEEDED',
    )
  })

  test('habilita a ação apenas com permissão de transmissão e seleção dentro do teto', async () => {
    const { CTE_EXPORT_MAX_BATCHES, canExportCteBatchSelection, resolveCteExportMessageKey } =
      await loadFutureModule<CteBatchExportModule>(EXPORT_MODULE)

    expect(canExportCteBatchSelection({ permissions: ['cte.submit'], selectedCount: 1 })).toBe(true)
    expect(canExportCteBatchSelection({ permissions: ['cte.read'], selectedCount: 1 })).toBe(false)
    expect(canExportCteBatchSelection({ permissions: ['cte.submit'], selectedCount: 0 })).toBe(
      false,
    )
    expect(
      canExportCteBatchSelection({
        permissions: ['cte.submit'],
        selectedCount: CTE_EXPORT_MAX_BATCHES + 1,
      }),
    ).toBe(false)

    expect(resolveCteExportMessageKey(new Error('CTE_EXPORT_BATCH_LIMIT_EXCEEDED'))).toBe(
      'cteItems.export.errors.batchLimitExceeded',
    )
  })

  test('liga a exportação na barra de seleção de lotes e nos locales pt/en', async () => {
    const [selectionBar, exportHook, ptLocale, enLocale] = await Promise.all([
      readModule('src/modules/cte-batch/components/CteBatchSelectionBar.component.tsx'),
      readModule('src/modules/cte-batch/hooks/useCteBatchExport.hook.ts'),
      readModule('src/modules/cte-batch/locales/cteBatch.locale.json'),
      readModule('src/modules/cte-batch/locales/cteBatch.en.locale.json'),
    ])

    expect(selectionBar).toContain('actions.exportSelection')
    expect(selectionBar).toContain('exportSelection(')
    expect(selectionBar).toContain('canExportSelection')
    // O erro chega traduzido pela chave resolvida no serviço, nunca como mensagem crua.
    expect(selectionBar).toContain('exportErrorKey')
    expect(selectionBar).not.toMatch(/style=\{\{/)

    expect(exportHook).toContain('buildCteBatchExportRequest')
    expect(exportHook).toContain('canExportCteBatchSelection')
    expect(exportHook).toContain('resolveCteExportMessageKey')
    expect(exportHook).toContain('exportCompanyItems')

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, Record<string, unknown>>
      const actions = dictionary.actions
      if (actions === undefined) throw new Error('CTE_BATCH_EXPORT_CONTRACT_LOCALE_MISSING')
      expect(Object.keys(actions)).toContain('exportSelection')

      const exportSection = (dictionary.cteItems?.export ?? {}) as Record<
        string,
        Record<string, unknown>
      >
      expect(Object.keys(exportSection.errors ?? {})).toContain('batchLimitExceeded')
    }
  })
})

type CteExportRequestBody = Readonly<{
  filters?: Readonly<Record<string, string | readonly string[] | undefined>>
  itemIds?: readonly string[]
}>

type CteBatchExportModule = {
  readonly CTE_EXPORT_MAX_BATCHES: number
  readonly buildCteBatchExportRequest: (input: {
    readonly selectedBatchIds: readonly string[]
  }) => CteExportRequestBody
  readonly canExportCteBatchSelection: (input: {
    readonly permissions: readonly string[]
    readonly selectedCount: number
  }) => boolean
  readonly resolveCteExportMessageKey: (error: unknown) => string
}
