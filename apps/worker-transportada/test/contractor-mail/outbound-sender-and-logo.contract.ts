/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §8, §9; critérios 5, 7 e 8): o "De" por `from_display_name` e o logo inline por `Content-ID`,
 * nos dois transportes, contra dublês do Resend (fetch) e do nodemailer (transport).
 */
import { describe, expect, test } from 'bun:test'

import {
  sendContractorMailOutboundMessage,
  type SendContractorMailOutboundMessageDependencies,
} from '../../src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import { COMPANY_LOGO_CONTENT_ID } from '../../src/contractor-mail/domain/contractor-mail.constant.js'
import type { ContractorMailOutboundMessageRecord } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'
import { createResendMailGateway } from '../../src/contractor-mail/infrastructure/resend-mail.gateway.js'
import {
  createSandboxSmtpMailGateway,
  type SandboxSmtpTransport,
} from '../../src/contractor-mail/infrastructure/sandbox-smtp-mail.gateway.js'
import { CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'

const COMPANY_ID = crypto.randomUUID()
const MESSAGE_ID = crypto.randomUUID()
const THREAD_ID = crypto.randomUUID()
const LOGO_BASE64 = Buffer.from('PNG-bytes').toString('base64')

const BASE: ContractorMailOutboundMessageRecord = {
  bodyHtml: '<p><img src="cid:company-logo"></p>',
  bodyText: 'texto',
  ccAddresses: [],
  direction: 'outbound',
  fromAddress: 'no-reply@staging.example.test',
  fromDisplayName: 'Ana Lima — Tapete Mágico',
  hasInlineLogo: true,
  subject: 'Ocorrência',
  threadId: THREAD_ID,
  toAddresses: ['compras@alfa.example.test'],
  transport: 'resend',
}

function envelope() {
  return {
    companyId: COMPANY_ID,
    correlationId: 'sender-and-logo-0001',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: { messageId: MESSAGE_ID },
    type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
    version: 1,
  } as const
}

type Harness = ReturnType<typeof build>

function build(input: {
  readonly logo?: { contentBase64: string; mimeType: 'image/jpeg' | 'image/png' } | undefined
  readonly message: ContractorMailOutboundMessageRecord
  readonly whiteLogo?: (bytes: Uint8Array) => Promise<Uint8Array>
}) {
  const resendBodies: Record<string, unknown>[] = []
  const nodemailerMessages: Record<string, unknown>[] = []
  const logs: { message: string; metadata: unknown }[] = []
  const logoQueries: string[] = []
  const transport: SandboxSmtpTransport = {
    async sendMail(message) {
      nodemailerMessages.push({ ...message })
      return { accepted: ['x'], messageId: 'sandbox-id', rejected: [] }
    },
  }
  const dependencies: SendContractorMailOutboundMessageDependencies = {
    attachments: { list: async () => [], read: async () => undefined },
    companyLogo: {
      async find({ companyId }: { companyId: string }) {
        logoQueries.push(companyId)
        return input.logo
      },
    },
    logger: {
      error: () => undefined,
      info: () => undefined,
      warn: (message: string, metadata?: unknown) => {
        logs.push({ message, metadata })
      },
    },
    ...(input.whiteLogo === undefined ? {} : { whiteLogo: input.whiteLogo }),
    mailGateway: createResendMailGateway({
      fetch: async (_target, init) => {
        resendBodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
        return new Response(JSON.stringify({ id: 'resend-id' }), { status: 200 })
      },
    }),
    repository: {
      findContractorReplyForward: async () => undefined,
      listThreadReferenceIds: async () => [],
      findMessageById: async () => input.message,
      findSettingsByCompanyId: async () => ({
        id: crypto.randomUUID(),
        replyDomain: 'resposta.example.test',
        secretEnvelope: {},
        senderAddress: 'ocorrencias@tapete.example.test',
        senderName: 'Nome da configuração',
      }),
      markMessageFailed: async () => undefined,
      markMessageSent: async () => undefined,
    },
    sandboxMailGateway: createSandboxSmtpMailGateway({ transport }),
    secretService: {
      decrypt: async () => ({ apiKey: 're_key', replyTokenSecret: 'a'.repeat(64) }),
    },
  } as unknown as SendContractorMailOutboundMessageDependencies
  return { dependencies, logoQueries, logs, nodemailerMessages, resendBodies }
}

async function run(harness: Harness) {
  return sendContractorMailOutboundMessage(envelope(), harness.dependencies)
}

describe('spec 272: "De" por from_display_name (critério 7)', () => {
  test('Resend: "Nome" <endereço> da configuração, nunca o senderName', async () => {
    const harness = build({ message: BASE, logo: undefined })
    await run(harness)
    expect(harness.resendBodies[0]?.from).toBe(
      '"Ana Lima — Tapete Mágico" <ocorrencias@tapete.example.test>',
    )
  })

  test('Resend: nome nulo mantém o comportamento de hoje (senderName)', async () => {
    const harness = build({ message: { ...BASE, fromDisplayName: null, hasInlineLogo: false } })
    await run(harness)
    expect(harness.resendBodies[0]?.from).toBe(
      'Nome da configuração <ocorrencias@tapete.example.test>',
    )
  })

  test('Resend: nome sujo é saneado de novo (sem aspas, ângulos nem quebra de linha)', async () => {
    const harness = build({
      message: { ...BASE, fromDisplayName: 'Ana"\r\nBcc: x@y.z <e@x>', hasInlineLogo: false },
    })
    await run(harness)
    expect(harness.resendBodies[0]?.from).toBe(
      '"Ana Bcc: x@y.z e@x" <ocorrencias@tapete.example.test>',
    )
  })

  test('Resend: nome que sanitiza para vazio cai no comportamento de hoje', async () => {
    const harness = build({
      message: { ...BASE, fromDisplayName: '​‮', hasInlineLogo: false },
    })
    await run(harness)
    expect(harness.resendBodies[0]?.from).toBe(
      'Nome da configuração <ocorrencias@tapete.example.test>',
    )
  })

  test('sandbox: { name, address } no nodemailer', async () => {
    const harness = build({
      message: { ...BASE, hasInlineLogo: false, transport: 'sandbox_smtp' },
    })
    await run(harness)
    expect(harness.nodemailerMessages[0]?.from).toEqual({
      address: 'no-reply@staging.example.test',
      name: 'Ana Lima — Tapete Mágico',
    })
  })

  test('sandbox: sem nome o remetente segue o endereço puro', async () => {
    const harness = build({
      message: { ...BASE, fromDisplayName: null, hasInlineLogo: false, transport: 'sandbox_smtp' },
    })
    await run(harness)
    expect(harness.nodemailerMessages[0]?.from).toBe('no-reply@staging.example.test')
  })

  test('mensagem que não é outbound ignora o nome', async () => {
    const harness = build({
      message: { ...BASE, direction: 'inbound', hasInlineLogo: false },
    })
    await run(harness)
    expect(harness.resendBodies[0]?.from).toBe(
      'Nome da configuração <ocorrencias@tapete.example.test>',
    )
  })
})

describe('spec 272: logo inline por Content-ID (critério 5)', () => {
  test('o Content-ID é o que o HTML da API usa', () => {
    expect(COMPANY_LOGO_CONTENT_ID).toBe('company-logo')
  })

  test('Resend: parte inline com content_id, lida da empresa da mensagem', async () => {
    const harness = build({
      logo: { contentBase64: LOGO_BASE64, mimeType: 'image/png' },
      message: BASE,
    })
    await run(harness)
    expect(harness.logoQueries).toEqual([COMPANY_ID])
    expect(harness.resendBodies[0]?.attachments).toEqual([
      {
        content: LOGO_BASE64,
        content_id: 'company-logo',
        content_type: 'image/png',
        filename: 'logo.png',
      },
    ])
  })

  test('com conversor: o logo vai como silhueta branca em PNG', async () => {
    const white = new Uint8Array([9, 9, 9])
    const harness = build({
      logo: { contentBase64: LOGO_BASE64, mimeType: 'image/jpeg' },
      message: BASE,
      whiteLogo: async () => white,
    })
    await run(harness)
    expect(harness.resendBodies[0]?.attachments).toEqual([
      {
        content: Buffer.from(white).toString('base64'),
        content_id: 'company-logo',
        content_type: 'image/png',
        filename: 'logo.png',
      },
    ])
  })

  test('conversor que falha: sai o logo original e o log não leva o conteúdo', async () => {
    const harness = build({
      logo: { contentBase64: LOGO_BASE64, mimeType: 'image/png' },
      message: BASE,
      whiteLogo: async () => {
        throw new Error('imagem inválida')
      },
    })
    await run(harness)
    expect(harness.resendBodies[0]?.attachments).toEqual([
      {
        content: LOGO_BASE64,
        content_id: 'company-logo',
        content_type: 'image/png',
        filename: 'logo.png',
      },
    ])
    expect(harness.logs).toEqual([
      {
        message: 'contractor_mail_inline_logo_white_failed',
        metadata: { messageId: MESSAGE_ID, reason: 'white_conversion_failed' },
      },
    ])
  })

  test('sandbox: parte inline com cid no nodemailer', async () => {
    const harness = build({
      logo: { contentBase64: LOGO_BASE64, mimeType: 'image/jpeg' },
      message: { ...BASE, transport: 'sandbox_smtp' },
    })
    await run(harness)
    expect(harness.nodemailerMessages[0]?.attachments).toEqual([
      {
        cid: 'company-logo',
        content: LOGO_BASE64,
        contentType: 'image/jpeg',
        encoding: 'base64',
        filename: 'logo.jpg',
      },
    ])
  })

  test('sem has_inline_logo o logo nem é lido', async () => {
    const harness = build({
      logo: { contentBase64: LOGO_BASE64, mimeType: 'image/png' },
      message: { ...BASE, hasInlineLogo: false },
    })
    await run(harness)
    expect(harness.logoQueries).toEqual([])
    expect(harness.resendBodies[0]?.attachments).toBeUndefined()
  })

  test.each(['resend', 'sandbox_smtp'] as const)(
    '%s: logo ausente envia sem a parte e loga só messageId e motivo',
    async (transport) => {
      const harness = build({ logo: undefined, message: { ...BASE, transport } })
      const result = await run(harness)
      expect(result.outcome).toBe('sent')
      expect(harness.resendBodies[0]?.attachments).toBeUndefined()
      expect(harness.nodemailerMessages[0]?.attachments).toBeUndefined()
      expect(harness.logs).toEqual([
        {
          message: 'contractor_mail_inline_logo_missing',
          metadata: { messageId: MESSAGE_ID, reason: 'logo_not_found' },
        },
      ])
    },
  )

  test('o gateway do Resend só manda content_id quando há contentId', async () => {
    const bodies: Record<string, unknown>[] = []
    const gateway = createResendMailGateway({
      fetch: async (_t, init) => {
        bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>)
        return new Response(JSON.stringify({ id: 'x' }), { status: 200 })
      },
    })
    await gateway.sendEmail({
      apiKey: 'k',
      attachments: [{ content: 'QQ==', contentType: 'application/pdf', fileName: 'a.pdf' }],
      from: 'a@b.c',
      headers: {},
      idempotencyKey: 'i',
      subject: 's',
      text: 't',
      to: ['x@y.z'],
    })
    expect(bodies[0]?.attachments).toEqual([
      { content: 'QQ==', content_type: 'application/pdf', filename: 'a.pdf' },
    ])
  })
})
