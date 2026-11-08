/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  processWhatsAppReceipts,
  type WhatsAppReceiptDependencies,
} from '../../src/nfe-xml-receipts/application/process-whatsapp-receipts.use-case.js'
import { NFE_XML_RECEIPT_LIMITS } from '../../src/nfe-xml-receipts/domain/nfe-xml-receipt.constant.js'
import {
  createLogCollector,
  FakeImportGateway,
  FakeReceiptRepository,
  NOW,
  whatsappReceipt,
} from './receipt.fixture.js'

function setup(overrides: Partial<WhatsAppReceiptDependencies> = {}) {
  const repository = new FakeReceiptRepository()
  const importGateway = new FakeImportGateway()
  const sent: { text: string; replyTo: string | null }[] = []
  const alerts: { errorCode: string; receiptId: string }[] = []
  const { entries, logger } = createLogCollector()
  const dependencies: WhatsAppReceiptDependencies = {
    alerts: {
      notifyFailure: (input) => {
        alerts.push({ errorCode: input.errorCode, receiptId: input.receiptId })
        return Promise.resolve()
      },
    },
    downloadMedia: () => Promise.resolve({ bytes: new Uint8Array([1, 2, 3]) }),
    importGateway,
    logger,
    now: () => NOW,
    reply: {
      send: (input) => {
        sent.push({ replyTo: input.replyTo, text: input.text })
        return Promise.resolve()
      },
    },
    repository,
    ...overrides,
  }
  return { alerts, dependencies, entries, importGateway, repository, sent }
}

describe('WhatsApp receipt cycle', () => {
  test('RN3: a zip with thousands of notes is queued in slices of the same import, never refused for volume', async () => {
    const { strToU8, zipSync } = await import('fflate')
    const files: Record<string, Uint8Array> = {}
    for (let index = 0; index < 1200; index += 1)
      files[`n${index}.xml`] = strToU8(`<a>${index}</a>`)
    const zip = zipSync(files)
    const { dependencies, importGateway, repository } = setup({
      downloadMedia: () => Promise.resolve({ bytes: zip }),
    })
    repository.pending = [
      whatsappReceipt({
        media: {
          fileName: 'mes.zip',
          mimeType: 'application/zip',
          rawMessage: { key: {}, message: {} },
          sizeBytes: zip.byteLength,
        },
      }),
    ]
    const result = await processWhatsAppReceipts(dependencies)
    expect(result.imported).toBe(1)
    expect(importGateway.created).toHaveLength(1)
    expect(importGateway.created[0]!.files.length).toBe(3)
    expect(importGateway.created[0]!.files.every((file) => file.name.endsWith('.zip'))).toBe(true)
  })

  test('releases stale receipts first and takes a bounded batch, leaving the rest for the next cycle', async () => {
    const { dependencies, importGateway, repository } = setup()
    repository.staleReleased = 2
    repository.pending = Array.from({ length: 45 }, (_, index) =>
      whatsappReceipt({ id: `r${index}`, providerMessageId: `m${index}` }),
    )
    const result = await processWhatsAppReceipts(dependencies)
    expect(repository.releasedStaleWith).toBe(NFE_XML_RECEIPT_LIMITS.staleProcessingSeconds)
    expect(repository.claimLimit).toBe(NFE_XML_RECEIPT_LIMITS.whatsappBatchSize)
    expect(result).toEqual({ failed: 0, imported: 20, rejected: 0, released: 2, retried: 0 })
    expect(importGateway.created).toHaveLength(20)
  })

  test('downloads, imports as the sender user and acknowledges in the same chat', async () => {
    const { dependencies, importGateway, repository, sent } = setup()
    repository.pending = [whatsappReceipt()]
    await processWhatsAppReceipts(dependencies)
    expect(importGateway.created[0]).toMatchObject({
      automationJob: null,
      receivedFrom: '5516999990000',
      receivedVia: 'whatsapp',
      receiptId: 'receipt-w1',
    })
    expect(importGateway.created[0]?.files.map((file) => file.name)).toEqual(['notas.zip'])
    expect(sent).toEqual([
      { replyTo: '120363@g.us', text: expect.stringContaining('Recebi 1 arquivo') },
    ])
    expect(repository.acknowledged).toEqual(['receipt-w1'])
  })

  test('a failed acknowledgement does not undo or repeat the import', async () => {
    const { dependencies, importGateway, repository } = setup({
      reply: { send: () => Promise.reject(new Error('whatsapp down')) },
    })
    repository.pending = [whatsappReceipt()]
    const result = await processWhatsAppReceipts(dependencies)
    expect(result.imported).toBe(1)
    expect(importGateway.created).toHaveLength(1)
    expect(repository.retries).toHaveLength(0)
    expect(repository.acknowledged).toHaveLength(0)
  })

  test('rejects, with a reason, a file that is not xml or zip, or is too large', async () => {
    const { dependencies, importGateway, repository } = setup()
    repository.pending = [
      whatsappReceipt({
        id: 'a',
        media: {
          fileName: 'danfe.pdf',
          mimeType: 'application/pdf',
          rawMessage: { key: {}, message: {} },
          sizeBytes: 10,
        },
      }),
      whatsappReceipt({
        id: 'b',
        media: {
          fileName: 'enorme.zip',
          mimeType: 'application/zip',
          rawMessage: { key: {}, message: {} },
          sizeBytes: NFE_XML_RECEIPT_LIMITS.maxFileBytes + 1,
        },
      }),
    ]
    await processWhatsAppReceipts(dependencies)
    expect(repository.rejected).toEqual([
      { reason: 'no_accepted_file', receiptId: 'a' },
      { reason: 'file_too_large', receiptId: 'b' },
    ])
    expect(importGateway.created).toHaveLength(0)
  })

  test('a download that turns out too large is rejected too', async () => {
    const { dependencies, repository } = setup({
      downloadMedia: () => Promise.resolve({ kind: 'too_large' as const }),
    })
    repository.pending = [whatsappReceipt()]
    await processWhatsAppReceipts(dependencies)
    expect(repository.rejected).toEqual([{ reason: 'file_too_large', receiptId: 'receipt-w1' }])
  })

  test('a transient failure goes back to the queue with a growing wait and logs the cause', async () => {
    const { dependencies, entries, repository } = setup({
      downloadMedia: () => Promise.reject(new TypeError('network')),
    })
    repository.pending = [whatsappReceipt({ attempts: 2 })]
    const result = await processWhatsAppReceipts(dependencies)
    expect(result.retried).toBe(1)
    expect(repository.retries[0]).toMatchObject({ errorCode: 'TypeError', receiptId: 'receipt-w1' })
    expect(repository.retries[0]?.nextAttemptAt.getTime()).toBe(NOW.getTime() + 300_000)
    expect(entries.some((entry) => entry.event === 'nfe_xml_receipt_retry')).toBe(true)
  })

  test('after the last attempt the receipt fails visibly and the operators are alerted', async () => {
    const { alerts, dependencies, entries, repository } = setup({
      downloadMedia: () => Promise.reject(new TypeError('network')),
    })
    repository.pending = [whatsappReceipt({ attempts: NFE_XML_RECEIPT_LIMITS.maxAttempts })]
    const result = await processWhatsAppReceipts(dependencies)
    expect(result.failed).toBe(1)
    expect(repository.failed).toEqual([{ errorCode: 'TypeError', receiptId: 'receipt-w1' }])
    expect(alerts).toEqual([{ errorCode: 'TypeError', receiptId: 'receipt-w1' }])
    expect(
      entries.some((entry) => entry.level === 'error' && entry.event === 'nfe_xml_receipt_failed'),
    ).toBe(true)
  })

  test('one bad receipt does not stop the rest of the batch', async () => {
    let calls = 0
    const { dependencies, importGateway, repository } = setup({
      downloadMedia: () => {
        calls += 1
        return calls === 1
          ? Promise.reject(new Error('boom'))
          : Promise.resolve({ bytes: new Uint8Array([1]) })
      },
    })
    repository.pending = [whatsappReceipt({ id: 'a' }), whatsappReceipt({ id: 'b' })]
    const result = await processWhatsAppReceipts(dependencies)
    expect(result).toMatchObject({ imported: 1, retried: 1 })
    expect(importGateway.created).toHaveLength(1)
  })

  test('logs never carry the sender number or file names', async () => {
    const { dependencies, entries, repository } = setup()
    repository.pending = [whatsappReceipt()]
    await processWhatsAppReceipts(dependencies)
    const serialized = JSON.stringify(entries)
    expect(serialized).not.toContain('5516999990000')
    expect(serialized).not.toContain('notas.zip')
  })
})
