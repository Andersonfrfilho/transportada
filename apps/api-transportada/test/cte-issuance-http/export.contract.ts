/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error'
import {
  EXPORT_ARCHIVE_BYTES,
  EXPORT_FILE_NAME,
  READ_ONLY_CONTEXT,
  createCteIssuanceHttpFixture,
  exportItemsRequest,
  responseApiError,
  unauthenticatedError,
} from '../fixtures/cte-issuance-http.fixture'

const BATCH_ID = '00000000-0000-4000-8000-000000000901'
const ITEM_ID = '00000000-0000-4000-8000-000000000902'
const OTHER_ITEM_ID = '00000000-0000-4000-8000-000000000903'

const LISTING_FILTERS = {
  batchId: BATCH_ID,
  cteNumberIn: ['1401', '1402'],
  invoiceNumberGte: '900',
  invoiceNumberLte: '950',
  issuedFrom: '2026-07-01T00:00:00.000Z',
  issuedUntil: '2026-07-31T23:59:59.000Z',
  statusIn: ['authorized'],
} as const

function exportError(code: string): ApiError {
  return new ApiError({ code, message: 'CT-e export was rejected', status: 422 })
}

describe('CT-e XML export HTTP contract', () => {
  test('devolve o arquivo ZIP com nome de download', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(exportItemsRequest())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="${EXPORT_FILE_NAME}"`,
    )
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(EXPORT_ARCHIVE_BYTES)
  })

  test('não é capturada pela rota de transmissão do lote', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    await fixture.handle(exportItemsRequest())

    expect(fixture.exportCalls).toHaveLength(1)
    expect(fixture.issueCalls).toHaveLength(0)
  })

  test('aceita os mesmos filtros da listagem', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(
      exportItemsRequest({ body: { filters: LISTING_FILTERS } }),
    )

    expect(response.status).toBe(200)
    expect(fixture.exportCalls[0]?.filters).toEqual(LISTING_FILTERS)
  })

  test('aceita a seleção explícita de itens', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(
      exportItemsRequest({ body: { itemIds: [ITEM_ID, OTHER_ITEM_ID] } }),
    )

    expect(response.status).toBe(200)
    expect(fixture.exportCalls[0]?.itemIds).toEqual([ITEM_ID, OTHER_ITEM_ID])
  })

  test('deriva a empresa do contexto autenticado e ignora companyId do corpo', async () => {
    const fixture = await createCteIssuanceHttpFixture()

    const response = await fixture.handle(
      exportItemsRequest({ body: { companyId: '00000000-0000-4000-8000-0000000009ff' } }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.exportCalls).toHaveLength(0)
  })

  test('rejeita filtro desconhecido e lista combinada com faixa', async () => {
    const fixture = await createCteIssuanceHttpFixture()
    const rejectedBodies = [
      { filters: { unknownFilter: '1' } },
      { filters: { cteNumberGte: '10', cteNumberIn: ['11'] } },
      {
        filters: {
          issuedFrom: '2026-07-31T00:00:00.000Z',
          issuedUntil: '2026-07-01T00:00:00.000Z',
        },
      },
      { itemIds: ['not-a-uuid'] },
      { itemIds: [] },
    ]

    for (const body of rejectedBodies) {
      const response = await fixture.handle(exportItemsRequest({ body }))

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    }
    expect(fixture.exportCalls).toHaveLength(0)
  })

  test('propaga o 422 de teto excedido com código estável', async () => {
    const fixture = await createCteIssuanceHttpFixture({
      exportError: exportError('CTE_EXPORT_LIMIT_EXCEEDED'),
    })

    const response = await fixture.handle(exportItemsRequest())

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).error.code).toBe('CTE_EXPORT_LIMIT_EXCEEDED')
  })

  test('propaga o 422 de filtro sem documento autorizado', async () => {
    const fixture = await createCteIssuanceHttpFixture({
      exportError: exportError('CTE_EXPORT_EMPTY'),
    })

    const response = await fixture.handle(exportItemsRequest())

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).error.code).toBe('CTE_EXPORT_EMPTY')
  })

  test('exige a permissão de transmissão de CT-e', async () => {
    const fixture = await createCteIssuanceHttpFixture({
      permissions: READ_ONLY_CONTEXT.permissions,
    })

    const response = await fixture.handle(exportItemsRequest())

    expect(response.status).toBe(403)
    expect(fixture.exportCalls).toHaveLength(0)
  })

  test('exige autenticação antes de qualquer leitura', async () => {
    const fixture = await createCteIssuanceHttpFixture({
      authenticationError: unauthenticatedError(),
    })

    const response = await fixture.handle(exportItemsRequest())

    expect(response.status).toBe(401)
    expect(fixture.exportCalls).toHaveLength(0)
  })
})
