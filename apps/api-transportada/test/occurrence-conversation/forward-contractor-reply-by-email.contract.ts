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
  type ForwardContractorReplyToClientInput,
} from '../../src/occurrence-conversation/application/forward-contractor-reply-by-email.use-case.js'
import { parseContractorReplyEmailAddress } from '../../src/occurrence-conversation/domain/contractor-reply-email-address.policy.js'
import { DeliveryClientNotFoundError } from '../../src/delivery-clients/domain/delivery-client.error.js'
import type { ClientEmailType } from '../../src/shared/delivery-client-email.constant.js'
import { OccurrenceClientEmailOffError } from '../../src/trips/domain/occurrence-client-email.error.js'
import {
  ContractorReplyClientTemplateMissingError,
  ContractorReplyClientEmailLimitReachedError,
  ContractorReplyClientEmailNotFoundError,
  ContractorReplyEmailAddressInvalidError,
  ContractorReplyEmailAttachmentNotFoundError,
  ContractorReplyEmailDeliveryNotFoundError,
  ContractorReplyEmailForwardDisabledError,
  ContractorReplyEmailLimitReachedError,
  ContractorReplyEmailRetryNotAllowedError,
} from '../../src/occurrence-conversation/domain/contractor-reply-email.error.js'
import { OccurrenceConversationIdempotencyKeyReusedError } from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'
import {
  createClientTextsResolver,
  type ClientTextsTemplate,
} from '../fixtures/contractor-reply-client-texts.fixture.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OCCURRENCE_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const ATTACHMENT_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_ATTACHMENT_ID = '55555555-5555-4555-8555-555555555555'
const NOTE_EMAIL = 'cliente@empresa.com.br'
const CLIENT_TAX_ID = '12345678000199'
const EMAIL_FINANCE_ID = '66666666-6666-4666-8666-666666666666'
const EMAIL_OWNER_ID = '77777777-7777-4777-8777-777777777777'
const CLIENT_EMAILS = [
  { address: 'financeiro@mercado.com.br', id: EMAIL_FINANCE_ID, label: 'financeiro' },
  { address: 'dono@mercado.com.br', id: EMAIL_OWNER_ID, label: 'dono' },
]
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
  /** Spec 279 T3: os e-mails para boleto do cadastro do cliente da nota. */
  clientEmails?: Array<{ address: string; id: string; label: string }>
  /** Spec 279 RF9: o `client_email_type` do tipo da ocorrência (padrão do teste: `boleto`). */
  clientEmailType?: ClientEmailType
  listedPurposes?: string[]
  /** `null`: o destinatário da nota não tem cadastro de cliente de entrega. */
  clientTaxId?: null | string
  savedEmails?: Array<{ address: string; authorKind: string; purpose: string; taxId: string }>
  config?: unknown
  deliveries: Array<RecordContractorReplyEmailDeliveryParams & { id: string }>
  mails: RecordContractorReplyMailParams[]
  noteEmail?: null | string
  readiness?: 'missing' | 'ok' | 'unverified'
  replyAttachmentId?: null | string
  replyExists?: boolean
  sentCount?: number
  /** Spec 286 T3: o modelo do canal escolhido no tipo; ausente, o texto livre antigo. */
  template?: ClientTextsTemplate
  threadId?: string | undefined
}

function build(world: Partial<World> = {}) {
  const state: World = { deliveries: [], mails: [], ...world }
  const logs: Array<Record<string, unknown>> = []
  const transaction: ContractorReplyEmailTransactionPort = {
    countEmailDeliveries: async () => state.sentCount ?? 0,
    findAttachment: async () =>
      state.attachmentSize === -1 ? null : { sizeBytes: state.attachmentSize ?? MEGABYTE },
    /** O layout real (modelo padrão das Notificações) vive na integração; aqui só a marca de que passou por ele. */
    renderMail: async ({ body, subject }) => ({
      hasInlineLogo: true,
      html: `<!-- standard-email -->${body}`,
      subject: subject.trim(),
      text: `${body}\n\n--\nTransportadora Teste`,
    }),
    findDeliveryClientTaxId: async () =>
      state.clientTaxId === undefined ? CLIENT_TAX_ID : state.clientTaxId,
    findDeliveryById: async ({ deliveryId }) => {
      const found = state.deliveries.find((delivery) => delivery.id === deliveryId)
      return found === undefined
        ? null
        : {
            address: found.address,
            attachmentId: found.attachmentId,
            id: found.id,
            reason: found.reason,
            status: found.status,
            target: found.target,
          }
    },
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
    findClientEmailType: async () => state.clientEmailType ?? 'boleto',
    listClientEmails: async ({ purpose }) => {
      state.listedPurposes = [...(state.listedPurposes ?? []), purpose]
      return state.clientEmails ?? []
    },
    saveClientEmail: async ({ address, authorKind, purpose, taxId }) => {
      state.savedEmails = [...(state.savedEmails ?? []), { address, authorKind, purpose, taxId }]
      const id = `email-saved-${state.savedEmails.length}`
      state.clientEmails = [...(state.clientEmails ?? []), { address, id, label: '' }]
      return { id }
    },
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
    resolveClientTexts: createClientTextsResolver(state.template),
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
    /** Spec 286: o e-mail sai no modelo padrão de e-mail, com o logo da empresa inline. */
    expect(state.mails[0]?.bodyHtml).toStartWith('<!-- standard-email -->')
    expect(state.mails[0]?.hasInlineLogo).toBe(true)
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

  test('nota sem e-mail com um endereço informado junto: continua skipped, nunca cai nele', async () => {
    const { state, useCase } = build({ noteEmail: null })
    const outcome = await useCase.forward({ ...NOTE_INPUT, address: 'outro@lugar.com' })
    expect(outcome.kind).toBe('skipped')
    expect(state.mails).toEqual([])
    expect(state.deliveries.map((delivery) => delivery.address)).toEqual([null])
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

const CLIENT_INPUT: ForwardContractorReplyToClientInput = {
  actorUserId: ACTOR_ID,
  authorKind: 'office',
  companyId: COMPANY_ID,
  correlationId: 'correlation-1',
  emailIds: [EMAIL_FINANCE_ID, EMAIL_OWNER_ID],
  idempotencyKey: 'key-1',
  occurrenceId: OCCURRENCE_ID,
  save: false,
}

describe('o boleto aos e-mails do cadastro do cliente (spec 279 T3, D3)', () => {
  test('um e-mail por endereço escolhido, no trilho da 248, com o resultado mascarado', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    const outcome = await useCase.forwardToClient(CLIENT_INPUT)
    expect(outcome).toEqual({
      results: [
        {
          addressMasked: 'f***@m***.com.br',
          deliveryId: 'delivery-1',
          emailId: EMAIL_FINANCE_ID,
          kind: 'queued',
          reason: null,
        },
        {
          addressMasked: 'd***@m***.com.br',
          deliveryId: 'delivery-2',
          emailId: EMAIL_OWNER_ID,
          kind: 'queued',
          reason: null,
        },
      ],
      savedEmailId: null,
    })
    expect(state.mails.map((mail) => mail.toAddress)).toEqual([
      'financeiro@mercado.com.br',
      'dono@mercado.com.br',
    ])
    expect(state.mails[0]).toMatchObject({ subject: 'Boleto prorrogado', threadId: 'thread-1' })
    expect(state.deliveries.map((delivery) => delivery.target)).toEqual([
      'client_boleto_emails',
      'client_boleto_emails',
    ])
    expect(state.deliveries.map((delivery) => delivery.mailMessageId)).toEqual(['mail-1', 'mail-2'])
  })

  test('o mesmo boleto ao mesmo endereço não sai de novo, mesmo com outra chave do cliente', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await useCase.forwardToClient(CLIENT_INPUT)
    const repeated = await useCase.forwardToClient({ ...CLIENT_INPUT, idempotencyKey: 'key-2' })
    expect(repeated.results.map((result) => result.kind)).toEqual([
      'already_queued',
      'already_queued',
    ])
    expect(state.mails).toHaveLength(2)
    expect(JSON.stringify(repeated)).not.toContain('mercado.com.br"')
  })

  test('outro anexo ao mesmo endereço é outro envio', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await useCase.forwardToClient({ ...CLIENT_INPUT, emailIds: [EMAIL_FINANCE_ID] })
    await useCase.forwardToClient({
      ...CLIENT_INPUT,
      attachmentId: OTHER_ATTACHMENT_ID,
      emailIds: [EMAIL_FINANCE_ID],
    })
    expect(state.mails).toHaveLength(2)
  })

  test('emailId de outro cliente, tipo ou empresa responde como inexistente e nada sai', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await expect(
      useCase.forwardToClient({
        ...CLIENT_INPUT,
        emailIds: [EMAIL_FINANCE_ID, '88888888-8888-4888-8888-888888888888'],
      }),
    ).rejects.toBeInstanceOf(ContractorReplyClientEmailNotFoundError)
    expect(state.mails).toEqual([])
    expect(state.deliveries).toEqual([])
  })

  test('destinatário da nota sem cadastro: emailId não existe e guardar não tem onde', async () => {
    const withIds = build({ clientEmails: CLIENT_EMAILS, clientTaxId: null })
    await expect(withIds.useCase.forwardToClient(CLIENT_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyClientEmailNotFoundError,
    )
    const saving = build({ clientTaxId: null })
    await expect(
      saving.useCase.forwardToClient({
        ...CLIENT_INPUT,
        address: 'novo@mercado.com.br',
        emailIds: [],
        save: true,
      }),
    ).rejects.toBeInstanceOf(DeliveryClientNotFoundError)
    expect(saving.state.mails).toEqual([])
  })

  test('endereço novo sem guardar sai e não entra no cadastro', async () => {
    const { state, useCase } = build({ clientTaxId: null })
    const outcome = await useCase.forwardToClient({
      ...CLIENT_INPUT,
      address: ' novo@mercado.com.br ',
      emailIds: [],
    })
    expect(outcome.results).toEqual([expect.objectContaining({ emailId: null, kind: 'queued' })])
    expect(outcome.savedEmailId).toBeNull()
    expect(state.mails.map((mail) => mail.toAddress)).toEqual(['novo@mercado.com.br'])
    expect(state.savedEmails).toBeUndefined()
  })

  test('endereço novo com save entra no cadastro com o autor e sai com o id guardado', async () => {
    const { state, useCase } = build({ clientEmails: [] })
    const outcome = await useCase.forwardToClient({
      ...CLIENT_INPUT,
      address: 'novo@mercado.com.br',
      authorKind: 'driver',
      emailIds: [],
      save: true,
    })
    expect(state.savedEmails).toEqual([
      {
        address: 'novo@mercado.com.br',
        authorKind: 'driver',
        purpose: 'boleto',
        taxId: CLIENT_TAX_ID,
      },
    ])
    expect(outcome.savedEmailId).toBe('email-saved-1')
    expect(outcome.results[0]).toMatchObject({ emailId: 'email-saved-1', kind: 'queued' })
  })

  test('endereço já guardado (outra caixa) não duplica, e não sai duas vezes', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    const outcome = await useCase.forwardToClient({
      ...CLIENT_INPUT,
      address: 'FINANCEIRO@mercado.com.br',
      emailIds: [EMAIL_FINANCE_ID],
      save: true,
    })
    expect(state.savedEmails).toBeUndefined()
    expect(outcome.savedEmailId).toBe(EMAIL_FINANCE_ID)
    expect(outcome.results).toHaveLength(1)
    expect(state.mails).toHaveLength(1)
  })

  test('guardar o 11º e-mail do tipo é recusado e nada sai (D2)', async () => {
    const full = Array.from({ length: 10 }, (_, index) => ({
      address: `c${index}@mercado.com.br`,
      id: `email-${index}`,
      label: '',
    }))
    const { state, useCase } = build({ clientEmails: full })
    await expect(
      useCase.forwardToClient({
        ...CLIENT_INPUT,
        address: 'novo@mercado.com.br',
        emailIds: [],
        save: true,
      }),
    ).rejects.toBeInstanceOf(ContractorReplyClientEmailLimitReachedError)
    expect(state.mails).toEqual([])
  })

  test('endereço novo inválido é recusado antes da transação', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await expect(
      useCase.forwardToClient({ ...CLIENT_INPUT, address: 'a@b.com\r\nBcc: c@d.com' }),
    ).rejects.toBeInstanceOf(ContractorReplyEmailAddressInvalidError)
    expect(state.mails).toEqual([])
  })

  test('o teto de cinco por ocorrência conta o pedido inteiro: nada sai se não couber', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS, sentCount: 4 })
    await expect(useCase.forwardToClient(CLIENT_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailLimitReachedError,
    )
    expect(state.mails).toEqual([])
    expect(state.deliveries).toEqual([])
  })

  test('tipo da ocorrência com client_email_type off: 409 e nada sai (RF9)', async () => {
    const { state, useCase } = build({ clientEmailType: 'off', clientEmails: CLIENT_EMAILS })
    await expect(useCase.forwardToClient(CLIENT_INPUT)).rejects.toBeInstanceOf(
      OccurrenceClientEmailOffError,
    )
    expect(state.mails).toEqual([])
    expect(state.deliveries).toEqual([])
  })

  test('o tipo de e-mail do cliente vem do tipo da ocorrência, na leitura e no cadastro', async () => {
    const { state, useCase } = build({ clientEmailType: 'finance', clientEmails: [] })
    await useCase.forwardToClient({
      ...CLIENT_INPUT,
      address: 'contas@mercado.com.br',
      emailIds: [],
      save: true,
    })
    expect(state.listedPurposes).toEqual(['finance'])
    expect(state.savedEmails?.map((email) => email.purpose)).toEqual(['finance'])
  })

  test('com os encaminhamentos da 248 desligados, o tipo ligado ainda envia (RF9 manda)', async () => {
    const { state, useCase } = build({
      clientEmails: CLIENT_EMAILS,
      config: { ...CONFIG, forwardToInformedEmail: 'off', forwardToNoteRecipient: 'off' },
    })
    await useCase.forwardToClient(CLIENT_INPUT)
    expect(state.mails).toHaveLength(2)
  })

  test('spec 286 T3: com modelo escolhido no tipo, o e-mail sai com o assunto e o corpo dele', async () => {
    const { state, useCase } = build({
      clientEmails: CLIENT_EMAILS,
      template: { email: { body: 'Boleto da NF 123/1 em anexo.', subject: 'Seu boleto' } },
    })
    await useCase.forwardToClient(CLIENT_INPUT)
    expect(state.mails[0]?.subject).toBe('Seu boleto')
    expect(state.mails[0]?.bodyText).toContain('Boleto da NF 123/1 em anexo.')
    expect(state.mails[0]?.bodyText).not.toContain('Segue o boleto com o novo vencimento.')
  })

  test('spec 286 T3: modelo escolhido que não serve recusa com 409 e nada sai', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS, template: 'missing' })
    await expect(useCase.forwardToClient(CLIENT_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyClientTemplateMissingError,
    )
    await expect(useCase.forward(NOTE_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyClientTemplateMissingError,
    )
    expect(state.mails).toEqual([])
    expect(state.deliveries).toEqual([])
  })

  test('sem o texto do e-mail na cópia do retorno, nada sai (248)', async () => {
    const { state, useCase } = build({
      clientEmails: CLIENT_EMAILS,
      config: { ...CONFIG, forwardEmailBody: '' },
    })
    await expect(useCase.forwardToClient(CLIENT_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailForwardDisabledError,
    )
    expect(state.mails).toEqual([])
  })

  test('PDF acima do limite do e-mail falha por endereço sem sair', async () => {
    const { state, useCase } = build({ attachmentSize: 11 * MEGABYTE, clientEmails: CLIENT_EMAILS })
    const outcome = await useCase.forwardToClient(CLIENT_INPUT)
    expect(outcome.results.map((result) => [result.kind, result.reason])).toEqual([
      ['failed', 'attachment_too_large_for_email'],
      ['failed', 'attachment_too_large_for_email'],
    ])
    expect(state.mails).toEqual([])
  })

  test('o log leva só endereços mascarados', async () => {
    const { logs, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await useCase.forwardToClient({
      ...CLIENT_INPUT,
      address: 'novo@mercado.com.br',
      save: true,
    })
    const serialized = JSON.stringify(logs)
    expect(serialized).not.toContain('mercado.com.br"')
    expect(serialized).not.toContain('financeiro@')
    expect(serialized).not.toContain('novo@')
    expect(serialized).toContain('f***@m***.com.br')
  })
})

const RETRY_INPUT = {
  actorUserId: ACTOR_ID,
  authorKind: 'office',
  companyId: COMPANY_ID,
  correlationId: 'correlation-2',
  deliveryId: 'delivery-1',
  occurrenceId: OCCURRENCE_ID,
} as const

/** O provedor recusou a primeira entrega: é o que o worker grava em `markMessageFailed`. */
function refuseFirstDelivery(state: World): void {
  const [first] = state.deliveries
  if (first === undefined) throw new Error('EXPECTED_DELIVERY')
  state.deliveries[0] = { ...first, reason: 'send_failed', status: 'failed' }
}

describe('Tentar de novo uma entrega recusada pelo provedor (spec 279 T6b, RF12)', () => {
  test('a recusa ganha chave nova: sai de novo ao mesmo endereço, e só ele', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await useCase.forwardToClient(CLIENT_INPUT)
    refuseFirstDelivery(state)
    const outcome = await useCase.retryToClient(RETRY_INPUT)
    expect(outcome.results).toEqual([
      {
        addressMasked: 'f***@m***.com.br',
        deliveryId: 'delivery-3',
        emailId: null,
        kind: 'queued',
        reason: null,
      },
    ])
    expect(state.mails.map((mail) => mail.toAddress)).toEqual([
      'financeiro@mercado.com.br',
      'dono@mercado.com.br',
      'financeiro@mercado.com.br',
    ])
    const keys = state.deliveries.map((delivery) => delivery.idempotencyKey)
    expect(new Set(keys).size).toBe(3)
    expect(state.deliveries[2]).toMatchObject({
      address: 'financeiro@mercado.com.br',
      attachmentId: ATTACHMENT_ID,
      target: 'client_boleto_emails',
    })
  })

  test('o clique repetido no mesmo "Tentar de novo" não duplica', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await useCase.forwardToClient(CLIENT_INPUT)
    refuseFirstDelivery(state)
    await useCase.retryToClient(RETRY_INPUT)
    const repeated = await useCase.retryToClient(RETRY_INPUT)
    expect(repeated.results.map((result) => result.kind)).toEqual(['already_queued'])
    expect(state.mails).toHaveLength(3)
  })

  test('um novo envio ao endereço recusado devolve a última tentativa, sem sair', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await useCase.forwardToClient({ ...CLIENT_INPUT, emailIds: [EMAIL_FINANCE_ID] })
    refuseFirstDelivery(state)
    const again = await useCase.forwardToClient({
      ...CLIENT_INPUT,
      emailIds: [EMAIL_FINANCE_ID],
      idempotencyKey: 'key-2',
    })
    expect(again.results.map((result) => [result.kind, result.reason])).toEqual([
      ['failed', 'send_failed'],
    ])
    expect(state.mails).toHaveLength(1)
  })

  test('a recusa seguinte também pode ser tentada de novo, até o teto de tentativas', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await useCase.forwardToClient({ ...CLIENT_INPUT, emailIds: [EMAIL_FINANCE_ID] })
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const last = state.deliveries.at(-1)
      if (last === undefined) throw new Error('EXPECTED_DELIVERY')
      state.deliveries[state.deliveries.length - 1] = {
        ...last,
        reason: 'send_failed',
        status: 'failed',
      }
      const retried = await useCase.retryToClient({ ...RETRY_INPUT, deliveryId: last.id })
      expect(retried.results.map((result) => result.kind)).toEqual(['queued'])
    }
    const last = state.deliveries.at(-1)
    if (last === undefined) throw new Error('EXPECTED_DELIVERY')
    state.deliveries[state.deliveries.length - 1] = {
      ...last,
      reason: 'send_failed',
      status: 'failed',
    }
    await expect(
      useCase.retryToClient({ ...RETRY_INPUT, deliveryId: last.id }),
    ).rejects.toBeInstanceOf(ContractorReplyEmailLimitReachedError)
  })

  test('a entrega que já saiu pode ser reenviada, com chave nova e sem repetir enquanto a nova está na fila (spec 286 Q4)', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await useCase.forwardToClient(CLIENT_INPUT)
    const [first] = state.deliveries
    if (first === undefined) throw new Error('EXPECTED_DELIVERY')
    state.deliveries[0] = { ...first, status: 'sent' }

    const resent = await useCase.retryToClient(RETRY_INPUT)
    expect(resent.results.map((result) => result.kind)).toEqual(['queued'])
    expect(state.deliveries).toHaveLength(3)
    expect(new Set(state.deliveries.map((delivery) => delivery.idempotencyKey)).size).toBe(3)

    const repeated = await useCase.retryToClient(RETRY_INPUT)
    expect(repeated.results.map((result) => result.kind)).toEqual(['already_queued'])
    expect(state.deliveries).toHaveLength(3)
  })

  test('só a entrega recusada pelo provedor tenta de novo', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await useCase.forwardToClient(CLIENT_INPUT)
    await expect(useCase.retryToClient(RETRY_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailRetryNotAllowedError,
    )
    const [first] = state.deliveries
    if (first === undefined) throw new Error('EXPECTED_DELIVERY')
    state.deliveries[0] = { ...first, reason: 'attachment_too_large_for_email', status: 'failed' }
    await expect(useCase.retryToClient(RETRY_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailRetryNotAllowedError,
    )
    expect(state.mails).toHaveLength(2)
  })

  test('entrega inexistente, de outro alvo ou sem endereço responde como inexistente', async () => {
    const { state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await expect(useCase.retryToClient(RETRY_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailDeliveryNotFoundError,
    )
    await useCase.forward(INFORMED_INPUT)
    refuseFirstDelivery(state)
    await expect(useCase.retryToClient(RETRY_INPUT)).rejects.toBeInstanceOf(
      ContractorReplyEmailDeliveryNotFoundError,
    )
  })

  test('o log e a resposta do "Tentar de novo" levam só a forma mascarada', async () => {
    const { logs, state, useCase } = build({ clientEmails: CLIENT_EMAILS })
    await useCase.forwardToClient(CLIENT_INPUT)
    refuseFirstDelivery(state)
    const outcome = await useCase.retryToClient(RETRY_INPUT)
    expect(JSON.stringify(outcome)).not.toContain('financeiro@')
    expect(JSON.stringify(logs)).not.toContain('financeiro@')
    expect(JSON.stringify(logs)).toContain('f***@m***.com.br')
  })
})
