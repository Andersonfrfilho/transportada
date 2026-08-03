/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  BATCH_ITEM_ID,
  COMPANY_CONTEXT,
  FISCAL_DOCUMENT_RECORD,
  OTHER_BATCH_ITEM_ID,
  REPROCESS_IDEMPOTENCY_KEY,
  SIGNED_URL_EXPIRES_AT,
  CteIssuanceUnitOfWorkFixture,
  captureApiError,
  createCteIssuanceUseCaseForTest,
} from './support.js'

describe('CT-e fiscal document listing contract', () => {
  test('lists the documents of the selected item behind a temporary URL', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const page = await useCase.listDocuments({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: COMPANY_CONTEXT,
    })

    expect(page).toEqual({
      items: [
        {
          accessKey: FISCAL_DOCUMENT_RECORD.accessKey,
          contentType: 'application/xml',
          documentId: FISCAL_DOCUMENT_RECORD.documentId,
          downloadUrl: 'https://storage.local/signed/cte-document-001?signature=stub',
          expiresAt: SIGNED_URL_EXPIRES_AT,
          sha256: FISCAL_DOCUMENT_RECORD.sha256,
        },
      ],
      nextCursor: null,
    })
    expect(unitOfWork.fiscalDocumentQueries).toEqual([
      { batchId: BATCH_ID, batchItemId: BATCH_ITEM_ID, companyId: COMPANY_CONTEXT.companyId },
    ])

    // O nome do arquivo sai da chave de acesso, não da chave do objeto no bucket.
    expect(unitOfWork.downloadRequests).toEqual([
      {
        bucket: FISCAL_DOCUMENT_RECORD.bucket,
        fileName: `${FISCAL_DOCUMENT_RECORD.accessKey}.xml`,
        key: FISCAL_DOCUMENT_RECORD.objectKey,
      },
    ])
  })

  test('never exposes the bucket, the storage key or the XML itself', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const page = await useCase.listDocuments({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: COMPANY_CONTEXT,
    })

    const [document] = page.items
    expect(Object.keys(document ?? {}).toSorted()).toEqual([
      'accessKey',
      'contentType',
      'documentId',
      'downloadUrl',
      'expiresAt',
      'sha256',
    ])
    expect(JSON.stringify(page)).not.toContain(FISCAL_DOCUMENT_RECORD.bucket)
    expect(JSON.stringify(page)).not.toContain('<cte')
  })

  test('returns an empty page when the item has no fiscal document', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.fiscalDocuments = []
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const page = await useCase.listDocuments({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: COMPANY_CONTEXT,
    })

    expect(page).toEqual({ items: [], nextCursor: null })
    expect(unitOfWork.downloadRequests).toEqual([])
  })

  test('keeps anti-enumeration for an item outside the batch', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.listDocuments({
        batchId: BATCH_ID,
        batchItemId: OTHER_BATCH_ITEM_ID,
        context: COMPANY_CONTEXT,
      }),
    )

    expect(error).toMatchObject({ code: 'CTE_ISSUANCE_NOT_FOUND', status: 404 })
    expect(unitOfWork.fiscalDocumentQueries).toEqual([])
  })
})

describe('CT-e issuance item selection contract', () => {
  test('looks the requested item up instead of the first item of the batch', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = unitOfWork.rejectedIssuance
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.getIssuance({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: COMPANY_CONTEXT,
      includeRejected: true,
    })

    expect(unitOfWork.batchItemQueries).toEqual([
      { batchId: BATCH_ID, batchItemId: BATCH_ITEM_ID, companyId: COMPANY_CONTEXT.companyId },
    ])
  })

  test('rejects a lookup for an item that does not belong to the batch', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    const error = await captureApiError(() =>
      useCase.getIssuance({
        batchId: BATCH_ID,
        batchItemId: OTHER_BATCH_ITEM_ID,
        context: COMPANY_CONTEXT,
      }),
    )

    expect(error).toMatchObject({ code: 'CTE_ISSUANCE_NOT_FOUND', status: 404 })
    expect(unitOfWork.lookupQueries).toEqual([])
  })

  test('reprocesses the requested item instead of the first item of the batch', async () => {
    const unitOfWork = new CteIssuanceUnitOfWorkFixture()
    unitOfWork.issuanceResult = unitOfWork.rejectedIssuance
    const useCase = await createCteIssuanceUseCaseForTest(unitOfWork)

    await useCase.reprocess({
      batchId: BATCH_ID,
      batchItemId: BATCH_ITEM_ID,
      context: COMPANY_CONTEXT,
      correlationId: 'correlation-002',
      idempotencyKey: REPROCESS_IDEMPOTENCY_KEY,
    })

    expect(unitOfWork.batchItemQueries).toEqual([
      { batchId: BATCH_ID, batchItemId: BATCH_ITEM_ID, companyId: COMPANY_CONTEXT.companyId },
    ])
  })
})
