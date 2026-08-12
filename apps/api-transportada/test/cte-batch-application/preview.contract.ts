import { describe, expect, test } from 'bun:test'

import {
  PREVIEW_COMPANY_ID,
  PREVIEW_CONTEXT,
  PREVIEW_NAME_PREFIX,
  PROFILE_ID,
  RECIPIENT_TAX_ID,
  REFERENCE_DOCUMENT,
  REFERENCE_DOCUMENT_ID,
  SECOND_DOCUMENT_ID,
  SENDER_TAX_ID,
  createPreviewUseCaseForTest,
  createProfileFixture,
  CteBatchPreviewProfileCatalogFixture,
  CteBatchPreviewReaderFixture,
} from './preview-support.js'

const NFSE_INVOICE_ID = '00000000-0000-4000-8000-0000000009f1'

describe('CT-e batch preview projection', () => {
  test('projects the reference NF-e at 4,5% without persisting anything', async () => {
    const preview = await createPreviewUseCaseForTest()

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID],
    })

    expect(result.blocked).toEqual([])
    expect(result.projections).toHaveLength(1)
    const [projection] = result.projections
    expect(projection?.baseAmount).toBe('958.4800')
    expect(projection?.percentage).toBe('0.045000')
    expect(projection?.calculatedAmount).toBe('43.1316')
    expect(projection?.fiscalAmount).toBe('43.13')
    expect(projection?.components).toEqual([
      { amount: '43.1316', calculationType: 'main', label: 'Frete' },
    ])
    expect(projection?.fiscalComponents).toEqual([
      { amount: '43.13', calculationType: 'main', label: 'Frete' },
    ])
    expect(projection?.adjustments).toEqual([])
    expect(projection?.senderTaxId).toBe(SENDER_TAX_ID)
    expect(projection?.recipientTaxId).toBe(RECIPIENT_TAX_ID)
    expect(projection?.documents).toEqual([
      {
        accessKey: REFERENCE_DOCUMENT.accessKey,
        documentId: REFERENCE_DOCUMENT_ID,
        number: REFERENCE_DOCUMENT.number,
        series: REFERENCE_DOCUMENT.series,
        totalAmount: '958.4800',
      },
    ])
    expect(projection?.profile).toEqual({
      groupingMode: 'per_invoice',
      id: PROFILE_ID,
      matchedBy: 'sender_tax_id',
      name: 'Perfil Zaragoza',
      resolvedBy: 'auto',
    })
    expect(result.summary).toEqual({
      blockedCount: 0,
      documentCount: 1,
      projectedCount: 1,
      totalAmount: '43.13',
    })
  })

  test('reads only within the authenticated company and never writes', async () => {
    const preview = await createPreviewUseCaseForTest()

    await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID],
    })

    expect(preview.reader.documentQueries).toEqual([
      { companyId: PREVIEW_COMPANY_ID, documentIds: [REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID] },
    ])
    expect(preview.reader.linkQueries).toEqual([
      { companyId: PREVIEW_COMPANY_ID, documentIds: [REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID] },
    ])
    expect(preview.profiles.queries).toEqual([{ companyId: PREVIEW_COMPANY_ID }])
    const readerKeys = Object.getOwnPropertyNames(
      Object.getPrototypeOf(preview.reader) as object,
    ).filter((name) => name !== 'constructor')
    expect(preview.reader.nfseLinkQueries).toEqual([
      { companyId: PREVIEW_COMPANY_ID, documentIds: [REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID] },
    ])
    expect(readerKeys.toSorted()).toEqual([
      'findActiveBatchLinks',
      'findActiveNfseLinks',
      'findBatchNamesStartingWith',
      'findPreviewDocuments',
    ])
  })

  /** Recíproco do bloqueio que a seleção de NFS-e faz com lotes abertos: nada de bitributar. */
  test('blocks a note already held by a live municipal service invoice', async () => {
    const preview = await createPreviewUseCaseForTest({
      reader: new CteBatchPreviewReaderFixture(
        undefined,
        new Map(),
        new Map([[REFERENCE_DOCUMENT_ID, NFSE_INVOICE_ID]]),
      ),
    })

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID],
    })

    expect(result.projections).toEqual([])
    expect(result.blocked).toEqual([
      {
        batchId: null,
        documentId: REFERENCE_DOCUMENT_ID,
        reason: 'CTE_BATCH_DOCUMENT_LINKED_TO_NFSE',
      },
    ])
  })

  test('groups notes by sender and recipient when the profile asks for it', async () => {
    const preview = await createPreviewUseCaseForTest({
      profiles: new CteBatchPreviewProfileCatalogFixture([
        createProfileFixture({ groupingMode: 'sender_recipient' }),
      ]),
    })

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID],
    })

    expect(result.projections).toHaveLength(1)
    const [projection] = result.projections
    expect(projection?.baseAmount).toBe('2000.0000')
    expect(projection?.calculatedAmount).toBe('90.0000')
    expect(projection?.fiscalAmount).toBe('90.00')
    expect(projection?.documents.map((document) => document.documentId)).toEqual([
      REFERENCE_DOCUMENT_ID,
      SECOND_DOCUMENT_ID,
    ])
    expect(projection?.profile.groupingMode).toBe('sender_recipient')
    expect(result.summary).toEqual({
      blockedCount: 0,
      documentCount: 2,
      projectedCount: 1,
      totalAmount: '90.00',
    })
  })

  test('lets the requested grouping mode override the profile default', async () => {
    const preview = await createPreviewUseCaseForTest({
      profiles: new CteBatchPreviewProfileCatalogFixture([
        createProfileFixture({ groupingMode: 'sender_recipient' }),
      ]),
    })

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID, SECOND_DOCUMENT_ID],
      groupingMode: 'per_invoice',
    })

    expect(result.projections.map((projection) => projection.fiscalAmount)).toEqual([
      '43.13',
      '46.87',
    ])
    expect(result.projections.map((projection) => projection.profile.groupingMode)).toEqual([
      'per_invoice',
      'per_invoice',
    ])
    expect(result.summary.totalAmount).toBe('90.00')
  })

  test('prices the profile components after the main freight component', async () => {
    const preview = await createPreviewUseCaseForTest({
      profiles: new CteBatchPreviewProfileCatalogFixture([
        createProfileFixture({
          components: [
            {
              amount: null,
              calculationType: 'percentage_of_cargo',
              label: 'GRIS',
              ordinal: '2',
              rate: '0.003000',
              validFrom: '2026-01-01T00:00:00.000Z',
              validUntil: null,
            },
            {
              amount: '15.0000',
              calculationType: 'fixed_amount',
              label: 'Pedagio',
              ordinal: '3',
              rate: null,
              validFrom: '2026-01-01T00:00:00.000Z',
              validUntil: null,
            },
          ],
        }),
      ]),
    })

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID],
    })

    const [projection] = result.projections
    expect(projection?.components).toEqual([
      { amount: '43.1316', calculationType: 'main', label: 'Frete' },
      { amount: '2.8754', calculationType: 'percentage_of_cargo', label: 'GRIS' },
      { amount: '15.0000', calculationType: 'fixed_amount', label: 'Pedagio' },
    ])
    expect(projection?.calculatedAmount).toBe('61.0070')
    expect(projection?.fiscalComponents.map((component) => component.amount)).toEqual([
      '43.13',
      '2.88',
      '15.00',
    ])
    expect(projection?.fiscalAmount).toBe('61.01')
    expect(result.summary.totalAmount).toBe('61.01')
  })

  test('applies the minimum freight amount as an adjustment', async () => {
    const preview = await createPreviewUseCaseForTest({
      profiles: new CteBatchPreviewProfileCatalogFixture([
        createProfileFixture({
          freightRule: {
            maximumAmount: null,
            minimumAmount: '80.0000',
            percentage: '0.045000',
            validFrom: '2026-01-01T00:00:00.000Z',
            validUntil: null,
          },
        }),
      ]),
    })

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID],
    })

    const [projection] = result.projections
    expect(projection?.adjustments).toEqual([{ amount: '36.8684', type: 'minimum_amount' }])
    expect(projection?.calculatedAmount).toBe('80.0000')
    expect(projection?.fiscalAmount).toBe('80.00')
  })

  test('suggests the next batch name of the day without touching the rest of the envelope', async () => {
    const preview = await createPreviewUseCaseForTest()
    preview.reader.batchNames = [`${PREVIEW_NAME_PREFIX}1`, `${PREVIEW_NAME_PREFIX}3`, 'rascunho']

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID],
    })

    expect(result.suggestedName).toBe(`${PREVIEW_NAME_PREFIX}4`)
    expect(result.blocked).toEqual([])
    expect(result.projections).toHaveLength(1)
    expect(result.summary).toEqual({
      blockedCount: 0,
      documentCount: 1,
      projectedCount: 1,
      totalAmount: '43.13',
    })
    // A consulta é do tenant autenticado — nome de lote de outra empresa nunca entra na sequência.
    expect(preview.reader.nameQueries).toEqual([
      { companyId: PREVIEW_COMPANY_ID, prefix: PREVIEW_NAME_PREFIX },
    ])
  })

  test('suggests the first name of the day when the company has no batch yet', async () => {
    const preview = await createPreviewUseCaseForTest()

    const result = await preview.execute({
      context: PREVIEW_CONTEXT,
      documentIds: [REFERENCE_DOCUMENT_ID],
    })

    expect(result.suggestedName).toBe(`${PREVIEW_NAME_PREFIX}1`)
  })
})
