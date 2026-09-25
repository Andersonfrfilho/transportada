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
  OccurrenceMailTarget,
  OccurrenceMailTransactionPort,
  RecordOccurrenceMailInput,
  SendOccurrenceMailResult,
} from '../../src/occurrence-conversation/application/occurrence-mail.port.js'
import type { ConversationUploadTarget } from '../../src/occurrence-conversation/application/conversation-attachment.port.js'
import { createPreviewOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/preview-occurrence-mail.use-case.js'
import { createSendOccurrenceMailUseCase } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import { buildOccurrenceMail } from '../../src/occurrence-conversation/domain/occurrence-mail.template.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000183401'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000183402'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000183403'
const ACTOR_ID = '00000000-0000-4000-8000-000000183404'
const NOW = new Date('2026-09-24T18:00:00.000Z')
const PDF = new TextEncoder().encode('%PDF-1.7 nota de devolução')
const UPLOAD_A = '00000000-0000-4000-8000-0000001834a1'
const UPLOAD_B = '00000000-0000-4000-8000-0000001834a2'

const TARGET: OccurrenceMailTarget = {
  contractorId: CONTRACTOR_ID,
  contractorName: 'Contratante Alfa',
  kind: 'document',
  stage: 'delivery',
}

type FakeState = {
  conversations: { id: string; publicRef: string }[]
  conversationMessages: Parameters<OccurrenceMailTransactionPort['recordConversationMessage']>[0][]
  idempotency: Map<string, { fingerprint: string; response: SendOccurrenceMailResult }>
  mails: RecordOccurrenceMailInput[]
  threadId: string | undefined
}

function createFake(
  overrides: Partial<{
    contacts: readonly { email: string; id: string }[]
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
    conversationMessages: [],
    conversations: [],
    idempotency: new Map(),
    mails: [],
    threadId: undefined,
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
    async findCarrierName() {
      return 'Transportadora Sintética'
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
      return state.threadId === undefined ? undefined : { id: state.threadId }
    },
    async findOperatorName() {
      return 'Operadora Lima'
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
  const useCase = createSendOccurrenceMailUseCase({
    fingerprintService: {
      create: async ({ fields }) =>
        fields.map((field) => new TextDecoder().decode(field)).join('|'),
    },
    now: () => NOW,
    secretService: {
      decrypt: async () => ({ apiKey: 're_test', replyTokenSecret: 'a'.repeat(64) }),
    } as never,
    storage: {
      createSignedDownload: async ({ key }) => new URL(`https://s3.test/${key}`),
      createSignedUpload: async ({ key }) => new URL(`https://s3.test/${key}?upload`),
      getObjectStream: async () => new Blob([PDF]).stream(),
      headObject: async () => ({ contentLength: uploadBytes }),
    },
    unitOfWork: { execute: (operation) => operation(transaction) },
  })
  return { attached, locked, state, useCase }
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
      subject: 'Ocorrência na entrega — NF 4512',
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
  ) {
    return createPreviewOccurrenceMailUseCase({
      reader: {
        findCarrierName: async () => 'Transportadora Sintética',
        findOperatorName: async () => 'Operadora Lima',
        findOccurrenceTarget: async () => target,
        listOccurrenceRecipients: async () => RECIPIENTS,
      },
      suggestedMail: { readSuggestedMail: async () => suggested },
    })
  }

  test('sem texto do operador, parte do modelo do tipo da ocorrência (079)', async () => {
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
      contractorName: 'Contratante Alfa',
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
      suggested: true,
    })
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
