/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CTE_EXPORT_MAX_DOCUMENTS,
  type CteArchiveEntry,
  type CteExportDocument,
  type CteExportRequest,
  type CteExportSelectionQuery,
} from '../../src/cte-issuance/application/export-cte-documents.port.js'
import { createExportCteDocumentsUseCase } from '../../src/cte-issuance/application/export-cte-documents.use-case.js'

import { COMPANY_CONTEXT, captureApiError } from './support.js'

const EXPORTED_AT = new Date('2026-07-31T12:00:00.000Z')
const RENDERED_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46])
const EXPORT_BUCKET = 'fiscal-documents-test'
const FOREIGN_COMPANY_ID = '00000000-0000-4000-8000-0000000007ff'
const BATCH_ID = '00000000-0000-4000-8000-0000000007a1'
const ITEM_ID = '00000000-0000-4000-8000-0000000007a2'

/** Chave sintética: 44 dígitos derivados de um sequencial, nunca uma chave fiscal real. */
function syntheticAccessKey(sequence: number): string {
  return `${'0'.repeat(40)}${String(sequence).padStart(4, '0')}`
}

function syntheticDocument(sequence: number): CteExportDocument {
  return {
    accessKey: syntheticAccessKey(sequence),
    bucket: EXPORT_BUCKET,
    objectKey: `cte/${syntheticAccessKey(sequence)}.xml`,
  }
}

function syntheticDocuments(total: number): readonly CteExportDocument[] {
  return Array.from({ length: total }, (_value, index) => syntheticDocument(index + 1))
}

function createFixture(documents: readonly CteExportDocument[]) {
  const archiveCalls: (readonly CteArchiveEntry[])[] = []
  const renderCalls: { readonly bucket: string; readonly objectKey: string }[] = []
  const selectionCalls: CteExportSelectionQuery[] = []
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })
  const useCase = createExportCteDocumentsUseCase({
    archive: {
      async createArchive(entries) {
        archiveCalls.push(entries)
        return stream
      },
    },
    clock: () => EXPORTED_AT,
    dacte: {
      async renderDacte(location) {
        renderCalls.push(location)
        return RENDERED_PDF
      },
    },
    selection: {
      async listAuthorizedDocuments(query) {
        selectionCalls.push(query)
        return documents.slice(0, query.limit)
      },
    },
  })

  return { archiveCalls, renderCalls, selectionCalls, stream, useCase }
}

function entryNames(entries: readonly CteArchiveEntry[] | undefined): readonly string[] {
  return (entries ?? []).map((entry) => entry.name)
}

async function loadEntry(entry: CteArchiveEntry | undefined): Promise<Uint8Array> {
  if (entry?.source.kind !== 'lazy') throw new Error('entrada não é gerada sob demanda')
  return entry.source.load()
}

describe('CT-e XML export contract', () => {
  test('deriva o companyId do contexto autenticado e ignora o valor do payload', async () => {
    const fixture = createFixture(syntheticDocuments(1))

    await fixture.useCase.exportDocuments({
      companyId: FOREIGN_COMPANY_ID,
      context: COMPANY_CONTEXT,
    } as unknown as CteExportRequest)

    expect(fixture.selectionCalls[0]?.companyId).toBe(COMPANY_CONTEXT.companyId)
    expect(JSON.stringify(fixture.selectionCalls[0])).not.toContain(FOREIGN_COMPANY_ID)
  })

  test('pede um documento a mais que o teto para detectar o estouro', async () => {
    const fixture = createFixture(syntheticDocuments(1))

    await fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT })

    expect(fixture.selectionCalls[0]?.limit).toBe(CTE_EXPORT_MAX_DOCUMENTS + 1)
  })

  test('repassa os mesmos filtros da listagem', async () => {
    const fixture = createFixture(syntheticDocuments(1))
    const filters = {
      batchId: BATCH_ID,
      cteNumberIn: ['1401', '1402'],
      invoiceNumberGte: '900',
      invoiceNumberLte: '950',
      issuedFrom: '2026-07-01T00:00:00.000Z',
      issuedUntil: '2026-07-31T23:59:59.000Z',
      statusIn: ['authorized'],
    } as const

    await fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT, filters })

    expect(fixture.selectionCalls[0]?.filters).toEqual(filters)
  })

  test('repassa a seleção explícita de itens', async () => {
    const fixture = createFixture(syntheticDocuments(1))

    await fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT, itemIds: [ITEM_ID] })

    expect(fixture.selectionCalls[0]?.itemIds).toEqual([ITEM_ID])
  })

  test('sem formato declarado leva só o XML, direto do storage', async () => {
    const documents = syntheticDocuments(2)
    const fixture = createFixture(documents)

    await fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT })

    expect(fixture.archiveCalls[0]).toEqual(
      documents.map((document) => ({
        name: `${document.accessKey}.xml`,
        source: { bucket: document.bucket, kind: 'object', objectKey: document.objectKey },
      })),
    )
  })

  test('formato pdf nomeia as entradas pela chave e não renderiza antes da hora', async () => {
    const documents = syntheticDocuments(2)
    const fixture = createFixture(documents)

    await fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT, format: 'pdf' })

    expect(entryNames(fixture.archiveCalls[0])).toEqual(
      documents.map((document) => `${document.accessKey}.pdf`),
    )
    expect(fixture.renderCalls).toHaveLength(0)
  })

  test('o DACTE nasce do XML autorizado, só quando o arquivo pede a entrada', async () => {
    const documents = syntheticDocuments(1)
    const fixture = createFixture(documents)

    await fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT, format: 'pdf' })
    const bytes = await loadEntry(fixture.archiveCalls[0]?.[0])

    expect(bytes).toEqual(RENDERED_PDF)
    expect(fixture.renderCalls).toEqual([
      { bucket: documents[0]!.bucket, objectKey: documents[0]!.objectKey },
    ])
  })

  test('formato both leva o XML e o DACTE do mesmo CT-e lado a lado', async () => {
    const documents = syntheticDocuments(2)
    const fixture = createFixture(documents)

    await fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT, format: 'both' })

    expect(entryNames(fixture.archiveCalls[0])).toEqual([
      `${documents[0]!.accessKey}.xml`,
      `${documents[0]!.accessKey}.pdf`,
      `${documents[1]!.accessKey}.xml`,
      `${documents[1]!.accessKey}.pdf`,
    ])
  })

  test('a contagem é de CT-es, não de arquivos dentro do ZIP', async () => {
    const fixture = createFixture(syntheticDocuments(3))

    const result = await fixture.useCase.exportDocuments({
      context: COMPANY_CONTEXT,
      format: 'both',
    })

    expect(result.documentCount).toBe(3)
    expect(fixture.archiveCalls[0]).toHaveLength(6)
  })

  test('o nome do download diz o que veio dentro', async () => {
    const fixture = createFixture(syntheticDocuments(1))

    const xml = await fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT })
    const pdf = await fixture.useCase.exportDocuments({
      context: COMPANY_CONTEXT,
      format: 'pdf',
    })
    const both = await fixture.useCase.exportDocuments({
      context: COMPANY_CONTEXT,
      format: 'both',
    })

    expect(xml.fileName).toBe('cte-xml-20260731-120000.zip')
    expect(pdf.fileName).toBe('cte-dacte-20260731-120000.zip')
    expect(both.fileName).toBe('cte-documentos-20260731-120000.zip')
  })

  test('devolve o fluxo do arquivo, a contagem e um nome de download com extensão zip', async () => {
    const fixture = createFixture(syntheticDocuments(3))

    const result = await fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT })

    expect(result.documentCount).toBe(3)
    expect(result.stream).toBe(fixture.stream)
    expect(result.fileName.endsWith('.zip')).toBe(true)
  })

  test('acima do teto responde 422 com código estável e não monta arquivo', async () => {
    const fixture = createFixture(syntheticDocuments(CTE_EXPORT_MAX_DOCUMENTS + 1))

    const error = await captureApiError(() =>
      fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT }),
    )

    expect(error.code).toBe('CTE_EXPORT_LIMIT_EXCEEDED')
    expect(error.status).toBe(422)
    expect(fixture.archiveCalls).toHaveLength(0)
  })

  test('filtro sem nenhum documento autorizado responde 422 em vez de arquivo vazio', async () => {
    const fixture = createFixture([])

    const error = await captureApiError(() =>
      fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT }),
    )

    expect(error.code).toBe('CTE_EXPORT_EMPTY')
    expect(error.status).toBe(422)
    expect(fixture.archiveCalls).toHaveLength(0)
  })
})
