import { describe, expect, test } from 'bun:test'

import {
  BATCH_ID,
  BATCH_NAME,
  CALCULATION_ID,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  DOCUMENT_ID,
  FINGERPRINT,
  FREIGHT_RULE_VERSION,
  FREIGHT_RULE_VERSION_ID,
  GRIS_COMPONENT,
  IDEMPOTENCY_KEY,
  ITEM_ID,
  SECOND_CALCULATION_ID,
  SECOND_DOCUMENT_ID,
  SECOND_ITEM_ID,
  THIRD_CALCULATION_ID,
  THIRD_DOCUMENT_ID,
  createCatalogFixture,
  createCteBatchUseCaseForTest,
  CteBatchFingerprintFixture,
  CteBatchUnitOfWorkFixture,
  decodeFingerprintFields,
} from './support.js'
import {
  CteBatchPreviewProfileCatalogFixture,
  PROFILE_ID,
  SECOND_PROFILE_ID,
  createProfileFixture,
} from './preview-support.js'

const ALL_DOCUMENT_IDS = [DOCUMENT_ID, SECOND_DOCUMENT_ID, THIRD_DOCUMENT_ID] as const

function createGroupedCatalog(): CteBatchPreviewProfileCatalogFixture {
  return createCatalogFixture({ components: [GRIS_COMPONENT], groupingMode: 'sender_recipient' })
}

describe('CT-e batch grouping contract', () => {
  test('groups the selection by sender and recipient into one CT-e item per group', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const useCase = await createCteBatchUseCaseForTest(
      unitOfWork,
      FINGERPRINT,
      createGroupedCatalog(),
    )

    await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [...ALL_DOCUMENT_IDS],
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(unitOfWork.documentQueries).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, documentIds: [...ALL_DOCUMENT_IDS] },
    ])
    expect(unitOfWork.activeLinkQueries).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, documentIds: [...ALL_DOCUMENT_IDS] },
    ])
    expect(unitOfWork.createdItems).toHaveLength(2)
    expect(unitOfWork.createdItems.map((item) => item['position'])).toEqual(['1', '2'])
    expect(unitOfWork.createdItems.map((item) => item['nfeDocumentId'])).toEqual([
      SECOND_DOCUMENT_ID,
      THIRD_DOCUMENT_ID,
    ])
    expect(unitOfWork.createdItemDocuments).toEqual([
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        itemId: ITEM_ID,
        nfeDocumentId: DOCUMENT_ID,
        position: '1',
      },
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        itemId: ITEM_ID,
        nfeDocumentId: SECOND_DOCUMENT_ID,
        position: '2',
      },
      {
        batchId: BATCH_ID,
        companyId: COMPANY_CONTEXT.companyId,
        itemId: SECOND_ITEM_ID,
        nfeDocumentId: THIRD_DOCUMENT_ID,
        position: '1',
      },
    ])
  })

  test('freezes the grouped charge breakdown with the profile components', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const useCase = await createCteBatchUseCaseForTest(
      unitOfWork,
      FINGERPRINT,
      createGroupedCatalog(),
    )

    await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [...ALL_DOCUMENT_IDS],
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(unitOfWork.createdItemCharges).toEqual([
      {
        amount: '1350.0000',
        baseAmount: '30000.0000',
        calculationType: 'percentage_of_cargo',
        companyId: COMPANY_CONTEXT.companyId,
        itemId: ITEM_ID,
        label: 'Frete',
        ordinal: '1',
        rate: '0.045000',
      },
      {
        amount: '90.0000',
        baseAmount: '30000.0000',
        calculationType: 'percentage_of_cargo',
        companyId: COMPANY_CONTEXT.companyId,
        itemId: ITEM_ID,
        label: 'GRIS',
        ordinal: '2',
        rate: '0.003000',
      },
      {
        amount: '225.0000',
        baseAmount: '5000.0000',
        calculationType: 'percentage_of_cargo',
        companyId: COMPANY_CONTEXT.companyId,
        itemId: SECOND_ITEM_ID,
        label: 'Frete',
        ordinal: '1',
        rate: '0.045000',
      },
      {
        amount: '15.0000',
        baseAmount: '5000.0000',
        calculationType: 'percentage_of_cargo',
        companyId: COMPANY_CONTEXT.companyId,
        itemId: SECOND_ITEM_ID,
        label: 'GRIS',
        ordinal: '2',
        rate: '0.003000',
      },
    ])
    expect(unitOfWork.createdItems[0]).toMatchObject({
      calculationSnapshot: {
        baseAmount: '30000.0000',
        calculatedAmount: '1440.0000',
        fiscalAmount: '1440.00',
        percentage: '0.045000',
        profile: {
          groupingMode: 'sender_recipient',
          id: PROFILE_ID,
          resolvedBy: 'auto',
        },
      },
    })
    expect(unitOfWork.createdItems[0]).toMatchObject({
      calculationSnapshot: { freightCalculationId: SECOND_CALCULATION_ID },
    })
  })

  test('guarantees one idempotent freight calculation per selected NF-e', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const useCase = await createCteBatchUseCaseForTest(
      unitOfWork,
      FINGERPRINT,
      createGroupedCatalog(),
    )

    await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [...ALL_DOCUMENT_IDS],
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(unitOfWork.ruleVersionQueries).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        freightRuleId: createProfileFixture().freightRuleId,
      },
    ])
    expect(
      unitOfWork.createdFreightCalculations.map((calculation) => calculation['idempotencyKey']),
    ).toEqual(ALL_DOCUMENT_IDS.map((documentId) => `cte-batch:${IDEMPOTENCY_KEY}:${documentId}`))
    expect(unitOfWork.createdFreightCalculations[0]).toEqual({
      adjustments: [],
      baseAmount: '10000.0000',
      calculatedAmount: '450.0000',
      calculationDetails: {
        formula: 'invoiceTotalAmount * percentage',
        roundingMode: 'half_up',
        scale: 4,
      },
      companyId: COMPANY_CONTEXT.companyId,
      correlationId: CORRELATION_ID,
      createdByUserId: COMPANY_CONTEXT.userId,
      freightRuleId: createProfileFixture().freightRuleId,
      freightRuleVersionId: FREIGHT_RULE_VERSION_ID,
      idempotencyKey: `cte-batch:${IDEMPOTENCY_KEY}:${DOCUMENT_ID}`,
      maximumAmount: null,
      minimumAmount: null,
      nfeDocumentId: DOCUMENT_ID,
      percentage: '0.045000',
      requestFingerprint: FINGERPRINT,
      ruleSnapshot: {
        freightRuleId: createProfileFixture().freightRuleId,
        freightRuleVersionId: FREIGHT_RULE_VERSION_ID,
        maximumAmount: null,
        minimumAmount: null,
        percentage: '0.045000',
        ruleVersion: FREIGHT_RULE_VERSION,
        type: 'percentage_of_invoice_total',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
      },
      ruleVersion: FREIGHT_RULE_VERSION,
      status: 'snapshotted',
      totalAmount: '450.0000',
    })
    expect(unitOfWork.createdItems.map((item) => item['freightCalculationId'])).toEqual([
      SECOND_CALCULATION_ID,
      THIRD_CALCULATION_ID,
    ])
  })

  test('honours the requested grouping override and emits one CT-e per invoice', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const useCase = await createCteBatchUseCaseForTest(
      unitOfWork,
      FINGERPRINT,
      createGroupedCatalog(),
    )

    await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [...ALL_DOCUMENT_IDS],
      groupingMode: 'per_invoice',
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(unitOfWork.createdItems.map((item) => item['nfeDocumentId'])).toEqual([
      ...ALL_DOCUMENT_IDS,
    ])
    expect(unitOfWork.createdItems.map((item) => item['freightCalculationId'])).toEqual([
      CALCULATION_ID,
      SECOND_CALCULATION_ID,
      THIRD_CALCULATION_ID,
    ])
    expect(
      unitOfWork.createdItemCharges
        .filter((charge) => charge['label'] === 'Frete')
        .map((charge) => charge['amount']),
    ).toEqual(['450.0000', '900.0000', '225.0000'])
  })

  test('resolves the emission profile manually when the operator selects one', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const catalog = new CteBatchPreviewProfileCatalogFixture([
      createProfileFixture(),
      createProfileFixture({ id: SECOND_PROFILE_ID, name: 'Perfil manual' }),
    ])
    const useCase = await createCteBatchUseCaseForTest(unitOfWork, FINGERPRINT, catalog)

    await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [DOCUMENT_ID],
      emissionProfileId: SECOND_PROFILE_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(unitOfWork.createdItems[0]).toMatchObject({
      calculationSnapshot: {
        profile: { id: SECOND_PROFILE_ID, matchedBy: 'manual', resolvedBy: 'manual' },
      },
    })
  })

  test('binds the selected profile and grouping to the idempotency fingerprint', async () => {
    const unitOfWork = new CteBatchUnitOfWorkFixture()
    const fingerprintService = new CteBatchFingerprintFixture(FINGERPRINT)
    const useCase = await createCteBatchUseCaseForTest(
      unitOfWork,
      fingerprintService,
      createGroupedCatalog(),
    )

    await useCase.create({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
      emissionProfileId: PROFILE_ID,
      groupingMode: 'per_invoice',
      idempotencyKey: IDEMPOTENCY_KEY,
      name: BATCH_NAME,
    })

    expect(decodeFingerprintFields(fingerprintService.payloads[0])).toEqual([
      COMPANY_CONTEXT.companyId,
      BATCH_NAME,
      PROFILE_ID,
      'per_invoice',
      DOCUMENT_ID,
      SECOND_DOCUMENT_ID,
    ])
  })
})
