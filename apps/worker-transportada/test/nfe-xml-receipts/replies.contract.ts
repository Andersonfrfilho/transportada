/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  emailForReceipt,
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

  test('the e-mail report carries times, counts, each file with its reason and the contractors (spec 304)', () => {
    const report = {
      contractors: [
        { count: 3, name: 'Contratante Um' },
        { count: 1, name: 'Contratante Dois' },
      ],
      files: [
        { code: null, count: 4, name: 'notas.zip' },
        { code: 'ZIP_ENTRY_TOO_LARGE', count: 1, name: 'grande.zip' },
      ],
      finishedAt: new Date('2026-11-08T17:36:00Z'),
      receivedAt: new Date('2026-11-08T17:34:00Z'),
    }
    const email = emailForReceipt(
      row({
        counts: { duplicated: 1, failed: 0, imported: 4, invalid: 0, received: 2, rejected: 1 },
        report,
      }),
    )
    expect(email?.subject).toBe('Importação de notas: 4 novas e 1 arquivo com problema')
    expect(email?.body).toContain('Recebido em: 08/11/2026 14:34')
    expect(email?.body).toContain('Entrou no sistema em: 08/11/2026 14:36')
    expect(email?.body).toContain('• 4 notas novas')
    expect(email?.body).toContain('• notas.zip — 4 itens processados')
    expect(email?.body).toContain(
      '• grande.zip — 1 caso não importado: um arquivo dentro do zip é grande demais',
    )
    expect(email?.body).toContain('• Contratante Um — 3 notas')
  })

  test('only a finished e-mail import gets the detailed report; WhatsApp, rejections and old rows stay short', () => {
    const report = { contractors: [], files: [], finishedAt: null, receivedAt: NOW }
    expect(emailForReceipt(row({ channel: 'whatsapp', report }))).toBeUndefined()
    expect(emailForReceipt(row({ report, status: 'rejected' }))).toBeUndefined()
    expect(emailForReceipt(row({}))).toBeUndefined()
    expect(emailForReceipt(row({ report }))?.body).toContain('ainda processando')
    expect(emailForReceipt(row({ report }))?.body).toContain('nenhuma nota nova')
  })
})
