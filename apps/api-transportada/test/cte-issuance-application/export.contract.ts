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
    selection: {
      async listAuthorizedDocuments(query) {
        selectionCalls.push(query)
        return documents.slice(0, query.limit)
      },
    },
  })

  return { archiveCalls, selectionCalls, stream, useCase }
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

  test('nomeia cada entrada do arquivo com a chave de acesso', async () => {
    const documents = syntheticDocuments(2)
    const fixture = createFixture(documents)

    await fixture.useCase.exportDocuments({ context: COMPANY_CONTEXT })

    expect(fixture.archiveCalls[0]).toEqual(
      documents.map((document) => ({
        bucket: document.bucket,
        name: `${document.accessKey}.xml`,
        objectKey: document.objectKey,
      })),
    )
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
