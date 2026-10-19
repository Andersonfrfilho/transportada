/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T403 (RF7, P4; absorve a 143 T015): o e-mail da conversa com a contratante. A montagem é
 * uma função só, usada pela prévia e pelo envio; o envio grava, numa transação, a conversa (na
 * primeira vez), a thread da 143 com o token de resposta (na primeira vez), a mensagem da 143 com o
 * outbox e a mensagem da conversa `queued` apontando para ela. A segunda mensagem é resposta: mesma
 * conversa, mesma thread.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CarrierIdentity,
  OccurrenceMailHtmlSource,
  OccurrenceMailTarget,
  OccurrenceMailTransactionPort,
  RecordContractorReplyResendOutcome,
  RecordOccurrenceMailInput,
  SendOccurrenceMailResult,
} from '../../src/occurrence-conversation/application/occurrence-mail.port.js'
import {
  ContractorReplyNotResendableError,
  ContractorReplyResendTooSoonError,
  OccurrenceMailTemplateMissingError,
} from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import type { StoredContractorReplyConfiguration } from '../../src/occurrence-conversation/application/occurrence-mail.port.js'
import type { ConversationUploadTarget } from '../../src/occurrence-conversation/application/conversation-attachment.port.js'
import type { OccurrenceOwnerReader } from '../../src/occurrence-conversation/application/occurrence-owner-reader.port.js'
import { htmlToPlainText } from '../../src/occurrence-conversation/domain/occurrence-mail-plain-text.policy.js'
import { composeOccurrenceMailHtml } from '../../src/occurrence-conversation/domain/occurrence-mail-html-compose.policy.js'
import { createPreviewOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/preview-occurrence-mail.use-case.js'
import { createSendOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import { buildOccurrenceMail } from '../../src/occurrence-conversation/domain/occurrence-mail.template.js'
import type { OccurrenceWatcherCandidate } from '../../src/contractor-mail/domain/occurrence-watcher.policy.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000183401'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000183402'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000183403'
const ACTOR_ID = '00000000-0000-4000-8000-000000183404'
const NOW = new Date('2026-09-24T18:00:00.000Z')
const PDF = new TextEncoder().encode('%PDF-1.7 nota de devolução')
const UPLOAD_A = '00000000-0000-4000-8000-0000001834a1'
const UPLOAD_B = '00000000-0000-4000-8000-0000001834a2'

/** Spec 271: o modelo do módulo de notificação que o tipo escolheu, a versão ativa no envio. */
const EFFECTIVE_TEMPLATE = { key: 'ocorrencia.padrao', version: 3 } as const

const CARRIER_IDENTITY: CarrierIdentity = {
  city: 'Ribeirão Preto',
  cnpj: '11444777000161',
  displayName: 'Transportadora Sintética',
  hasLogo: false,
  legalName: 'Transportadora Sintética Ltda',
  state: 'SP',
}
const OPERATOR_SIGNER = { jobTitle: 'Operação', name: 'Operadora Lima' } as const
/** Spec 272 D7: o prefixo que o assunto de toda mensagem de ocorrência passa a ter. */
const SUBJECT_PREFIX = 'Transportadora Sintética · CNPJ 11.444.777/0001-61 — '

const TARGET: OccurrenceMailTarget = {
  contractorId: CONTRACTOR_ID,
  contractorName: 'Contratante Alfa',
  contractorTaxId: '11222333000181',
  kind: 'document',
  occurrenceTypeId: '00000000-0000-4000-8000-000000271401',
  stage: 'delivery',
}

type FakeState = {
  calls: string[]
  conversations: { id: string; publicRef: string }[]
  conversationMessages: Parameters<OccurrenceMailTransactionPort['recordConversationMessage']>[0][]
  htmlSourceReads: string[]
  idempotency: Map<string, { fingerprint: string; response: SendOccurrenceMailResult }>
  mails: RecordOccurrenceMailInput[]
  openedReplies: Parameters<OccurrenceMailTransactionPort['openContractorReply']>[0][]
  replyReads: string[]
  resendCalls: Parameters<OccurrenceMailTransactionPort['recordContractorReplyResend']>[0][]
  threadId: string | undefined
  watcherTypeIds: (null | string | undefined)[]
}

function createFake(
  overrides: Partial<{
    appBaseUrl: string
    carrier: CarrierIdentity | undefined
    chosenRecipientIds: readonly string[]
    contacts: readonly { email: string; id: string }[]
    /** Spec 272 D6: o dono da 273 injetado na porta; ausente, a porta nula. */
    ownerReader: OccurrenceOwnerReader
    /** Spec 272: o modelo HTML e os valores da nota; ausente é modelo de texto. */
    htmlSource: OccurrenceMailHtmlSource
    /** Spec 271: o modelo do tipo no módulo de notificação; `null` é sem modelo utilizável. */
    effectiveTemplate: null | typeof EFFECTIVE_TEMPLATE
    /** Spec 271: o modelo da primeira mensagem de e-mail da ocorrência (reenvio do retorno). */
    originalTemplate: null | typeof EFFECTIVE_TEMPLATE
    logger: {
      info?: (event: string, fields?: Record<string, unknown>) => void
      warn: (event: string, fields?: Record<string, unknown>) => void
    }
    /** Spec 267/271: as listas de responsáveis, já com o endereço resolvido. */
    watchers: {
      company?: readonly OccurrenceWatcherCandidate[]
      contractor?: readonly OccurrenceWatcherCandidate[]
      type?: readonly OccurrenceWatcherCandidate[]
    }
    replyConfiguration: StoredContractorReplyConfiguration | null
    /** Spec 268: o modo sandbox do ambiente (`CONTRACTOR_MAIL_SANDBOX_SMTP`), ausente em produção. */
    sandbox: { readonly fromAddress: string }
    resendOutcome: RecordContractorReplyResendOutcome
    settings: Awaited<ReturnType<OccurrenceMailTransactionPort['findMailSettings']>>
    target: OccurrenceMailTarget | null
    /** Spec 183 T702e: o tamanho de cada objeto subido, pelo `head()`. */
    uploadBytes: number
  }> = {},
) {
  const uploadBytes = overrides.uploadBytes ?? PDF.byteLength
  const locked: { ids: readonly string[]; target: ConversationUploadTarget }[] = []
  const attached: { messageId: string; uploadId: string }[] = []
  const state: FakeState = {
    calls: [],
    conversationMessages: [],
    conversations: [],
    htmlSourceReads: [],
    idempotency: new Map(),
    mails: [],
    openedReplies: [],
    replyReads: [],
    resendCalls: [],
    threadId: undefined,
    watcherTypeIds: [],
  }
  const transaction: OccurrenceMailTransactionPort = {
    attachments: {
      attachUpload: async (params) => void attached.push(params),
      lockPendingUploads: async (params) => {
        locked.push(params)
        return params.ids.map((id) => ({
          bucket: 'bucket-test',
          declaredContentType: 'application/pdf',
          expiresAt: new Date(NOW.getTime() + 60_000),
          fileName: 'nota.pdf',
          id,
          objectKey: `key-${id}`,
        }))
      },
    },
    async listOccurrenceRecipients() {
      return []
    },
    async findChosenOccurrenceRecipientIds() {
      return overrides.chosenRecipientIds ?? []
    },
    async loadWatcherCandidates(params) {
      state.watcherTypeIds.push(params.occurrenceTypeId)
      return {
        company: overrides.watchers?.company ?? [],
        contractor: overrides.watchers?.contractor ?? [],
        type: overrides.watchers?.type ?? [],
      }
    },
    async findContractorReplyConfiguration({ occurrenceId }) {
      state.replyReads.push(occurrenceId)
      return overrides.replyConfiguration ?? null
    },
    async openContractorReply(params) {
      state.openedReplies.push(params)
    },
    async recordContractorReplyResend(params) {
      state.resendCalls.push(params)
      return overrides.resendOutcome ?? 'recorded'
    },
    async findCarrierIdentity() {
      return 'carrier' in overrides ? overrides.carrier : CARRIER_IDENTITY
    },
    async findOperatorSigner() {
      return OPERATOR_SIGNER
    },
    async findOccurrenceMailHtmlSource(params) {
      state.htmlSourceReads.push(params.templateKey)
      return overrides.htmlSource ?? null
    },
    async findOccurrenceNotificationTemplate() {
      const template =
        'effectiveTemplate' in overrides ? overrides.effectiveTemplate : EFFECTIVE_TEMPLATE
      return template ?? null
    },
    async findOriginalOccurrenceNotificationTemplate() {
      return overrides.originalTemplate ?? null
    },
    async findIdempotency({ idempotencyKey }) {
      return state.idempotency.get(idempotencyKey) ?? null
    },
    async findMailSettings() {
      return 'settings' in overrides
        ? overrides.settings
        : {
            id: 'settings-1',
            secretEnvelope: {},
            senderAddress: 'ocorrencias@transportadora.example.test',
            sendingVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
          }
    },
    async findOccurrenceContacts({ contactIds }) {
      const contacts = overrides.contacts ?? [
        { email: 'compras@alfa.example.test', id: 'contact-1' },
        { email: 'Fiscal@Alfa.example.test', id: 'contact-2' },
      ]
      return contacts.filter((contact) => contactIds.includes(contact.id))
    },
    async findOccurrenceTarget() {
      return 'target' in overrides ? (overrides.target ?? null) : TARGET
    },
    async findOccurrenceThread() {
      state.calls.push('findOccurrenceThread')
      return state.threadId === undefined ? undefined : { id: state.threadId }
    },
    async lockOccurrenceThread(params) {
      state.calls.push(`lock:${params.companyId}:${params.occurrenceKind}:${params.occurrenceId}`)
    },
    async findOrCreateContractorConversation({ publicRef }) {
      const existing = state.conversations[0]
      if (existing !== undefined) return { id: existing.id }
      const created = { id: 'conversation-1', publicRef }
      state.conversations.push(created)
      return { id: created.id }
    },
    async recordConversationMessage(params) {
      state.conversationMessages.push(params)
      return { id: `conversation-message-${state.conversationMessages.length}` }
    },
    async recordMail(params) {
      state.mails.push(params)
      if (params.createThread) state.threadId = params.threadId
      return { messageId: `mail-message-${state.mails.length}` }
    },
    async saveIdempotency({ fingerprint, idempotencyKey, response }) {
      state.idempotency.set(idempotencyKey, { fingerprint, response })
    },
  }
  const decryptCalls: string[] = []
  const useCase = createSendOccurrenceMailUseCase({
    ...(overrides.appBaseUrl === undefined ? {} : { appBaseUrl: overrides.appBaseUrl }),
    ...(overrides.ownerReader === undefined ? {} : { ownerReader: overrides.ownerReader }),
    ...(overrides.sandbox === undefined ? {} : { contractorMailSandbox: overrides.sandbox }),
    ...(overrides.logger === undefined ? {} : { logger: overrides.logger }),
    fingerprintService: {
      create: async ({ fields }) =>
        fields.map((field) => new TextDecoder().decode(field)).join('|'),
    },
    now: () => NOW,
    secretService: {
      decrypt: async () => {
        decryptCalls.push('decrypt')
        return { apiKey: 're_test', replyTokenSecret: 'a'.repeat(64) }
      },
    } as never,
    storage: {
      createSignedDownload: async ({ key }) => new URL(`https://s3.test/${key}`),
      createSignedUpload: async ({ key }) => new URL(`https://s3.test/${key}?upload`),
      getObjectStream: async () => new Blob([PDF]).stream(),
      deleteObject: async () => undefined,
      headObject: async () => ({ contentLength: uploadBytes }),
      storeObject: async () => undefined,
    },
    unitOfWork: { execute: (operation) => operation(transaction) },
  })
  return { attached, decryptCalls, locked, state, useCase }
}

function input(
  overrides: Partial<Parameters<ReturnType<typeof createFake>['useCase']['send']>[0]> = {},
) {
  return {
    actorUserId: ACTOR_ID,
    bodyText: 'Recebedor está cobrando taxa de descarga. Autorizam?',
    companyId: COMPANY_ID,
    contactIds: ['contact-1', 'contact-2'],
    correlationId: 'correlation-1',
    idempotencyKey: 'key-1',
    occurrenceId: OCCURRENCE_ID,
    subject: 'Ocorrência na entrega — NF 4512',
    ...overrides,
  }
}

async function failure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation()
  } catch (error) {
    return error
  }
  throw new Error('EXPECTED_FAILURE')
}

describe('a montagem do e-mail (RF7: a prévia e o envio usam a mesma)', () => {
  test('texto com a mensagem e a assinatura; HTML escapado, em parágrafos', () => {
    const mail = buildOccurrenceMail({
      bodyText: 'Linha <b>um</b>\n\nLinha dois',
      carrierName: 'Transportadora Sintética',
      operatorName: 'Operadora Lima',
      subject: '  Ocorrência NF 4512  ',
    })

    expect(mail.subject).toBe('Ocorrência NF 4512')
    expect(mail.text).toBe(
      'Linha <b>um</b>\n\nLinha dois\n\n--\nOperadora Lima\nTransportadora Sintética',
    )
    expect(mail.html).toContain('<p>Linha &lt;b&gt;um&lt;/b&gt;</p>')
    expect(mail.html).toContain('<p>Linha dois</p>')
    expect(mail.html).not.toContain('<b>')
  })
})

describe('o envio do e-mail da conversa (spec 183 T403)', () => {
  test('a primeira mensagem cria conversa e thread, grava a da 143 e a da conversa, na fila', async () => {
    const { state, useCase } = createFake()

    const result = await useCase.send(input())

    expect(state.conversations).toHaveLength(1)
    expect(state.conversations[0]?.publicRef).toMatch(/^[A-Za-z0-9_-]{22,64}$/u)
    expect(state.mails).toHaveLength(1)
    const [mail] = state.mails
    expect(mail).toMatchObject({
      actorUserId: ACTOR_ID,
      contractorId: CONTRACTOR_ID,
      createThread: true,
      fromAddress: 'ocorrencias@transportadora.example.test',
      occurrenceId: OCCURRENCE_ID,
      occurrenceKind: 'document',
      subject: `${SUBJECT_PREFIX}Ocorrência na entrega — NF 4512`,
      toAddresses: ['compras@alfa.example.test', 'fiscal@alfa.example.test'],
    })
    expect(mail?.replyTokenHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(mail?.bodyText).toContain('Autorizam?')
    expect(state.conversationMessages).toEqual([
      {
        authorUserId: ACTOR_ID,
        bodyText: 'Recebedor está cobrando taxa de descarga. Autorizam?',
        companyId: COMPANY_ID,
        conversationId: 'conversation-1',
        mailMessageId: 'mail-message-1',
        queuedAt: NOW.toISOString(),
      },
    ])
    expect(result).toEqual({
      conversationId: 'conversation-1',
      conversationMessageId: 'conversation-message-1',
      mailMessageId: 'mail-message-1',
      recipientCount: 2,
      threadId: expect.any(String),
    })
    expect(result.threadId).toBe(mail?.threadId ?? 'missing')
  })

  test('a segunda mensagem é resposta: mesma conversa e mesma thread, sem criar outra', async () => {
    const { state, useCase } = createFake()
    const first = await useCase.send(input())

    const second = await useCase.send(
      input({ bodyText: 'Seguimos aguardando.', idempotencyKey: 'key-2' }),
    )

    expect(state.conversations).toHaveLength(1)
    expect(state.mails[1]).toMatchObject({ createThread: false, threadId: first.threadId })
    expect(second.threadId).toBe(first.threadId)
    expect(second.conversationId).toBe(first.conversationId)
  })

  test('a mesma chave com o mesmo pedido devolve a resposta gravada; com outro pedido é 409', async () => {
    const { state, useCase } = createFake()
    const first = await useCase.send(input())

    expect(await useCase.send(input())).toEqual(first)
    expect(state.mails).toHaveLength(1)

    const reused = await failure(() => useCase.send(input({ bodyText: 'Outro texto' })))
    expect(reused).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED',
      status: 409,
    })
  })

  test('ocorrência de outra empresa é 404; sem nota (sem contratante) é 422', async () => {
    expect(await failure(() => createFake({ target: null }).useCase.send(input()))).toBeInstanceOf(
      TripOccurrenceNotFoundError,
    )
    expect(
      await failure(() =>
        createFake({ target: { ...TARGET, contractorId: null } }).useCase.send(input()),
      ),
    ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_CONTRACTOR_UNKNOWN', status: 422 })
  })

  test('contato que não é desta contratante, está inativo ou não recebe ocorrências: 422', async () => {
    const { state, useCase } = createFake()
    const result = await failure(() => useCase.send(input({ contactIds: ['contact-1', 'other'] })))

    expect(result).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_NO_RECIPIENT', status: 422 })
    expect(state.mails).toEqual([])
  })

  test('e-mail de contato com quebra de linha ou vírgula nunca vira destinatário', async () => {
    const { useCase } = createFake({
      contacts: [{ email: 'a@example.test\r\nBcc: x@example.test', id: 'contact-1' }],
    })

    expect(await failure(() => useCase.send(input({ contactIds: ['contact-1'] })))).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_NO_RECIPIENT',
    })
  })

  test('sem configuração de e-mail pronta é o erro da 150; assunto ou mensagem vazios é 422', async () => {
    expect(
      await failure(() => createFake({ settings: undefined }).useCase.send(input())),
    ).toMatchObject({ code: 'CONTRACTOR_MAIL_NOT_CONFIGURED' })
    expect(
      await failure(() => createFake().useCase.send(input({ bodyText: '   ' }))),
    ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_MAIL_INVALID', status: 422 })
    expect(await failure(() => createFake().useCase.send(input({ subject: '' })))).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_MAIL_INVALID',
    })
  })
})

/** Spec 183 T407: os contatos que o diálogo oferece como destinatários. */
const RECIPIENTS = [
  {
    email: 'compras@alfa.example.test',
    id: 'contact-delivery',
    name: 'Maria Souza',
    occurrenceStages: ['separation', 'delivery', 'stop'],
    roleLabel: 'Compras',
    types: ['occurrences', 'approves_charges'],
  },
  {
    email: 'expedicao@alfa.example.test',
    id: 'contact-separation',
    name: '',
    occurrenceStages: ['separation'],
    roleLabel: '',
    types: ['occurrences'],
  },
] as const

describe('a prévia do e-mail (RF7)', () => {
  function createPreview(
    suggested: { bodyText: string; subject: string } | null,
    target: OccurrenceMailTarget = TARGET,
    template: null | typeof EFFECTIVE_TEMPLATE = EFFECTIVE_TEMPLATE,
  ) {
    return createPreviewOccurrenceMailUseCase({
      reader: {
        findCarrierIdentity: async () => CARRIER_IDENTITY,
        findMailSettings: async () => undefined,
        findChosenOccurrenceRecipientIds: async () => [],
        findOccurrenceNotificationTemplate: async () => template,
        findOccurrenceMailHtmlSource: async () => null,
        findOperatorSigner: async () => OPERATOR_SIGNER,
        findOccurrenceTarget: async () => target,
        listOccurrenceRecipients: async () => RECIPIENTS,
        loadWatcherCandidates: async () => ({ company: [], contractor: [] }),
      },
      suggestedMail: { readSuggestedMail: async () => suggested },
    })
  }

  test('sem texto do operador, parte do modelo efetivo da ocorrência (269)', async () => {
    const preview = await createPreview({
      bodyText: 'Ocorrência na NF 4512: cobrança de descarga.',
      subject: 'Ocorrência — NF 4512',
    }).preview({ actorUserId: ACTOR_ID, companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID })

    expect(preview).toEqual({
      ...buildOccurrenceMail({
        bodyText: 'Ocorrência na NF 4512: cobrança de descarga.',
        carrierName: 'Transportadora Sintética',
        operatorName: 'Operadora Lima',
        subject: 'Ocorrência — NF 4512',
      }),
      bodyText: 'Ocorrência na NF 4512: cobrança de descarga.',
      cc: [],
      ccSource: null,
      contractorName: 'Contratante Alfa',
      missingNotificationTemplate: false,
      /** Spec 183 T407: marcado de saída quem recebe ocorrências do grupo desta (RF5). */
      recipients: [
        {
          approvesCharges: true,
          contactId: 'contact-delivery',
          email: 'compras@alfa.example.test',
          name: 'Maria Souza',
          preselected: true,
          roleLabel: 'Compras',
        },
        {
          approvesCharges: false,
          contactId: 'contact-separation',
          email: 'expedicao@alfa.example.test',
          name: '',
          preselected: false,
          roleLabel: '',
        },
      ],
      notificationTemplateKey: EFFECTIVE_TEMPLATE.key,
      suggested: true,
    })
  })

  /** Spec 271 D13: os escolhidos no tipo vêm pré-marcados no lugar da regra da etapa; o operador ainda muda. */
  test('com destinatários escolhidos no tipo, a pré-marcação é a escolha, não a etapa', async () => {
    const preview = await createPreviewOccurrenceMailUseCase({
      reader: {
        findCarrierIdentity: async () => CARRIER_IDENTITY,
        findMailSettings: async () => undefined,
        findChosenOccurrenceRecipientIds: async () => ['contact-separation'],
        findOccurrenceNotificationTemplate: async () => EFFECTIVE_TEMPLATE,
        findOccurrenceTarget: async () => TARGET,
        findOccurrenceMailHtmlSource: async () => null,
        findOperatorSigner: async () => OPERATOR_SIGNER,
        listOccurrenceRecipients: async () => RECIPIENTS,
        loadWatcherCandidates: async () => ({ company: [], contractor: [] }),
      },
      suggestedMail: { readSuggestedMail: async () => null },
    }).preview({ actorUserId: ACTOR_ID, companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID })

    expect(preview.recipients.map((r) => [r.contactId, r.preselected])).toEqual([
      ['contact-delivery', false],
      ['contact-separation', true],
    ])
  })

  test('ocorrência sem contratante casada não oferece destinatário (o envio responde 422)', async () => {
    const preview = await createPreview(null, {
      ...TARGET,
      contractorId: null,
      contractorName: '',
    }).preview({ actorUserId: ACTOR_ID, companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID })

    expect(preview.recipients).toEqual([])
  })

  test('com o texto do operador, é o mesmo e-mail que o envio grava', async () => {
    const preview = await createPreview(null).preview({
      actorUserId: ACTOR_ID,
      bodyText: 'Texto do operador',
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      subject: 'Assunto do operador',
    })

    expect(preview.suggested).toBe(false)
    expect(preview.text).toBe(
      buildOccurrenceMail({
        bodyText: 'Texto do operador',
        carrierName: 'Transportadora Sintética',
        operatorName: 'Operadora Lima',
        subject: 'Assunto do operador',
      }).text,
    )
  })

  test('tipo sem e-mail e sem texto: prévia vazia, para o operador escrever', async () => {
    const preview = await createPreview(null).preview({
      actorUserId: ACTOR_ID,
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
    })

    expect(preview).toMatchObject({ bodyText: '', subject: '', suggested: false })
  })

  /** Spec 269 D4/D8: sem modelo efetivo a prévia sai em branco, com o aviso, e o envio é bloqueado no painel. */
  test('sem modelo efetivo: aviso, sem sugestão e sem modelo', async () => {
    let suggestedReads = 0
    const preview = await createPreviewOccurrenceMailUseCase({
      reader: {
        findCarrierIdentity: async () => CARRIER_IDENTITY,
        findMailSettings: async () => undefined,
        findChosenOccurrenceRecipientIds: async () => [],
        findOccurrenceNotificationTemplate: async () => null,
        findOccurrenceTarget: async () => TARGET,
        findOccurrenceMailHtmlSource: async () => null,
        findOperatorSigner: async () => OPERATOR_SIGNER,
        listOccurrenceRecipients: async () => RECIPIENTS,
        loadWatcherCandidates: async () => ({ company: [], contractor: [] }),
      },
      suggestedMail: {
        readSuggestedMail: async () => {
          suggestedReads += 1
          return { bodyText: 'x', subject: 'y' }
        },
      },
    }).preview({ actorUserId: ACTOR_ID, companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID })

    expect(preview).toMatchObject({
      bodyText: '',
      missingNotificationTemplate: true,
      subject: '',
      notificationTemplateKey: null,
      suggested: false,
    })
    expect(suggestedReads).toBe(0)
  })

  test('o texto do operador não troca o modelo efetivo que a prévia informa', async () => {
    const preview = await createPreview(null).preview({
      actorUserId: ACTOR_ID,
      bodyText: 'Texto do operador',
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      subject: 'Assunto do operador',
    })

    expect(preview).toMatchObject({
      missingNotificationTemplate: false,
      notificationTemplateKey: EFFECTIVE_TEMPLATE.key,
    })
  })

  test('ocorrência sem contratante casada não tem modelo efetivo', async () => {
    const preview = await createPreview(null, {
      ...TARGET,
      contractorId: null,
      contractorName: '',
    }).preview({
      actorUserId: ACTOR_ID,
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
    })

    expect(preview).toMatchObject({
      missingNotificationTemplate: true,
      notificationTemplateKey: null,
    })
  })
})

describe('o modelo do e-mail da ocorrência no envio (spec 271 D9, RF11)', () => {
  test('grava a chave e a versão do modelo que o servidor resolveu, no envio manual', async () => {
    const { state, useCase } = createFake()

    await useCase.send(input())

    expect(state.mails[0]?.notificationTemplate).toEqual(EFFECTIVE_TEMPLATE)
  })

  test('sem modelo efetivo, 409 OCCURRENCE_MAIL_TEMPLATE_MISSING — nem à mão — e nada é gravado', async () => {
    const { state, useCase } = createFake({ effectiveTemplate: null })

    const error = await failure(() => useCase.send(input()))

    expect(error).toBeInstanceOf(OccurrenceMailTemplateMissingError)
    expect(error).toMatchObject({ code: 'OCCURRENCE_MAIL_TEMPLATE_MISSING', status: 409 })
    expect(state.mails).toEqual([])
    expect(state.conversationMessages).toEqual([])
  })

  test('o aviso automático também precisa de modelo efetivo', async () => {
    const { state, useCase } = createFake({ effectiveTemplate: null })

    const error = await failure(() => useCase.send(input({ actorUserId: null, automatic: true })))

    expect(error).toBeInstanceOf(OccurrenceMailTemplateMissingError)
    expect(state.mails).toEqual([])
  })

  test('o reenvio do retorno (248) não passa pelo bloqueio e grava a chave e a versão da mensagem original', async () => {
    const { state, useCase } = createFake({
      effectiveTemplate: null,
      originalTemplate: EFFECTIVE_TEMPLATE,
    })

    await useCase.send(input({ contractorReplyResend: true }))

    expect(state.mails[0]?.notificationTemplate).toEqual(EFFECTIVE_TEMPLATE)
  })

  test('o reenvio sem mensagem original com modelo grava nulo, sem erro', async () => {
    const { state, useCase } = createFake({ effectiveTemplate: null })

    await useCase.send(input({ contractorReplyResend: true }))

    expect(state.mails[0]?.notificationTemplate).toBeNull()
  })
})

describe('o e-mail com anexo (spec 183 T702e)', () => {
  test('os arquivos subidos ligam à mensagem da conversa, com o alvo e-mail e a contratante', async () => {
    const { attached, locked, useCase } = createFake()

    const result = await useCase.send(input({ attachmentIds: [UPLOAD_A, UPLOAD_B] }))

    expect(locked).toEqual([
      {
        ids: [UPLOAD_A, UPLOAD_B],
        target: {
          channel: 'email',
          companyId: COMPANY_ID,
          occurrenceId: OCCURRENCE_ID,
          occurrenceKind: 'document',
          participant: 'contractor',
          requestedByUserId: ACTOR_ID,
        },
      },
    ])
    expect(attached.map((row) => [row.uploadId, row.messageId])).toEqual([
      [UPLOAD_A, result.conversationMessageId],
      [UPLOAD_B, result.conversationMessageId],
    ])
  })

  test('os anexos entram na impressão da idempotência: a mesma chave com outros é 409', async () => {
    const { attached, useCase } = createFake()

    await useCase.send(input({ attachmentIds: [UPLOAD_A] }))
    expect(await failure(() => useCase.send(input({ attachmentIds: [UPLOAD_B] })))).toMatchObject({
      status: 409,
    })
    expect(attached).toHaveLength(1)
  })

  test('acima do total do e-mail somando os arquivos, 422 — cada um cabendo sozinho', async () => {
    const { useCase } = createFake({ uploadBytes: 9 * 1024 * 1024 })

    expect(
      await failure(() =>
        useCase.send(
          input({
            attachmentIds: [UPLOAD_A, UPLOAD_B, '00000000-0000-4000-8000-0000001834a3'],
          }),
        ),
      ),
    ).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_ATTACHMENT_REJECTED', status: 422 })
  })
})

describe('o aviso automático, sem autor humano (spec 183 T802)', () => {
  test('a mensagem da conversa nasce sem autor e marcada automática; a da 143 também sem ator', async () => {
    const { state, useCase } = createFake()

    await useCase.send(input({ actorUserId: null, automatic: true }))

    expect(state.mails[0]?.actorUserId).toBeNull()
    expect(state.conversationMessages[0]).toMatchObject({ authorUserId: null, automatic: true })
    /** A assinatura não leva nome de operador: quem mandou foi o tipo da ocorrência. */
    expect(state.mails[0]?.bodyText).not.toContain('Operadora Lima')
  })

  test('sem autor só com a marca de automático — nunca um envio manual anônimo', async () => {
    const { useCase } = createFake()

    expect(await failure(() => useCase.send(input({ actorUserId: null })))).toMatchObject({
      message: 'OCCURRENCE_MAIL_AUTHOR_REQUIRED',
    })
  })
})

const REPLY_TYPE: StoredContractorReplyConfiguration['type'] = {
  alertIntervalMinutes: 60,
  alertMaxCount: 24,
  alertMode: 'off',
  attachmentKind: 'pdf',
  driverReplyChannel: 'app_chat',
  driverReplyTemplate: 'Segue o boleto prorrogado.',
  driverReplyWindowClosedAction: 'fallback_app_chat',
  emailsContractor: true,
  forwardEmailBody: '',
  forwardEmailSubject: '',
  forwardToInformedEmail: 'off',
  forwardToNoteRecipient: 'off',
  mode: 'forward_automatic',
  waitHours: 6,
}

describe('a abertura do retorno da contratante no envio automático (spec 248 T4.4a)', () => {
  const configured = { override: null, type: REPLY_TYPE }

  test('automático com o modo ligado abre o retorno uma vez, com a cópia da configuração e o prazo', async () => {
    const { state, useCase } = createFake({ replyConfiguration: configured })

    await useCase.send(input({ actorUserId: null, automatic: true }))

    expect(state.openedReplies).toEqual([
      {
        companyId: COMPANY_ID,
        configuration: expect.objectContaining({
          attachmentKind: 'pdf',
          mode: 'forward_automatic',
          version: 1,
          waitHours: 6,
        }),
        conversationId: 'conversation-1',
        deadlineAt: new Date(NOW.getTime() + 6 * 3_600_000),
        occurrenceId: OCCURRENCE_ID,
      },
    ])
  })

  test('sem prazo no tipo, o retorno abre sem `deadlineAt`', async () => {
    const { state, useCase } = createFake({
      replyConfiguration: { override: null, type: { ...REPLY_TYPE, waitHours: null } },
    })

    await useCase.send(input({ actorUserId: null, automatic: true }))

    expect(state.openedReplies[0]).toMatchObject({ deadlineAt: null })
  })

  test('o modo desligado não abre retorno', async () => {
    const { state, useCase } = createFake({
      replyConfiguration: { override: null, type: { ...REPLY_TYPE, mode: 'off' } },
    })

    await useCase.send(input({ actorUserId: null, automatic: true }))

    expect(state.openedReplies).toEqual([])
  })

  test('o envio manual do operador nunca abre retorno, nem lê a configuração', async () => {
    const { state, useCase } = createFake({ replyConfiguration: configured })

    await useCase.send(input())

    expect(state.openedReplies).toEqual([])
    expect(state.replyReads).toEqual([])
  })

  test('a repetição da mesma chave devolve a resposta gravada e não abre outro retorno', async () => {
    const { state, useCase } = createFake({ replyConfiguration: configured })
    await useCase.send(input({ actorUserId: null, automatic: true }))

    await useCase.send(input({ actorUserId: null, automatic: true }))

    expect(state.openedReplies).toHaveLength(1)
    expect(state.replyReads).toHaveLength(1)
  })

  test('envio que não sai (e-mail da empresa não pronto) não abre retorno', async () => {
    const { state, useCase } = createFake({ replyConfiguration: configured, settings: undefined })

    await failure(() => useCase.send(input({ actorUserId: null, automatic: true })))

    expect(state.openedReplies).toEqual([])
  })

  test('combinação efetiva inválida não abre retorno, avisa só com contagem e o envio segue', async () => {
    const warnings: { event: string; fields: Record<string, unknown> | undefined }[] = []
    const { state, useCase } = createFake({
      logger: { warn: (event, fields) => void warnings.push({ event, fields }) },
      replyConfiguration: { override: null, type: { ...REPLY_TYPE, driverReplyTemplate: '  ' } },
    })

    await useCase.send(input({ actorUserId: null, automatic: true }))

    expect(state.openedReplies).toEqual([])
    expect(state.mails).toHaveLength(1)
    expect(warnings).toEqual([
      {
        event: 'occurrence_contractor_reply_configuration_invalid',
        fields: { companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID },
      },
    ])
  })

  test('ocorrência fora do retorno (sem configuração achada) não abre nada', async () => {
    const { state, useCase } = createFake()

    await useCase.send(input({ actorUserId: null, automatic: true }))

    expect(state.openedReplies).toEqual([])
  })
})

describe('o reenvio do pedido à contratante no mesmo e-mail (spec 248 RF6)', () => {
  test('o envio comum nunca toca o retorno; o reenvio grava o evento do operador com o relógio do envio', async () => {
    const plain = createFake()
    await plain.useCase.send(input())
    expect(plain.state.resendCalls).toEqual([])

    const { state, useCase } = createFake()
    await useCase.send(input({ contractorReplyResend: true }))
    expect(state.resendCalls).toEqual([
      { actorUserId: ACTOR_ID, companyId: COMPANY_ID, now: NOW, occurrenceId: OCCURRENCE_ID },
    ])
    expect(state.mails).toHaveLength(1)
  })

  test('retorno que não espera mais a contratante, ou cedo demais: 409 e nada de e-mail gravado', async () => {
    const notWaiting = createFake({ resendOutcome: 'not_resendable' })
    expect(
      await failure(() => notWaiting.useCase.send(input({ contractorReplyResend: true }))),
    ).toBeInstanceOf(ContractorReplyNotResendableError)
    expect(notWaiting.state.mails).toEqual([])
    expect(notWaiting.state.conversationMessages).toEqual([])

    const tooSoon = createFake({ resendOutcome: 'too_soon' })
    expect(
      await failure(() => tooSoon.useCase.send(input({ contractorReplyResend: true }))),
    ).toBeInstanceOf(ContractorReplyResendTooSoonError)
    expect(tooSoon.state.mails).toEqual([])
  })

  test('repetir a mesma chave devolve a resposta gravada sem conferir o intervalo de novo', async () => {
    const { state, useCase } = createFake()
    const first = await useCase.send(input({ contractorReplyResend: true }))
    const second = await useCase.send(input({ contractorReplyResend: true }))

    expect(second).toEqual(first)
    expect(state.resendCalls).toHaveLength(1)
    expect(state.mails).toHaveLength(1)
  })

  test('o reenvio é sempre de um operador: o aviso automático não pode ser reenvio', async () => {
    const { useCase } = createFake()
    expect(
      await failure(() =>
        useCase.send(input({ actorUserId: null, automatic: true, contractorReplyResend: true })),
      ),
    ).toMatchObject({ message: 'OCCURRENCE_MAIL_RESEND_IS_NOT_AUTOMATIC' })
  })
})

describe('o primeiro e-mail da ocorrência não corre (spec 183 T903, achado C3)', () => {
  /**
   * Dois envios com chaves diferentes (dois operadores, o aviso automático junto de um manual) não
   * achavam thread e criavam duas; o segundo violava a unicidade da thread e respondia 500. A
   * procura da thread passa a acontecer com a ocorrência travada.
   */
  test('trava pela ocorrência antes de procurar a thread', async () => {
    const { state, useCase } = createFake()

    await useCase.send(input())

    expect(state.calls).toEqual([
      `lock:${COMPANY_ID}:document:${OCCURRENCE_ID}`,
      'findOccurrenceThread',
    ])
  })
})

describe('o e-mail da contratante em modo sandbox (spec 268)', () => {
  const SANDBOX = { fromAddress: 'no-reply@staging.example.test' } as const
  const NOT_READY = undefined

  test('sem Resend pronto e com o modo ligado, grava a mensagem para o SMTP do ambiente', async () => {
    const { decryptCalls, state, useCase } = createFake({ sandbox: SANDBOX, settings: NOT_READY })

    const result = await useCase.send(input())

    expect(state.mails).toHaveLength(1)
    expect(state.mails[0]).toMatchObject({
      createThread: true,
      fromAddress: 'no-reply@staging.example.test',
      toAddresses: ['compras@alfa.example.test', 'fiscal@alfa.example.test'],
      transport: 'sandbox_smtp',
    })
    expect(state.mails[0]?.replyTokenHash).toMatch(/^[0-9a-f]{64}$/u)
    expect(decryptCalls).toEqual([])
    expect(result.recipientCount).toBe(2)
  })

  test('configuração sem remetente verificado também cai no sandbox', async () => {
    const { state, useCase } = createFake({
      sandbox: SANDBOX,
      settings: {
        id: 'settings-1',
        secretEnvelope: {},
        senderAddress: 'ocorrencias@transportadora.example.test',
        sendingVerifiedAt: null,
      },
    })

    await useCase.send(input())

    expect(state.mails[0]).toMatchObject({ transport: 'sandbox_smtp' })
  })

  test('com o Resend pronto, o modo ligado não desvia: continua pelo Resend', async () => {
    const { decryptCalls, state, useCase } = createFake({ sandbox: SANDBOX })

    await useCase.send(input())

    expect(state.mails[0]).toMatchObject({
      fromAddress: 'ocorrencias@transportadora.example.test',
      transport: 'resend',
    })
    expect(decryptCalls).toEqual(['decrypt'])
  })

  test('sem o modo ligado, a recusa de hoje continua', async () => {
    const { state, useCase } = createFake({ settings: NOT_READY })

    expect(await failure(() => useCase.send(input()))).toMatchObject({
      code: 'CONTRACTOR_MAIL_NOT_CONFIGURED',
    })
    expect(state.mails).toEqual([])
  })

  test('a segunda mensagem da mesma thread segue no sandbox', async () => {
    const { state, useCase } = createFake({ sandbox: SANDBOX, settings: NOT_READY })
    const first = await useCase.send(input())

    await useCase.send(input({ bodyText: 'Seguimos aguardando.', idempotencyKey: 'key-2' }))

    expect(state.mails[1]).toMatchObject({
      createThread: false,
      threadId: first.threadId,
      transport: 'sandbox_smtp',
    })
  })
})

function watcher(name: string, overrides: Partial<OccurrenceWatcherCandidate> = {}) {
  return {
    address: `${name.toLowerCase()}@empresa.example.test`,
    name,
    status: 'active' as const,
    userId: `user-${name.toLowerCase()}`,
    ...overrides,
  }
}

describe('a prévia mostra a cópia (spec 267 RF4)', () => {
  test('a consulta dos responsáveis que falha não derruba a prévia: cópia vazia e aviso sem endereço', async () => {
    const warnings: string[] = []
    const preview = await createPreviewOccurrenceMailUseCase({
      logger: { warn: (event) => warnings.push(event) },
      reader: {
        findCarrierIdentity: async () => CARRIER_IDENTITY,
        findMailSettings: async () => undefined,
        findChosenOccurrenceRecipientIds: async () => [],
        findOccurrenceNotificationTemplate: async () => EFFECTIVE_TEMPLATE,
        findOccurrenceTarget: async () => TARGET,
        findOccurrenceMailHtmlSource: async () => null,
        findOperatorSigner: async () => OPERATOR_SIGNER,
        listOccurrenceRecipients: async () => [],
        loadWatcherCandidates: async () => {
          throw new Error('database unavailable')
        },
      },
      suggestedMail: { readSuggestedMail: async () => null },
    }).preview({ actorUserId: ACTOR_ID, companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID })

    expect(preview.cc).toEqual([])
    expect(preview.ccSource).toBeNull()
    expect(warnings).toEqual(['contractor_mail.copy.display_unavailable'])
  })

  test('a lista efetiva com e-mail mascarado e a origem; inelegível não aparece', async () => {
    const preview = await createPreviewOccurrenceMailUseCase({
      reader: {
        findCarrierIdentity: async () => CARRIER_IDENTITY,
        findMailSettings: async () => undefined,
        findChosenOccurrenceRecipientIds: async () => [],
        findOccurrenceNotificationTemplate: async () => EFFECTIVE_TEMPLATE,
        findOccurrenceTarget: async () => TARGET,
        findOccurrenceMailHtmlSource: async () => null,
        findOperatorSigner: async () => OPERATOR_SIGNER,
        listOccurrenceRecipients: async () => [],
        loadWatcherCandidates: async () => ({
          company: [watcher('Ana'), watcher('Bruno', { address: undefined })],
          contractor: [watcher('Carla')],
        }),
      },
      suggestedMail: { readSuggestedMail: async () => null },
    }).preview({ actorUserId: ACTOR_ID, companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID })

    expect(preview.ccSource).toBe('contractor')
    expect(preview.cc).toEqual([
      { maskedEmail: 'c***@e***.example.test', name: 'Carla', userId: 'user-carla' },
    ])
    expect(JSON.stringify(preview)).not.toContain('carla@empresa')
  })
})

describe('a cópia no e-mail de ocorrência (spec 267)', () => {
  /** Sem remoção a impressão digital é a de antes da 267: chave em voo durante o deploy continua válida. */
  test('sem excluídos a impressão digital não ganha campo novo', async () => {
    const { state, useCase } = createFake()

    await useCase.send(input())

    const stored = state.idempotency.get('key-1')?.fingerprint ?? ''
    expect(stored.split('|')).toHaveLength(6)
    expect(stored).not.toContain('excluded')
  })

  test('a lista da empresa vai em ccAddresses; o To segue os contatos', async () => {
    const { state, useCase } = createFake({
      watchers: { company: [watcher('Bruno'), watcher('Ana')] },
    })

    await useCase.send(input())

    expect(state.mails[0]).toMatchObject({
      ccAddresses: ['ana@empresa.example.test', 'bruno@empresa.example.test'],
      toAddresses: ['compras@alfa.example.test', 'fiscal@alfa.example.test'],
    })
  })

  test('a lista da contratante substitui a da empresa', async () => {
    const { state, useCase } = createFake({
      watchers: { company: [watcher('Ana')], contractor: [watcher('Carla')] },
    })

    await useCase.send(input())

    expect(state.mails[0]?.ccAddresses).toEqual(['carla@empresa.example.test'])
  })

  test('a lista do tipo vence a da contratante e a da empresa (spec 271 D11)', async () => {
    const { state, useCase } = createFake({
      watchers: {
        company: [watcher('Ana')],
        contractor: [watcher('Carla')],
        type: [watcher('Davi')],
      },
    })

    await useCase.send(input())

    expect(state.mails[0]?.ccAddresses).toEqual(['davi@empresa.example.test'])
    expect(state.watcherTypeIds).toEqual(['00000000-0000-4000-8000-000000271401'])
  })

  test('o tipo só com responsável inativo herda a contratante', async () => {
    const { state, useCase } = createFake({
      watchers: {
        contractor: [watcher('Carla')],
        type: [watcher('Davi', { status: 'inactive' })],
      },
    })

    await useCase.send(input())

    expect(state.mails[0]?.ccAddresses).toEqual(['carla@empresa.example.test'])
  })

  test('sem nenhuma lista a mensagem grava cópia vazia', async () => {
    const { state, useCase } = createFake()

    await useCase.send(input())

    expect(state.mails[0]?.ccAddresses).toEqual([])
  })

  test('o operador tira alguém naquele envio; id desconhecido não adiciona ninguém', async () => {
    const { state, useCase } = createFake({
      watchers: { company: [watcher('Ana'), watcher('Bruno')] },
    })

    await useCase.send(input({ excludedWatcherUserIds: ['user-bruno', 'user-desconhecido'] }))

    expect(state.mails[0]?.ccAddresses).toEqual(['ana@empresa.example.test'])
  })

  test('responsável sem permissão (sem endereço) sai sem erro; quem já está no To não repete', async () => {
    const { state, useCase } = createFake({
      watchers: {
        company: [
          watcher('Ana', { address: undefined }),
          watcher('Bruno', { address: 'COMPRAS@alfa.example.test' }),
          watcher('Carla'),
        ],
      },
    })

    await useCase.send(input())

    expect(state.mails[0]?.ccAddresses).toEqual(['carla@empresa.example.test'])
  })

  test('os excluídos entram, ordenados, na impressão digital da idempotência', async () => {
    const { state, useCase } = createFake({
      watchers: { company: [watcher('Ana'), watcher('Bruno')] },
    })
    const first = await useCase.send(input({ excludedWatcherUserIds: ['user-bruno', 'user-ana'] }))

    expect(
      await useCase.send(input({ excludedWatcherUserIds: ['user-ana', 'user-bruno'] })),
    ).toEqual(first)
    expect(state.mails).toHaveLength(1)
    const reused = await failure(() => useCase.send(input({ excludedWatcherUserIds: [] })))
    expect(reused).toMatchObject({
      code: 'OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED',
      status: 409,
    })
  })

  test('manual com To + Cc acima de 50 é 400 antes de gravar', async () => {
    const contacts = Array.from({ length: 50 }, (_, index) => ({
      email: `contato${index}@alfa.example.test`,
      id: `contact-${index}`,
    }))
    const { state, useCase } = createFake({ contacts, watchers: { company: [watcher('Ana')] } })

    const result = await failure(() =>
      useCase.send(input({ contactIds: contacts.map((contact) => contact.id) })),
    )

    expect(result).toMatchObject({ code: 'CONTRACTOR_MAIL_TOO_MANY_RECIPIENTS', status: 400 })
    expect(state.mails).toEqual([])
    expect(state.idempotency.size).toBe(0)
  })

  test('automático acima de 50 corta a cópia até caber e registra warn só com contagens', async () => {
    const warnings: { event: string; fields: Record<string, unknown> | undefined }[] = []
    const contacts = Array.from({ length: 49 }, (_, index) => ({
      email: `contato${index}@alfa.example.test`,
      id: `contact-${index}`,
    }))
    const { state, useCase } = createFake({
      contacts,
      logger: { warn: (event, fields) => warnings.push({ event, fields }) },
      watchers: { company: [watcher('Ana'), watcher('Bruno'), watcher('Carla')] },
    })

    await useCase.send(
      input({
        actorUserId: null,
        automatic: true,
        contactIds: contacts.map((contact) => contact.id),
      }),
    )

    expect(state.mails[0]?.ccAddresses).toEqual(['ana@empresa.example.test'])
    expect(warnings).toEqual([
      {
        event: 'contractor_mail.copy.truncated',
        fields: { ccCount: 1, droppedCount: 2, toCount: 49 },
      },
    ])
  })

  test('o log de resolução leva contagens e a origem, nunca endereço', async () => {
    const infos: unknown[] = []
    const { useCase } = createFake({
      logger: { info: (event, fields) => infos.push({ event, fields }), warn: () => undefined },
      watchers: { company: [watcher('Ana'), watcher('Bruno', { address: undefined })] },
    })

    await useCase.send(input())

    expect(infos).toEqual([
      {
        event: 'contractor_mail.copy.resolved',
        fields: { ccCount: 1, droppedCount: 1, source: 'company' },
      },
    ])
    expect(JSON.stringify(infos)).not.toContain('@')
  })
})

/** Spec 272 T2.4: o modelo HTML — a área de mensagem, a tabela, o logo e a assinatura. */
const HTML_TEMPLATE = [
  '<html><body>',
  '<div>{{logoTransportadora}} <b>{{nomeExibicao}}</b> CNPJ {{cnpjTransportadora}}</div>',
  '<!-- mensagem -->',
  '<p>Prezados, a NF {{numeroNota}} teve avaria. {{observacao}}</p>',
  '<!-- /mensagem -->',
  '{{tabelaItens}}',
  '{{faixaResposta}}',
  '<p>{{assinaturaNome}} — {{assinaturaCargo}}</p>',
  '</body></html>',
].join('\n')

function htmlSource(overrides: Partial<OccurrenceMailHtmlSource> = {}): OccurrenceMailHtmlSource {
  return {
    bodyTemplate: HTML_TEMPLATE,
    itemLines: ['A1 – Tapete – 2 un – R$ 10,00'],
    itemRows: [{ amount: 'R$ 10,00', code: 'A1', description: 'Tapete', quantity: '2 un' }],
    itemsSum: 'R$ 10,00',
    subjectTemplate: 'Avaria — NF {{numeroNota}}',
    values: {
      linhasItens: 'A1 – Tapete – 2 un – R$ 10,00',
      numeroNota: '48.213-1',
      observacao: '',
    },
    ...overrides,
  }
}

const AREA_TEXT = 'Prezados, a NF 48.213-1 teve avaria.'

describe('o envio do e-mail com modelo HTML (spec 272 T2.4, D1/D7/D8/D12)', () => {
  test('manual, texto mantido: o HTML do modelo, o texto gerado do HTML inteiro e o "De" com o operador', async () => {
    const { state, useCase } = createFake({ htmlSource: htmlSource() })

    await useCase.send(input({ bodyText: AREA_TEXT, subject: 'Avaria — NF 48.213-1' }))

    const [mail] = state.mails
    expect(state.htmlSourceReads).toEqual([EFFECTIVE_TEMPLATE.key])
    expect(mail?.bodyHtml).toContain('<p>Prezados, a NF 48.213-1 teve avaria. </p>')
    expect(mail?.bodyHtml).toContain('<b>Transportadora Sintética</b> CNPJ 11.444.777/0001-61')
    expect(mail?.bodyHtml).toContain('<p>Operadora Lima — Operação</p>')
    expect(mail?.bodyText).toBe(htmlToPlainText(mail?.bodyHtml ?? ''))
    expect(mail?.bodyText).toContain('Tapete')
    expect(mail?.bodyText).not.toMatch(/<[a-z]/u)
    expect(mail?.fromDisplayName).toBe('Operadora Lima — Transportadora Sintética')
    expect(mail?.subject).toBe(`${SUBJECT_PREFIX}Avaria — NF 48.213-1`)
    expect(mail?.hasInlineLogo).toBe(false)
  })

  test('manual, texto editado: o HTML do modelo com o texto do operador escapado na área; a conversa leva o texto dele', async () => {
    const { state, useCase } = createFake({ htmlSource: htmlSource() })

    await useCase.send(input({ bodyText: 'Segue <b>novo</b> texto & mais.' }))

    const [mail] = state.mails
    expect(mail?.bodyHtml).toContain('Segue &lt;b&gt;novo&lt;/b&gt; texto &amp; mais.')
    expect(mail?.bodyHtml).not.toContain('<b>novo</b>')
    expect(mail?.bodyHtml).not.toContain('teve avaria')
    expect(mail?.bodyHtml).toContain('<td style=')
    expect(mail?.bodyHtml).toContain('<p>Operadora Lima — Operação</p>')
    expect(state.conversationMessages[0]?.bodyText).toBe('Segue <b>novo</b> texto & mais.')
  })

  test('o aviso automático usa sempre a área do modelo, e a equipe assina (critério 6)', async () => {
    const { state, useCase } = createFake({ htmlSource: htmlSource() })

    await useCase.send(
      input({
        actorUserId: null,
        automatic: true,
        bodyText: 'texto do plano',
        idempotencyKey: 'a',
      }),
    )

    const [mail] = state.mails
    expect(mail?.bodyHtml).toContain('<p>Prezados, a NF 48.213-1 teve avaria. </p>')
    expect(mail?.bodyHtml).not.toContain('texto do plano')
    expect(mail?.bodyHtml).toContain('<p>Equipe Transportadora Sintética — </p>')
    expect(mail?.fromDisplayName).toBe('Transportadora Sintética')
  })

  test('com o dono injetado na porta (critério 12), o automático sai em nome dele', async () => {
    const { state, useCase } = createFake({
      htmlSource: htmlSource(),
      ownerReader: {
        findEligibleOwner: async () => ({ jobTitle: 'Gerente', name: 'Carla', userId: 'owner-1' }),
      },
    })

    await useCase.send(input({ actorUserId: null, automatic: true, idempotencyKey: 'a' }))

    expect(state.mails[0]?.fromDisplayName).toBe('Carla — Transportadora Sintética')
    expect(state.mails[0]?.bodyHtml).toContain('<p>Carla — Gerente</p>')
  })

  test('assunto de 200 caracteres (o teto do renderer sobre um modelo de 300): o prefixo fica inteiro (critério 11); o assunto já prefixado não ganha outro', async () => {
    const { state, useCase } = createFake({ htmlSource: htmlSource() })

    await useCase.send(input({ bodyText: AREA_TEXT, subject: 'x'.repeat(200) }))
    expect(state.mails[0]?.subject).toHaveLength(200)
    expect(state.mails[0]?.subject.startsWith(SUBJECT_PREFIX)).toBe(true)

    await useCase.send(
      input({ bodyText: AREA_TEXT, idempotencyKey: 'k2', subject: `${SUBJECT_PREFIX}Avaria` }),
    )
    expect(state.mails[1]?.subject).toBe(`${SUBJECT_PREFIX}Avaria`)
  })

  test('logo: has_inline_logo só com o modelo usando {{logoTransportadora}} e logo cadastrado', async () => {
    const withLogo = createFake({
      carrier: { ...CARRIER_IDENTITY, hasLogo: true },
      htmlSource: htmlSource(),
    })
    await withLogo.useCase.send(input({ bodyText: AREA_TEXT }))
    expect(withLogo.state.mails[0]?.hasInlineLogo).toBe(true)
    expect(withLogo.state.mails[0]?.bodyHtml).toContain('cid:company-logo')

    const withoutPlaceholder = createFake({
      carrier: { ...CARRIER_IDENTITY, hasLogo: true },
      htmlSource: htmlSource({
        bodyTemplate: HTML_TEMPLATE.replace('{{logoTransportadora}}', ''),
      }),
    })
    await withoutPlaceholder.useCase.send(input({ bodyText: AREA_TEXT }))
    expect(withoutPlaceholder.state.mails[0]?.hasInlineLogo).toBe(false)
  })

  test('Resend: a faixa de resposta e o endereço do Resend; sandbox: sem a faixa, com o nome no "De"', async () => {
    const resend = createFake({ htmlSource: htmlSource() })
    await resend.useCase.send(input({ bodyText: AREA_TEXT }))
    expect(resend.state.mails[0]).toMatchObject({ transport: 'resend' })
    expect(resend.state.mails[0]?.bodyHtml).toContain('Responda este e-mail')

    const sandbox = createFake({
      htmlSource: htmlSource(),
      sandbox: { fromAddress: 'sandbox@example.test' },
      settings: undefined,
    })
    await sandbox.useCase.send(input({ bodyText: AREA_TEXT }))
    expect(sandbox.state.mails[0]).toMatchObject({
      fromAddress: 'sandbox@example.test',
      fromDisplayName: 'Operadora Lima — Transportadora Sintética',
      transport: 'sandbox_smtp',
    })
    expect(sandbox.state.mails[0]?.bodyHtml).not.toContain('Responda este e-mail')
  })

  test('200 itens com {{linhasItens}} na área: a conversa grava até 8000 e o e-mail leva o texto inteiro', async () => {
    const lines = Array.from(
      { length: 200 },
      (_, index) =>
        `COD${index} – Item de teste número ${index} com descrição longa – 10 un – R$ 1.234,56`,
    )
    const source = htmlSource({
      bodyTemplate: HTML_TEMPLATE.replace('{{observacao}}', '{{linhasItens}}'),
      itemLines: lines,
      itemRows: lines.map((line, index) => ({
        amount: 'R$ 1.234,56',
        code: `COD${index}`,
        description: line,
        quantity: '10 un',
      })),
      values: { linhasItens: lines.join('\n'), numeroNota: '1' },
    })
    const generated = composeOccurrenceMailHtml({
      appBaseUrl: undefined,
      carrier: CARRIER_IDENTITY,
      contractorTaxId: null,
      hasReplyTo: true,
      signer: { kind: 'operator', name: 'Operadora Lima', userId: ACTOR_ID },
      source,
    }).areaText
    const { state, useCase } = createFake({ htmlSource: source })

    await useCase.send(input({ bodyText: generated }))

    expect(generated.length).toBeLessThanOrEqual(8000)
    expect(state.conversationMessages[0]?.bodyText.length).toBeLessThanOrEqual(8000)
    expect(state.mails[0]?.bodyText.length).toBeGreaterThan(8000)
    expect(state.mails[0]?.bodyHtml).toContain('COD199')
  })

  test('HTML acima de 524288 bytes: problema do modelo (409), nada gravado, nunca 500', async () => {
    const { state, useCase } = createFake({
      htmlSource: htmlSource({
        values: { numeroNota: '1', observacao: 'o'.repeat(600_000) },
      }),
    })

    const error = await failure(() => useCase.send(input({ bodyText: AREA_TEXT })))

    expect(error).toBeInstanceOf(OccurrenceMailTemplateMissingError)
    expect(state.mails).toEqual([])
    expect(state.conversationMessages).toEqual([])
  })

  test('o reenvio do retorno (248) segue o caminho de texto: nem lê o modelo HTML; o prefixo é idempotente', async () => {
    const { state, useCase } = createFake({
      htmlSource: htmlSource(),
      originalTemplate: EFFECTIVE_TEMPLATE,
    })

    await useCase.send(
      input({
        bodyText: 'Reenvio do pedido abaixo.',
        contractorReplyResend: true,
        subject: `${SUBJECT_PREFIX}Pedido de boleto`,
      }),
    )

    expect(state.htmlSourceReads).toEqual([])
    expect(state.mails[0]?.subject).toBe(`${SUBJECT_PREFIX}Pedido de boleto`)
    expect(state.mails[0]?.bodyText).toContain('Reenvio do pedido abaixo.')
    expect(state.mails[0]?.hasInlineLogo).toBe(false)
  })

  test('modelo de texto (critério 4): sai como hoje, com o prefixo e o "De" novos', async () => {
    const { state, useCase } = createFake()

    await useCase.send(input())

    const [mail] = state.mails
    expect(mail?.bodyText).toBe(
      'Recebedor está cobrando taxa de descarga. Autorizam?\n\n--\nOperadora Lima\nTransportadora Sintética',
    )
    expect(mail?.bodyHtml).toContain('<p>Recebedor está cobrando taxa de descarga. Autorizam?</p>')
    expect(mail?.subject).toBe(`${SUBJECT_PREFIX}Ocorrência na entrega — NF 4512`)
    expect(mail?.fromDisplayName).toBe('Operadora Lima — Transportadora Sintética')
    expect(mail?.hasInlineLogo).toBe(false)
  })

  test('automático com modelo de texto: "De" é só o nome de exibição', async () => {
    const { state, useCase } = createFake()

    await useCase.send(input({ actorUserId: null, automatic: true }))

    expect(state.mails[0]?.fromDisplayName).toBe('Transportadora Sintética')
    expect(state.mails[0]?.bodyText).toBe(
      'Recebedor está cobrando taxa de descarga. Autorizam?\n\n--\nTransportadora Sintética',
    )
  })

  test('sem perfil fiscal: assunto sem prefixo e "De" nulo (o worker segue como antes)', async () => {
    const { state, useCase } = createFake({ carrier: undefined })

    await useCase.send(input())

    expect(state.mails[0]).toMatchObject({
      fromDisplayName: null,
      subject: 'Ocorrência na entrega — NF 4512',
    })
  })
})

describe('a prévia com modelo HTML (spec 272 T2.4, D12)', () => {
  const READY_SETTINGS = {
    id: 'settings-1',
    secretEnvelope: {},
    senderAddress: 'ocorrencias@transportadora.example.test',
    sendingVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
  }

  function createHtmlPreview(
    source: OccurrenceMailHtmlSource | null = htmlSource(),
    settings: typeof READY_SETTINGS | undefined = undefined,
  ) {
    return createPreviewOccurrenceMailUseCase({
      reader: {
        findCarrierIdentity: async () => CARRIER_IDENTITY,
        findChosenOccurrenceRecipientIds: async () => [],
        findMailSettings: async () => settings,
        findOccurrenceMailHtmlSource: async () => source,
        findOccurrenceNotificationTemplate: async () => EFFECTIVE_TEMPLATE,
        findOccurrenceTarget: async () => TARGET,
        findOperatorSigner: async () => OPERATOR_SIGNER,
        listOccurrenceRecipients: async () => RECIPIENTS,
        loadWatcherCandidates: async () => ({ company: [], contractor: [] }),
      },
      suggestedMail: {
        readSuggestedMail: async () => {
          throw new Error('SUGGESTED_MAIL_NOT_USED_FOR_HTML')
        },
      },
    })
  }

  test('sem body: bodyText é só o texto da área; html é o HTML do modelo renderizado; subject sem prefixo', async () => {
    const preview = await createHtmlPreview().preview({
      actorUserId: ACTOR_ID,
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
    })

    expect(preview.bodyText).toBe(AREA_TEXT)
    expect(preview.html).toContain('<p>Prezados, a NF 48.213-1 teve avaria. </p>')
    expect(preview.html).toContain('<p>Operadora Lima — Operação</p>')
    expect(preview.subject).toBe('Avaria — NF 48.213-1')
    expect(preview.text).toBe(htmlToPlainText(preview.html))
    expect(preview.suggested).toBe(true)
    expect(preview.missingNotificationTemplate).toBe(false)
  })

  test('com body: o html leva o texto do operador escapado na área', async () => {
    const preview = await createHtmlPreview().preview({
      actorUserId: ACTOR_ID,
      bodyText: 'Meu <i>texto</i>',
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
    })

    expect(preview.bodyText).toBe('Meu <i>texto</i>')
    expect(preview.html).toContain('Meu &lt;i&gt;texto&lt;/i&gt;')
    expect(preview.html).not.toContain('teve avaria')
    expect(preview.suggested).toBe(false)
  })

  test('a faixa de resposta segue o envio: só com Resend pronto (Reply-To), nunca no sandbox', async () => {
    const withStrip = htmlSource({ bodyTemplate: `${HTML_TEMPLATE}<div>[{{faixaResposta}}]</div>` })
    const request = { actorUserId: ACTOR_ID, companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID }

    const sandbox = await createHtmlPreview(withStrip).preview(request)
    const resend = await createHtmlPreview(withStrip, READY_SETTINGS).preview(request)

    expect(sandbox.html).toContain('<div>[]</div>')
    expect(resend.html).not.toContain('<div>[]</div>')
    expect(resend.html).toContain('Responda')
  })

  test('modelo sem área não compõe: a prévia cai no texto em branco e o envio recusa com 409', async () => {
    const preview = await createHtmlPreview(
      htmlSource({ bodyTemplate: '<p>{{numeroNota}}</p>' }),
    ).preview({
      actorUserId: ACTOR_ID,
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
    })

    expect(preview.bodyText).toBe('')
  })
})
