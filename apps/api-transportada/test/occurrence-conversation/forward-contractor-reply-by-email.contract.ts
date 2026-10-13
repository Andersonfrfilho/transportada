/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.7/T4.8 (RF9–RF12, CA07): o boleto da contratante por e-mail a um terceiro. Um endereço só e
 * sem cabeçalho; nota sem e-mail vira `skipped` e nunca cai em outro endereço; a mesma chave não duplica;
 * teto de cinco por ocorrência; PDF acima de 10 MB falha sem sair; e o endereço só aparece mascarado.
 */
import { describe, expect, test } from 'bun:test'

import {
  ContractorMailNotConfiguredError,
  ContractorMailSendingNotVerifiedError,
} from '../../src/contractor-mail/domain/contractor-mail.error.js'
import type {
  ContractorReplyEmailDeliveryRecord,
  ContractorReplyEmailTransactionPort,
  RecordContractorReplyEmailDeliveryParams,
  RecordContractorReplyMailParams,
} from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.port.js'
import {
  createForwardContractorReplyByEmailUseCase,
  type ForwardContractorReplyByEmailInput,
} from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import { parseContractorReplyEmailAddress } from '../../src/occurrence-conversation/domain/contractor-reply-email-address.policy.js'
import {
  ContractorReplyEmailAddressInvalidError,
  ContractorReplyEmailAttachmentNotFoundError,
  ContractorReplyEmailForwardDisabledError,
  ContractorReplyEmailLimitReachedError,
} from '../../src/occurrence-conversation/domain/contractor-reply-email.error.js'
import { OccurrenceConversationIdempotencyKeyReusedError } from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OCCURRENCE_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const ATTACHMENT_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_ATTACHMENT_ID = '55555555-5555-4555-8555-555555555555'
const NOTE_EMAIL = 'cliente@empresa.com.br'
const MEGABYTE = 1024 * 1024

const CONFIG = {
  alertIntervalMinutes: 60,
  alertMaxCount: 24,
  alertMode: 'off',
  attachmentKind: 'pdf',
  driverReplyChannel: 'app_chat',
  driverReplyTemplate: '',
  driverReplyWindowClosedAction: 'fallback_app_chat',
  forwardEmailBody: 'Segue o boleto com o novo vencimento.',
  forwardEmailSubject: 'Boleto prorrogado',
  forwardToInformedEmail: 'manual',
  forwardToNoteRecipient: 'manual',
  mode: 'forward_after_approval',
  version: 1,
  waitHours: 6,
}

type World = {
  attachmentSize?: number
  config?: unknown
  deliveries: Array<RecordContractorReplyEmailDeliveryParams & { id: string }>
  mails: RecordContractorReplyMailParams[]
  noteEmail?: null | string
  readiness?: 'missing' | 'ok' | 'unverified'
  replyAttachmentId?: null | string
  replyExists?: boolean
  sentCount?: number
  threadId?: string | undefined
}

function build(world: Partial<World> = {}) {
  const state: World = { deliveries: [], mails: [], ...world }
  const logs: Array<Record<string, unknown>> = []
  const transaction: ContractorReplyEmailTransactionPort = {
    countEmailDeliveries: async () => state.sentCount ?? 0,
    findAttachment: async () =>
      state.attachmentSize === -1 ? null : { sizeBytes: state.attachmentSize ?? MEGABYTE },
    findCarrierName: async () => 'Transportadora Teste',
    findDeliveryByKey: async ({ idempotencyKey }) => {
      const found = state.deliveries.find((delivery) => delivery.idempotencyKey === idempotencyKey)
      return found === undefined
        ? null
        : ({
            address: found.address,
            attachmentId: found.attachmentId,
            id: found.id,
            reason: found.reason,
            status: found.status,
          } satisfies ContractorReplyEmailDeliveryRecord)
    },
    findMailSettings: async () =>
      state.readiness === 'missing'
        ? undefined
        : {
            id: 'settings-1',
            secretEnvelope: {},
            senderAddress: 'envio@transportadora.com.br',
            sendingVerifiedAt: state.readiness === 'unverified' ? null : new Date(),
          },
    findNoteRecipientEmail: async () =>
      state.noteEmail === undefined ? NOTE_EMAIL : state.noteEmail,
    findOccurrenceThreadId: async () => ('threadId' in state ? state.threadId : 'thread-1'),
    lockReply: async () =>
      state.replyExists === false
        ? null
        : {
            config: state.config ?? CONFIG,
            id: 'reply-1',
            occurrenceKind: 'document',
            replyAttachmentId:
              state.replyAttachmentId === undefined ? ATTACHMENT_ID : state.replyAttachmentId,
          },
    recordDelivery: async (params) => {
      const id = `delivery-${state.deliveries.length + 1}`
      state.deliveries.push({ ...params, id })
      return { id }
    },
    recordMail: async (params) => {
      state.mails.push({ ...params })
      return { messageId: `mail-${state.mails.length}` }
    },
  }
  const useCase = createForwardContractorReplyByEmailUseCase({
    logger: { info: (_event, fields) => void logs.push({ ...fields }) },
    unitOfWork: { execute: (operation) => operation(transaction) },
  })
  return { logs, state, useCase }
}

const NOTE_INPUT: ForwardContractorReplyByEmailInput = {
  actorUserId: ACTOR_ID,
  companyId: COMPANY_ID,
  correlationId: 'correlation-1',
  idempotencyKey: 'key-1',
  occurrenceId: OCCURRENCE_ID,
  target: 'note_recipient_email',
}

const INFORMED_INPUT: ForwardContractorReplyByEmailInput = {
  ...NOTE_INPUT,
  address: 'financeiro@cliente.com.br',
  target: 'informed_email',
}

describe('o endereço informado é um endereço só (spec 248 RF11)', () => {
  test.each([
    ['vazio', ''],
    ['só espaços', '   '],
    ['dois endereços', 'a@b.com,c@d.com'],
    ['ponto e vírgula', 'a@b.com;c@d.com'],
    ['cabeçalho Bcc', 'x@y.com\r\nBcc: z@w.com'],
    ['quebra de linha', 'x@y.com\nz@w.com'],
    ['nome com colchetes', 'Fulano <a@b.com>'],
    ['sem arroba', 'fulano.empresa.com'],
    ['acima de 254', `${'a'.repeat(250)}@b.com`],
  ])('recusa %s', (_label, address) => {
    expect(parseContractorReplyEmailAddress(address)).toBeNull()
  })

  test('aceita um endereço e tira as bordas em branco', () => {
    expect(parseContractorReplyEmailAddress('  financeiro@cliente.com.br ')).toBe(
      'financeiro@cliente.com.br',
    )
  })

  test.each(['a@b.com,c@d.com', 'x@y.com\r\nBcc: z@w.com', ''])(
    'o caso de uso recusa %j e nada sai',
    async (address) => {
      const { state, useCase } = build()
      await expect(useCase.forward({ ...INFORMED_INPUT, address })).rejects.toBeInstanceOf(
        ContractorReplyEmailAddressInvalidError,
      )
      expect(state.mails).toEqual([])
      expect(state.deliveries).toEqual([])
    },
  )
})

describe('enviar o boleto ao cliente da nota (spec 248 RF10)', () => {
  test('usa o endereço da nota, o PDF escolhido e o texto da cópia do retorno', async () => {
    const { state, useCase } = build()
    const outcome = await useCase.forward({ ...NOTE_INPUT, attachmentId: OTHER_ATTACHMENT_ID })
    expect(outcome).toEqual({
      addressMasked: 'c***@e***.com.br',
      deliveryId: 'delivery-1',
      kind: 'queued',
    })
    expect(state.mails).toHaveLength(1)
    expect(state.mails[0]).toMatchObject({
      actorUserId: ACTOR_ID,
      companyId: COMPANY_ID,
      fromAddress: 'envio@transportadora.com.br',
      subject: 'Boleto prorrogado',
      threadId: 'thread-1',
      toAddress: NOTE_EMAIL,
    })
    expect(state.mails[0]?.bodyText).toContain('Segue o boleto com o novo vencimento.')
    expect(state.mails[0]?.bodyText).toContain('Transportadora Teste')
    expect(state.deliveries[0]).toMatchObject({
      address: NOTE_EMAIL,
      attachmentId: OTHER_ATTACHMENT_ID,
      mailMessageId: 'mail-1',
      status: 'queued',
      target: 'note_recipient_email',
    })
  })

  test('sem anexo escolhido vale o anexo aceito do retorno', async () => {
    const { state, useCase } = build()
    await useCase.forward(NOTE_INPUT)
    expect(state.deliveries[0]?.attachmentId).toBe(ATTACHMENT_ID)
  })

  test('nota sem e-mail vira skipped, nada sai e nenhum outro endereço é usado', async () => {
    const { state, useCase } = build({ noteEmail: null })
    const outcome = await useCase.forward(NOTE_INPUT)
    expect(outcome).toEqual({
      deliveryId: 'delivery-1',
      kind: 'skipped',
      reason: 'note_without_recipient_email',
    })
    expect(state.mails).toEqual([])
    expect(state.deliveries[0]).toMatchObject({
      address: null,
      status: 'skipped',
      target: 'note_recipient_email',
    })
  })

  test('nota com e-mail malformado também vira skipped em vez de ir a outro lugar', async () => {
    const { state, useCase } = build({ noteEmail: 'a@b.com,c@d.com' })
    const outcome = await useCase.forward(NOTE_INPUT)
    expect(outcome.kind).toBe('skipped')
    expect(state.mails).toEqual([])
  })

  test('o endereço informado no alvo da nota não é usado', async () => {
    const { state, useCase } = build()
    await useCase.forward({ ...NOTE_INPUT, address: 'outro@lugar.com' })
    expect(state.mails[0]?.toAddress).toBe(NOTE_EMAIL)
  })
})

describe('enviar a um e-mail informado (spec 248 RF11)', () => {
  test('manda ao endereço informado, uma vez, com a entrega gravada', async () => {
    const { state, useCase } = build()
    const outcome = await useCase.forward(INFORMED_INPUT)
    expect(outcome.kind).toBe('queued')
    expect(state.mails.map((mail) => mail.toAddress)).toEqual(['financeiro@cliente.com.br'])
    expect(state.deliveries[0]).toMatchObject({
      address: 'financeiro@cliente.com.br',
      target: 'informed_email',
    })
  })
})

describe('repetir não duplica (spec 248 CA07)', () => {
  test('a mesma chave devolve a mesma entrega e não manda de novo', async () => {
    const { state, useCase } = build()
    await useCase.forward(NOTE_INPUT)
    const repeated = await useCase.forward(NOTE_INPUT)
    expect(repeated).toMatchObject({ deliveryId: 'delivery-1', kind: 'already_queued' })
    expect(state.mails).toHaveLength(1)
    expect(state.deliveries).toHaveLength(1)
  })

  test('chave nova é outro envio', async () => {
    const { state, useCase } = build()
    await useCase.forward(NOTE_INPUT)
    await useCase.forward({ ...NOTE_INPUT, idempotencyKey: 'key-2' })
    expect(state.mails).toHaveLength(2)
  })

  test('a mesma chave com outro anexo ou outro endereço é 409, nunca um envio calado', async () => {
    const { state, useCase } = build()
    await useCase.forward(INFORMED_INPUT)
    await expect(
      useCase.forward({ ...INFORMED_INPUT, attachmentId: OTHER_ATTACHMENT_ID }),
    ).rejects.toBeInstanceOf(OccurrenceConversationIdempotencyKeyReusedError)
    await expect(
      useCase.forward({ ...INFORMED_INPUT, address: 'outro@cliente.com.br' }),
    ).rejects.toBeInstanceOf(OccurrenceConversationIdempotencyKeyReusedError)
    expect(state.mails).toHaveLength(1)
  })

  test('a chave de um alvo não repete o outro', async () => {
    const { state, useCase } = build()
    await useCase.forward(NOTE_INPUT)
    await useCase.forward({ ...INFORMED_INPUT })
    expect(state.mails).toHaveLength(2)
  })
})

describe('limites e recusas', () => {
  test('o quinto envio passa e o sexto é recusado', async () => {
    const fifth = build({ sentCount: 4 })
    expect((await fifth.useCase.forward(NOTE_INPUT)).kind).toBe('queued')
    const sixth = build({ sentCount: 5 })
    await expect(sixth.useCase.forward(NOTE_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailLimitReachedError,
    )
    expect(sixth.state.mails).toEqual([])
  })

  test('PDF acima de 10 MB falha com o motivo e nada sai', async () => {
    const { state, useCase } = build({ attachmentSize: 10 * MEGABYTE + 1 })
    expect(await useCase.forward(NOTE_INPUT)).toEqual({
      deliveryId: 'delivery-1',
      kind: 'failed',
      reason: 'attachment_too_large_for_email',
    })
    expect(state.mails).toEqual([])
    expect(state.deliveries[0]).toMatchObject({ status: 'failed' })
  })

  test('exatamente 10 MB ainda sai', async () => {
    const { useCase } = build({ attachmentSize: 10 * MEGABYTE })
    expect((await useCase.forward(NOTE_INPUT)).kind).toBe('queued')
  })

  test('alvo desligado na cópia do retorno, ou sem o texto do e-mail, é recusado', async () => {
    const off = build({ config: { ...CONFIG, forwardToNoteRecipient: 'off' } })
    await expect(off.useCase.forward(NOTE_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailForwardDisabledError,
    )
    const noBody = build({ config: { ...CONFIG, forwardEmailBody: '  ' } })
    await expect(noBody.useCase.forward(NOTE_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailForwardDisabledError,
    )
    const informedOff = build({ config: { ...CONFIG, forwardToInformedEmail: 'off' } })
    await expect(informedOff.useCase.forward(INFORMED_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailForwardDisabledError,
    )
    const broken = build({ config: { version: 1 } })
    await expect(broken.useCase.forward(NOTE_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailForwardDisabledError,
    )
  })

  test('sem retorno é 404; sem anexo, ou anexo de fora, é 404 próprio', async () => {
    const noReply = build({ replyExists: false })
    await expect(noReply.useCase.forward(NOTE_INPUT)).rejects.toBeInstanceOf(
      TripOccurrenceNotFoundError,
    )
    const noAttachment = build({ replyAttachmentId: null })
    await expect(noAttachment.useCase.forward(NOTE_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailAttachmentNotFoundError,
    )
    const foreign = build({ attachmentSize: -1 })
    await expect(foreign.useCase.forward(NOTE_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailAttachmentNotFoundError,
    )
    expect(foreign.state.mails).toEqual([])
  })

  test('e-mail da empresa não pronto não grava nada', async () => {
    const missing = build({ readiness: 'missing' })
    await expect(missing.useCase.forward(NOTE_INPUT)).rejects.toBeInstanceOf(
      ContractorMailNotConfiguredError,
    )
    const unverified = build({ readiness: 'unverified' })
    await expect(unverified.useCase.forward(NOTE_INPUT)).rejects.toBeInstanceOf(
      ContractorMailSendingNotVerifiedError,
    )
    expect(unverified.state.deliveries).toEqual([])
  })
})

describe('o endereço nunca sai em claro (spec 248 CA08)', () => {
  test('o log leva só a forma mascarada', async () => {
    const { logs, useCase } = build()
    await useCase.forward(INFORMED_INPUT)
    expect(logs).toHaveLength(1)
    const serialized = JSON.stringify(logs)
    expect(serialized).not.toContain('financeiro@cliente.com.br')
    expect(serialized).not.toContain('cliente.com.br')
    expect(serialized).toContain('f***@c***.com.br')
  })

  test('a resposta de uma entrega repetida também só leva a máscara', async () => {
    const { useCase } = build()
    await useCase.forward(INFORMED_INPUT)
    const repeated = await useCase.forward(INFORMED_INPUT)
    expect(JSON.stringify(repeated)).not.toContain('financeiro@cliente.com.br')
  })
})
