/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { CTE_BATCH_ID, SYNTHETIC_ACCESS_TOKEN, loadFutureModule } from './cte-batch.fixture'

const EXPORT_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemExport.service'
const ITEM_CLIENT_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemClient.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const API_URL = 'https://api.transportada.test'

/** Espelha a allowlist de `exportFiltersSchema` na API — chave fora dela devolve 400. */
const ALLOWED_FILTER_KEYS: readonly string[] = [
  'batchId',
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

const EMPTY_FILTERS: CteItemFiltersState = {
  batchId: '',
  cteNumberQuery: '',
  invoiceNumberQuery: '',
  issuedFrom: '',
  issuedTo: '',
  statuses: ['failed', 'pending', 'reconciliation_required', 'rejected', 'retry_scheduled'],
}

const FIRST_ITEM_ID = '00000000-0000-4000-8000-000000000701'
const SECOND_ITEM_ID = '00000000-0000-4000-8000-000000000702'

/** ZIP sintético: o cliente só transporta bytes opacos, sem XML fiscal real. */
const SYNTHETIC_ARCHIVE = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function archiveResponse(fileName: string): Response {
  return new Response(SYNTHETIC_ARCHIVE, {
    headers: {
      'content-disposition': `attachment; filename="${fileName}"`,
      'content-type': 'application/zip',
    },
    status: 200,
  })
}

/** O código estável é a mensagem do erro — o teste compara códigos, nunca texto de exceção. */
async function captureExportErrorCode(client: CteItemExportClient): Promise<string> {
  try {
    await client.exportCompanyItems({ itemIds: [FIRST_ITEM_ID] })
    return 'CTE_EXPORT_UNEXPECTED_SUCCESS'
  } catch (error) {
    return error instanceof Error ? error.message : 'CTE_EXPORT_UNEXPECTED_THROWN_VALUE'
  }
}

function errorResponse(input: Readonly<{ code: string; status: number }>): Response {
  return new Response(JSON.stringify({ error: { code: input.code, message: 'rejected' } }), {
    headers: { 'content-type': 'application/json' },
    status: input.status,
  })
}

describe('CT-e XML export contract', () => {
  test('traduz os filtros da tabela no corpo que a API aceita, restrito a autorizados', async () => {
    const { serializeCteExportFilters } = await loadFutureModule<CteItemExportModule>(EXPORT_MODULE)

    const base = serializeCteExportFilters(EMPTY_FILTERS)
    // O ZIP só existe para CT-e autorizado — os chips da listagem não decidem o recorte exportável.
    expect(base).toEqual({ statusIn: ['authorized'] })
    expect(Object.keys(base).filter((key) => !ALLOWED_FILTER_KEYS.includes(key))).toEqual([])

    const filled = serializeCteExportFilters({
      ...EMPTY_FILTERS,
      batchId: CTE_BATCH_ID,
      cteNumberQuery: '10-90',
      invoiceNumberQuery: '22,23',
      issuedFrom: '2026-07-01',
      issuedTo: '2026-07-31',
      statuses: ['authorized', 'rejected'],
    })
    expect(filled).toEqual({
      batchId: CTE_BATCH_ID,
      cteNumberGte: '10',
      cteNumberLte: '90',
      invoiceNumberIn: ['22', '23'],
      issuedFrom: '2026-07-01T00:00:00.000Z',
      issuedUntil: '2026-07-31T23:59:59.999Z',
      statusIn: ['authorized'],
    })
    expect(Object.keys(filled).filter((key) => !ALLOWED_FILTER_KEYS.includes(key))).toEqual([])

    const exact = serializeCteExportFilters({ ...EMPTY_FILTERS, cteNumberQuery: '14093' })
    expect(exact.cteNumberIn).toEqual(['14093'])
    expect(exact.cteNumberGte).toBeUndefined()

    // Texto inválido não vira filtro silencioso: sem chave é melhor do que exportar o recorte errado.
    const invalid = serializeCteExportFilters({ ...EMPTY_FILTERS, invoiceNumberQuery: 'abc' })
    expect(invalid.invoiceNumberIn).toBeUndefined()
  })

  test('monta o corpo por escopo e nunca deixa a empresa vir do cliente', async () => {
    const { CTE_EXPORT_MAX_ITEMS, buildCteExportRequest } =
      await loadFutureModule<CteItemExportModule>(EXPORT_MODULE)

    expect(CTE_EXPORT_MAX_ITEMS).toBe(500)

    const selection = buildCteExportRequest({
      filters: EMPTY_FILTERS,
      scope: 'selection',
      selectedIds: [FIRST_ITEM_ID, SECOND_ITEM_ID],
    })
    expect(selection).toEqual({ itemIds: [FIRST_ITEM_ID, SECOND_ITEM_ID] })

    const filtered = buildCteExportRequest({
      filters: { ...EMPTY_FILTERS, batchId: CTE_BATCH_ID },
      scope: 'filters',
      selectedIds: [FIRST_ITEM_ID],
    })
    expect(filtered).toEqual({ filters: { batchId: CTE_BATCH_ID, statusIn: ['authorized'] } })

    for (const body of [selection, filtered]) {
      expect(Object.keys(body)).not.toContain('companyId')
    }

    expect(() =>
      buildCteExportRequest({ filters: EMPTY_FILTERS, scope: 'selection', selectedIds: [] }),
    ).toThrow('CTE_EXPORT_EMPTY_SELECTION')

    const above = Array.from(
      { length: CTE_EXPORT_MAX_ITEMS + 1 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    )
    expect(() =>
      buildCteExportRequest({ filters: EMPTY_FILTERS, scope: 'selection', selectedIds: above }),
    ).toThrow('CTE_EXPORT_LIMIT_EXCEEDED')
  })

  test('habilita a ação apenas com permissão de transmissão e seleção dentro do teto', async () => {
    const { CTE_EXPORT_MAX_ITEMS, canExportCteSelection } =
      await loadFutureModule<CteItemExportModule>(EXPORT_MODULE)

    expect(canExportCteSelection({ permissions: ['cte.submit'], selectedCount: 1 })).toBe(true)
    expect(canExportCteSelection({ permissions: ['cte.read'], selectedCount: 1 })).toBe(false)
    expect(canExportCteSelection({ permissions: ['cte.submit'], selectedCount: 0 })).toBe(false)
    expect(
      canExportCteSelection({
        permissions: ['cte.submit'],
        selectedCount: CTE_EXPORT_MAX_ITEMS + 1,
      }),
    ).toBe(false)
  })

  test('baixa o ZIP pela rota de exportação e propaga o código de erro da API', async () => {
    const { createCteBatchItemClient } =
      await loadFutureModule<CteItemClientModule>(ITEM_CLIENT_MODULE)

    const calls: { request: Request }[] = []
    const client = createCteBatchItemClient({
      apiUrl: API_URL,
      fetch: (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init)
        calls.push({ request })
        return Promise.resolve(archiveResponse('cte-xml-20260731-120000.zip'))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const file = await client.exportCompanyItems({ itemIds: [FIRST_ITEM_ID] })
    expect(file.fileName).toBe('cte-xml-20260731-120000.zip')
    expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(SYNTHETIC_ARCHIVE)

    const call = calls[0]
    if (call === undefined) throw new Error('CTE_EXPORT_CONTRACT_REQUEST_MISSING')
    expect(call.request.method).toBe('POST')
    expect(new URL(call.request.url).pathname).toBe('/cte-batches/items/export')
    expect(call.request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(call.request.headers.get('content-type')).toBe('application/json')
    expect(JSON.parse(await call.request.text())).toEqual({ itemIds: [FIRST_ITEM_ID] })

    const failures = [
      { code: 'CTE_EXPORT_EMPTY', status: 422 },
      { code: 'CTE_EXPORT_LIMIT_EXCEEDED', status: 422 },
      { code: 'FORBIDDEN', status: 403 },
    ]
    const rejectedCodes = await Promise.all(
      failures.map((failure) =>
        captureExportErrorCode(
          createCteBatchItemClient({
            apiUrl: API_URL,
            fetch: () => Promise.resolve(errorResponse(failure)),
            getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
          }),
        ),
      ),
    )
    expect(rejectedCodes).toEqual(failures.map((failure) => failure.code))

    const offline = createCteBatchItemClient({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new Error('offline')),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })
    expect(await captureExportErrorCode(offline)).toBe('CTE_BATCH_REQUEST_FAILED')
  })

  test('traduz cada código de falha em uma chave de locale estável', async () => {
    const { CTE_EXPORT_UNKNOWN_MESSAGE_KEY, resolveCteExportMessageKey } =
      await loadFutureModule<CteItemExportModule>(EXPORT_MODULE)

    expect(resolveCteExportMessageKey(new Error('CTE_EXPORT_EMPTY'))).toBe(
      'cteItems.export.errors.empty',
    )
    expect(resolveCteExportMessageKey(new Error('CTE_EXPORT_EMPTY_SELECTION'))).toBe(
      'cteItems.export.errors.empty',
    )
    expect(resolveCteExportMessageKey(new Error('CTE_EXPORT_LIMIT_EXCEEDED'))).toBe(
      'cteItems.export.errors.limitExceeded',
    )
    expect(resolveCteExportMessageKey(new Error('FORBIDDEN'))).toBe(
      'cteItems.export.errors.forbidden',
    )
    expect(resolveCteExportMessageKey(new Error('CTE_BATCH_REQUEST_FAILED'))).toBe(
      CTE_EXPORT_UNKNOWN_MESSAGE_KEY,
    )
    expect(resolveCteExportMessageKey('sem erro')).toBe(CTE_EXPORT_UNKNOWN_MESSAGE_KEY)
  })

  test('liga a exportação na barra de seleção, no painel de filtros e nos locales pt/en', async () => {
    const [selection, filters, exportHook, tableHook, ptLocale, enLocale] = await Promise.all([
      readModule('src/modules/cte-batch/components/CteItemSelectionBar.component.tsx'),
      readModule('src/modules/cte-batch/components/CteItemFilters.component.tsx'),
      readModule('src/modules/cte-batch/hooks/useCteItemExport.hook.ts'),
      readModule('src/modules/cte-batch/hooks/useCteItemTable.hook.ts'),
      readModule('src/modules/cte-batch/locales/cteBatch.locale.json'),
      readModule('src/modules/cte-batch/locales/cteBatch.en.locale.json'),
    ])

    expect(selection).toContain('cteItems.exportSelection')
    expect(selection).toContain('exportSelection(')
    expect(selection).toContain('canExportSelection')
    expect(filters).toContain('cteItems.exportFiltered')
    expect(filters).toContain('exportFiltered(')

    for (const source of [selection, filters]) {
      expect(source).toContain('useTranslation')
      expect(source).not.toMatch(/<select[\s>]/)
      expect(source).not.toMatch(/style=\{\{/)
      // O erro chega traduzido pela chave resolvida no serviço, nunca como mensagem crua.
      expect(source).toContain('exportErrorKey')
    }

    expect(exportHook).toContain('buildCteExportRequest')
    expect(exportHook).toContain('resolveCteExportMessageKey')
    expect(exportHook).toContain('canExportCteSelection')
    expect(exportHook).toContain('exportCompanyItems')
    expect(tableHook).toContain('useCteItemExport')

    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, Record<string, unknown>>
      const cteItems = dictionary.cteItems
      if (cteItems === undefined) throw new Error('CTE_EXPORT_CONTRACT_LOCALE_MISSING')
      for (const key of ['exportFiltered', 'exportSelection', 'export']) {
        expect(Object.keys(cteItems)).toContain(key)
      }
      const exportSection = cteItems.export as Record<string, Record<string, unknown>>
      expect(Object.keys(exportSection)).toContain('pending')
      for (const key of ['empty', 'forbidden', 'limitExceeded', 'unknown']) {
        expect(Object.keys(exportSection.errors ?? {})).toContain(key)
      }
    }
  })
})

type CteItemFiltersState = Readonly<{
  batchId: string
  cteNumberQuery: string
  invoiceNumberQuery: string
  issuedFrom: string
  issuedTo: string
  statuses: readonly string[]
}>

type CteExportFilterPayload = Readonly<{
  batchId?: string
  cteNumberGte?: string
  cteNumberIn?: readonly string[]
  cteNumberLte?: string
  invoiceNumberGte?: string
  invoiceNumberIn?: readonly string[]
  invoiceNumberLte?: string
  issuedFrom?: string
  issuedUntil?: string
  statusIn?: readonly string[]
}>

type CteExportRequestBody = Readonly<{
  filters?: CteExportFilterPayload
  itemIds?: readonly string[]
}>

type CteItemExportModule = {
  readonly CTE_EXPORT_MAX_ITEMS: number
  readonly CTE_EXPORT_UNKNOWN_MESSAGE_KEY: string
  readonly buildCteExportRequest: (input: {
    readonly filters: CteItemFiltersState
    readonly scope: 'filters' | 'selection'
    readonly selectedIds: readonly string[]
  }) => CteExportRequestBody
  readonly canExportCteSelection: (input: {
    readonly permissions: readonly string[]
    readonly selectedCount: number
  }) => boolean
  readonly resolveCteExportMessageKey: (error: unknown) => string
  readonly serializeCteExportFilters: (filters: CteItemFiltersState) => CteExportFilterPayload
}

type CteItemExportClient = {
  readonly exportCompanyItems: (
    body: CteExportRequestBody,
  ) => Promise<{ readonly blob: Blob; readonly fileName: string }>
}

type CteItemClientModule = {
  readonly createCteBatchItemClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => CteItemExportClient
}
