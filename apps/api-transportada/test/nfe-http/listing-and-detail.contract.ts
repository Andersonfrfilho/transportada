/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { serializeScheduledDistributionStatus } from '../../src/companies/presentation/scheduled-distribution.serializer'
import {
  DISTRIBUTION_STATUS,
  DOCUMENT_DETAIL,
  DOCUMENT_ELIGIBILITY,
  DOCUMENT_SUMMARY,
  IMPORT_DETAIL,
  SCHEDULED_DISTRIBUTION_STATUS,
  serializeDocumentSummary,
  serializeImportDetail,
  serializeImportSummary,
  UPLOAD_RESPONSE,
} from '../fixtures/nfe-http-payload.fixture'
import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import {
  distributionStatusRequest,
  documentDetailRequest,
  documentEligibilityRequest,
  documentsListRequest,
  importDetailRequest,
  importsListRequest,
  responseApiError,
} from '../fixtures/nfe-http-request.fixture'
import { COMPANY_CONTEXT, IMPORT_ID } from '../fixtures/nfe-import-application.fixture'

describe('nfe http listing and detail contract', () => {
  test('lists imports with validated cursor/limit and stable response serialization', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(
      importsListRequest({
        query: '?cursor=2026-07-22T13:39:00.000Z::00000000-0000-4000-8000-000000000099&limit=25',
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [serializeImportSummary(UPLOAD_RESPONSE)],
      page: { nextCursor: '2026-07-22T13:40:00.000Z::00000000-0000-4000-8000-000000000207' },
    })
    expect(fixture.importListCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: '2026-07-22T13:39:00.000Z::00000000-0000-4000-8000-000000000099',
        limit: 25,
      },
    ])
  })

  test('rejects invalid import listing cursors and limits before application work', async () => {
    const fixture = await createNfeHttpFixture()

    for (const query of ['?limit=0', '?limit=101', '?cursor=not-a-cursor']) {
      const response = await fixture.handle(importsListRequest({ query }))
      expect(response.status).toBe(400)
      expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    }
    expect(fixture.importListCalls).toEqual([])
  })

  test('returns import detail with item-level safe state and without xml fields', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(importDetailRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ data: serializeImportDetail(IMPORT_DETAIL) })
    expect(fixture.importGetCalls).toEqual([{ context: COMPANY_CONTEXT, importId: IMPORT_ID }])
    expect(JSON.stringify(body)).not.toContain('"xml"')
    expect(JSON.stringify(body)).not.toContain('"content"')
  })

  test('lists and details documents with decimal strings and safe metadata only', async () => {
    const fixture = await createNfeHttpFixture()

    const listResponse = await fixture.handle(
      documentsListRequest({
        query: '?cursor=2026-07-22T14:00:00.000Z::00000000-0000-4000-8000-000000000230&limit=10',
      }),
    )
    expect(listResponse.status).toBe(200)
    expect(await listResponse.json()).toEqual({
      data: [serializeDocumentSummary(DOCUMENT_SUMMARY)],
      page: { nextCursor: '2026-07-22T14:01:00.000Z::00000000-0000-4000-8000-000000000230' },
    })

    const detailResponse = await fixture.handle(documentDetailRequest())
    expect(detailResponse.status).toBe(200)
    expect(await detailResponse.json()).toEqual({
      data: serializeDocumentSummary(DOCUMENT_DETAIL),
    })
    expect(fixture.documentListCalls[0]).toEqual({
      accessKey: null,
      context: COMPANY_CONTEXT,
      cursor: '2026-07-22T14:00:00.000Z::00000000-0000-4000-8000-000000000230',
      limit: 10,
    })
  })

  test('exposes both parties tax id and ibge city code required by the CT-e payload', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(documentsListRequest({ query: '?limit=10' }))
    const [document] = (await documentListBody(response)).data

    expect(document).toMatchObject({
      emitterCityCode: '3509502',
      emitterTaxId: '61156864000191',
      recipientCityCode: '3525904',
      recipientTaxId: '12345678000199',
    })
  })

  test('keeps tax id and city code nullable for documents imported without those fields', async () => {
    const fixture = await createNfeHttpFixture({
      documentList: {
        items: [
          {
            ...DOCUMENT_SUMMARY,
            emitterCityCode: null,
            emitterTaxId: null,
            recipientCityCode: null,
            recipientTaxId: null,
          },
        ],
        nextCursor: null,
      },
    })

    const response = await fixture.handle(documentsListRequest({ query: '?limit=10' }))
    const [document] = (await documentListBody(response)).data

    expect(document).toMatchObject({
      emitterCityCode: null,
      emitterTaxId: null,
      recipientCityCode: null,
      recipientTaxId: null,
    })
  })

  test('exposes the CT-e block reason so the listing does not discover it only in the dialog', async () => {
    const fixture = await createNfeHttpFixture({
      documentList: {
        items: [
          DOCUMENT_SUMMARY,
          {
            ...DOCUMENT_SUMMARY,
            cteBlockReason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
            nfseBlockReason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
            id: '00000000-0000-4000-8000-000000000231',
          },
        ],
        nextCursor: null,
      },
    })

    const response = await fixture.handle(documentsListRequest({ query: '?limit=10' }))
    const documents = (await documentListBody(response)).data

    expect(documents[0]).toMatchObject({ cteBlockReason: null })
    expect(documents[1]).toMatchObject({ cteBlockReason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED' })
  })

  /**
   * Spec 067: os dois motivos são independentes, e é a diferença entre eles que a tabela lê para
   * decidir se a linha pode ser marcada. Serializar um a partir do outro devolveria a nota sem peso
   * ao estado de "impossível de selecionar para nada", que é o defeito que esta rota conserta.
   */
  test('publica o bloqueio da NFS-e separado do bloqueio do CT-e', async () => {
    const fixture = await createNfeHttpFixture({
      documentList: {
        items: [
          {
            ...DOCUMENT_SUMMARY,
            cteBlockReason: 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT',
            id: '00000000-0000-4000-8000-000000000232',
            nfseBlockReason: null,
          },
        ],
        nextCursor: null,
      },
    })

    const documents = (
      await documentListBody(await fixture.handle(documentsListRequest({ query: '?limit=10' })))
    ).data

    expect(documents[0]).toMatchObject({
      cteBlockReason: 'CTE_BATCH_DOCUMENT_MISSING_WEIGHT',
      nfseBlockReason: null,
    })
  })

  /**
   * Spec 065 D4b: **fatura-se o que saiu.** Quem monta o lote precisa ver a viagem da nota sem abrir
   * a tela de viagem — e é **sinal, não bloqueio**: a nota que rodou é justamente a que deve entrar.
   */
  test('announces the trip the note travelled on, without blocking it', async () => {
    const fixture = await createNfeHttpFixture({
      documentList: {
        items: [
          DOCUMENT_SUMMARY,
          {
            ...DOCUMENT_SUMMARY,
            id: '00000000-0000-4000-8000-000000000232',
            tripId: '00000000-0000-4000-8000-000000000a11',
            tripStatus: 'in_transit',
          },
        ],
        nextCursor: null,
      },
    })

    const response = await fixture.handle(documentsListRequest({ query: '?limit=10' }))
    const documents = (await documentListBody(response)).data

    expect(documents[0]).toMatchObject({ tripId: null, tripStatus: null })
    expect(documents[1]).toMatchObject({
      cteBlockReason: null,
      nfseBlockReason: null,
      tripId: '00000000-0000-4000-8000-000000000a11',
      tripStatus: 'in_transit',
    })
  })

  test('returns distribution pull status with cooldown state and no leaked identifiers', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(distributionStatusRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(body).toEqual({
      data: {
        ...DISTRIBUTION_STATUS,
        lastRun: null,
        scheduled: serializeScheduledDistributionStatus(SCHEDULED_DISTRIBUTION_STATUS),
      },
    })
    expect(fixture.distributionStatusCalls).toEqual([{ context: COMPANY_CONTEXT }])
  })

  test('returns structural document eligibility without inventing fiscal rules', async () => {
    const fixture = await createNfeHttpFixture()

    const response = await fixture.handle(documentEligibilityRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: DOCUMENT_ELIGIBILITY })
    expect(fixture.documentEligibilityCalls[0]).toEqual({
      context: COMPANY_CONTEXT,
      documentId: DOCUMENT_SUMMARY.id,
    })
  })
})

async function documentListBody(
  response: Response,
): Promise<{ readonly data: readonly Record<string, unknown>[] }> {
  return (await response.json()) as { readonly data: readonly Record<string, unknown>[] }
}
