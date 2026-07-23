/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

const TEXT_ENCODER = new TextEncoder()

type BillingContext = {
  readonly companyId: string
  readonly userId: string
}

type BillingClockPort = {
  readonly now: () => Promise<string> | string
}

type BillingFingerprintPort = {
  readonly create: (input: {
    readonly fields: readonly Uint8Array[]
    readonly operation: string
  }) => Promise<string> | string
}

type BillingUnitOfWorkPort = {
  readonly createInvoice: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
  readonly createInvoiceEvent: (input: Record<string, unknown>) => Promise<void>
  readonly createInvoiceItem: (input: Record<string, unknown>) => Promise<void>
  readonly execute?: <TResponse>(
    operation: (transaction: BillingUnitOfWorkPort) => Promise<TResponse>,
  ) => Promise<TResponse>
  readonly findEligibleCtesByIds: (
    input: Record<string, unknown>,
  ) => Promise<readonly Record<string, unknown>[]>
  readonly findInvoice: (input: Record<string, unknown>) => Promise<Record<string, unknown> | null>
  readonly findInvoiceByIdempotency: (
    input: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>
  readonly listEligibleCtes: (
    input: Record<string, unknown>,
  ) => Promise<readonly Record<string, unknown>[]>
  readonly reserveCteForActiveInvoice: (input: Record<string, unknown>) => Promise<boolean>
  readonly updateInvoiceStatus: (input: Record<string, unknown>) => Promise<Record<string, unknown>>
}

export type BillingEligibilityInput = {
  readonly context: BillingContext
  readonly filters: Record<string, unknown>
  readonly limit: number
}

export type CreateBillingInvoiceInput = {
  readonly context: BillingContext
  readonly correlationId: string
  readonly cteDocumentIds: readonly string[]
  readonly dueDate: string
  readonly idempotencyKey: string
}

export type BillingInvoiceLookupInput = {
  readonly context: BillingContext
  readonly invoiceId: string
}

export type CancelBillingInvoiceInput = BillingInvoiceLookupInput & {
  readonly correlationId: string
  readonly reason: string
}

export function createBillingUseCase(dependencies: {
  readonly clock: BillingClockPort
  readonly fingerprintService: BillingFingerprintPort
  readonly unitOfWork: BillingUnitOfWorkPort
}): {
  readonly cancel: (input: CancelBillingInvoiceInput) => Promise<Record<string, unknown>>
  readonly create: (input: CreateBillingInvoiceInput) => Promise<Record<string, unknown>>
  readonly get: (input: BillingInvoiceLookupInput) => Promise<Record<string, unknown>>
  readonly listEligible: (
    input: BillingEligibilityInput,
  ) => Promise<readonly Record<string, unknown>[]>
} {
  return {
    cancel: (input) => cancelInvoice(dependencies, input),
    create: (input) => createInvoice(dependencies, input),
    get: (input) => getInvoice(dependencies.unitOfWork, input),
    listEligible: (input) => listEligibleCtes(dependencies.unitOfWork, input),
  }
}

async function listEligibleCtes(
  unitOfWork: BillingUnitOfWorkPort,
  input: BillingEligibilityInput,
): Promise<readonly Record<string, unknown>[]> {
  return unitOfWork.listEligibleCtes({
    companyId: input.context.companyId,
    excludeActiveInvoice: true,
    filters: input.filters,
    limit: input.limit,
    status: 'authorized',
  })
}

async function createInvoice(
  dependencies: {
    readonly clock: BillingClockPort
    readonly fingerprintService: BillingFingerprintPort
    readonly unitOfWork: BillingUnitOfWorkPort
  },
  input: CreateBillingInvoiceInput,
): Promise<Record<string, unknown>> {
  const cteDocumentIds = resolveCteDocumentIds(input.cteDocumentIds)
  const issueDate = await dependencies.clock.now()
  assertValidDates(issueDate, input.dueDate)
  const fingerprint = await dependencies.fingerprintService.create({
    fields: [input.context.companyId, input.dueDate, ...cteDocumentIds].map((value) =>
      TEXT_ENCODER.encode(value),
    ),
    operation: 'billing.invoice.create',
  })

  const operation = async (transaction: BillingUnitOfWorkPort) => {
    const replay = await transaction.findInvoiceByIdempotency({
      companyId: input.context.companyId,
      idempotencyKey: input.idempotencyKey,
    })
    if (replay !== null) return resolveReplay(replay, fingerprint)

    const eligibleCtes = await transaction.findEligibleCtesByIds({
      companyId: input.context.companyId,
      cteDocumentIds,
      excludeActiveInvoice: true,
      status: 'authorized',
    })
    assertEligibleCtes(eligibleCtes, cteDocumentIds, input.context.companyId)
    assertSingleCustomer(eligibleCtes)

    for (const cte of eligibleCtes) {
      const reserved = await transaction.reserveCteForActiveInvoice({
        companyId: input.context.companyId,
        cteDocumentId: requiredString(cte, 'id'),
      })
      if (!reserved) throw cteAlreadyInvoicedError()
    }

    const subtotalAmount = sumMoney(eligibleCtes.map((cte) => requiredString(cte, 'totalAmount')))
    const invoice = await transaction.createInvoice({
      actorUserId: input.context.userId,
      companyId: input.context.companyId,
      correlationId: input.correlationId,
      currency: 'BRL',
      customerDocument: requiredString(eligibleCtes[0] ?? {}, 'customerDocument'),
      customerName: requiredString(eligibleCtes[0] ?? {}, 'customerName'),
      discountAmount: '0.00',
      dueDate: input.dueDate,
      idempotencyKey: input.idempotencyKey,
      issueDate,
      requestFingerprint: fingerprint,
      status: 'issued',
      subtotalAmount,
      surchargeAmount: '0.00',
      totalAmount: subtotalAmount,
    })
    const invoiceId = requiredString(invoice, 'id')

    for (const [index, cte] of eligibleCtes.entries()) {
      const cteNumber = requiredString(cte, 'cteNumber')
      const totalAmount = normalizeMoney(requiredString(cte, 'totalAmount'))
      await transaction.createInvoiceItem({
        batchId: requiredString(cte, 'batchId'),
        batchItemId: requiredString(cte, 'batchItemId'),
        companyId: input.context.companyId,
        cteAccessKey: requiredString(cte, 'accessKey'),
        cteDocumentId: requiredString(cte, 'id'),
        cteNumber,
        description: `Frete CT-e ${cteNumber}`,
        freightAmount: normalizeMoney(requiredString(cte, 'freightAmount')),
        invoiceId,
        lineNumber: String(index + 1),
        snapshot: requiredRecord(cte, 'snapshot'),
        totalAmount,
      })
    }

    await transaction.createInvoiceEvent({
      actorUserId: input.context.userId,
      companyId: input.context.companyId,
      eventName: 'invoice_created',
      invoiceId,
      payload: {
        itemCount: eligibleCtes.length,
        totalAmount: subtotalAmount,
      },
    })

    return {
      ...invoice,
      itemCount: eligibleCtes.length,
    }
  }

  return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
}

async function getInvoice(
  unitOfWork: BillingUnitOfWorkPort,
  input: BillingInvoiceLookupInput,
): Promise<Record<string, unknown>> {
  const invoice = await unitOfWork.findInvoice({
    companyId: input.context.companyId,
    invoiceId: input.invoiceId,
  })
  if (invoice === null || invoice['companyId'] !== input.context.companyId) {
    throw invoiceNotFoundError()
  }
  return invoice
}

async function cancelInvoice(
  dependencies: {
    readonly clock: BillingClockPort
    readonly unitOfWork: BillingUnitOfWorkPort
  },
  input: CancelBillingInvoiceInput,
): Promise<Record<string, unknown>> {
  const operation = async (transaction: BillingUnitOfWorkPort) => {
    const invoice = await getInvoice(transaction, input)
    if (invoice['status'] === 'cancelled') return invoice
    if (invoice['status'] !== 'issued') throw invoiceInvalidStateError()

    const cancelledAt = await dependencies.clock.now()
    const updatedInvoice = await transaction.updateInvoiceStatus({
      cancelledAt,
      companyId: input.context.companyId,
      expectedStatus: 'issued',
      invoiceId: input.invoiceId,
      nextStatus: 'cancelled',
    })
    await transaction.createInvoiceEvent({
      actorUserId: input.context.userId,
      companyId: input.context.companyId,
      eventName: 'invoice_cancelled',
      invoiceId: input.invoiceId,
      payload: {
        correlationId: input.correlationId,
        previousStatus: 'issued',
        status: 'cancelled',
      },
      reason: sanitizeReason(input.reason),
    })
    return updatedInvoice
  }

  return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
}

function resolveCteDocumentIds(values: readonly string[]): readonly string[] {
  const uniqueValues = [...new Set(values)]
  if (uniqueValues.length === 0 || uniqueValues.some((value) => value.trim().length === 0)) {
    throw cteNotEligibleError()
  }
  return uniqueValues
}

function assertEligibleCtes(
  records: readonly Record<string, unknown>[],
  expectedIds: readonly string[],
  companyId: string,
): void {
  if (records.length !== expectedIds.length) throw cteNotEligibleError()
  const actualIds = new Set<string>()
  for (const record of records) {
    if (record['companyId'] !== companyId || record['status'] !== 'authorized') {
      throw cteNotEligibleError()
    }
    actualIds.add(requiredString(record, 'id'))
  }
  if (expectedIds.some((id) => !actualIds.has(id))) throw cteNotEligibleError()
}

function assertSingleCustomer(records: readonly Record<string, unknown>[]): void {
  const first = records[0]
  if (first === undefined) throw cteNotEligibleError()
  const customerDocument = requiredString(first, 'customerDocument')
  if (records.some((record) => requiredString(record, 'customerDocument') !== customerDocument)) {
    throw cteNotEligibleError()
  }
}

function resolveReplay(
  replay: Record<string, unknown>,
  fingerprint: string,
): Record<string, unknown> {
  if (replay['requestFingerprint'] !== fingerprint) throw idempotencyConflictError()
  return requiredRecord(replay, 'invoice')
}

function assertValidDates(issueDate: string, dueDate: string): void {
  const issueTimestamp = Date.parse(issueDate)
  const dueTimestamp = Date.parse(dueDate)
  if (
    !Number.isFinite(issueTimestamp) ||
    !Number.isFinite(dueTimestamp) ||
    dueTimestamp < issueTimestamp
  ) {
    throw invoiceInvalidStateError()
  }
}

function sumMoney(values: readonly string[]): string {
  return formatMoney(values.reduce((total, value) => total + parseMoney(value), 0n))
}

function normalizeMoney(value: string): string {
  return formatMoney(parseMoney(value))
}

function parseMoney(value: string): bigint {
  const match = /^([0-9]+)(?:\.([0-9]{1,4}))?$/.exec(value)
  if (match === null) throw invoiceInvalidStateError()
  const fraction = (match[2] ?? '').padEnd(4, '0')
  if (fraction.slice(2) !== '00') throw invoiceInvalidStateError()
  return BigInt(match[1] ?? '0') * 100n + BigInt(fraction.slice(0, 2))
}

function formatMoney(cents: bigint): string {
  const integer = cents / 100n
  const fraction = (cents % 100n).toString().padStart(2, '0')
  return `${integer}.${fraction}`
}

function sanitizeReason(reason: string): string {
  const sanitized = Array.from(reason, (character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint < 32 || codePoint === 127 ? ' ' : character
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (sanitized.length === 0) throw invoiceInvalidStateError()
  return sanitized.slice(0, 500)
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.length === 0) throw invoiceInvalidStateError()
  return value
}

function requiredRecord(record: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = record[field]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invoiceInvalidStateError()
  }
  return value as Record<string, unknown>
}

function cteNotEligibleError(): ApiError {
  return new ApiError({
    code: 'BILLING_CTE_NOT_ELIGIBLE',
    message: 'CT-e is not eligible for billing',
    status: 409,
  })
}

function cteAlreadyInvoicedError(): ApiError {
  return new ApiError({
    code: 'BILLING_CTE_ALREADY_INVOICED',
    message: 'CT-e already belongs to an active invoice',
    status: 409,
  })
}

function idempotencyConflictError(): ApiError {
  return new ApiError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key cannot be reused',
    status: 409,
  })
}

function invoiceNotFoundError(): ApiError {
  return new ApiError({
    code: 'BILLING_INVOICE_NOT_FOUND',
    message: 'Billing invoice was not found',
    status: 404,
  })
}

function invoiceInvalidStateError(): ApiError {
  return new ApiError({
    code: 'BILLING_INVOICE_INVALID_STATE',
    message: 'Billing invoice state transition is not allowed',
    status: 409,
  })
}
