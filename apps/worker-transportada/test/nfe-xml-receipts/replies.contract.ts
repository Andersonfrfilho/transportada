/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  sendReceiptReplies,
  textForReceipt,
} from '../../src/nfe-xml-receipts/application/send-receipt-replies.use-case.js'
import type { ReceiptSummaryRow } from '../../src/nfe-xml-receipts/application/nfe-xml-receipt.types.js'
import { NFE_XML_RECEIPT_LIMITS } from '../../src/nfe-xml-receipts/domain/nfe-xml-receipt.constant.js'
import { COMPANY_ID, createLogCollector, FakeSummaryRepository, NOW } from './receipt.fixture.js'

function row(overrides: Partial<ReceiptSummaryRow>): ReceiptSummaryRow {
  return {
    channel: 'email',
    companyId: COMPANY_ID,
    counts: { duplicated: 1, failed: 0, imported: 4, invalid: 0, received: 5, rejected: 0 },
    id: 'r1',
    problems: [],
    rejectReason: null,
    replyTo: null,
    sender: 'maria@transportadora.com.br',
    status: 'imported',
    ...overrides,
  }
}

describe('receipt replies', () => {
  test('writes the right text for a finished import, a rejection and a final failure', () => {
    expect(textForReceipt(row({}))).toContain('• 4 notas importadas')
    expect(
      textForReceipt(row({ rejectReason: 'sender_not_allowed', status: 'rejected' })),
    ).toContain('não pode importar')
    expect(textForReceipt(row({ counts: null, status: 'failed' }))).toContain('várias tentativas')
  })

  test('sends each summary once and marks it; a failed send is counted and stays in the queue', async () => {
    const repository = new FakeSummaryRepository()
    repository.rows = [row({ id: 'ok' }), row({ id: 'broken', sender: 'quebrado@x.com' })]
    const { entries, logger } = createLogCollector()
    const delivered: string[] = []
    const result = await sendReceiptReplies({
      logger,
      now: () => NOW,
      reply: {
        send: (input) => {
          if (input.sender === 'quebrado@x.com') return Promise.reject(new Error('smtp'))
          delivered.push(input.sender)
          return Promise.resolve()
        },
      },
      repository,
    })
    expect(result).toEqual({ failed: 1, sent: 1 })
    expect(repository.sent).toEqual(['ok'])
    expect(repository.attempts).toEqual(['broken'])
    expect(repository.receivedMaxAttempts).toBe(NFE_XML_RECEIPT_LIMITS.summaryMaxAttempts)
    expect(JSON.stringify(entries)).not.toContain('maria@')
  })
})
