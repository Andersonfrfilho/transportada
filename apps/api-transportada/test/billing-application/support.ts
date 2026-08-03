import { expect } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'

export const COMPANY_CONTEXT = {
  companyId: 'company-001',
  membershipId: 'membership-001',
  permissions: new Set(['billing.read', 'billing.manage']),
  userId: 'user-001',
} as const

export const CORRELATION_ID = 'correlation-001'
export const CTE_DOCUMENT_ID = 'cte-document-001'
export const INVOICE_ID = 'billing-invoice-001'
export const IDEMPOTENCY_KEY = 'billing-idempotency-001'
export const FINGERPRINT = 'billing-fingerprint-001'
export const NOW = '2026-07-23T15:00:00.000Z'
export const DUE_DATE = '2026-08-07T00:00:00.000Z'

export type BillingUseCaseContract = {
  readonly cancel: (input: Record<string, unknown>) => Promise<unknown>
  readonly create: (input: Record<string, unknown>) => Promise<unknown>
  readonly get: (input: Record<string, unknown>) => Promise<unknown>
  readonly listEligible: (input: Record<string, unknown>) => Promise<unknown>
  readonly preview: (input: Record<string, unknown>) => Promise<unknown>
  readonly update: (input: Record<string, unknown>) => Promise<unknown>
}

export type BillingApplicationFactory = (options: {
  readonly clock: BillingClockFixture
  readonly fingerprintService: BillingFingerprintFixture
  readonly unitOfWork: BillingUnitOfWorkFixture
}) => BillingUseCaseContract

export const ELIGIBLE_CTE = {
  accessKey: '35260700000000000000570010000010011000010010',
  authorizedAt: '2026-07-22T20:00:00.000Z',
  batchId: 'cte-batch-001',
  batchItemId: 'cte-batch-item-001',
  companyId: COMPANY_CONTEXT.companyId,
  cteNumber: '1001',
  customerDocument: '12345678000190',
  customerName: 'Cliente Exemplo Ltda',
  freightAmount: '350.00',
  id: CTE_DOCUMENT_ID,
  snapshot: {
    freightCalculationId: 'freight-calculation-001',
    freightRuleVersion: '1',
    totalAmount: '350.00',
  },
  status: 'authorized',
  totalAmount: '350.00',
} as const

export const EXPECTED_INVOICE = {
  companyId: COMPANY_CONTEXT.companyId,
  createdAt: NOW,
  currency: 'BRL',
  customerDocument: ELIGIBLE_CTE.customerDocument,
  customerName: ELIGIBLE_CTE.customerName,
  discountAmount: '0.00',
  dueDate: DUE_DATE,
  id: INVOICE_ID,
  invoiceNumber: '1001',
  issueDate: NOW,
  itemCount: 1,
  items: [
    {
      accessKey: ELIGIBLE_CTE.accessKey,
      cteNumber: ELIGIBLE_CTE.cteNumber,
      description: `Frete CT-e ${ELIGIBLE_CTE.cteNumber}`,
      totalAmount: ELIGIBLE_CTE.totalAmount,
    },
  ],
  observations: '',
  status: 'issued',
  subtotalAmount: '350.00',
  surchargeAmount: '0.00',
  totalAmount: '350.00',
  updatedAt: NOW,
} as const

export async function createBillingUseCaseForTest(
  unitOfWork: BillingUnitOfWorkFixture,
  fingerprint = FINGERPRINT,
): Promise<BillingUseCaseContract> {
  let moduleExports: Record<string, unknown>

  try {
    moduleExports = (await import('../../src/billing/application/billing.use-case.js')) as Record<
      string,
      unknown
    >
  } catch (error) {
    throw new Error(`T005 application implementation is missing: ${String(error)}`)
  }

  const factory = moduleExports['createBillingUseCase']
  expect(typeof factory).toBe('function')

  return (factory as BillingApplicationFactory)({
    clock: new BillingClockFixture(),
    fingerprintService: new BillingFingerprintFixture(fingerprint),
    unitOfWork,
  })
}

export class BillingClockFixture {
  public now(): string {
    return NOW
  }
}

export class BillingFingerprintFixture {
  public readonly payloads: unknown[] = []

  public constructor(private readonly fingerprint: string) {}

  public create(payload: unknown): string {
    this.payloads.push(payload)
    return this.fingerprint
  }
}

export class BillingUnitOfWorkFixture {
  public readonly cancellationUpdates: Array<Record<string, unknown>> = []
  public readonly createdEvents: Array<Record<string, unknown>> = []
  public readonly detailUpdates: Array<Record<string, unknown>> = []
  public readonly createdInvoices: Array<Record<string, unknown>> = []
  public readonly createdItems: Array<Record<string, unknown>> = []
  public readonly eligibilityQueries: Array<Record<string, unknown>> = []
  public readonly executedTransactions: Array<'billing'> = []
  public readonly idempotencyQueries: Array<Record<string, unknown>> = []
  public readonly invoiceQueries: Array<Record<string, unknown>> = []
  public readonly previewQueries: Array<Record<string, unknown>> = []
  public readonly reservations: Array<Record<string, unknown>> = []

  public concurrentReservationAllowed = true
  public eligibleCtes: Array<Record<string, unknown>> = [{ ...ELIGIBLE_CTE }]
  public previewRecords: Array<Record<string, unknown>> = []
  public invoice: Record<string, unknown> | null = EXPECTED_INVOICE
  public replayedCreate: {
    readonly invoice: Record<string, unknown>
    readonly requestFingerprint: string
  } | null = null

  public async execute<TResponse>(
    operation: (transaction: BillingUnitOfWorkFixture) => Promise<TResponse>,
  ): Promise<TResponse> {
    this.executedTransactions.push('billing')
    const writeLengths = {
      cancellationUpdates: this.cancellationUpdates.length,
      createdEvents: this.createdEvents.length,
      createdInvoices: this.createdInvoices.length,
      createdItems: this.createdItems.length,
      detailUpdates: this.detailUpdates.length,
      reservations: this.reservations.length,
    }

    try {
      return await operation(this)
    } catch (error) {
      this.cancellationUpdates.length = writeLengths.cancellationUpdates
      this.createdEvents.length = writeLengths.createdEvents
      this.createdInvoices.length = writeLengths.createdInvoices
      this.createdItems.length = writeLengths.createdItems
      this.detailUpdates.length = writeLengths.detailUpdates
      this.reservations.length = writeLengths.reservations
      throw error
    }
  }

  public async listEligibleCtes(
    input: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[]> {
    this.eligibilityQueries.push(input)
    return this.eligibleCtes
  }

  public async findEligibleCtesByIds(
    input: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[]> {
    this.eligibilityQueries.push(input)
    return this.eligibleCtes
  }

  public async findBillingPreviewByIds(
    input: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[]> {
    this.previewQueries.push(input)
    return this.previewRecords
  }

  public async findInvoiceByIdempotency(
    input: Record<string, unknown>,
  ): Promise<BillingUnitOfWorkFixture['replayedCreate']> {
    this.idempotencyQueries.push(input)
    return this.replayedCreate
  }

  public async reserveCteForActiveInvoice(input: Record<string, unknown>): Promise<boolean> {
    this.reservations.push(input)
    return this.concurrentReservationAllowed
  }

  public async createInvoice(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.createdInvoices.push(input)
    return EXPECTED_INVOICE
  }

  public async createInvoiceItem(input: Record<string, unknown>): Promise<void> {
    this.createdItems.push(input)
  }

  public async createInvoiceEvent(input: Record<string, unknown>): Promise<void> {
    this.createdEvents.push(input)
  }

  public async findInvoice(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    this.invoiceQueries.push(input)
    return this.invoice
  }

  public async updateInvoiceStatus(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.cancellationUpdates.push(input)
    return {
      ...EXPECTED_INVOICE,
      status: 'cancelled',
      updatedAt: NOW,
    }
  }

  public async updateInvoiceDetails(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    this.detailUpdates.push(input)
    return {
      ...EXPECTED_INVOICE,
      discountAmount: input.discountAmount,
      observations: input.observations,
      surchargeAmount: input.surchargeAmount,
      totalAmount: input.totalAmount,
      updatedAt: NOW,
    }
  }
}

export async function captureApiError(callback: () => Promise<unknown>): Promise<ApiError> {
  try {
    await callback()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }

  throw new Error('Expected ApiError to be thrown')
}
