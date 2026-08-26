/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createAggregateDocumentReviewUseCase } from '../../src/fleet/application/aggregate-document-review.use-case.js'
import { createAggregateDocumentUseCase } from '../../src/fleet/application/aggregate-document.use-case.js'
import {
  AggregateDocumentNotFoundError,
  AggregateDocumentRejectionReasonRequiredError,
} from '../../src/fleet/domain/aggregate-document.error.js'
import { COMPANY_CONTEXT } from '../fixtures/company-settings-application.fixture.js'
import {
  FakeAggregateDocumentRepository,
  FakeAggregateDocumentStorage,
} from '../fixtures/aggregate-documents.fixture.js'

const CONTEXT = COMPANY_CONTEXT
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46])

function buildFixtures() {
  const repository = new FakeAggregateDocumentRepository()
  const storage = new FakeAggregateDocumentStorage()
  const uploadUseCase = createAggregateDocumentUseCase({ bucket: 'test-bucket', repository, storage })
  const reviewUseCase = createAggregateDocumentReviewUseCase({ bucket: 'test-bucket', repository, storage })
  return { repository, reviewUseCase, storage, uploadUseCase }
}

describe('aggregate document review use case', () => {
  test('a pending document appears in the review queue', async () => {
    const { reviewUseCase, uploadUseCase } = buildFixtures()
    await uploadUseCase.upload({ bytes: PDF_BYTES, companyId: CONTEXT.companyId, taxId: '12345678901', type: 'cnh' })

    const pending = await reviewUseCase.list({ context: CONTEXT })

    expect(pending).toHaveLength(1)
    expect(pending[0]?.taxId).toBe('12345678901')
    expect(pending[0]?.status).toBe('pending')
  })

  test('approving marks the document approved with no rejection reason', async () => {
    const { reviewUseCase, uploadUseCase } = buildFixtures()
    const uploaded = await uploadUseCase.upload({
      bytes: PDF_BYTES,
      companyId: CONTEXT.companyId,
      taxId: '12345678901',
      type: 'cnh',
    })

    const reviewed = await reviewUseCase.review({
      context: CONTEXT,
      decision: 'approved',
      id: uploaded.id,
      rejectionReason: '',
    })

    expect(reviewed.status).toBe('approved')
    expect(reviewed.rejectionReason).toBe('')
  })

  test('rejecting without a reason is refused', async () => {
    const { reviewUseCase, uploadUseCase } = buildFixtures()
    const uploaded = await uploadUseCase.upload({
      bytes: PDF_BYTES,
      companyId: CONTEXT.companyId,
      taxId: '12345678901',
      type: 'cnh',
    })

    await expect(
      reviewUseCase.review({ context: CONTEXT, decision: 'rejected', id: uploaded.id, rejectionReason: '' }),
    ).rejects.toBeInstanceOf(AggregateDocumentRejectionReasonRequiredError)
  })

  test('rejecting with a reason records it', async () => {
    const { reviewUseCase, uploadUseCase } = buildFixtures()
    const uploaded = await uploadUseCase.upload({
      bytes: PDF_BYTES,
      companyId: CONTEXT.companyId,
      taxId: '12345678901',
      type: 'cnh',
    })

    const reviewed = await reviewUseCase.review({
      context: CONTEXT,
      decision: 'rejected',
      id: uploaded.id,
      rejectionReason: 'Foto ilegível',
    })

    expect(reviewed.status).toBe('rejected')
    expect(reviewed.rejectionReason).toBe('Foto ilegível')
  })

  test('reviewing a document from another company is refused as not found', async () => {
    const { reviewUseCase, uploadUseCase } = buildFixtures()
    const uploaded = await uploadUseCase.upload({
      bytes: PDF_BYTES,
      companyId: CONTEXT.companyId,
      taxId: '12345678901',
      type: 'cnh',
    })

    await expect(
      reviewUseCase.review({
        context: { ...CONTEXT, companyId: crypto.randomUUID() },
        decision: 'approved',
        id: uploaded.id,
        rejectionReason: '',
      }),
    ).rejects.toBeInstanceOf(AggregateDocumentNotFoundError)
  })

  test('a download URL is issued for an existing document, refused for an unknown one', async () => {
    const { reviewUseCase, uploadUseCase } = buildFixtures()
    const uploaded = await uploadUseCase.upload({
      bytes: PDF_BYTES,
      companyId: CONTEXT.companyId,
      taxId: '12345678901',
      type: 'cnh',
    })

    const url = await reviewUseCase.getDownloadUrl({ context: CONTEXT, id: uploaded.id })
    expect(url).toBeInstanceOf(URL)

    await expect(
      reviewUseCase.getDownloadUrl({ context: CONTEXT, id: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(AggregateDocumentNotFoundError)
  })
})
