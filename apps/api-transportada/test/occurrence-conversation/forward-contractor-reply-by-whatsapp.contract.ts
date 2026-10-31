/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5 (RF3/RF5/RF6, critérios de aceite): o boleto por WhatsApp (Evolution) ao cliente. O número é
 * normalizado e só sai mascarado; o mesmo envio não chama o Evolution duas vezes; sem número conectado o erro é
 * tipado e nada é reservado; instância caída fecha em `whatsapp_disconnected`; "Tentar de novo" e "Reenviar" abrem
 * tentativa nova com a chave do pedido; o log não leva número nem texto.
 */
import { describe, expect, test } from 'bun:test'

import {
  ContractorReplyWhatsAppSendError,
  type ContractorReplyWhatsAppDeliveryRecord,
  type ContractorReplyWhatsAppSendFailure,
  type ContractorReplyWhatsAppTransactionPort,
  type RecordContractorReplyWhatsAppDeliveryParams,
} from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.port.js'
import {
  createForwardContractorReplyByWhatsAppUseCase,
  startOfBrasiliaDay,
  type ForwardContractorReplyByWhatsAppInput,
} from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.use-case.js'
import {
  maskClientWhatsAppNumber,
  parseClientWhatsAppNumber,
} from '../../src/occurrence-conversation/domain/contractor-reply-whatsapp-number.policy.js'
import {
  ContractorReplyWhatsAppContactNotFoundError,
  ContractorReplyWhatsAppDailyCapReachedError,
  ContractorReplyWhatsAppNumberInvalidError,
  ContractorReplyWhatsAppOffError,
  ContractorReplyWhatsAppResendNotAllowedError,
} from '../../src/occurrence-conversation/domain/contractor-reply-whatsapp.error.js'
import type { ClientChannel } from '../../src/shared/delivery-client-email.constant.js'
import {
  WhatsAppEvolutionDisabledError,
  WhatsAppEvolutionNotConfiguredError,
} from '../../src/whatsapp/domain/whatsapp-evolution.error.js'
import { ContractorReplyClientTemplateMissingError } from '../../src/occurrence-conversation/domain/contractor-reply-email.error.js'
import {
  createClientTextsResolver,
  type ClientTextsTemplate,
} from '../fixtures/contractor-reply-client-texts.fixture.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OCCURRENCE_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const ATTACHMENT_ID = '44444444-4444-4444-8444-444444444444'
const CONTACT_ID = '55555555-5555-4555-8555-555555555555'
const NUMBER = '+5516999998888'
const SAVED_NUMBER = '+5511988887777'
const MEGABYTE = 1024 * 1024
const NOW = new Date('2026-10-27T15:00:00.000Z')

const CONFIG = {
  alertIntervalMinutes: 60,
  alertMaxCount: 24,
  alertMode: 'off',
  attachmentKind: 'pdf',
  driverReplyChannel: 'app_chat',
  driverReplyTemplate: '',
  driverReplyWindowClosedAction: 'fallback_app_chat',
  forwardToInformedEmail: 'manual',
  forwardToNoteRecipient: 'manual',
  mode: 'forward_after_approval',
  version: 1,
  waitHours: 6,
}

type Delivery = Omit<RecordContractorReplyWhatsAppDeliveryParams, 'reason' | 'status'> & {
  id: string
  providerMessageId: null | string
  reason: RecordContractorReplyWhatsAppDeliveryParams['reason']
  status: 'failed' | 'queued' | 'sent'
}

type World = {
  attachmentSize?: number
  channel?: ClientChannel
  connected?: boolean
  /** O número do chip pareado, só dígitos; ausente, o Evolution não informa. */
  connectedNumber?: null | string
  dailyCap?: number
  failure?: ContractorReplyWhatsAppSendFailure
  settings?: 'active' | 'disabled' | null
  /** Spec 286 T3: o modelo do canal escolhido no tipo; ausente, o texto livre antigo. */
  template?: ClientTextsTemplate
  todayCount?: number
}

function build(world: World = {}) {
  const deliveries: Delivery[] = []
  const saved: Array<{ address: string; authorKind: string; taxId: string }> = []
  const closedCaptions: string[] = []
  const sends: Array<{ caption: string; mimeType: string; number: string }> = []
  const logs: Array<Record<string, unknown>> = []
  let connectionChecks = 0

  const toRecord = (delivery: Delivery): ContractorReplyWhatsAppDeliveryRecord => ({
    address: delivery.address,
    attachmentId: delivery.attachmentId,
    id: delivery.id,
    reason: delivery.reason,
    status: delivery.status,
    target: 'client_boleto_whatsapp',
  })

  const transaction: ContractorReplyWhatsAppTransactionPort = {
    countCompanyDeliveriesSince: async () => world.todayCount ?? 0,
    countDeliveries: async ({ address }) =>
      address === undefined
        ? deliveries.filter((delivery) => delivery.status !== 'failed').length
        : deliveries.filter((delivery) => delivery.address === address).length,
    findAttachment: async () => ({
      bucket: 'bucket',
      contentType: 'application/pdf',
      fileName: 'boleto.pdf',
      objectKey: 'key',
      sizeBytes: world.attachmentSize ?? MEGABYTE,
    }),
    findClientChannel: async () => world.channel ?? 'both',
    findDeliveryById: async ({ deliveryId }) => {
      const found = deliveries.find((delivery) => delivery.id === deliveryId)
      return found === undefined ? null : toRecord(found)
    },
    findDeliveryByKey: async ({ idempotencyKey }) => {
      const found = deliveries.find((delivery) => delivery.idempotencyKey === idempotencyKey)
      return found === undefined ? null : toRecord(found)
    },
    findDeliveryClientTaxId: async () => '12345678000199',
    findEvolutionSettings: async () =>
      world.settings === null
        ? null
        : { dailyCap: world.dailyCap ?? 50, status: world.settings ?? 'active' },
    listClientWhatsAppContacts: async () => [
      { address: SAVED_NUMBER, id: CONTACT_ID, label: 'dono' },
    ],
    lockReply: async () => ({
      config: CONFIG,
      id: 'reply-1',
      occurrenceKind: 'document',
      replyAttachmentId: ATTACHMENT_ID,
    }),
    resolveClientTexts: createClientTextsResolver(world.template),
    recordDelivery: async (params) => {
      const id = `delivery-${deliveries.length + 1}`
      deliveries.push({ ...params, id, providerMessageId: null })
      return { id }
    },
    saveClientWhatsAppContact: async (params) => {
      saved.push({ address: params.address, authorKind: params.authorKind, taxId: params.taxId })
      return { id: 'contact-new' }
    },
  }

  const useCase = createForwardContractorReplyByWhatsAppUseCase({
    attachments: { read: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]) },
    completion: {
      markFailed: async ({ deliveryId, reason }) => {
        const found = deliveries.find((delivery) => delivery.id === deliveryId)
        if (found !== undefined && found.status === 'queued') {
          found.status = 'failed'
          found.reason = reason
        }
      },
      markSent: async ({ caption, deliveryId, providerMessageId }) => {
        closedCaptions.push(caption)
        const found = deliveries.find((delivery) => delivery.id === deliveryId)
        if (found !== undefined && found.status === 'queued') {
          found.status = 'sent'
          found.providerMessageId = providerMessageId
        }
      },
    },
    logger: { info: (event, fields) => logs.push({ event, ...fields }) },
    now: () => NOW,
    sender: {
      connectedNumber: async () => world.connectedNumber ?? null,
      isConnected: async () => {
        connectionChecks += 1
        return world.connected ?? true
      },
      sendDocument: async (params) => {
        if (world.failure !== undefined) throw new ContractorReplyWhatsAppSendError(world.failure)
        sends.push({ caption: params.caption, mimeType: params.mimeType, number: params.number })
        return { providerMessageId: `wamid-${sends.length}` }
      },
    },
    unitOfWork: { execute: (operation) => operation(transaction) },
  })

  return {
    connectionChecks: () => connectionChecks,
    deliveries,
    logs,
    saved,
    closedCaptions,
    sends,
    useCase,
    world,
  }
}

function input(
  overrides: Partial<ForwardContractorReplyByWhatsAppInput> = {},
): ForwardContractorReplyByWhatsAppInput {
  return {
    actorUserId: ACTOR_ID,
    authorKind: 'office',
    companyId: COMPANY_ID,
    contactIds: [],
    correlationId: 'corr-1',
    idempotencyKey: 'click-1',
    number: '(16) 99999-8888',
    occurrenceId: OCCURRENCE_ID,
    save: false,
    ...overrides,
  }
}

describe('spec 281 T5: número do WhatsApp do cliente (D4)', () => {
  test('as formas comuns chegam ao mesmo E.164, com DDI 55 quando falta', () => {
    for (const raw of [
      '(16) 99999-8888',
      '16999998888',
      '016 99999-8888',
      '+55 16 99999-8888',
      '5516999998888',
      ' 55 (16) 99999.8888 ',
    ]) {
      expect(parseClientWhatsAppNumber(raw)).toBe(NUMBER)
    }
    expect(parseClientWhatsAppNumber('(11) 3333-4444')).toBe('+551133334444')
    expect(parseClientWhatsAppNumber('+1 415 555 2671')).toBe('+14155552671')
  })

  test('sem DDD, com letra, com dois números, celular sem o 9 ou fora do E.164: nada', () => {
    for (const raw of [
      '',
      '99999-8888',
      '16 9999A-8888',
      '16999998888, 16999997777',
      '+55 16 89999-8888',
      '+55 01 99999-8888',
      '+0 16 99999-8888',
      '1699999888812345',
      '16+999998888',
    ]) {
      expect(parseClientWhatsAppNumber(raw)).toBeNull()
    }
  })

  test('mascarado mostra o país e os quatro últimos dígitos', () => {
    expect(maskClientWhatsAppNumber(NUMBER)).toBe('+55 ••••8888')
    expect(maskClientWhatsAppNumber(NUMBER)).not.toContain('99999')
  })

  test('o dia do teto diário é o de Brasília', () => {
    expect(startOfBrasiliaDay(new Date('2026-10-27T02:00:00.000Z')).toISOString()).toBe(
      '2026-10-26T03:00:00.000Z',
    )
    expect(startOfBrasiliaDay(new Date('2026-10-27T03:00:00.000Z')).toISOString()).toBe(
      '2026-10-27T03:00:00.000Z',
    )
  })
})

describe('spec 286 T3: a legenda vem do modelo whatsapp do tipo', () => {
  test('com modelo escolhido, a legenda é o corpo dele (sem o assunto do e-mail)', async () => {
    const world = build({
      template: { whatsapp: { body: 'Olá! Segue o boleto da NF 123/1.', subject: '' } },
    })
    await world.useCase.forward(input())
    expect(world.sends.map((send) => send.caption)).toEqual(['Olá! Segue o boleto da NF 123/1.'])
  })

  test('modelo escolhido que não serve recusa com 409 e não reserva nada', async () => {
    const world = build({ template: 'missing' })
    await expect(world.useCase.forward(input())).rejects.toBeInstanceOf(
      ContractorReplyClientTemplateMissingError,
    )
    expect(world.deliveries).toEqual([])
    expect(world.sends).toEqual([])
  })
})

describe('spec 281 T5: envio do boleto por WhatsApp', () => {
  test('o telefone da mensagem é o do número conectado, não o do perfil fiscal', async () => {
    const world = build({
      connectedNumber: '5516993857105',
      template: { whatsapp: { body: 'Fale conosco: {{telefoneTransportadora}}', subject: '' } },
    })
    await world.useCase.forward(input())

    expect(world.sends.map((send) => send.caption)).toEqual(['Fale conosco: (16) 99385-7105'])
  })

  test('sem o número do Evolution a mensagem sai com o telefone do perfil', async () => {
    const world = build({
      template: { whatsapp: { body: 'Fale conosco: {{telefoneTransportadora}}', subject: '' } },
    })
    await world.useCase.forward(input())

    expect(world.sends.map((send) => send.caption)).toEqual([
      'Fale conosco: {{telefoneTransportadora}}',
    ])
  })

  test('o número digitado recebe o PDF e o texto do retorno; entrega fechada com o id do provedor', async () => {
    const world = build()
    const outcome = await world.useCase.forward(input())

    expect(world.sends).toEqual([
      {
        caption: 'Boleto prorrogado\n\nSegue o boleto com o novo vencimento.',
        mimeType: 'application/pdf',
        number: NUMBER,
      },
    ])
    // O balão da conversa do cliente mostra o texto que saiu, não só o anexo.
    expect(world.closedCaptions).toEqual([
      'Boleto prorrogado\n\nSegue o boleto com o novo vencimento.',
    ])
    expect(outcome.results).toEqual([
      {
        contactId: null,
        deliveryId: 'delivery-1',
        kind: 'sent',
        numberMasked: '+55 ••••8888',
        reason: null,
      },
    ])
    expect(world.deliveries[0]).toMatchObject({
      actorUserId: ACTOR_ID,
      address: NUMBER,
      providerMessageId: 'wamid-1',
      status: 'sent',
    })
  })

  test('o mesmo envio (clique repetido, outro operador, outra chave) não chama o Evolution de novo', async () => {
    const world = build()
    await world.useCase.forward(input())
    const again = await world.useCase.forward(
      input({ idempotencyKey: 'click-2', number: '16999998888' }),
    )

    expect(world.sends).toHaveLength(1)
    expect(world.deliveries).toHaveLength(1)
    expect(again.results[0]).toMatchObject({ deliveryId: 'delivery-1', kind: 'already_sent' })
  })

  test('o número guardado vai por id, e o novo só entra no cadastro com save', async () => {
    const world = build()
    const outcome = await world.useCase.forward(
      input({ authorKind: 'driver', contactIds: [CONTACT_ID], save: true }),
    )

    expect(world.sends.map((send) => send.number)).toEqual([SAVED_NUMBER, NUMBER])
    expect(world.saved).toEqual([
      { address: NUMBER, authorKind: 'driver', taxId: '12345678000199' },
    ])
    expect(outcome.savedContactId).toBe('contact-new')
    expect(outcome.results.map((result) => result.contactId)).toEqual([CONTACT_ID, 'contact-new'])
  })

  test('número inválido e contato de outro cliente: nada é reservado nem enviado', async () => {
    const world = build()
    await expect(world.useCase.forward(input({ number: '9999-8888' }))).rejects.toBeInstanceOf(
      ContractorReplyWhatsAppNumberInvalidError,
    )
    await expect(
      world.useCase.forward(input({ contactIds: ['99999999-9999-4999-8999-999999999999'] })),
    ).rejects.toBeInstanceOf(ContractorReplyWhatsAppContactNotFoundError)
    expect(world.deliveries).toEqual([])
    expect(world.sends).toEqual([])
  })

  test('RF5: canal desligado, Evolution sem configuração ou desligado recusam tipado, sem reservar', async () => {
    for (const [world, error] of [
      [{ channel: 'email' }, ContractorReplyWhatsAppOffError],
      [{ channel: 'off' }, ContractorReplyWhatsAppOffError],
      [{ settings: null }, WhatsAppEvolutionNotConfiguredError],
      [{ settings: 'disabled' }, WhatsAppEvolutionDisabledError],
    ] as const) {
      const built = build(world)
      await expect(built.useCase.forward(input())).rejects.toBeInstanceOf(error)
      expect(built.deliveries).toEqual([])
      expect(built.connectionChecks()).toBe(0)
    }
  })

  test('D9: o teto diário da empresa recusa antes de reservar', async () => {
    const world = build({ dailyCap: 10, todayCount: 10 })
    await expect(world.useCase.forward(input())).rejects.toBeInstanceOf(
      ContractorReplyWhatsAppDailyCapReachedError,
    )
    expect(world.deliveries).toEqual([])
  })

  test('instância desconectada: a entrega fecha em whatsapp_disconnected sem chamar o envio', async () => {
    const world = build({ connected: false })
    const outcome = await world.useCase.forward(input())

    expect(world.sends).toEqual([])
    expect(outcome.results[0]).toMatchObject({ kind: 'failed', reason: 'whatsapp_disconnected' })
    expect(world.deliveries[0]?.status).toBe('failed')
  })

  test('o motivo do Evolution vira motivo fechado da entrega', async () => {
    for (const [failure, reason] of [
      ['number_not_found', 'whatsapp_number_not_found'],
      ['disconnected', 'whatsapp_disconnected'],
      ['failed', 'send_failed'],
    ] as const) {
      const world = build({ failure })
      const outcome = await world.useCase.forward(input())
      expect(outcome.results[0]).toMatchObject({ kind: 'failed', reason })
    }
  })

  test('arquivo acima de 25 MB falha antes de chamar o Evolution', async () => {
    const world = build({ attachmentSize: 26 * MEGABYTE })
    const outcome = await world.useCase.forward(input())

    expect(world.connectionChecks()).toBe(0)
    expect(world.sends).toEqual([])
    expect(outcome.results[0]).toMatchObject({
      kind: 'failed',
      reason: 'attachment_too_large_for_whatsapp',
    })
  })

  test('"Tentar de novo" de uma falha de instância abre tentativa nova; a mesma chave não duplica', async () => {
    const world = build({ connected: false })
    await world.useCase.forward(input())
    world.world.connected = true

    const retry = { ...input(), deliveryId: 'delivery-1', idempotencyKey: 'retry-1' }
    const first = await world.useCase.resend(retry)
    const repeated = await world.useCase.resend(retry)

    expect(first.results[0]).toMatchObject({ deliveryId: 'delivery-2', kind: 'sent' })
    expect(repeated.results[0]).toMatchObject({ deliveryId: 'delivery-2', kind: 'already_sent' })
    expect(world.sends).toHaveLength(1)
  })

  test('"Reenviar" o que já saiu manda de novo, ao mesmo número', async () => {
    const world = build()
    await world.useCase.forward(input())
    const outcome = await world.useCase.resend({
      ...input(),
      deliveryId: 'delivery-1',
      idempotencyKey: 'resend-1',
    })

    expect(outcome.results[0]).toMatchObject({ kind: 'sent', numberMasked: '+55 ••••8888' })
    expect(world.sends.map((send) => send.number)).toEqual([NUMBER, NUMBER])
  })

  test('número sem WhatsApp não tem "Tentar de novo": a tela oferece o e-mail', async () => {
    const world = build({ failure: 'number_not_found' })
    await world.useCase.forward(input())
    await expect(
      world.useCase.resend({ ...input(), deliveryId: 'delivery-1', idempotencyKey: 'retry-1' }),
    ).rejects.toBeInstanceOf(ContractorReplyWhatsAppResendNotAllowedError)
  })

  test('o log não leva número, texto do boleto nem nome do arquivo', async () => {
    const world = build()
    await world.useCase.forward(input({ contactIds: [CONTACT_ID] }))
    const serialized = JSON.stringify(world.logs)

    expect(world.logs).toHaveLength(1)
    for (const secret of ['99999', '98888', '5516', 'novo vencimento', 'boleto.pdf']) {
      expect(serialized).not.toContain(secret)
    }
    expect(serialized).toContain('+55 ••••8888')
  })
})
