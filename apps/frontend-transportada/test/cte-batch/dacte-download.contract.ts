/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { CTE_BATCH_ID, SYNTHETIC_ACCESS_TOKEN, loadFutureModule } from './cte-batch.fixture'

const EXPORT_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemExport.service'
const ITEM_CLIENT_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemClient.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const API_URL = 'https://api.transportada.test'

const FIRST_ITEM_ID = '00000000-0000-4000-8000-000000000701'
const SECOND_ITEM_ID = '00000000-0000-4000-8000-000000000702'

/** Chave sintética: 44 dígitos derivados de um sequencial, nunca uma chave fiscal real. */
const SYNTHETIC_ACCESS_KEY = `${'0'.repeat(40)}0001`

/** PDF sintético: o cliente só transporta bytes opacos, sem documento fiscal real. */
const SYNTHETIC_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])

const EMPTY_FILTERS: CteItemFiltersState = {
  batchId: '',
  cteNumberQuery: '',
  invoiceNumberQuery: '',
  issuedFrom: '',
  issuedTo: '',
  statuses: ['authorized'],
}

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function dacteResponse(fileName: string): Response {
  return new Response(SYNTHETIC_PDF, {
    headers: {
      'content-disposition': `attachment; filename="${fileName}"`,
      'content-type': 'application/pdf',
    },
    status: 200,
  })
}

function errorResponse(input: Readonly<{ code: string; status: number }>): Response {
  return new Response(JSON.stringify({ error: { code: input.code, message: 'rejected' } }), {
    headers: { 'content-type': 'application/json' },
    status: input.status,
  })
}

/** O código estável é a mensagem do erro — o teste compara códigos, nunca texto de exceção. */
async function captureDacteErrorCode(client: CteDacteClient): Promise<string> {
  try {
    await client.downloadItemDacte({ batchId: CTE_BATCH_ID, itemId: FIRST_ITEM_ID })
    return 'DACTE_UNEXPECTED_SUCCESS'
  } catch (error) {
    return error instanceof Error ? error.message : 'DACTE_UNEXPECTED_THROWN_VALUE'
  }
}

describe('DACTE download contract', () => {
  test('o formato do arquivo entra no corpo e some quando ninguém escolheu', async () => {
    const { CTE_EXPORT_DEFAULT_FORMAT, CTE_EXPORT_FORMATS, buildCteExportRequest } =
      await loadFutureModule<CteItemExportModule>(EXPORT_MODULE)

    // Mesma lista de `CTE_EXPORT_FORMATS` na API — formato fora dela devolve 400.
    expect(CTE_EXPORT_FORMATS).toEqual(['xml', 'pdf', 'both'])
    // Quem não escolhe continua recebendo o que já recebia antes do DACTE existir.
    expect(CTE_EXPORT_DEFAULT_FORMAT).toBe('xml')

    const withFormat = buildCteExportRequest({
      filters: EMPTY_FILTERS,
      format: 'both',
      scope: 'selection',
      selectedIds: [FIRST_ITEM_ID, SECOND_ITEM_ID],
    })
    expect(withFormat).toEqual({
      format: 'both',
      itemIds: [FIRST_ITEM_ID, SECOND_ITEM_ID],
    })

    const filtered = buildCteExportRequest({
      filters: { ...EMPTY_FILTERS, batchId: CTE_BATCH_ID },
      format: 'pdf',
      scope: 'filters',
      selectedIds: [],
    })
    expect(filtered).toEqual({
      filters: { batchId: CTE_BATCH_ID, statusIn: ['authorized'] },
      format: 'pdf',
    })

    const withoutFormat = buildCteExportRequest({
      filters: EMPTY_FILTERS,
      scope: 'selection',
      selectedIds: [FIRST_ITEM_ID],
    })
    expect(withoutFormat).toEqual({ itemIds: [FIRST_ITEM_ID] })
  })

  test('a seleção de lotes também escolhe o formato do que vai no ZIP', async () => {
    const { buildCteBatchExportRequest } =
      await loadFutureModule<CteItemExportModule>(EXPORT_MODULE)

    expect(
      buildCteBatchExportRequest({ format: 'both', selectedBatchIds: [CTE_BATCH_ID] }),
    ).toEqual({
      filters: { batchIdIn: [CTE_BATCH_ID], statusIn: ['authorized'] },
      format: 'both',
    })
    expect(buildCteBatchExportRequest({ selectedBatchIds: [CTE_BATCH_ID] })).toEqual({
      filters: { batchIdIn: [CTE_BATCH_ID], statusIn: ['authorized'] },
    })
  })

  test('o DACTE individual só é oferecido para CT-e autorizado de quem pode transmitir', async () => {
    const { canDownloadCteDacte } = await loadFutureModule<CteItemExportModule>(EXPORT_MODULE)

    const authorized = { accessKey: SYNTHETIC_ACCESS_KEY, status: 'authorized' }
    expect(canDownloadCteDacte({ ...authorized, permissions: ['cte.submit'] })).toBe(true)
    expect(canDownloadCteDacte({ ...authorized, permissions: ['cte.read'] })).toBe(false)
    // O papel nasce do XML autorizado: sem autorização não há o que desenhar.
    expect(
      canDownloadCteDacte({ accessKey: null, permissions: ['cte.submit'], status: 'authorized' }),
    ).toBe(false)
    for (const status of ['cancelled', 'failed', 'in_flight', 'pending', 'rejected']) {
      expect(
        canDownloadCteDacte({
          accessKey: SYNTHETIC_ACCESS_KEY,
          permissions: ['cte.submit'],
          status,
        }),
      ).toBe(false)
    }
  })

  test('baixa o PDF pela rota do item e propaga o código de erro da API', async () => {
    const { createCteBatchItemClient } =
      await loadFutureModule<CteItemClientModule>(ITEM_CLIENT_MODULE)

    const calls: { request: Request }[] = []
    const client = createCteBatchItemClient({
      apiUrl: API_URL,
      fetch: (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init)
        calls.push({ request })
        return Promise.resolve(dacteResponse(`dacte-${SYNTHETIC_ACCESS_KEY}.pdf`))
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const file = await client.downloadItemDacte({ batchId: CTE_BATCH_ID, itemId: FIRST_ITEM_ID })
    expect(file.fileName).toBe(`dacte-${SYNTHETIC_ACCESS_KEY}.pdf`)
    expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(SYNTHETIC_PDF)

    const call = calls[0]
    if (call === undefined) throw new Error('DACTE_CONTRACT_REQUEST_MISSING')
    expect(call.request.method).toBe('GET')
    expect(new URL(call.request.url).pathname).toBe(
      `/cte-batches/${CTE_BATCH_ID}/items/${FIRST_ITEM_ID}/dacte`,
    )
    expect(call.request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)

    const failures = [
      { code: 'DACTE_DOCUMENT_NOT_AUTHORIZED', status: 422 },
      { code: 'DACTE_DOCUMENT_NOT_FOUND', status: 404 },
      { code: 'FORBIDDEN', status: 403 },
    ]
    const rejectedCodes = await Promise.all(
      failures.map((failure) =>
        captureDacteErrorCode(
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
    expect(await captureDacteErrorCode(offline)).toBe('CTE_BATCH_REQUEST_FAILED')
  })

  test('cada recusa do DACTE vira uma chave de locale estável', async () => {
    const { CTE_EXPORT_UNKNOWN_MESSAGE_KEY, resolveCteExportMessageKey } =
      await loadFutureModule<CteItemExportModule>(EXPORT_MODULE)

    expect(resolveCteExportMessageKey(new Error('DACTE_DOCUMENT_NOT_AUTHORIZED'))).toBe(
      'cteItems.export.errors.dacteNotAuthorized',
    )
    expect(resolveCteExportMessageKey(new Error('DACTE_DOCUMENT_NOT_FOUND'))).toBe(
      'cteItems.export.errors.dacteNotFound',
    )
    expect(resolveCteExportMessageKey(new Error('DACTE_XML_INVALID'))).toBe(
      CTE_EXPORT_UNKNOWN_MESSAGE_KEY,
    )
  })

  test('liga a escolha de formato e o DACTE de linha na tela e nos locales pt/en', async () => {
    const [picker, itemSelection, batchSelection, filters, table, exportHook, dacteHook] =
      await Promise.all([
        readModule('src/modules/cte-batch/components/CteExportFormatPicker.component.tsx'),
        readModule('src/modules/cte-batch/components/CteItemSelectionBar.component.tsx'),
        readModule('src/modules/cte-batch/components/CteBatchSelectionBar.component.tsx'),
        readModule('src/modules/cte-batch/components/CteItemFilters.component.tsx'),
        readModule('src/modules/cte-batch/components/CteItemTable.component.tsx'),
        readModule('src/modules/cte-batch/hooks/useCteItemExport.hook.ts'),
        readModule('src/modules/cte-batch/hooks/useCteDacteDownload.hook.ts'),
      ])

    // O seletor vem do design system: `<select>` cru é proibido em `src/**/*.tsx`.
    expect(picker).toContain("from '@/components/ui/select'")
    expect(picker).toContain('CTE_EXPORT_FORMATS')

    for (const source of [itemSelection, batchSelection, filters]) {
      expect(source).toContain('CteExportFormatPicker')
      expect(source).toContain('exportFormat')
      expect(source).not.toMatch(/<select[\s>]/u)
    }

    expect(table).toContain('canDownloadDacte')
    expect(table).toContain('downloadDacte(')
    expect(table).toContain('cteItems.downloadDacte')
    expect(exportHook).toContain('setExportFormat')
    expect(dacteHook).toContain('downloadItemDacte')
    expect(dacteHook).toContain('canDownloadCteDacte')

    const [ptLocale, enLocale] = await Promise.all([
      readModule('src/modules/cte-batch/locales/cteBatch.locale.json'),
      readModule('src/modules/cte-batch/locales/cteBatch.en.locale.json'),
    ])
    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, Record<string, unknown>>
      const cteItems = dictionary.cteItems
      if (cteItems === undefined) throw new Error('DACTE_CONTRACT_LOCALE_MISSING')
      expect(Object.keys(cteItems)).toContain('downloadDacte')
      const exportSection = cteItems.export as Record<string, Record<string, unknown>>
      for (const key of ['both', 'label', 'pdf', 'xml']) {
        expect(Object.keys(exportSection.format ?? {})).toContain(key)
      }
      for (const key of ['dacteNotAuthorized', 'dacteNotFound']) {
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

type CteExportRequestBody = Readonly<{
  filters?: Readonly<Record<string, readonly string[] | string | undefined>>
  format?: string
  itemIds?: readonly string[]
}>

type CteItemExportModule = {
  readonly CTE_EXPORT_DEFAULT_FORMAT: string
  readonly CTE_EXPORT_FORMATS: readonly string[]
  readonly CTE_EXPORT_UNKNOWN_MESSAGE_KEY: string
  readonly buildCteBatchExportRequest: (input: {
    readonly format?: string
    readonly selectedBatchIds: readonly string[]
  }) => CteExportRequestBody
  readonly buildCteExportRequest: (input: {
    readonly filters: CteItemFiltersState
    readonly format?: string
    readonly scope: 'filters' | 'selection'
    readonly selectedIds: readonly string[]
  }) => CteExportRequestBody
  readonly canDownloadCteDacte: (input: {
    readonly accessKey: null | string
    readonly permissions: readonly string[]
    readonly status: string
  }) => boolean
  readonly resolveCteExportMessageKey: (error: unknown) => string
}

type CteDacteClient = {
  readonly downloadItemDacte: (
    input: Readonly<{ batchId: string; itemId: string }>,
  ) => Promise<{ readonly blob: Blob; readonly fileName: string }>
}

type CteItemClientModule = {
  readonly createCteBatchItemClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => CteDacteClient
}
