import { describe, expect, test } from 'bun:test'

import {
  PREVIEW_COMPANY_ID,
  PREVIEW_CONTEXT,
  PROFILE_ID,
  RECIPIENT_TAX_ID,
  REFERENCE_DOCUMENT,
  REFERENCE_DOCUMENT_ID,
  SECOND_DOCUMENT_ID,
  SENDER_TAX_ID,
  createPreviewUseCaseForTest,
  createProfileFixture,
  CteBatchPreviewProfileCatalogFixture,
} from './preview-support.js'

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
    expect(readerKeys.toSorted()).toEqual(['findActiveBatchLinks', 'findPreviewDocuments'])
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
})
