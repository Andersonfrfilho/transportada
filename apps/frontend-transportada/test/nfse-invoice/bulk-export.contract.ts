/**
 * Contrato do download em massa de NFS-e. O download por nota sai por URL assinada e abre uma aba;
 * a partir da segunda o navegador bloqueia. A seleção inteira só atravessa como um arquivo só, e o
 * nome dele é decidido pelo servidor — o cliente lê o `content-disposition` em vez de inventar.
 */
import { describe, expect, test } from 'bun:test'

import {
  INVOICE_ID,
  loadFutureModule,
  SECOND_INVOICE_ID,
  SYNTHETIC_ACCESS_TOKEN,
} from './nfse-invoice.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

const API_URL = 'https://api.example.test'
const EXPORT_URL = `${API_URL}/nfse-service-invoices/export`
const SERVER_FILE_NAME = 'nfse-documentos-20260813-093840.zip'

const CLIENT_MODULE = '../../src/modules/nfse-invoice/shared/nfseInvoiceClient.service'
const DOWNLOAD_MODULE = '../../src/modules/shared/archiveDownload.service'

const BAR_PATH = 'src/modules/nfse-invoice/components/NfseInvoiceSelectionBar.component.tsx'
const HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseInvoiceBulkExport.hook.ts'
const TABLE_HOOK_PATH = 'src/modules/nfse-invoice/hooks/useNfseInvoiceTable.hook.ts'
const DOWNLOAD_PATH = 'src/modules/shared/archiveDownload.service.ts'
const CTE_DACTE_HOOK_PATH = 'src/modules/cte-batch/hooks/useCteDacteDownload.hook.ts'
const CTE_BATCH_HOOK_PATH = 'src/modules/cte-batch/hooks/useCteBatchExport.hook.ts'
const CTE_ITEM_HOOK_PATH = 'src/modules/cte-batch/hooks/useCteItemExport.hook.ts'
const PT_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.locale.json'
const EN_LOCALE_PATH = 'src/modules/nfse-invoice/locales/nfseInvoice.en.locale.json'

type ExportFile = Readonly<{ blob: Blob; fileName: string }>

type ExportInput = Readonly<{
  format?: 'both' | 'pdf' | 'xml'
  invoiceIds: readonly string[]
}>

type ClientModule = {
  createNfseInvoiceClient: (
    dependencies: Readonly<{
      apiUrl: string
      fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      getAccessToken: () => Promise<string>
    }>,
  ) => Readonly<{ exportInvoices: (input: ExportInput) => Promise<ExportFile> }>
}

type DownloadModule = {
  saveArchiveFile: (file: ExportFile) => void
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocaleSection(filePath: string): Promise<Record<string, unknown>> {
  const locale = JSON.parse(await readApplicationFile(filePath)) as Record<string, unknown>
  return (locale['bulkExport'] ?? {}) as Record<string, unknown>
}

function archiveResponse(headers: Record<string, string>): Response {
  return new Response(new Blob([new Uint8Array([80, 75, 5, 6])]), {
    headers: { 'content-type': 'application/zip', ...headers },
    status: 200,
  })
}

async function createRecordingClient(
  requests: Request[],
  respond: (request: Request) => Promise<Response> | Response = () =>
    archiveResponse({ 'content-disposition': `attachment; filename="${SERVER_FILE_NAME}"` }),
): Promise<ReturnType<ClientModule['createNfseInvoiceClient']>> {
  const { createNfseInvoiceClient } = await loadFutureModule<ClientModule>(CLIENT_MODULE)
  return createNfseInvoiceClient({
    apiUrl: API_URL,
    fetch: async (input) => {
      const request = input as Request
      requests.push(request.clone())
      return respond(request)
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

describe('nfse bulk export client contract', () => {
  /** `companyId` vem do token: o corpo leva a seleção e nada mais, porque a API é `.strict()`. */
  test('a exportação envia só a seleção no corpo', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    await client.exportInvoices({ invoiceIds: [INVOICE_ID, SECOND_INVOICE_ID] })

    const [request] = requests
    if (request === undefined) throw new Error('NFSE_CONTRACT_REQUEST_MISSING')
    expect(request.url).toBe(EXPORT_URL)
    expect(request.method).toBe('POST')
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(await request.json()).toEqual({ invoiceIds: [INVOICE_ID, SECOND_INVOICE_ID] })
  })

  test('o formato pedido vai no corpo quando declarado', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    await client.exportInvoices({ format: 'xml', invoiceIds: [INVOICE_ID] })

    const [request] = requests
    if (request === undefined) throw new Error('NFSE_CONTRACT_REQUEST_MISSING')
    expect(await request.json()).toEqual({ format: 'xml', invoiceIds: [INVOICE_ID] })
  })

  /** Quem nomeia o arquivo é quem sabe o carimbo da exportação: o servidor. */
  test('o nome do arquivo vem do cabeçalho da resposta', async () => {
    const client = await createRecordingClient([])

    const file = await client.exportInvoices({ invoiceIds: [INVOICE_ID] })

    expect(file.fileName).toBe(SERVER_FILE_NAME)
    expect(file.blob.size).toBeGreaterThan(0)
  })

  test('sem cabeçalho de nome o arquivo ainda salva com nome estável', async () => {
    const client = await createRecordingClient([], () => archiveResponse({}))

    const file = await client.exportInvoices({ invoiceIds: [INVOICE_ID] })

    expect(file.fileName.endsWith('.zip')).toBe(true)
  })

  /** O erro chega como JSON mesmo na rota de arquivo: o código é o que a tela traduz. */
  test('a falha do servidor devolve o código do erro', async () => {
    const client = await createRecordingClient([], () =>
      Response.json(
        { error: { code: 'NFSE_EXPORT_EMPTY', message: 'sem documento' } },
        {
          status: 422,
        },
      ),
    )

    const failure = await client
      .exportInvoices({ invoiceIds: [INVOICE_ID] })
      .catch((error: unknown) => error)

    expect((failure as Error).message).toBe('NFSE_EXPORT_EMPTY')
  })

  test('falha de rede vira o erro de requisição do módulo', async () => {
    const client = await createRecordingClient([], () => {
      throw new Error('offline')
    })

    const failure = await client
      .exportInvoices({ invoiceIds: [INVOICE_ID] })
      .catch((error: unknown) => error)

    expect((failure as Error).message).toBe('NFSE_INVOICE_REQUEST_FAILED')
  })
})

describe('nfse bulk export download contract', () => {
  /** Sem `document` — em teste ou no service worker — salvar é no-op, não exceção. */
  test('o salvamento do arquivo é compartilhado entre módulos', async () => {
    const { saveArchiveFile } = await loadFutureModule<DownloadModule>(DOWNLOAD_MODULE)

    expect(() =>
      saveArchiveFile({ blob: new Blob(['pk']), fileName: SERVER_FILE_NAME }),
    ).not.toThrow()
  })

  test('o CT-e passa a usar o mesmo salvamento, sem cópia por módulo', async () => {
    const [service, dacte, batch, item] = await Promise.all([
      readApplicationFile(DOWNLOAD_PATH),
      readApplicationFile(CTE_DACTE_HOOK_PATH),
      readApplicationFile(CTE_BATCH_HOOK_PATH),
      readApplicationFile(CTE_ITEM_HOOK_PATH),
    ])

    expect(service).toContain('export function saveArchiveFile')
    for (const hook of [dacte, batch, item]) {
      expect(hook).toContain('saveArchiveFile')
      expect(hook).not.toContain('cteArchiveDownload')
    }
  })
})

describe('nfse bulk export rendering contract', () => {
  test('a barra de seleção oferece o download do lote', async () => {
    const bar = await readApplicationFile(BAR_PATH)

    expect(bar).toContain("t('bulkExport.action')")
    expect(bar).toContain('bulkExport.isAllowed')
  })

  test('o download em massa salva o arquivo pelo serviço compartilhado', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain('saveArchiveFile')
    expect(hook).toContain('exportInvoices')
  })

  test('a tabela alimenta o download com a seleção corrente', async () => {
    const tableHook = await readApplicationFile(TABLE_HOOK_PATH)

    expect(tableHook).toContain('useNfseInvoiceBulkExport')
    expect(tableHook).toContain('bulkExport')
  })
})

describe('nfse bulk export locale contract', () => {
  test('pt e en descrevem o download com as mesmas chaves', async () => {
    const [pt, en] = await Promise.all([
      readLocaleSection(PT_LOCALE_PATH),
      readLocaleSection(EN_LOCALE_PATH),
    ])

    expect(Object.keys(pt).sort()).toEqual(Object.keys(en).sort())
    expect(Object.keys(pt)).toContain('action')
  })
})
