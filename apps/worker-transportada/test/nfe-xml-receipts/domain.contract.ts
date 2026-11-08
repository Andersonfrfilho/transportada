/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { NFE_XML_RECEIPT_LIMITS } from '../../src/nfe-xml-receipts/domain/nfe-xml-receipt.constant.js'
import {
  buildAcknowledgement,
  buildSummary,
  describeRejection,
} from '../../src/nfe-xml-receipts/domain/receipt-messages.policy.js'
import { decideReceiptRetry } from '../../src/nfe-xml-receipts/domain/receipt-retry.policy.js'
import {
  classifyReceivedFiles,
  contentTypeForReceivedFile,
  sanitizeReceivedFileName,
} from '../../src/nfe-xml-receipts/domain/received-xml-files.policy.js'

describe('received XML files policy', () => {
  test('keeps xml and zip by extension, whatever the declared type, and skips the rest with a reason', () => {
    const result = classifyReceivedFiles([
      { name: 'nota.XML', sizeBytes: 10, contentType: 'text/plain' },
      { name: 'lote.zip', sizeBytes: 10, contentType: 'application/x-zip-compressed' },
      { name: 'danfe.pdf', sizeBytes: 10 },
      { name: 'vazio.xml', sizeBytes: 0 },
      { name: 'enorme.zip', sizeBytes: NFE_XML_RECEIPT_LIMITS.maxFileBytes + 1 },
    ])
    expect(result.accepted.map((file) => file.name)).toEqual(['nota.XML', 'lote.zip'])
    expect(result.skipped.map((entry) => [entry.file.name, entry.reason])).toEqual([
      ['danfe.pdf', 'not_xml_or_zip'],
      ['vazio.xml', 'empty'],
      ['enorme.zip', 'file_too_large'],
    ])
  })

  test('never refuses by volume: a thousand valid files are all accepted', () => {
    const files = Array.from({ length: 1000 }, (_, index) => ({
      name: `nota-${index}.xml`,
      sizeBytes: 1000,
    }))
    expect(classifyReceivedFiles(files).accepted).toHaveLength(1000)
  })

  test('decides the content type by extension and strips paths and control characters from names', () => {
    expect(contentTypeForReceivedFile('A.ZIP')).toBe('application/zip')
    expect(contentTypeForReceivedFile('a.xml')).toBe('application/xml')
    expect(sanitizeReceivedFileName('../../etc/passwd\u0000.xml')).toBe('passwd.xml')
    expect(sanitizeReceivedFileName('C:\\x\\nota.xml')).toBe('nota.xml')
    expect(sanitizeReceivedFileName('   ')).toBe('arquivo')
    expect(sanitizeReceivedFileName('a'.repeat(500)).length).toBe(180)
  })
})

describe('receipt messages policy', () => {
  test('acknowledges what arrived and what was ignored, without file names', () => {
    const text = buildAcknowledgement({
      accepted: 3,
      skipped: [{ reason: 'not_xml_or_zip' }, { reason: 'not_xml_or_zip' }],
    })
    expect(text).toContain('Recebi 3 arquivos')
    expect(text).toContain('Ignorei 2 arquivos (não é .xml nem .zip)')
    expect(buildAcknowledgement({ accepted: 1, skipped: [] })).toBe(
      'Recebi 1 arquivo e já estou importando. Aviso quando terminar.',
    )
  })

  test('summarises the outcome with the reason of each kind of problem, capped at five lines', () => {
    const text = buildSummary({
      counts: { duplicated: 2, failed: 0, imported: 10, invalid: 3, received: 15, rejected: 0 },
      problems: [
        { code: 'ZIP_INVALID_ARCHIVE', count: 1 },
        { code: 'XYZ_UNKNOWN', count: 2 },
      ],
    })
    expect(text).toContain('• 10 notas importadas')
    expect(text).toContain('• 2 já estavam no sistema')
    expect(text).toContain('• 3 arquivos não importados')
    expect(text).toContain('1 caso: o zip está corrompido ou protegido por senha')
    expect(text).toContain('2 casos: o arquivo não é uma NF-e válida')
    const many = buildSummary({
      counts: { duplicated: 0, failed: 0, imported: 0, invalid: 9, received: 9, rejected: 0 },
      problems: Array.from({ length: 9 }, (_, index) => ({ code: `C${index}`, count: 1 })),
    })
    expect(many.split('\n').filter((line) => line.startsWith('   -'))).toHaveLength(5)
  })

  test('every rejection has a Portuguese explanation', () => {
    expect(describeRejection('sender_not_allowed')).toContain('não pode importar')
    expect(describeRejection('no_accepted_file')).toContain('.xml')
  })
})

describe('receipt retry policy', () => {
  const now = new Date('2026-11-08T12:00:00.000Z')
  test('waits longer after each failure and gives up at the limit', () => {
    const waits = [1, 2, 3, 4].map((attemptsDone) => {
      const decision = decideReceiptRetry({ attemptsDone, now })
      if (decision.kind !== 'retry') throw new Error('expected retry')
      return (decision.nextAttemptAt.getTime() - now.getTime()) / 1000
    })
    expect(waits).toEqual([60, 300, 900, 3600])
    expect(decideReceiptRetry({ attemptsDone: NFE_XML_RECEIPT_LIMITS.maxAttempts, now })).toEqual({
      kind: 'fail',
    })
  })
})
