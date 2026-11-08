/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  ImportReceivedXmlInput,
  ReceiptLogger,
  ReceiptRecord,
  ReceiptRepositoryPort,
  ReceiptSummaryRepositoryPort,
  ReceiptSummaryRow,
  RecordReceiptInput,
  ReceivedXmlImportGatewayPort,
} from '../../src/nfe-xml-receipts/application/nfe-xml-receipt.types.js'

export const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
export const USER_ID = '22222222-2222-4222-8222-222222222222'
export const NOW = new Date('2026-11-08T12:00:00.000Z')

export class FakeReceiptRepository implements ReceiptRepositoryPort {
  public readonly recorded: (RecordReceiptInput & { receiptId: string })[] = []
  public readonly rejected: { reason: string; receiptId: string }[] = []
  public readonly failed: { errorCode: string; receiptId: string }[] = []
  public readonly retries: { errorCode: string; nextAttemptAt: Date; receiptId: string }[] = []
  public readonly acknowledged: string[] = []
  public readonly discarded: string[] = []
  public claimLimit: number | undefined
  public releasedStaleWith: number | undefined
  public pending: ReceiptRecord[] = []
  public authorizedEmails = new Set<string>()
  public staleReleased = 0

  public claimPending(input: { limit: number }) {
    this.claimLimit = input.limit
    return Promise.resolve(this.pending.slice(0, input.limit))
  }
  public releaseStale(input: { staleSeconds: number }) {
    this.releasedStaleWith = input.staleSeconds
    return Promise.resolve(this.staleReleased)
  }
  public findAuthorizedSenderByEmail(input: { email: string }) {
    return Promise.resolve(
      this.authorizedEmails.has(input.email.toLowerCase()) ? { userId: USER_ID } : undefined,
    )
  }
  public recordReceipt(input: RecordReceiptInput) {
    const duplicate = this.recorded.find(
      (entry) =>
        entry.companyId === input.companyId &&
        entry.channel === input.channel &&
        entry.providerMessageId === input.providerMessageId,
    )
    if (duplicate !== undefined) {
      return Promise.resolve({ created: false, receiptId: duplicate.receiptId })
    }
    const receiptId = `receipt-${this.recorded.length + 1}`
    this.recorded.push({ ...input, receiptId })
    return Promise.resolve({ created: true, receiptId })
  }
  public discardReceipt(input: { receiptId: string }) {
    this.discarded.push(input.receiptId)
    const index = this.recorded.findIndex((entry) => entry.receiptId === input.receiptId)
    if (index >= 0) this.recorded.splice(index, 1)
    return Promise.resolve()
  }
  public markRejected(input: { reason: string; receiptId: string }) {
    this.rejected.push({ reason: input.reason, receiptId: input.receiptId })
    return Promise.resolve()
  }
  public markFailed(input: { errorCode: string; receiptId: string }) {
    this.failed.push({ errorCode: input.errorCode, receiptId: input.receiptId })
    return Promise.resolve()
  }
  public scheduleRetry(input: { errorCode: string; nextAttemptAt: Date; receiptId: string }) {
    this.retries.push(input)
    return Promise.resolve()
  }
  public markAcknowledged(input: { receiptId: string }) {
    this.acknowledged.push(input.receiptId)
    return Promise.resolve()
  }
}

export class FakeImportGateway implements ReceivedXmlImportGatewayPort {
  public readonly created: ImportReceivedXmlInput[] = []
  public failWith: Error | undefined
  public createImport(input: ImportReceivedXmlInput) {
    if (this.failWith !== undefined) return Promise.reject(this.failWith)
    this.created.push(input)
    return Promise.resolve({ importId: `import-${this.created.length}` })
  }
}

export class FakeSummaryRepository implements ReceiptSummaryRepositoryPort {
  public rows: ReceiptSummaryRow[] = []
  public readonly sent: string[] = []
  public readonly attempts: string[] = []
  public receivedMaxAttempts: number | undefined
  public findSummariesToSend(input: { limit: number; maxAttempts: number }) {
    this.receivedMaxAttempts = input.maxAttempts
    return Promise.resolve(this.rows.slice(0, input.limit))
  }
  public inFlight = false
  public hasBatchInFlight() {
    return Promise.resolve(this.inFlight)
  }
  public markSummaryAttempt(input: { receiptId: string }) {
    this.attempts.push(input.receiptId)
    return Promise.resolve()
  }
  public markSummarySent(input: { receiptId: string }) {
    this.sent.push(input.receiptId)
    return Promise.resolve()
  }
}

export function createLogCollector() {
  const entries: { event: string; fields: Readonly<Record<string, unknown>>; level: string }[] = []
  const logger: ReceiptLogger = {
    error: (event, fields) => entries.push({ event, fields, level: 'error' }),
    info: (event, fields) => entries.push({ event, fields, level: 'info' }),
    warn: (event, fields) => entries.push({ event, fields, level: 'warn' }),
  }
  return { entries, logger }
}

export function whatsappReceipt(overrides: Partial<ReceiptRecord> = {}): ReceiptRecord {
  return {
    attempts: 1,
    channel: 'whatsapp',
    companyId: COMPANY_ID,
    id: 'receipt-w1',
    media: {
      fileName: 'notas.zip',
      mimeType: 'application/zip',
      rawMessage: { key: { id: 'ABC' }, message: {} },
      sizeBytes: 2048,
    },
    providerMessageId: 'ABC',
    replyTo: '120363@g.us',
    requestedByUserId: USER_ID,
    sender: '5516999990000',
    ...overrides,
  }
}
