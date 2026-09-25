/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702a (RF10): o anexo em cada envio e em cada pedido de upload. O alvo do anexo vem
 * sempre do contexto — canal e participante da superfície, a ocorrência resolvida pelo servidor e
 * quem pediu é quem envia —, nunca do corpo. A mensagem pode ser só anexo; vazia dos dois é 422.
 * O reenvio da mesma chave não liga o arquivo de novo.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ConversationAttachmentStoragePort,
  ConversationAttachmentTransactionPort,
  ConversationUploadTarget,
} from '../../src/occurrence-conversation/application/conversation-attachment.port.js'
import { resolveContractorScope } from '../../src/contractor-portal/domain/contractor-scope.policy.js'
import {
  createContractorPortalConversationUseCase,
  createRequestPortalConversationUploadUseCase,
} from '../../src/occurrence-conversation/application/contractor-portal-conversation.use-case.js'
import { createSendContractorPortalMessageUseCase } from '../../src/occurrence-conversation/application/contractor-portal-message.use-case.js'
import {
  createReplyMyOccurrenceConversationUseCase,
  createRequestMyConversationUploadUseCase,
  createSendDriverAppMessageUseCase,
} from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import { createListOccurrenceConversationsUseCase } from '../../src/occurrence-conversation/application/read-occurrence-conversations.use-case.js'
import { createRequestOccurrenceConversationUploadUseCase } from '../../src/occurrence-conversation/application/occurrence-conversation-upload.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000000002'
const OPERATOR_ID = '00000000-0000-4000-8000-000000000003'
const DRIVER_USER_ID = '00000000-0000-4000-8000-000000000004'
const PORTAL_USER_ID = '00000000-0000-4000-8000-000000000005'
const REF = 'Qm9hcmQtcmVmZXJlbmNpYS0xMjM0NTY'
const NOW = new Date('2026-09-25T12:00:00.000Z')
const PDF = new TextEncoder().encode('%PDF-1.7 comprovante')

const fingerprintService = {
  create: async ({
    fields,
    operation,
  }: {
    readonly fields: readonly Uint8Array[]
    readonly operation: string
  }) => `${operation}:${fields.map((field) => new TextDecoder().decode(field)).join('|')}`,
}

const storage: ConversationAttachmentStoragePort = {
  createSignedDownload: async ({ key }) => new URL(`https://s3.test/${key}`),
  createSignedUpload: async ({ key }) => new URL(`https://s3.test/${key}?upload`),
  getObjectStream: async () => new Blob([PDF]).stream(),
  headObject: async () => ({ contentLength: PDF.byteLength }),
}

/** O falso da porta de anexo: registra o alvo pedido e devolve um pedido para cada id. */
function attachmentsFake() {
  const locked: { ids: readonly string[]; target: ConversationUploadTarget }[] = []
  const attached: { messageId: string; uploadId: string }[] = []
  const port: ConversationAttachmentTransactionPort = {
    attachUpload: async (input) => void attached.push(input),
    lockPendingUploads: async (input) => {
      locked.push(input)
      return input.ids.map((id) => ({
        bucket: 'bucket-test',
        declaredContentType: 'application/pdf',
        expiresAt: new Date(NOW.getTime() + 60_000),
        fileName: 'comprovante.pdf',
        id,
        objectKey: `key-${id}`,
      }))
    },
  }
  return { attached, locked, port }
}

function idempotency() {
  const records = new Map<string, { fingerprint: string; response: unknown }>()
  return {
    findIdempotency: async ({ idempotencyKey }: { readonly idempotencyKey: string }) =>
      records.get(idempotencyKey) ?? null,
    saveIdempotency: async (input: {
      readonly fingerprint: string
      readonly idempotencyKey: string
      readonly response: unknown
    }) => void records.set(input.idempotencyKey, input),
  }
}

function driverTransaction(attachments: ConversationAttachmentTransactionPort) {
  return {
    ...idempotency(),
    applyDriverStatus: async () => undefined,
    attachments,
    findDriverTarget: async () => ({
      driverUserId: DRIVER_USER_ID,
      occurrenceKind: 'document' as const,
      occurrenceLabel: 'NF 4512/1',
    }),
    findMyOccurrence: async () => ({ occurrenceKind: 'document' as const }),
    findOrCreateDriverConversation: async () => ({ id: 'conversation-driver' }),
    insertMessage: async () => ({ id: 'message-1' }),
    listAttachments: async () => [],
    listDriverMessages: async () => [],
    listMyConversations: async () => [],
  }
}

describe('o anexo nos envios (spec 183 T702a)', () => {
  test('operador → motorista pelo app: o alvo é o app, o motorista e quem enviou', async () => {
    const fake = attachmentsFake()
    const tx = driverTransaction(fake.port)
    const useCase = createSendDriverAppMessageUseCase({
      clock: () => NOW,
      fingerprintService,
      notifier: { notify: async () => undefined },
      storage,
      unitOfWork: { execute: (work) => work(tx) },
    })
    const send = () =>
      useCase.send({
        actorUserId: OPERATOR_ID,
        attachmentIds: ['upload-1'],
        bodyText: '',
        companyId: COMPANY_ID,
        idempotencyKey: 'send-with-file-0001',
        occurrenceId: OCCURRENCE_ID,
      })

    await send()
    await send()

    expect(fake.locked).toEqual([
      {
        ids: ['upload-1'],
        target: {
          channel: 'app',
          companyId: COMPANY_ID,
          occurrenceId: OCCURRENCE_ID,
          occurrenceKind: 'document',
          participant: 'driver',
          requestedByUserId: OPERATOR_ID,
        },
      },
    ])
    expect(fake.attached).toEqual([
      expect.objectContaining({ messageId: 'message-1', uploadId: 'upload-1' }),
    ])
  })

  test('mensagem sem texto e sem anexo é 422 sem ler nada', async () => {
    const fake = attachmentsFake()
    const tx = driverTransaction(fake.port)
    const useCase = createSendDriverAppMessageUseCase({
      clock: () => NOW,
      fingerprintService,
      notifier: { notify: async () => undefined },
      storage,
      unitOfWork: { execute: (work) => work(tx) },
    })

    await expect(
      useCase.send({
        actorUserId: OPERATOR_ID,
        attachmentIds: [],
        bodyText: '   ',
        companyId: COMPANY_ID,
        idempotencyKey: 'send-empty-000001',
        occurrenceId: OCCURRENCE_ID,
      }),
    ).rejects.toMatchObject({ status: 422 })
    expect(fake.locked).toEqual([])
  })

  test('motorista responde com foto: o alvo é o app, o motorista e ele mesmo', async () => {
    const fake = attachmentsFake()
    const tx = driverTransaction(fake.port)
    const useCase = createReplyMyOccurrenceConversationUseCase({
      clock: () => NOW,
      fingerprintService,
      storage,
      unitOfWork: { execute: (work) => work(tx) },
    })

    await useCase.reply({
      attachmentIds: ['upload-9'],
      bodyText: 'Canhoto rasgado.',
      companyId: COMPANY_ID,
      driverId: 'driver-1',
      driverUserId: DRIVER_USER_ID,
      idempotencyKey: 'reply-with-photo-01',
      occurrenceId: OCCURRENCE_ID,
    })

    expect(fake.locked[0]?.target).toEqual({
      channel: 'app',
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      occurrenceKind: 'document',
      participant: 'driver',
      requestedByUserId: DRIVER_USER_ID,
    })
  })

  test('operador → contratante pelo portal: o alvo é o portal e a contratante', async () => {
    const fake = attachmentsFake()
    const useCase = createSendContractorPortalMessageUseCase({
      clock: () => NOW,
      fingerprintService,
      newRef: () => REF,
      notifier: { notify: async () => undefined },
      storage,
      unitOfWork: {
        execute: (work) =>
          work({
            ...idempotency(),
            attachments: fake.port,
            findAudience: async () => ({
              audience: {
                contractorId: 'contractor-alfa',
                occurrenceKind: 'document',
                occurrenceLabel: 'NF 4512/1',
                userIds: ['portal-user'],
              },
              kind: 'available',
            }),
            findOrCreateContractorConversation: async () => ({ id: 'conversation-contractor' }),
            insertPortalMessage: async () => ({ id: 'message-2' }),
          }),
      },
    })

    await useCase.send({
      actorUserId: OPERATOR_ID,
      attachmentIds: ['upload-2'],
      bodyText: 'Segue o comprovante.',
      companyId: COMPANY_ID,
      idempotencyKey: 'portal-with-file-01',
      occurrenceId: OCCURRENCE_ID,
    })

    expect(fake.locked[0]?.target).toEqual({
      channel: 'portal',
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      occurrenceKind: 'document',
      participant: 'contractor',
      requestedByUserId: OPERATOR_ID,
    })
    expect(fake.attached[0]).toMatchObject({ messageId: 'message-2', uploadId: 'upload-2' })
  })

  test('contratante pelo portal: a ocorrência vem da referência, e quem pediu é a conta', async () => {
    const fake = attachmentsFake()
    const useCase = createContractorPortalConversationUseCase({
      clock: () => NOW,
      fingerprintService,
      newRef: () => REF,
      scopes: {
        resolveScope: async () =>
          resolveContractorScope([{ contractorId: 'contractor-alfa', taxId: '11222333000181' }]),
      },
      storage,
      unitOfWork: {
        execute: (work) =>
          work({
            ...idempotency(),
            attachments: fake.port,
            ensureConversationRefs: async () => new Map(),
            findConversation: async () => ({
              id: 'conversation-contractor',
              occurrenceId: OCCURRENCE_ID,
              occurrenceKind: 'document',
            }),
            insertPortalMessage: async (input) => ({ createdAt: input.createdAt, id: 'message-3' }),
            listAttachments: async () => [],
            listMessages: async () => [],
            markRead: async () => undefined,
            unreadCount: async () => 0,
          }),
      },
    })

    await useCase.send({
      attachmentIds: ['upload-3'],
      bodyText: '',
      context: {
        companyId: COMPANY_ID,
        kind: 'company',
        membershipId: 'membership-portal',
        permissions: new Set(['deliveries.track']),
        roles: ['contractor'],
        userId: PORTAL_USER_ID,
      },
      idempotencyKey: 'portal-user-file-01',
      ref: REF,
    })

    expect(fake.locked[0]?.target).toEqual({
      channel: 'portal',
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      occurrenceKind: 'document',
      participant: 'contractor',
      requestedByUserId: PORTAL_USER_ID,
    })
    expect(fake.attached[0]).toMatchObject({ messageId: 'message-3', uploadId: 'upload-3' })
  })
})

describe('o pedido de upload em cada superfície (spec 183 T702a)', () => {
  const declared = { contentType: 'application/pdf', fileName: 'comprovante.pdf', sizeBytes: 2048 }

  function uploadsFake() {
    const inserted: ConversationUploadTarget[] = []
    return {
      inserted,
      repository: {
        insertUpload: async (input: ConversationUploadTarget) => void inserted.push(input),
      },
    }
  }

  test('o operador pede para o motorista (app) ou para a contratante (portal); e-mail ainda não', async () => {
    const uploads = uploadsFake()
    const useCase = createRequestOccurrenceConversationUploadUseCase({
      bucket: 'bucket-test',
      clock: () => NOW,
      newId: () => 'upload-1',
      occurrences: { findKind: async () => 'document' },
      repository: uploads.repository,
      storage,
    })
    const request = (participant: 'contractor' | 'driver', channel: 'app' | 'email' | 'portal') =>
      useCase.request({
        ...declared,
        actorUserId: OPERATOR_ID,
        channel,
        companyId: COMPANY_ID,
        occurrenceId: OCCURRENCE_ID,
        participant,
      })

    await request('driver', 'app')
    await request('contractor', 'portal')
    await expect(request('contractor', 'email')).rejects.toMatchObject({ status: 422 })
    await expect(request('driver', 'portal')).rejects.toMatchObject({ status: 422 })

    expect(
      uploads.inserted.map((row) => [row.participant, row.channel, row.requestedByUserId]),
    ).toEqual([
      ['driver', 'app', OPERATOR_ID],
      ['contractor', 'portal', OPERATOR_ID],
    ])
  })

  test('ocorrência de outra empresa é 404 sem gravar', async () => {
    const uploads = uploadsFake()
    const useCase = createRequestOccurrenceConversationUploadUseCase({
      bucket: 'bucket-test',
      clock: () => NOW,
      newId: () => 'upload-1',
      occurrences: { findKind: async () => null },
      repository: uploads.repository,
      storage,
    })

    await expect(
      useCase.request({
        ...declared,
        actorUserId: OPERATOR_ID,
        channel: 'app',
        companyId: COMPANY_ID,
        occurrenceId: OCCURRENCE_ID,
        participant: 'driver',
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(uploads.inserted).toEqual([])
  })

  test('o motorista pede para a própria conversa, só da ocorrência dele', async () => {
    const uploads = uploadsFake()
    const tx = driverTransaction(attachmentsFake().port)
    const useCase = createRequestMyConversationUploadUseCase({
      bucket: 'bucket-test',
      clock: () => NOW,
      newId: () => 'upload-1',
      repository: uploads.repository,
      storage,
      unitOfWork: { execute: (work) => work(tx) },
    })

    await useCase.request({
      ...declared,
      companyId: COMPANY_ID,
      driverId: 'driver-1',
      driverUserId: DRIVER_USER_ID,
      occurrenceId: OCCURRENCE_ID,
    })

    expect(uploads.inserted[0]).toMatchObject({
      channel: 'app',
      participant: 'driver',
      requestedByUserId: DRIVER_USER_ID,
    })
  })

  test('a contratante pede pela referência; referência que não é dela é 404', async () => {
    const uploads = uploadsFake()
    const build = (found: boolean) =>
      createRequestPortalConversationUploadUseCase({
        bucket: 'bucket-test',
        clock: () => NOW,
        newId: () => 'upload-1',
        repository: uploads.repository,
        scopes: {
          resolveScope: async () =>
            resolveContractorScope([{ contractorId: 'contractor-alfa', taxId: '11222333000181' }]),
        },
        storage,
        unitOfWork: {
          execute: (work) =>
            work({
              findConversation: async () =>
                found
                  ? {
                      id: 'conversation-contractor',
                      occurrenceId: OCCURRENCE_ID,
                      occurrenceKind: 'document',
                    }
                  : null,
            } as never),
        },
      })
    const context = {
      companyId: COMPANY_ID,
      kind: 'company' as const,
      membershipId: 'membership-portal',
      permissions: new Set(['deliveries.track'] as const),
      roles: ['contractor'] as const,
      userId: PORTAL_USER_ID,
    }

    const result = await build(true).request({ ...declared, context: context as never, ref: REF })
    await expect(
      build(false).request({ ...declared, context: context as never, ref: REF }),
    ).rejects.toMatchObject({
      status: 404,
    })

    expect(uploads.inserted).toHaveLength(1)
    expect(uploads.inserted[0]).toMatchObject({
      channel: 'portal',
      participant: 'contractor',
      requestedByUserId: PORTAL_USER_ID,
    })
    /** A resposta do portal não leva id interno além do próprio pedido de upload. */
    expect(Object.keys(result).sort()).toEqual(['expiresAt', 'uploadId', 'uploadUrl'])
  })
})

describe('a leitura do operador com anexo (spec 183 T702a)', () => {
  test('cada mensagem traz os anexos dela com a URL temporária; sem anexo, lista vazia', async () => {
    const asked: unknown[] = []
    const message = (id: string) => ({
      attachments: [],
      author: { kind: 'driver' as const, name: null, userId: DRIVER_USER_ID },
      bodyText: '',
      channel: 'app' as const,
      createdAt: NOW.toISOString(),
      direction: 'inbound' as const,
      id,
      status: null,
      statusTimes: {},
    })
    const useCase = createListOccurrenceConversationsUseCase({
      reader: {
        findAttachments: async (input) => {
          asked.push(input)
          return [
            {
              bucket: 'bucket-test',
              contentType: 'image/jpeg',
              fileName: 'canhoto.jpg',
              id: 'attachment-1',
              messageId: 'message-2',
              objectKey: 'occurrence-conversations/token-foto',
              sizeBytes: 4096,
            },
          ]
        },
        findConversations: async () => ({
          contractorPortal: { available: false },
          conversations: [
            {
              id: 'conversation-driver',
              messages: [message('message-1'), message('message-2')],
              participant: 'driver',
              status: 'open',
              unreadCount: 0,
            },
          ],
        }),
      },
      storage,
    })

    const view = await useCase.list({
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      userId: OPERATOR_ID,
    })

    expect(asked).toEqual([{ companyId: COMPANY_ID, messageIds: ['message-1', 'message-2'] }])
    expect(view.conversations[0]?.messages.map((row) => row.attachments)).toEqual([
      [],
      [
        {
          contentType: 'image/jpeg',
          fileName: 'canhoto.jpg',
          id: 'attachment-1',
          sizeBytes: 4096,
          url: 'https://s3.test/occurrence-conversations/token-foto',
        },
      ],
    ])
  })
})
