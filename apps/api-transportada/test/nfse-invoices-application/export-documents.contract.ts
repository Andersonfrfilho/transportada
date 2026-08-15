/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Contrato da exportação em massa de NFS-e. O download por nota já existe e sai por URL assinada;
 * aqui o pedido é de uma seleção inteira, e uma aba por documento assinado seria bloqueada pelo
 * navegador a partir da segunda. O ZIP é a única entrega que atravessa a seleção toda.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ExportNfseDocumentsUseCase,
  NfseExportDocument,
  NfseExportRequest,
  NfseExportSelectionQuery,
} from '../../src/nfse-invoices/application/export-nfse-documents.port'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000a1'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000000a2'
const INVOICE_ID = '00000000-0000-4000-8000-0000000000b4'
const EXPORTED_AT = new Date('2026-08-13T09:38:40.000Z')

const WITH_BOTH_DOCUMENTS: NfseExportDocument = {
  identifier: '2026000123',
  pdf: { bucket: 'transportada-fiscal', objectKey: 'tenants/a1/nfse/123/nota.pdf' },
  xml: { bucket: 'transportada-fiscal', objectKey: 'tenants/a1/nfse/123/authorized.xml' },
}

const WITHOUT_PDF: NfseExportDocument = {
  identifier: '2026000124',
  pdf: null,
  xml: { bucket: 'transportada-fiscal', objectKey: 'tenants/a1/nfse/124/authorized.xml' },
}

type ArchiveEntry = { readonly name: string }

type Harness = {
  readonly entries: ArchiveEntry[][]
  readonly queries: NfseExportSelectionQuery[]
  readonly useCase: ExportNfseDocumentsUseCase
}

async function createHarness(documents: readonly NfseExportDocument[]): Promise<Harness> {
  const entries: ArchiveEntry[][] = []
  const queries: NfseExportSelectionQuery[] = []
  const module = await import('../../src/nfse-invoices/application/export-nfse-documents.use-case')

  return {
    entries,
    queries,
    useCase: module.createExportNfseDocumentsUseCase({
      archive: {
        async createArchive(requested) {
          entries.push(requested.map((entry) => ({ name: entry.name })))
          return new ReadableStream<Uint8Array>({
            start(controller) {
              controller.close()
            },
          })
        },
      },
      clock: () => EXPORTED_AT,
      selection: {
        async listAuthorizedDocuments(query) {
          queries.push(query)
          return documents
        },
      },
    }),
  }
}

function exportRequest(overrides: Partial<NfseExportRequest> = {}): NfseExportRequest {
  return {
    context: { companyId: COMPANY_ID },
    invoiceIds: [INVOICE_ID],
    ...overrides,
  }
}

describe('nfse export selection', () => {
  /** A empresa vem sempre do contexto autenticado — o corpo da requisição nunca a escolhe. */
  test('a consulta filtra pela empresa do contexto', async () => {
    const harness = await createHarness([WITH_BOTH_DOCUMENTS])

    await harness.useCase.exportDocuments(
      exportRequest({ context: { companyId: OTHER_COMPANY_ID } }),
    )

    expect(harness.queries[0]?.companyId).toBe(OTHER_COMPANY_ID)
    expect(harness.queries[0]?.invoiceIds).toEqual([INVOICE_ID])
  })

  /** Pedir o teto + 1 é o que distingue "seleção cheia" de "seleção estourada" numa consulta só. */
  test('a consulta pede um documento além do teto', async () => {
    const port = await import('../../src/nfse-invoices/application/export-nfse-documents.port')
    const harness = await createHarness([WITH_BOTH_DOCUMENTS])

    await harness.useCase.exportDocuments(exportRequest())

    expect(harness.queries[0]?.limit).toBe(port.NFSE_EXPORT_MAX_DOCUMENTS + 1)
  })

  test('seleção acima do teto é recusada antes de abrir o ZIP', async () => {
    const port = await import('../../src/nfse-invoices/application/export-nfse-documents.port')
    const oversized = Array.from({ length: port.NFSE_EXPORT_MAX_DOCUMENTS + 1 }, (_, index) => ({
      ...WITH_BOTH_DOCUMENTS,
      identifier: `2026${index}`,
    }))
    const harness = await createHarness(oversized)

    const failure = await harness.useCase
      .exportDocuments(exportRequest())
      .catch((error: unknown) => error)

    expect((failure as { code: string }).code).toBe('NFSE_EXPORT_LIMIT_EXCEEDED')
    expect((failure as { status: number }).status).toBe(422)
    expect(harness.entries).toHaveLength(0)
  })

  test('seleção sem nota autorizada é recusada', async () => {
    const harness = await createHarness([])

    const failure = await harness.useCase
      .exportDocuments(exportRequest())
      .catch((error: unknown) => error)

    expect((failure as { code: string }).code).toBe('NFSE_EXPORT_EMPTY')
    expect(harness.entries).toHaveLength(0)
  })
})

describe('nfse export archive entries', () => {
  /** Sem formato declarado saem os dois: quem seleciona e baixa quer a nota e o comprovante dela. */
  test('o formato padrão leva XML e PDF', async () => {
    const harness = await createHarness([WITH_BOTH_DOCUMENTS])

    await harness.useCase.exportDocuments(exportRequest())

    expect(harness.entries[0]?.map((entry) => entry.name)).toEqual([
      'nfse-2026000123.xml',
      'nfse-2026000123.pdf',
    ])
  })

  test('o formato XML deixa o PDF de fora', async () => {
    const harness = await createHarness([WITH_BOTH_DOCUMENTS])

    await harness.useCase.exportDocuments(exportRequest({ format: 'xml' }))

    expect(harness.entries[0]?.map((entry) => entry.name)).toEqual(['nfse-2026000123.xml'])
  })

  /**
   * O XML é o documento fiscal e sem ele a nota não liquida; o PDF é conveniência da prefeitura e
   * sua falta só é registrada. O ZIP segue com o que existe em vez de derrubar o lote inteiro.
   */
  test('nota sem PDF arquivado entra só com o XML', async () => {
    const harness = await createHarness([WITH_BOTH_DOCUMENTS, WITHOUT_PDF])

    await harness.useCase.exportDocuments(exportRequest())

    expect(harness.entries[0]?.map((entry) => entry.name)).toEqual([
      'nfse-2026000123.xml',
      'nfse-2026000123.pdf',
      'nfse-2026000124.xml',
    ])
  })

  /** Pedir só PDF de notas que não têm PDF é pedido sem resposta: ZIP vazio seria pior que erro. */
  test('formato sem nenhum documento correspondente é recusado', async () => {
    const harness = await createHarness([WITHOUT_PDF])

    const failure = await harness.useCase
      .exportDocuments(exportRequest({ format: 'pdf' }))
      .catch((error: unknown) => error)

    expect((failure as { code: string }).code).toBe('NFSE_EXPORT_EMPTY')
  })

  test('a entrada aponta para o objeto arquivado, nunca para bytes em memória', async () => {
    const harness = await createHarness([WITH_BOTH_DOCUMENTS])

    await harness.useCase.exportDocuments(exportRequest({ format: 'xml' }))

    expect(harness.entries).toHaveLength(1)
  })
})

describe('nfse export result', () => {
  test('o nome do arquivo carrega formato e carimbo da exportação', async () => {
    const harness = await createHarness([WITH_BOTH_DOCUMENTS])

    const result = await harness.useCase.exportDocuments(exportRequest({ format: 'xml' }))

    expect(result.fileName).toBe('nfse-xml-20260813-093840.zip')
    expect(result.documentCount).toBe(1)
  })

  test('o resultado devolve o ZIP em stream', async () => {
    const harness = await createHarness([WITH_BOTH_DOCUMENTS])

    const result = await harness.useCase.exportDocuments(exportRequest())

    expect(result.stream).toBeInstanceOf(ReadableStream)
    expect(result.fileName.startsWith('nfse-documentos-')).toBe(true)
  })
})
