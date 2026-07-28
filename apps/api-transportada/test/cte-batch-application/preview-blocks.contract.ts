import { describe, expect, test } from 'bun:test'

import {
  LINKED_BATCH_ID,
  PREVIEW_CONTEXT,
  PROFILE_ID,
  REFERENCE_DOCUMENT,
  REFERENCE_DOCUMENT_ID,
  SECOND_DOCUMENT,
  SECOND_DOCUMENT_ID,
  SECOND_PROFILE_ID,
  UNKNOWN_DOCUMENT_ID,
  capturePreviewApiError,
  createPreviewUseCaseForTest,
  createProfileFixture,
  CteBatchPreviewProfileCatalogFixture,
  CteBatchPreviewReaderFixture,
  type PreviewDocumentFixture,
} from './preview-support.js'

const previewWithDocuments = (documents: readonly PreviewDocumentFixture[]) =>
  createPreviewUseCaseForTest({ reader: new CteBatchPreviewReaderFixture(documents) })

describe('CT-e batch preview blocks', () => {
  test('reports duplicated, unknown and non-authorized notes without failing the request', async () => {
    const preview = await previewWithDocuments([
      REFERENCE_DOCUMENT,
      { ...SECOND_DOCUMENT, status: 'cancelled' },
    ])

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [
        REFERENCE_DOCUMENT_ID,
        REFERENCE_DOCUMENT_ID,
        UNKNOWN_DOCUMENT_ID,
        SECOND_DOCUMENT_ID,
      ],
    })

    expect(result.blocked).toEqual([
      {
        batchId: null,
        documentId: REFERENCE_DOCUMENT_ID,
        reason: 'CTE_BATCH_DOCUMENT_DUPLICATED',
      },
      { batchId: null, documentId: UNKNOWN_DOCUMENT_ID, reason: 'CTE_BATCH_DOCUMENT_NOT_FOUND' },
      {
        batchId: null,
        documentId: SECOND_DOCUMENT_ID,
        reason: 'CTE_BATCH_DOCUMENT_NOT_AUTHORIZED',
      },
    ])
    expect(result.projections).toHaveLength(1)
    expect(result.summary).toEqual({
      blockedCount: 3,
      documentCount: 4,
      projectedCount: 1,
      totalAmount: '43.13',
    })
  })

  test('hard blocks a note already linked to a live CT-e and exposes the batch', async () => {
    const preview = await createPreviewUseCaseForTest()
    preview.reader.links.set(SECOND_DOCUMENT_ID, LINKED_BATCH_ID)

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID],
    })

    expect(result.blocked).toEqual([
      {
        batchId: LINKED_BATCH_ID,
        documentId: SECOND_DOCUMENT_ID,
        reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
      },
    ])
    expect(result.projections).toHaveLength(1)
  })

  test('blocks notes missing the fiscal data a CT-e needs', async () => {
    const preview = await previewWithDocuments([
      { ...REFERENCE_DOCUMENT, variant: 'summary' },
      { ...SECOND_DOCUMENT, totalAmount: null },
      { ...SECOND_DOCUMENT, id: 'doc-no-party', senderTaxId: null },
      { ...SECOND_DOCUMENT, id: 'doc-no-city', recipientCity: null },
      { ...SECOND_DOCUMENT, id: 'doc-no-weight', grossWeight: null },
    ])

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [
        REFERENCE_DOCUMENT_ID,
        SECOND_DOCUMENT_ID,
        'doc-no-party',
        'doc-no-city',
        'doc-no-weight',
      ],
    })

    expect(result.blocked.map((blocked) => blocked.reason)).toEqual([
      'CTE_BATCH_DOCUMENT_SUMMARY_ONLY',
      'CTE_BATCH_DOCUMENT_MISSING_TOTAL',
      'CTE_BATCH_DOCUMENT_MISSING_PARTY',
      'CTE_BATCH_DOCUMENT_MISSING_MUNICIPALITY',
      'CTE_BATCH_DOCUMENT_MISSING_WEIGHT',
    ])
    expect(result.projections).toEqual([])
    expect(result.summary.totalAmount).toBe('0.00')
  })

  test('blocks a note when no active profile matches its sender', async () => {
    const preview = await createPreviewUseCaseForTest({
      profiles: new CteBatchPreviewProfileCatalogFixture([
        createProfileFixture({ matchers: [{ matchRole: 'sender', taxId: '99999999000191' }] }),
      ]),
    })

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID],
    })

    expect(result.blocked).toEqual([
      { batchId: null, documentId: REFERENCE_DOCUMENT_ID, reason: 'CTE_PROFILE_UNRESOLVED' },
    ])
  })

  test('blocks a note when two profiles match the sender with the same precision', async () => {
    const preview = await createPreviewUseCaseForTest({
      profiles: new CteBatchPreviewProfileCatalogFixture([
        createProfileFixture(),
        createProfileFixture({ id: SECOND_PROFILE_ID, name: 'Perfil alternativo' }),
      ]),
    })

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID],
    })

    expect(result.blocked).toEqual([
      { batchId: null, documentId: REFERENCE_DOCUMENT_ID, reason: 'CTE_PROFILE_AMBIGUOUS' },
    ])
  })

  test('blocks a note issued outside the freight rule validity window', async () => {
    const preview = await createPreviewUseCaseForTest({
      profiles: new CteBatchPreviewProfileCatalogFixture([
        createProfileFixture({
          freightRule: {
            maximumAmount: null,
            minimumAmount: null,
            percentage: '0.045000',
            validFrom: '2026-01-01T00:00:00.000Z',
            validUntil: '2026-06-30T23:59:59.000Z',
          },
        }),
      ]),
    })

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID],
    })

    expect(result.blocked).toEqual([
      { batchId: null, documentId: REFERENCE_DOCUMENT_ID, reason: 'CTE_PROFILE_RULE_NOT_IN_FORCE' },
    ])
  })

  test('applies a manually requested profile to every projected note', async () => {
    const preview = await createPreviewUseCaseForTest({
      profiles: new CteBatchPreviewProfileCatalogFixture([
        createProfileFixture({ matchers: [] }),
        createProfileFixture({
          id: SECOND_PROFILE_ID,
          matchMode: 'manual',
          matchers: [],
          name: 'Perfil manual',
        }),
      ]),
    })

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID],
      emissionProfileId: SECOND_PROFILE_ID,
    })

    expect(result.blocked).toEqual([])
    expect(result.projections[0]?.profile).toEqual({
      groupingMode: 'per_invoice',
      id: SECOND_PROFILE_ID,
      matchedBy: 'manual',
      name: 'Perfil manual',
      resolvedBy: 'manual',
    })
  })

  test('rejects the whole request when the requested profile is unknown or inactive', async () => {
    const preview = await createPreviewUseCaseForTest({
      profiles: new CteBatchPreviewProfileCatalogFixture([
        createProfileFixture({ id: SECOND_PROFILE_ID, status: 'draft' }),
      ]),
    })

    const notFound = await capturePreviewApiError(() =>
      preview.execute({
        context: PREVIEW_CONTEXT,
        documentIds: [REFERENCE_DOCUMENT_ID],
        emissionProfileId: PROFILE_ID,
      }),
    )
    const inactive = await capturePreviewApiError(() =>
      preview.execute({
        context: PREVIEW_CONTEXT,
        documentIds: [REFERENCE_DOCUMENT_ID],
        emissionProfileId: SECOND_PROFILE_ID,
      }),
    )

    expect(notFound.code).toBe('CTE_PROFILE_NOT_FOUND')
    expect(notFound.status).toBe(404)
    expect(inactive.code).toBe('CTE_PROFILE_INACTIVE')
    expect(inactive.status).toBe(409)
  })
})
