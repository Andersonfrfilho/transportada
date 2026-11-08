/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: o `.xml`/`.zip` mandado ao bot — leitura do corpo cru, marcação do bot em qualquer grupo, autorização do
 * remetente e o recibo gravado (ou recusado com motivo). Volume nunca recusa: só segurança.
 */
import { describe, expect, test } from 'bun:test'

import { createEvolutionGroupIdentity } from '../../src/whatsapp/application/evolution-group-identity.service.js'
import type { EvolutionMessageEvent } from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import { readWhatsAppXmlDocuments } from '../../src/nfe-xml-receipts/application/read-whatsapp-xml-documents.js'
import {
  createWhatsAppXmlInbound,
  type WhatsAppXmlReceiptRepositoryPort,
} from '../../src/nfe-xml-receipts/application/receive-whatsapp-xml-document.service.js'
import { createListNfeXmlReceiptsUseCase } from '../../src/nfe-xml-receipts/application/list-nfe-xml-receipts.use-case.js'
import { NFE_XML_IMPORT_ROLES } from '../../src/nfe-xml-receipts/domain/nfe-xml-receipt.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const ANY_GROUP = '120363077777777777@g.us'
const BOT = '5516900000001'
const BOT_LID = '11111111111111'
const SENDER = '5516988887777'
const SENDER_LID = '22222222222222'
const CONNECTION = { apiKey: 'k', baseUrl: 'https://evolution.exemplo.com', instanceName: 'i' }

function payload(message: Record<string, unknown>, id = 'M1') {
  return { data: { key: { id, remoteJid: ANY_GROUP }, message }, event: 'messages.upsert' }
}

function documentMessage(extra: Record<string, unknown> = {}) {
  return {
    documentMessage: {
      contextInfo: { mentionedJid: [`${BOT}@s.whatsapp.net`] },
      fileLength: '2048',
      fileName: 'notas.zip',
      mimetype: 'application/zip',
      ...extra,
    },
  }
}

describe('reading the document out of the raw webhook body', () => {
  test('reads name, type, size and the mention of an .xml/.zip document', () => {
    const documents = readWhatsAppXmlDocuments(payload(documentMessage()))
    expect(documents.get('M1')).toMatchObject({
      fileName: 'notas.zip',
      mentionedJids: [`${BOT}@s.whatsapp.net`],
      mimeType: 'application/zip',
      sizeBytes: 2048,
    })
    expect(documents.get('M1')?.rawMessage.key).toMatchObject({ id: 'M1' })
  })

  test('reads a document wrapped with a caption and a protobuf Long size', () => {
    const documents = readWhatsAppXmlDocuments(
      payload({
        documentWithCaptionMessage: {
          message: documentMessage({ fileLength: { high: 0, low: 4096 }, fileName: 'NF.XML' }),
        },
      }),
    )
    expect(documents.get('M1')).toMatchObject({ fileName: 'NF.XML', sizeBytes: 4096 })
  })

  test('ignores anything that is not an xml or a zip (a PDF keeps being ignored)', () => {
    expect(
      readWhatsAppXmlDocuments(
        payload(documentMessage({ fileName: 'boleto.pdf', mimetype: 'application/pdf' })),
      ).size,
    ).toBe(0)
    expect(readWhatsAppXmlDocuments(payload({ conversation: 'oi' })).size).toBe(0)
    expect(readWhatsAppXmlDocuments(undefined).size).toBe(0)
  })

  test('a document with no name falls back to its xml/zip mime type', () => {
    const documents = readWhatsAppXmlDocuments(
      payload(documentMessage({ fileName: undefined, mimetype: 'text/xml' })),
    )
    expect(documents.get('M1')?.fileName).toBe('arquivo.xml')
  })
})

function setup(
  options: {
    authorized?: boolean
    duplicate?: boolean
    failEvolution?: boolean
    participants?: { lid: null | string; number: null | string }[]
  } = {},
) {
  const recorded: Parameters<WhatsAppXmlReceiptRepositoryPort['recordReceipt']>[0][] = []
  const repository: WhatsAppXmlReceiptRepositoryPort = {
    findImportSender: () =>
      Promise.resolve(options.authorized === false ? undefined : { userId: 'user-1' }),
    recordReceipt: (input) => {
      recorded.push(input)
      return Promise.resolve({ created: options.duplicate !== true })
    },
  }
  const identity = createEvolutionGroupIdentity({
    gateway: {
      getOwnerNumber: () =>
        options.failEvolution === true ? Promise.reject(new Error('down')) : Promise.resolve(BOT),
      listGroupParticipants: () =>
        Promise.resolve(
          options.participants ?? [
            { lid: BOT_LID, number: BOT },
            { lid: SENDER_LID, number: SENDER },
          ],
        ),
    },
  })
  const logs: { event: string; fields: unknown }[] = []
  const inbound = createWhatsAppXmlInbound({
    identity,
    logger: {
      error: () => undefined,
      info: (event: string, fields: unknown) => logs.push({ event, fields }),
      warn: () => undefined,
    } as never,
    now: () => new Date('2026-11-08T12:00:00Z'),
    repository,
  })
  const receive = (
    event: Partial<EvolutionMessageEvent>,
    documentOverrides: { mentionedJids?: string[]; sizeBytes?: number } = {},
    senderLid: null | string = null,
  ) =>
    inbound.receive({
      companyId: COMPANY_ID,
      connection: () => Promise.resolve(CONNECTION),
      document: {
        fileName: 'notas.zip',
        mentionedJids: documentOverrides.mentionedJids ?? [],
        mimeType: 'application/zip',
        rawMessage: { key: { id: 'M1' }, message: {} },
        sizeBytes: documentOverrides.sizeBytes ?? 2048,
      },
      event: {
        chat: 'group',
        externalMessageId: 'M1',
        from: '',
        fromMe: false,
        groupJid: ANY_GROUP,
        mentionedJids: [],
        participant: SENDER,
        pushName: null,
        replyToExternalMessageId: null,
        text: null,
        timestamp: 1,
        type: 'message',
        ...event,
      },
      senderLid,
    })
  return { logs, receive, recorded }
}

describe('XML sent to the bot on WhatsApp', () => {
  test('in a group the bot is in (any group), marking the bot queues a pending receipt for the worker', async () => {
    const { receive, recorded } = setup()
    const outcome = await receive({ mentionedJids: [`${BOT}@s.whatsapp.net`] })
    expect(outcome).toBe('recorded')
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toMatchObject({
      companyId: COMPANY_ID,
      providerMessageId: 'M1',
      rejectReason: null,
      replyTo: ANY_GROUP,
      requestedByUserId: 'user-1',
      sender: SENDER,
      status: 'pending',
    })
    expect(recorded[0]!.media).toMatchObject({ fileName: 'notas.zip', sizeBytes: 2048 })
  })

  test('the mention can come from the document context and from an @lid', async () => {
    const { receive } = setup()
    expect(await receive({}, { mentionedJids: [`${BOT_LID}@lid`] })).toBe('recorded')
  })

  test('a group message that does not mark the bot is ignored without touching the database', async () => {
    const { receive, recorded } = setup()
    expect(await receive({})).toBe('not_addressed')
    expect(await receive({ mentionedJids: ['5511000000000@s.whatsapp.net'] })).toBe('not_addressed')
    expect(recorded).toHaveLength(0)
  })

  test('the sender is found by @lid when the event brings no number', async () => {
    const { receive, recorded } = setup()
    const outcome = await receive(
      { mentionedJids: [`${BOT}@s.whatsapp.net`], participant: '' },
      {},
      SENDER_LID,
    )
    expect(outcome).toBe('recorded')
    expect(recorded[0]!.sender).toBe(SENDER)
  })

  test('direct chat needs no mention and replies to the sender, not a group', async () => {
    const { receive, recorded } = setup()
    const outcome = await receive({ chat: 'user', from: SENDER, groupJid: null, participant: '' })
    expect(outcome).toBe('recorded')
    expect(recorded[0]).toMatchObject({ replyTo: null, sender: SENDER })
  })

  test('an unauthorized sender gets a rejected receipt with the reason, and no media is kept', async () => {
    const { receive, recorded } = setup({ authorized: false })
    const outcome = await receive({ mentionedJids: [`${BOT}@s.whatsapp.net`] })
    expect(outcome).toBe('rejected')
    expect(recorded[0]).toMatchObject({
      media: null,
      rejectReason: 'sender_not_allowed',
      requestedByUserId: null,
      status: 'rejected',
    })
  })

  test('a file above the per-file ceiling is rejected with its reason; a big batch of files is not', async () => {
    const { receive, recorded } = setup()
    const marked = { mentionedJids: [`${BOT}@s.whatsapp.net`] }
    expect(await receive(marked, { sizeBytes: 60 * 1024 * 1024 })).toBe('rejected')
    expect(recorded[0]).toMatchObject({ rejectReason: 'file_too_large', status: 'rejected' })
    expect(
      await receive({ ...marked, externalMessageId: 'M2' }, { sizeBytes: 49 * 1024 * 1024 }),
    ).toBe('recorded')
  })

  test('a repeated webhook delivery of the same message creates nothing new', async () => {
    const { receive } = setup({ duplicate: true })
    expect(await receive({ mentionedJids: [`${BOT}@s.whatsapp.net`] })).toBe('duplicate')
  })

  test('identity down closes the door; own messages and broadcasts are ignored', async () => {
    expect(
      await setup({ failEvolution: true }).receive({ mentionedJids: [`${BOT}@s.whatsapp.net`] }),
    ).toBe('identity_unavailable')
    const { receive, recorded } = setup()
    expect(await receive({ fromMe: true })).toBe('from_me')
    expect(await receive({ chat: 'broadcast', groupJid: null })).toBe('not_addressed')
    expect(recorded).toHaveLength(0)
  })

  test('logs carry channel, outcome and counts only — never the number, the file name or the group', async () => {
    const { logs, receive } = setup()
    await receive({ mentionedJids: [`${BOT}@s.whatsapp.net`] })
    const serialized = JSON.stringify(logs)
    expect(serialized).not.toContain(SENDER)
    expect(serialized).not.toContain('notas.zip')
    expect(serialized).not.toContain(ANY_GROUP)
  })
})

describe('who may send XML', () => {
  test('the roles that carry invoices.import are the allowed ones, and viewers/drivers are not', () => {
    expect(NFE_XML_IMPORT_ROLES).toContain('company-admin')
    expect(NFE_XML_IMPORT_ROLES).toContain('fiscal')
    expect(NFE_XML_IMPORT_ROLES).not.toContain('viewer')
    expect(NFE_XML_IMPORT_ROLES).not.toContain('driver')
  })
})

describe('listing the submissions', () => {
  test('masks a WhatsApp number and keeps an e-mail address as is', async () => {
    const list = createListNfeXmlReceiptsUseCase({
      reader: {
        listRecent: () =>
          Promise.resolve([
            {
              channel: 'whatsapp' as const,
              createdAt: '2026-11-08T12:00:00.000Z',
              filesCount: 0,
              id: '1',
              import: null,
              importId: null,
              lastErrorCode: null,
              rejectReason: 'sender_not_allowed',
              sender: '5516988887777',
              status: 'rejected' as const,
            },
            {
              channel: 'email' as const,
              createdAt: '2026-11-08T11:00:00.000Z',
              filesCount: 3,
              id: '2',
              import: null,
              importId: 'i',
              lastErrorCode: null,
              rejectReason: null,
              sender: 'maria@transportadora.com.br',
              status: 'imported' as const,
            },
          ]),
      },
    })
    const rows = await list.execute({ companyId: COMPANY_ID, limit: 20 })
    expect(rows[0]!.sender).toBe('****7777')
    expect(rows[1]!.sender).toBe('maria@transportadora.com.br')
  })
})
