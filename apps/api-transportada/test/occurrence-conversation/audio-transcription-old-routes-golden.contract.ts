/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 T2.2 (contract.md §6, D12): a tela antiga da ocorrência e o portal não ganham transcrição nem
 * duração. Os casos de uso das rotas `/me/.../occurrences/**` e `/client/**` e a leitura do escritório,
 * com um anexo de áudio na mensagem, devolvem os mesmos bytes de antes: lista branca de cinco campos
 * (quatro no portal) e nada de `transcription` nem `durationMs`.
 */
import { describe, expect, test } from 'bun:test'

import { resolveContractorScope } from '../../src/contractor-portal/domain/contractor-scope.policy.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type { ConversationAttachmentRecord } from '../../src/occurrence-conversation/application/conversation-attachment.port.js'
import { createContractorPortalConversationUseCase } from '../../src/occurrence-conversation/application/contractor-portal-conversation.use-case.js'
import type { DriverConversationTransactionPort } from '../../src/occurrence-conversation/application/driver-conversation.port.js'
import { createListMyOccurrenceConversationUseCase } from '../../src/occurrence-conversation/application/driver-conversation.use-case.js'
import type { OccurrenceConversationsView } from '../../src/occurrence-conversation/application/occurrence-conversation.port.js'
import { createListOccurrenceConversationsUseCase } from '../../src/occurrence-conversation/application/read-occurrence-conversations.use-case.js'
import {
  NO_ATTACHMENTS,
  SIGNING_ATTACHMENT_STORAGE,
} from '../fixtures/conversation-attachment.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000264201'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000264202'
const MESSAGE_ID = '00000000-0000-4000-8000-000000264203'
const NOW = new Date('2026-10-12T12:00:00.000Z')

const AUDIO: ConversationAttachmentRecord = {
  bucket: 'bucket',
  contentType: 'audio/ogg',
  fileName: 'voz.ogg',
  id: '00000000-0000-4000-8000-000000264204',
  messageId: MESSAGE_ID,
  objectKey: 'conversation/voz',
  sizeBytes: 2048,
}

const DRIVER_GOLDEN =
  '[{"authorName":null,"bodyText":"","createdAt":"2026-10-12T11:00:00.000Z","direction":"inbound","id":"00000000-0000-4000-8000-000000264203","status":null,"attachments":[{"contentType":"audio/ogg","fileName":"voz.ogg","id":"00000000-0000-4000-8000-000000264204","sizeBytes":2048,"url":"https://storage.test/conversation/voz"}]}]'

const OFFICE_GOLDEN =
  '{"contractorPortal":{"available":false},"conversations":[{"id":"conversation-1","messages":[{"attachments":[{"contentType":"audio/ogg","fileName":"voz.ogg","id":"00000000-0000-4000-8000-000000264204","sizeBytes":2048,"url":"https://storage.test/conversation/voz"}],"author":{"kind":"automatic"},"bodyText":"","channel":"app","createdAt":"2026-10-12T11:00:00.000Z","direction":"inbound","id":"00000000-0000-4000-8000-000000264203","status":null,"statusTimes":{}}],"participant":"driver","status":"open","unreadCount":0}]}'

const PORTAL_GOLDEN =
  '{"messages":[{"attachments":[{"contentType":"audio/ogg","fileName":"voz.ogg","sizeBytes":2048,"url":"https://storage.test/conversation/voz"}],"body":"","channel":"portal","createdAt":"2026-10-12T11:00:00.000Z","mine":false,"side":"contractor"}],"unreadCount":0}'

describe('as rotas antigas da conversa de ocorrência não mudam com a transcrição (spec 264 T2.2)', () => {
  test('GET /me/trips/current/occurrences/:id/messages: o áudio sai com os cinco campos de sempre', async () => {
    const transaction: DriverConversationTransactionPort = {
      applyDriverStatus: async () => undefined,
      attachments: NO_ATTACHMENTS,
      findDriverTarget: async () => null,
      findIdempotency: async () => null,
      findMyOccurrence: async () => ({ occurrenceKind: 'document' }),
      findOrCreateDriverConversation: async () => ({
        driverUserId: 'driver-user',
        id: 'conversation-1',
        protocol: '261012-AB12',
      }),
      insertMessage: async () => ({ id: MESSAGE_ID }),
      listAttachments: async () => [AUDIO],
      listDriverMessages: async () => [
        {
          authorName: null,
          bodyText: '',
          createdAt: new Date('2026-10-12T11:00:00.000Z'),
          direction: 'inbound',
          id: MESSAGE_ID,
          status: null,
        },
      ],
      listMyConversations: async () => [],
      saveIdempotency: async () => undefined,
    }
    const list = createListMyOccurrenceConversationUseCase({
      clock: () => NOW,
      storage: SIGNING_ATTACHMENT_STORAGE,
      unitOfWork: { execute: (work) => work(transaction) },
    })
    const result = await list.list({
      companyId: COMPANY_ID,
      driverId: 'driver-1',
      driverUserId: 'driver-user',
      occurrenceId: OCCURRENCE_ID,
    })
    expect(JSON.stringify(result)).toBe(DRIVER_GOLDEN)
  })

  test('a leitura das conversas da ocorrência no painel traz o áudio sem transcrição', async () => {
    const view: OccurrenceConversationsView = {
      contractorPortal: { available: false },
      conversations: [
        {
          id: 'conversation-1',
          messages: [
            {
              attachments: [],
              author: { kind: 'automatic' },
              bodyText: '',
              channel: 'app',
              createdAt: '2026-10-12T11:00:00.000Z',
              direction: 'inbound',
              id: MESSAGE_ID,
              status: null,
              statusTimes: {},
            },
          ],
          participant: 'driver',
          status: 'open',
          unreadCount: 0,
        },
      ],
    }
    const useCase = createListOccurrenceConversationsUseCase({
      reader: { findAttachments: async () => [AUDIO], findConversations: async () => view },
      storage: SIGNING_ATTACHMENT_STORAGE,
    })
    const result = await useCase.list({
      companyId: COMPANY_ID,
      occurrenceId: OCCURRENCE_ID,
      userId: 'operator',
    })
    expect(JSON.stringify(result)).toBe(OFFICE_GOLDEN)
  })

  test('GET /client/me/occurrences/:ref/conversation: o portal vê o áudio sem id, sem transcrição e sem duração', async () => {
    const REF = 'Qm9hcmQtcmVmZXJlbmNpYS0xMjM0NTY'
    const useCase = createContractorPortalConversationUseCase({
      clock: () => NOW,
      fingerprintService: { create: async ({ operation }) => operation },
      newRef: () => REF,
      scopes: {
        resolveScope: async () =>
          resolveContractorScope([{ contractorId: 'contractor-alfa', taxId: '11222333000181' }]),
      },
      storage: SIGNING_ATTACHMENT_STORAGE,
      unitOfWork: {
        execute: (work) =>
          work({
            attachments: NO_ATTACHMENTS,
            ensureConversationRefs: async () => new Map(),
            findConversation: async () => ({
              id: 'conversation-1',
              occurrenceId: OCCURRENCE_ID,
              occurrenceKind: 'document',
            }),
            findIdempotency: async () => null,
            insertPortalMessage: async (input) => ({ createdAt: input.createdAt, id: MESSAGE_ID }),
            listAttachments: async () => [AUDIO],
            listMessages: async () => [
              {
                authorUserId: null,
                bodyText: '',
                channel: 'portal',
                createdAt: new Date('2026-10-12T11:00:00.000Z'),
                direction: 'inbound',
                id: MESSAGE_ID,
              },
            ],
            markRead: async () => undefined,
            saveIdempotency: async () => undefined,
            unreadCount: async () => 0,
          }),
      },
    })
    const context: CompanyContext = {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: 'membership-portal',
      permissions: new Set(['deliveries.track']),
      roles: ['contractor'],
      userId: 'portal-user',
    }
    const result = await useCase.read({ context, ref: REF })
    expect(JSON.stringify(result)).toBe(PORTAL_GOLDEN)
  })
})
