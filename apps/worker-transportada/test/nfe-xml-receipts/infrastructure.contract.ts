/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfeXmlEmailIntake } from '../../src/nfe-xml-receipts/infrastructure/nfe-xml-email-intake.factory.js'
import { createNfeXmlReceiptRuntime } from '../../src/nfe-xml-receipts/infrastructure/nfe-xml-receipt-runtime.js'
import { createDrizzleReceivedXmlImportGateway } from '../../src/nfe-xml-receipts/infrastructure/drizzle-received-xml-import.gateway.js'
import { createReceiptReplyAdapter } from '../../src/nfe-xml-receipts/infrastructure/receipt-reply.adapter.js'
import { ResendDownloadTooLargeError } from '../../src/contractor-mail/domain/resend-provider.error.js'
import { COMPANY_ID, createLogCollector, NOW } from './receipt.fixture.js'

type Insert = { readonly table: unknown; readonly values: unknown }

function fakeDatabase(
  options: { readonly insertError?: unknown; readonly lockGranted?: boolean } = {},
) {
  const inserts: Insert[] = []
  const statements: unknown[] = []
  const transaction = {
    execute: (query: unknown) => {
      statements.push(query)
      return Promise.resolve(
        options.lockGranted === false ? [{ locked: false }] : [{ locked: true }],
      )
    },
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        if (options.insertError !== undefined && inserts.length === 1) {
          return Promise.reject(options.insertError as Error)
        }
        inserts.push({ table, values })
        return Promise.resolve()
      },
    }),
  }
  const database = {
    execute: (query: unknown) => {
      statements.push(query)
      return Promise.resolve([{ id: 'existing-import' }])
    },
    transaction: (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  }
  return { database: database as never, inserts, statements }
}

function fakeStorage() {
  const puts: { key: string; sha256: string; size: number }[] = []
  return {
    bucket: 'bucket',
    puts,
    put: (input: { key: string; sha256: string; contentLength: number }) => {
      puts.push({ key: input.key, sha256: input.sha256, size: input.contentLength })
      return Promise.resolve({ provider: 's3' as const })
    },
  }
}

const IMPORT_INPUT = {
  automationJob: null,
  companyId: COMPANY_ID,
  correlationId: 'corr-1',
  files: [
    { bytes: new TextEncoder().encode('<nfeProc/>'), name: 'a.xml' },
    { bytes: new TextEncoder().encode('<nfeProc/>2'), name: 'b.xml' },
  ],
  receiptId: '11111111-1111-4111-8111-111111111111',
  receivedFrom: '5516999998888',
  receivedVia: 'whatsapp',
  requestedByUserId: '22222222-2222-4222-8222-222222222222',
} as const

describe('received XML import gateway', () => {
  test('stores every file, then writes import, items, outbox event and the receipt in one transaction', async () => {
    const { database, inserts, statements } = fakeDatabase()
    const storage = fakeStorage()
    const gateway = createDrizzleReceivedXmlImportGateway({ database, storage })

    const { importId } = await gateway.createImport(IMPORT_INPUT)

    expect(storage.puts).toHaveLength(2)
    expect(storage.puts[0]!.key).toContain(`/nfe-imports/${importId}/staging/`)
    // 2 stored_objects + import + items + outbox
    expect(inserts).toHaveLength(5)
    const importRow = inserts[2]!.values as Record<string, unknown>
    expect(importRow).toMatchObject({
      idempotencyKey: `xml-whatsapp-${IMPORT_INPUT.receiptId}`,
      receivedCount: 2n,
      receivedFrom: '5516999998888',
      receivedVia: 'whatsapp',
      source: 'upload',
      status: 'queued',
      triggeredBy: 'user',
    })
    const items = inserts[3]!.values as readonly Record<string, unknown>[]
    expect(items.map((item) => item.sourceEntry)).toEqual(['/', 'b.xml'])
    expect(items.map((item) => item.ordinal)).toEqual([1n, 2n])
    expect(inserts[4]!.values).toMatchObject({
      eventType: 'transportada.nfe.import.requested',
      payload: { importId },
    })
    expect(statements).toHaveLength(1) // o fechamento do recibo
  })

  test('an automation import (e-mail mailbox) carries the automation job and trigger', async () => {
    const { database, inserts } = fakeDatabase()
    const gateway = createDrizzleReceivedXmlImportGateway({ database, storage: fakeStorage() })
    await gateway.createImport({
      ...IMPORT_INPUT,
      automationJob: 'nfe.xml.mailbox',
      receivedVia: 'email',
    })
    expect(inserts[2]!.values).toMatchObject({
      automationJob: 'nfe.xml.mailbox',
      triggeredBy: 'automation',
    })
  })

  test('a repeated delivery returns the import that already exists instead of creating another', async () => {
    const { database } = fakeDatabase({ insertError: { code: '23505' } })
    const gateway = createDrizzleReceivedXmlImportGateway({ database, storage: fakeStorage() })
    await expect(gateway.createImport(IMPORT_INPUT)).resolves.toEqual({
      importId: 'existing-import',
    })
  })

  test('any other database error is raised so the receipt goes back to the queue', async () => {
    const { database } = fakeDatabase({ insertError: new Error('connection lost') })
    const gateway = createDrizzleReceivedXmlImportGateway({ database, storage: fakeStorage() })
    await expect(gateway.createImport(IMPORT_INPUT)).rejects.toThrow('connection lost')
  })
})

describe('receipt reply adapter', () => {
  const settings = {
    id: 's1',
    secretEnvelope: {},
    senderAddress: 'no-reply@x.com',
    senderName: 'Transp',
  }
  function setup(
    overrides: { resendDisabled?: boolean; settings?: typeof settings | undefined } = {},
  ) {
    const texts: { body: string; number: string }[] = []
    const emails: { to: readonly string[]; text: string; apiKey: string }[] = []
    const adapter = createReceiptReplyAdapter({
      findSettings: () => Promise.resolve('settings' in overrides ? overrides.settings : settings),
      mailGateway: {
        sendEmail: (input) => {
          emails.push({ apiKey: input.apiKey, text: input.text, to: input.to })
          return Promise.resolve({ id: 'e1' })
        },
      },
      ...(overrides.resendDisabled === true ? { resendDisabled: true } : {}),
      secretService: {
        decrypt: () => Promise.resolve({ apiKey: 'key', replyTokenSecret: 's' }) as never,
      },
      sendWhatsAppText: (input) => {
        texts.push({ body: input.body, number: input.number })
        return Promise.resolve()
      },
    })
    return { adapter, emails, texts }
  }

  test('WhatsApp answers in the group when there is one, else to the sender', async () => {
    const { adapter, texts } = setup()
    await adapter.send({
      channel: 'whatsapp',
      companyId: COMPANY_ID,
      replyTo: '1@g.us',
      sender: '5516',
      text: 'ok',
    })
    await adapter.send({
      channel: 'whatsapp',
      companyId: COMPANY_ID,
      replyTo: null,
      sender: '5516',
      text: 'ok2',
    })
    expect(texts.map((entry) => entry.number)).toEqual(['1@g.us', '5516'])
  })

  test('e-mail goes through the company Resend settings to the sender', async () => {
    const { adapter, emails } = setup()
    await adapter.send({
      channel: 'email',
      companyId: COMPANY_ID,
      replyTo: null,
      sender: 'maria@x.com',
      text: 'resumo',
    })
    expect(emails).toEqual([{ apiKey: 'key', text: 'resumo', to: ['maria@x.com'] }])
  })

  test('e-mail is skipped when Resend is disabled and fails loudly without settings', async () => {
    const disabled = setup({ resendDisabled: true })
    await disabled.adapter.send({
      channel: 'email',
      companyId: COMPANY_ID,
      replyTo: null,
      sender: 'a@x.com',
      text: 't',
    })
    expect(disabled.emails).toHaveLength(0)

    const missing = setup({ settings: undefined })
    await expect(
      missing.adapter.send({
        channel: 'email',
        companyId: COMPANY_ID,
        replyTo: null,
        sender: 'a@x.com',
        text: 't',
      }),
    ).rejects.toThrow('settings not found')
  })
})

describe('e-mail intake factory', () => {
  const MIME = [
    'From: Maria <maria@transportadora.com.br>',
    'To: notas@mail.transportadora.com.br',
    'Subject: notas',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="b"',
    '',
    '--b',
    'Content-Type: text/plain',
    '',
    'segue',
    '--b',
    'Content-Type: application/xml; name="nota.xml"',
    'Content-Disposition: attachment; filename="nota.xml"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('<nfeProc/>').toString('base64'),
    '--b--',
    '',
  ].join('\r\n')

  function setup(options: { download?: () => Promise<Buffer> } = {}) {
    const created: unknown[] = []
    const recorded: unknown[] = []
    const repository = {
      claimPending: () => Promise.resolve([]),
      discardReceipt: () => Promise.resolve(),
      findAuthorizedSenderByEmail: () => Promise.resolve({ userId: 'u1' }),
      markAcknowledged: () => Promise.resolve(),
      markFailed: () => Promise.resolve(),
      markRejected: () => Promise.resolve(),
      recordReceipt: (input: unknown) => {
        recorded.push(input)
        return Promise.resolve({ created: true, receiptId: 'r1' })
      },
      releaseStale: () => Promise.resolve(0),
      scheduleRetry: () => Promise.resolve(),
    }
    const { logger } = createLogCollector()
    const intake = createNfeXmlEmailIntake({
      dkimVerifier: {
        verifyWithHeaderFrom: () =>
          Promise.resolve({
            alignment: 'aligned' as const,
            headerFrom: ['maria@transportadora.com.br'],
          }),
      },
      importGateway: {
        createImport: (input) => {
          created.push(input)
          return Promise.resolve({ importId: 'i1' })
        },
      },
      logger,
      mailGateway: {
        downloadRawEmail: options.download ?? (() => Promise.resolve(Buffer.from(MIME))),
      },
      repository,
    })
    const received = {
      cc: [],
      from: 'Maria <maria@transportadora.com.br>',
      headers: {},
      message_id: 'm1',
      raw: { download_url: 'https://x', expires_at: 'x' },
      subject: 'notas',
      text: null,
      to: ['notas@mail.transportadora.com.br'],
    }
    const input = {
      companyId: COMPANY_ID,
      correlationId: 'c1',
      delivery: { isLastAttempt: false },
      occurredAt: NOW,
      providerEmailId: 'e-1',
      received,
      replyDomain: 'mail.transportadora.com.br',
    }
    return { created, input, intake, recorded }
  }

  test('reads the attachment out of the real MIME and imports it for the verified sender', async () => {
    const { created, input, intake } = setup()
    const result = await intake.intake(input)
    expect(result).toEqual({ files: 1, importId: 'i1', kind: 'imported' })
    expect(created).toHaveLength(1)
    const file = (created[0] as { files: { name: string; bytes: Uint8Array }[] }).files[0]!
    expect(file.name).toBe('nota.xml')
    expect(new TextDecoder().decode(file.bytes)).toBe('<nfeProc/>')
  })

  test('a raw e-mail above the provider ceiling is refused with a reason, not crashed on', async () => {
    const { input, intake } = setup({
      download: () => Promise.reject(new ResendDownloadTooLargeError()),
    })
    await expect(intake.intake(input)).resolves.toEqual({
      kind: 'rejected',
      reason: 'file_too_large',
    })
  })

  test('mail to another address is not the XML mailbox', async () => {
    const { input, intake } = setup()
    const other = {
      ...input,
      received: { ...input.received, to: ['contato@mail.transportadora.com.br'] },
    }
    await expect(intake.intake(other)).resolves.toEqual({ kind: 'not_xml_mailbox' })
  })
})

describe('receipt runtime cycle', () => {
  function runtime(lockGranted: boolean) {
    const { database, statements } = fakeDatabase({ lockGranted })
    const { logger } = createLogCollector()
    const instance = createNfeXmlReceiptRuntime({
      database,
      evolution: {
        fetchMedia: () => Promise.resolve({ kind: 'too_large' }),
        sendText: () => Promise.resolve(),
      },
      findReplySettings: () => Promise.resolve(undefined),
      logger: logger as never,
      mailGateway: { sendEmail: () => Promise.resolve({ id: 'x' }) },
      secretService: { decrypt: () => Promise.reject(new Error('unused')) },
      sendNotification: () => Promise.resolve(),
      storage: fakeStorage(),
    })
    return { instance, statements }
  }

  test('another replica holding the lock makes the beat a no-op', async () => {
    const { instance, statements } = runtime(false)
    await instance.runCycle()
    expect(statements).toHaveLength(1) // só a tentativa do lock
  })

  test('with the lock, the cycle drains the queue and looks for pending summaries', async () => {
    const { instance, statements } = runtime(true)
    await instance.runCycle()
    expect(statements.length).toBeGreaterThan(1)
  })
})
