/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import {
  sendContractorMailOutboundMessage,
  type SendContractorMailOutboundMessageDependencies,
} from '../../src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import { CONTRACTOR_MAIL_MAX_RECIPIENTS } from '../../src/contractor-mail/domain/contractor-mail.constant.js'
import {
  createSandboxSmtpMailGateway,
  type SandboxSmtpMailGateway,
  type SandboxSmtpTransport,
} from '../../src/contractor-mail/infrastructure/sandbox-smtp-mail.gateway.js'
import { CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'
import type { ContractorMailOutboundMessageRecord } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'

const COMPANY_ID = crypto.randomUUID()
const MESSAGE_ID = crypto.randomUUID()
const THREAD_ID = crypto.randomUUID()
const PDF = new TextEncoder().encode('%PDF-1.7 nota')

const SANDBOX_MESSAGE: ContractorMailOutboundMessageRecord = {
  bodyHtml: '<p>Ocorrência</p>',
  bodyText: 'Ocorrência',
  ccAddresses: [],
  direction: 'outbound',
  fromDisplayName: null,
  hasInlineLogo: false,
  fromAddress: 'no-reply@staging.example.test',
  subject: 'Ocorrência NF 4512',
  threadId: THREAD_ID,
  toAddresses: [
    'compras@alfa.example.test',
    'Fiscal@Alfa.example.test',
    'compras@alfa.example.test',
  ],
  transport: 'sandbox_smtp',
}

function buildEnvelope() {
  return {
    companyId: COMPANY_ID,
    correlationId: 'sandbox-outbound-0001',
    eventId: crypto.randomUUID(),
    occurredAt: new Date(0).toISOString(),
    payload: { messageId: MESSAGE_ID },
    type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
    version: 1,
  } as const
}

function buildDependencies(input: {
  readonly attachments?: readonly {
    available: boolean
    bucket: string
    contentType: string
    fileName: string
    key: string
    sha256: string
    sizeBytes: number
  }[]
  readonly message?: ContractorMailOutboundMessageRecord
  readonly sandbox: SandboxSmtpMailGateway | undefined
}) {
  const calls: string[] = []
  const sent: { messageId: string; providerEmailId: string }[] = []
  const failed: string[] = []
  const dependencies: SendContractorMailOutboundMessageDependencies = {
    attachments: {
      list: async () => input.attachments ?? [],
      read: async () => PDF,
    },
    mailGateway: {
      downloadRawEmail: async () => Buffer.alloc(0),
      fetchReceivedEmail: async () => {
        calls.push('resend:fetch')
        throw new Error('o sandbox nunca toca o Resend')
      },
      sendEmail: async () => {
        calls.push('resend:send')
        throw new Error('o sandbox nunca toca o Resend')
      },
    },
    repository: {
      async findContractorReplyForward() {
        calls.push('repository:forward')
        return undefined
      },
      async listThreadReferenceIds() {
        calls.push('repository:reference-headers')
        return []
      },
      async findMessageById() {
        return input.message ?? SANDBOX_MESSAGE
      },
      async findSettingsByCompanyId() {
        calls.push('repository:settings')
        return undefined
      },
      async markMessageFailed({ messageId }) {
        failed.push(messageId)
      },
      async markMessageSent({ messageId, providerEmailId }) {
        sent.push({ messageId, providerEmailId })
      },
    },
    ...(input.sandbox === undefined ? {} : { sandboxMailGateway: input.sandbox }),
    secretService: {
      async decrypt() {
        calls.push('secret:decrypt')
        throw new Error('o sandbox nunca abre a credencial da empresa')
      },
    },
  }
  return { calls, dependencies, failed, sent }
}

describe('spec 268: o e-mail da contratante em modo sandbox sai pelo SMTP do ambiente', () => {
  test('envia à lista de destinatários sem Resend, sem configuração da empresa e sem Reply-To', async () => {
    const requests: Parameters<SandboxSmtpMailGateway['sendEmail']>[0][] = []
    const { calls, dependencies, failed, sent } = buildDependencies({
      sandbox: {
        sendEmail: async (request) => {
          requests.push(request)
          return { id: '<smtp-1@mailpit>' }
        },
      },
    })

    const result = await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({ outcome: 'sent', threadId: THREAD_ID })
    expect(requests).toEqual([
      {
        from: 'no-reply@staging.example.test',
        html: '<p>Ocorrência</p>',
        subject: 'Ocorrência NF 4512',
        text: 'Ocorrência',
        to: ['compras@alfa.example.test', 'fiscal@alfa.example.test'],
      },
    ])
    expect(sent).toEqual([{ messageId: MESSAGE_ID, providerEmailId: '<smtp-1@mailpit>' }])
    expect(failed).toEqual([])
    expect(calls).toEqual([])
  })

  test('leva os anexos, conferidos pelo hash, em base64', async () => {
    const requests: Parameters<SandboxSmtpMailGateway['sendEmail']>[0][] = []
    const { dependencies } = buildDependencies({
      attachments: [
        {
          available: true,
          bucket: 'bucket',
          contentType: 'application/pdf',
          fileName: 'nota.pdf',
          key: 'key-1',
          sha256: createHash('sha256').update(PDF).digest('hex'),
          sizeBytes: PDF.byteLength,
        },
      ],
      sandbox: {
        sendEmail: async (request) => {
          requests.push(request)
          return { id: '<smtp-2@mailpit>' }
        },
      },
    })

    await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(requests[0]?.attachments).toEqual([
      {
        content: Buffer.from(PDF).toString('base64'),
        contentType: 'application/pdf',
        fileName: 'nota.pdf',
      },
    ])
  })

  test('worker com o modo desligado falha sem enviar e sem tocar o Resend', async () => {
    const { calls, dependencies, failed, sent } = buildDependencies({ sandbox: undefined })

    const result = await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({ outcome: 'failed', reason: 'sandbox_disabled', threadId: THREAD_ID })
    expect(failed).toEqual([MESSAGE_ID])
    expect(sent).toEqual([])
    expect(calls).toEqual([])
  })

  test('falha de conexão com o SMTP propaga, para a fila tentar de novo', async () => {
    const { dependencies, failed } = buildDependencies({
      sandbox: {
        sendEmail: async () => {
          throw new Error('ECONNREFUSED')
        },
      },
    })

    await expect(sendContractorMailOutboundMessage(buildEnvelope(), dependencies)).rejects.toThrow(
      'ECONNREFUSED',
    )
    expect(failed).toEqual([])
  })

  test('anexo indisponível falha sem enviar', async () => {
    let attempts = 0
    const { dependencies, failed } = buildDependencies({
      attachments: [
        {
          available: false,
          bucket: 'bucket',
          contentType: 'application/pdf',
          fileName: 'nota.pdf',
          key: 'key-1',
          sha256: 'a'.repeat(64),
          sizeBytes: 1,
        },
      ],
      sandbox: {
        sendEmail: async () => {
          attempts += 1
          return { id: 'x' }
        },
      },
    })

    const result = await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(result).toMatchObject({ outcome: 'failed', reason: 'attachment_unavailable' })
    expect(failed).toEqual([MESSAGE_ID])
    expect(attempts).toBe(0)
  })
})

describe('spec 267: a cópia no modo sandbox', () => {
  test('leva a cópia deduplicada no cc, sem repetir quem já está no To', async () => {
    const requests: Parameters<SandboxSmtpMailGateway['sendEmail']>[0][] = []
    const { dependencies } = buildDependencies({
      message: {
        ...SANDBOX_MESSAGE,
        ccAddresses: ['Ana@empresa.test', 'ana@empresa.test', 'bruno@empresa.test'],
      },
      sandbox: {
        sendEmail: async (request) => {
          requests.push(request)
          return { id: '<smtp-cc@mailpit>' }
        },
      },
    })

    await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(requests[0]?.cc).toEqual(['ana@empresa.test', 'bruno@empresa.test'])
  })

  test('To + Cc acima do teto é falha permanente antes de qualquer envio', async () => {
    let attempts = 0
    const addresses = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => `${prefix}${index}@example.test`)
    const { dependencies, failed } = buildDependencies({
      message: {
        ...SANDBOX_MESSAGE,
        ccAddresses: addresses('cc', 1),
        toAddresses: addresses('to', CONTRACTOR_MAIL_MAX_RECIPIENTS),
      },
      sandbox: {
        sendEmail: async () => {
          attempts += 1
          return { id: 'x' }
        },
      },
    })

    const result = await sendContractorMailOutboundMessage(buildEnvelope(), dependencies)

    expect(result).toEqual({ outcome: 'failed', reason: 'invalid_recipients', threadId: THREAD_ID })
    expect(failed).toEqual([MESSAGE_ID])
    expect(attempts).toBe(0)
  })
})

describe('o gateway SMTP do sandbox', () => {
  function fakeTransport(result: { accepted: readonly unknown[]; rejected: readonly unknown[] }) {
    const messages: Parameters<SandboxSmtpTransport['sendMail']>[0][] = []
    const transport: SandboxSmtpTransport = {
      sendMail: async (message) => {
        messages.push(message)
        return { messageId: '<id@mailpit>', ...result }
      },
    }
    return { messages, transport }
  }

  test('entrega ao transporte com todos os destinatários e anexo em base64', async () => {
    const { messages, transport } = fakeTransport({ accepted: ['a', 'b'], rejected: [] })
    const gateway = createSandboxSmtpMailGateway({ transport })

    const sent = await gateway.sendEmail({
      attachments: [{ content: 'AAAA', contentType: 'application/pdf', fileName: 'nota.pdf' }],
      from: 'no-reply@staging.example.test',
      subject: 'Assunto',
      text: 'Corpo',
      to: ['a@example.test', 'b@example.test'],
    })

    expect(sent).toEqual({ id: '<id@mailpit>' })
    expect(messages[0]).toEqual({
      attachments: [
        {
          content: 'AAAA',
          contentType: 'application/pdf',
          encoding: 'base64',
          filename: 'nota.pdf',
        },
      ],
      from: 'no-reply@staging.example.test',
      subject: 'Assunto',
      text: 'Corpo',
      to: ['a@example.test', 'b@example.test'],
    })
  })

  test('todos os destinatários recusados é falha permanente', async () => {
    const { transport } = fakeTransport({ accepted: [], rejected: ['a', 'b'] })
    const gateway = createSandboxSmtpMailGateway({ transport })

    await expect(
      gateway.sendEmail({
        from: 'no-reply@staging.example.test',
        subject: 'Assunto',
        text: 'Corpo',
        to: ['a@example.test'],
      }),
    ).rejects.toMatchObject({ name: 'SandboxSmtpRecipientsRejectedError' })
  })

  test('entrega o cc ao transporte e o omite quando vazio', async () => {
    const { messages, transport } = fakeTransport({ accepted: ['a'], rejected: [] })
    const gateway = createSandboxSmtpMailGateway({ transport })
    const base = {
      from: 'no-reply@staging.example.test',
      subject: 'Assunto',
      text: 'Corpo',
      to: ['a@example.test'],
    }

    await gateway.sendEmail({ ...base, cc: ['ana@example.test'] })
    await gateway.sendEmail({ ...base, cc: [] })

    expect(messages[0]?.cc).toEqual(['ana@example.test'])
    expect('cc' in (messages[1] ?? {})).toBe(false)
  })

  test('recusa endereço que injetaria cabeçalho ou viraria lista, no to e no cc, sem tocar o transporte', async () => {
    const { messages, transport } = fakeTransport({ accepted: ['a'], rejected: [] })
    const gateway = createSandboxSmtpMailGateway({ transport })
    const base = {
      from: 'no-reply@staging.example.test',
      subject: 'Assunto',
      text: 'Corpo',
      to: ['a@example.test'],
    }

    for (const hostile of ['x@e.test\nBcc: y@e.test', 'x@e.test, y@e.test', 'Nome <x@e.test>']) {
      await expect(gateway.sendEmail({ ...base, cc: [hostile] })).rejects.toMatchObject({
        name: 'SandboxSmtpRecipientsRejectedError',
      })
      await expect(gateway.sendEmail({ ...base, to: [hostile] })).rejects.toMatchObject({
        name: 'SandboxSmtpRecipientsRejectedError',
      })
    }
    expect(messages).toEqual([])
  })

  test('recusa To + Cc acima do teto sem tocar o transporte', async () => {
    const { messages, transport } = fakeTransport({ accepted: ['a'], rejected: [] })
    const gateway = createSandboxSmtpMailGateway({ transport })

    await expect(
      gateway.sendEmail({
        cc: ['ana@example.test'],
        from: 'no-reply@staging.example.test',
        subject: 'Assunto',
        text: 'Corpo',
        to: Array.from({ length: CONTRACTOR_MAIL_MAX_RECIPIENTS }, (_, i) => `to${i}@example.test`),
      }),
    ).rejects.toMatchObject({ name: 'SandboxSmtpRecipientsRejectedError' })
    expect(messages).toEqual([])
  })
})
