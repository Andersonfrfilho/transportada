/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7a (revisão de segurança, achado 1): o verificador de DKIM passa `From`/`Return-Path` pelo
 * `addressparser` do nodemailer, que fica quadrático (um `Return-Path: a,a,a…` de 400 KB travou o laço de
 * eventos por 58 s). Antes de qualquer `dkimVerify`, o cabeçalho é medido: a seção inteira em 64 KiB e cada
 * linha desdobrada de `From`/`Return-Path`/`Sender`/`Reply-To` em 2 KiB. Vale para a prévia e para a conversa.
 */
import { describe, expect, test } from 'bun:test'

import type { CargoPreviewEmailIntakePort } from '../../src/cargo-preview-email/application/cargo-preview-email.types.js'
import { recordContractorMailInboundMessage } from '../../src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import type { RecordContractorMailInboundMessageDependencies } from '../../src/contractor-mail/application/record-contractor-mail-inbound-message.use-case.js'
import { hasBoundedMimeHeaders } from '../../src/contractor-mail/domain/mime-header-bounds.policy.js'
import { CONTRACTOR_MAIL_INBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-inbound-envelope.schema.js'
import { buildMime, gmailForwardText } from './mime.fixture.js'
import { FORWARDER, ORIGINAL, runIntake } from './intake.harness.js'

const LIST_BOMB = 'a,'.repeat(200_000)
const bytes = (value: string) => Buffer.from(value, 'latin1')

describe('a barreira de cabeçalho do MIME (spec 237 T4.7a)', () => {
  test('mensagem comum passa, com CRLF ou só LF', () => {
    expect(hasBoundedMimeHeaders(bytes('From: a@b.example\r\nSubject: x\r\n\r\ncorpo'))).toBe(true)
    expect(hasBoundedMimeHeaders(bytes('From: a@b.example\nSubject: x\n\ncorpo'))).toBe(true)
  })

  test('sem fim de cabeçalho, recusa', () => {
    expect(hasBoundedMimeHeaders(bytes('From: a@b.example\r\nSubject: x\r\n'))).toBe(false)
    expect(hasBoundedMimeHeaders(bytes('lixo'))).toBe(false)
  })

  test('a seção de cabeçalhos acima de 64 KiB recusa, mesmo que cada linha seja curta', () => {
    const many = Array.from({ length: 2200 }, (_, index) => `X-Campo-${index}: ${'v'.repeat(30)}`)
    const section = `From: a@b.example\r\n${many.join('\r\n')}\r\n\r\ncorpo`
    expect(section.indexOf('\r\n\r\n')).toBeGreaterThan(64 * 1024)
    expect(hasBoundedMimeHeaders(bytes(section))).toBe(false)
  })

  test.each(['From', 'Return-Path', 'Sender', 'Reply-To', 'return-path'])(
    '%s acima de 2 KiB recusa, e na borda passa',
    (name) => {
      const header = (length: number) =>
        bytes(`${name}: ${'a'.repeat(length)}\r\nSubject: x\r\n\r\ncorpo`)
      expect(hasBoundedMimeHeaders(header(2000))).toBe(true)
      expect(hasBoundedMimeHeaders(header(3000))).toBe(false)
    },
  )

  test('a linha desdobrada conta inteira: dobras de 1 KiB somam', () => {
    const folded = `Return-Path: ${'a'.repeat(1000)}\r\n ${'b'.repeat(1000)}\r\n\t${'c'.repeat(1000)}\r\n`
    expect(hasBoundedMimeHeaders(bytes(`${folded}Subject: x\r\n\r\ncorpo`))).toBe(false)
  })

  test('outros cabeçalhos longos não pesam: o teto de 2 KiB é dos de endereço', () => {
    const subject = `Subject: ${'a'.repeat(5000)}\r\n`
    expect(hasBoundedMimeHeaders(bytes(`From: a@b.example\r\n${subject}\r\ncorpo`))).toBe(true)
    expect(hasBoundedMimeHeaders(bytes(`X-From: ${'a'.repeat(5000)}\r\n\r\ncorpo`))).toBe(true)
  })

  test('o corpo grande depois do cabeçalho não é lido nem pesa', () => {
    const message = bytes(`From: a@b.example\r\n\r\n${'x'.repeat(2_000_000)}`)
    expect(hasBoundedMimeHeaders(message)).toBe(true)
  })
})

describe('a prévia nunca chama o verificador de DKIM com cabeçalho hostil (spec 237 T4.7a)', () => {
  const forward = (extraHeaders: readonly string[]) =>
    buildMime({
      attachments: [{ fileName: 'FR-06-10.xlsm' }],
      extraHeaders,
      from: `Equipe <${FORWARDER}>`,
      text: gmailForwardText({ from: `FR <${ORIGINAL}>` }),
    })

  test.each([
    ['Return-Path de 400 KB', [`Return-Path: ${LIST_BOMB}`]],
    ['Sender de 3 KiB', [`Sender: ${'a'.repeat(3000)}`]],
    ['Reply-To de 3 KiB', [`Reply-To: ${'a'.repeat(3000)}`]],
  ])('%s: recusa MIME_UNREADABLE sem DKIM e em milissegundos', async (_name, extraHeaders) => {
    const startedAt = performance.now()
    const run = runIntake({ rawEmail: forward(extraHeaders) })
    expect(await run.result).toEqual({
      contractorId: '22222222-2222-4222-8222-222222222222',
      kind: 'rejected',
      reason: 'MIME_UNREADABLE',
    })
    expect(performance.now() - startedAt).toBeLessThan(1500)
    expect(run.calls.dkimVerifications).toHaveLength(0)
    expect(run.calls.rejections).toHaveLength(1)
    expect(run.calls.rejections[0]?.reason).toBe('MIME_UNREADABLE')
    expect(run.calls.rejections[0]?.dkimResult).toBeUndefined()
    expect(run.calls.created).toEqual([])
    expect(run.calls.stored).toEqual([])
  })

  test('o e-mail comum continua passando pelo DKIM uma vez', async () => {
    const run = runIntake({ rawEmail: forward([]) })
    expect(await run.result).toMatchObject({ kind: 'accepted' })
    expect(run.calls.dkimVerifications).toHaveLength(1)
  })
})

describe('a conversa também não verifica DKIM de cabeçalho hostil (spec 237 T4.7a)', () => {
  const COMPANY_ID = crypto.randomUUID()
  const THREAD_ID = crypto.randomUUID()
  const REPLY_DOMAIN = 'resposta.example'
  const REPLY_TOKEN = 'replytoken234567abcdefghij'

  async function run(rawEmail: string) {
    const verified: Buffer[] = []
    const recorded: { dkimResult: string }[] = []
    const extracted: Uint8Array[] = []
    const previewIntake: CargoPreviewEmailIntakePort = {
      hasIntake: async () => false,
      intake: async () => ({ kind: 'not_a_preview' }),
    }
    const dependencies = {
      conversationAttachments: {
        discard: async () => undefined,
        store: async (raw: Uint8Array) => {
          extracted.push(raw)
          return { skipped: 0, stored: [] }
        },
      },
      dkimVerifier: {
        verify: async (rawMessage: Buffer) => {
          verified.push(rawMessage)
          return 'aligned' as const
        },
      },
      mailGateway: {
        downloadRawEmail: async () => Buffer.from(rawEmail, 'latin1'),
        fetchReceivedEmail: async () => ({
          from: 'financeiro@contratante.example',
          headers: {},
          message_id: '<x@y>',
          raw: { download_url: 'https://cdn.resend.com/raw/1', expires_at: '2099-01-01T00:00:00Z' },
          subject: 'APROVADO',
          text: 'APROVADO',
          to: [`${REPLY_TOKEN}@${REPLY_DOMAIN}`],
        }),
        sendEmail: async () => {
          throw new Error('not used')
        },
      },
      previewIntake,
      repository: {
        findMessageByProviderEmailId: async () => undefined,
        findSettingsByCompanyId: async () => ({
          id: crypto.randomUUID(),
          replyDomain: REPLY_DOMAIN,
          secretEnvelope: {},
        }),
        findThreadsByReplyTokenHashes: async () => [{ id: THREAD_ID }],
        recordInboundMessage: async (input: { dkimResult: string }) => {
          recorded.push({ dkimResult: input.dkimResult })
          return { id: crypto.randomUUID(), linkedAttachments: 0 }
        },
        threadHasOccurrenceConversation: async () => true,
      },
      secretService: {
        decrypt: async () => ({
          apiKey: 'k',
          replyTokenSecret: 'a'.repeat(64),
          webhookSigningSecret: 'w',
        }),
      },
      storage: { storeObject: async () => undefined },
      storageBucket: 'b',
      storageProvider: 'minio',
    } as unknown as RecordContractorMailInboundMessageDependencies
    const result = await recordContractorMailInboundMessage(
      {
        companyId: COMPANY_ID,
        correlationId: 'corr',
        eventId: crypto.randomUUID(),
        occurredAt: new Date(0).toISOString(),
        payload: { providerEmailId: 'evt_hostile_0001' },
        type: CONTRACTOR_MAIL_INBOUND_EVENT_TYPE.EMAIL_RECEIVED,
        version: 1,
      },
      dependencies,
    )
    return { extracted, recorded, result, verified }
  }

  test('Return-Path de 400 KB: grava a mensagem como DKIM ausente, sem verificar nem ler anexos', async () => {
    const startedAt = performance.now()
    const { extracted, recorded, result, verified } = await run(
      `From: financeiro@contratante.example\r\nReturn-Path: ${LIST_BOMB}\r\n\r\nAPROVADO\r\n`,
    )
    expect(performance.now() - startedAt).toBeLessThan(1500)
    expect(verified).toHaveLength(0)
    expect(extracted).toHaveLength(0)
    expect(result).toMatchObject({ dkimResult: 'absent', outcome: 'recorded' })
    expect(recorded).toEqual([{ dkimResult: 'absent' }])
  })

  test('mensagem comum segue verificada e com anexos lidos, como antes', async () => {
    const { extracted, recorded, verified } = await run(
      'From: financeiro@contratante.example\r\nTo: x@y.example\r\n\r\nAPROVADO\r\n',
    )
    expect(verified).toHaveLength(1)
    expect(extracted).toHaveLength(1)
    expect(recorded).toEqual([{ dkimResult: 'aligned' }])
  })
})
