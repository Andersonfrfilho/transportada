/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T654 (RF21, D9): a operação escreve à contratante pelo canal Portal. Só quando o portal
 * mostra a ocorrência e há conta ligada à contratante; a mensagem nasce entregue (gravada já está no
 * portal); cada conta do portal recebe um aviso por e-mail **sem o corpo**; o reenvio da mesma
 * chave não grava nem avisa de novo.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ContractorPortalMessageTransactionPort,
  ContractorPortalNotifierPort,
} from '../../src/occurrence-conversation/application/contractor-portal-message.port.js'
import { createSendContractorPortalMessageUseCase } from '../../src/occurrence-conversation/application/contractor-portal-message.use-case.js'
import { createContractorPortalNotifier } from '../../src/occurrence-conversation/infrastructure/contractor-portal-notifier.gateway.js'
import { createOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/occurrence-conversation.routes.js'
import { NOTIFICATION_CHANNEL } from '@adatechnology/notification-contracts'

import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../src/notification/domain/notification-catalog.constant.js'
import {
  NO_ATTACHMENTS,
  UNUSED_ATTACHMENT_STORAGE,
} from '../fixtures/conversation-attachment.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OPERATOR_ID = '00000000-0000-4000-8000-000000000002'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000000003'
const NOW = new Date('2026-09-25T12:00:00.000Z')

type Audience = Awaited<ReturnType<ContractorPortalMessageTransactionPort['findAudience']>>

function createFake(audience: Audience) {
  const calls: { readonly name: string; readonly input: unknown }[] = []
  const notices: unknown[] = []
  const idempotency = new Map<string, { fingerprint: string; response: unknown }>()
  const transaction: ContractorPortalMessageTransactionPort = {
    attachments: NO_ATTACHMENTS,
    findAudience: async (input) => {
      calls.push({ input, name: 'findAudience' })
      return audience
    },
    findIdempotency: async ({ idempotencyKey }) => idempotency.get(idempotencyKey) ?? null,
    /** Spec 183 T702d: sem encaminhamento nestes casos. */
    forwardDriverAttachments: async () => 0,
    findOrCreateContractorConversation: async (input) => {
      calls.push({ input, name: 'findOrCreateContractorConversation' })
      return { id: 'conversation-1' }
    },
    insertPortalMessage: async (input) => {
      calls.push({ input, name: 'insertPortalMessage' })
      return { id: 'message-1' }
    },
    saveIdempotency: async (input) => {
      idempotency.set(input.idempotencyKey, input)
    },
  }
  const notifier: ContractorPortalNotifierPort = {
    notify: async (input) => {
      notices.push(input)
    },
  }
  const useCase = createSendContractorPortalMessageUseCase({
    clock: () => NOW,
    storage: UNUSED_ATTACHMENT_STORAGE,
    fingerprintService: {
      create: async ({ fields, operation }) =>
        `${operation}:${fields.map((field) => new TextDecoder().decode(field)).join('|')}`,
    },
    newRef: () => 'Qm9hcmQtcmVmZXJlbmNpYS0xMjM0NTY',
    notifier,
    unitOfWork: { execute: (work) => work(transaction) },
  })
  const send = (bodyText: string, idempotencyKey = 'portal-operator-key-0001') =>
    useCase.send({
      actorUserId: OPERATOR_ID,
      bodyText,
      companyId: COMPANY_ID,
      idempotencyKey,
      occurrenceId: OCCURRENCE_ID,
    })
  return { calls, notices, send }
}

const AVAILABLE: Audience = {
  audience: {
    contractorId: 'contractor-alfa',
    occurrenceKind: 'document',
    occurrenceLabel: 'NF 4512/1',
    userIds: ['portal-user-1', 'portal-user-2'],
  },
  kind: 'available',
}

describe('a operação escreve pelo portal (spec 183 T654)', () => {
  test('grava a mensagem enviada pelo portal, já entregue, e avisa as contas sem o corpo', async () => {
    const { calls, notices, send } = createFake(AVAILABLE)

    const result = await send('  Recebemos a nota de devolução.  ')

    expect(result).toEqual({ conversationId: 'conversation-1', conversationMessageId: 'message-1' })
    expect(calls.find((call) => call.name === 'findOrCreateContractorConversation')?.input).toEqual(
      {
        companyId: COMPANY_ID,
        contractorId: 'contractor-alfa',
        occurrenceId: OCCURRENCE_ID,
        occurrenceKind: 'document',
        publicRef: 'Qm9hcmQtcmVmZXJlbmNpYS0xMjM0NTY',
      },
    )
    expect(calls.find((call) => call.name === 'insertPortalMessage')?.input).toEqual({
      actorUserId: OPERATOR_ID,
      bodyText: 'Recebemos a nota de devolução.',
      companyId: COMPANY_ID,
      conversationId: 'conversation-1',
      createdAt: NOW,
    })
    expect(notices).toEqual([
      {
        companyId: COMPANY_ID,
        messageId: 'message-1',
        occurrenceLabel: 'NF 4512/1',
        recipientUserIds: ['portal-user-1', 'portal-user-2'],
      },
    ])
    expect(JSON.stringify(notices)).not.toContain('Recebemos')
  })

  test.each([
    ['ocorrência inexistente é 404', { kind: 'not_found' } as const, 404],
    ['portal que não mostra a ocorrência é 409', { kind: 'unavailable' } as const, 409],
    [
      'ninguém com conta no portal é 409',
      { ...AVAILABLE, audience: { ...AVAILABLE.audience, userIds: [] } } as Audience,
      409,
    ],
  ] as const)('%s, sem gravar nem avisar', async (_label, audience, status) => {
    const { calls, notices, send } = createFake(audience)

    await expect(send('Oi')).rejects.toMatchObject({ status })
    expect(calls.some((call) => call.name === 'insertPortalMessage')).toBe(false)
    expect(notices).toEqual([])
  })

  test('o reenvio da mesma chave devolve o gravado sem avisar de novo; outro texto é 409', async () => {
    const { calls, notices, send } = createFake(AVAILABLE)

    const first = await send('Texto')
    expect(await send('Texto')).toEqual(first)
    await expect(send('Outro texto')).rejects.toMatchObject({ status: 409 })

    expect(calls.filter((call) => call.name === 'insertPortalMessage')).toHaveLength(1)
    expect(notices).toHaveLength(1)
  })

  test('texto em branco é 422 antes de qualquer leitura', async () => {
    const { calls, send } = createFake(AVAILABLE)

    await expect(send('   ')).rejects.toMatchObject({ status: 422 })
    expect(calls).toEqual([])
  })
})

describe('o aviso ao portal (spec 183 T654)', () => {
  test('um aviso por conta, por e-mail, com a nota e sem o corpo; a falha não sobe', async () => {
    const sent: Record<string, unknown>[] = []
    const warnings: unknown[] = []
    const notifier = createContractorPortalNotifier({
      logger: { warn: (event, meta) => void warnings.push({ event, meta }) },
      send: async (params) => {
        if (params.recipientUserId === 'portal-user-2') throw new TypeError('queue down')
        sent.push(params)
      },
    })

    await notifier.notify({
      companyId: COMPANY_ID,
      messageId: 'message-1',
      occurrenceLabel: 'NF 4512/1',
      recipientUserIds: ['portal-user-1', 'portal-user-2'],
    })

    expect(sent).toEqual([
      {
        category: 'trip',
        companyId: COMPANY_ID,
        dedupeKey: `${NOTIFICATION_TEMPLATE_KEY.TRIP_CONTRACTOR_PORTAL_MESSAGE}:message-1:portal-user-1`,
        payload: {
          occurrenceLabel: 'NF 4512/1',
          portalAccess: 'Entre no portal de acompanhamento, em Ocorrências, para ler e responder.',
        },
        recipientUserId: 'portal-user-1',
        templateKey: NOTIFICATION_TEMPLATE_KEY.TRIP_CONTRACTOR_PORTAL_MESSAGE,
      },
    ])
    expect(warnings).toEqual([
      {
        event: 'occurrence_conversation_portal_notice_failed',
        meta: { companyId: COMPANY_ID, errorName: 'TypeError' },
      },
    ])
  })

  test('o modelo é só e-mail, com a nota e o acesso ao portal como marcadores e nenhum corpo de mensagem', () => {
    const entry = NOTIFICATION_CATALOG.find(
      (item) => item.templateKey === NOTIFICATION_TEMPLATE_KEY.TRIP_CONTRACTOR_PORTAL_MESSAGE,
    )

    expect(entry?.channels).toEqual([NOTIFICATION_CHANNEL.EMAIL])
    expect(entry?.placeholders).toEqual(['occurrenceLabel', 'portalAccess'])
    expect(entry?.templateKey).toStartWith('trip.')
    expect(entry?.templates.email?.subject).toContain('{{occurrenceLabel}}')
    expect(entry?.templates.email?.body).toContain('{{portalAccess}}')
    expect(entry?.templates.email?.body).not.toMatch(/\{\{(?!occurrenceLabel|portalAccess)/u)
  })
})

describe('a rota do envio pelo portal (spec 183 T654)', () => {
  test('contratante pelo portal aceita só { body, channel } e responde 202', async () => {
    const calls: unknown[] = []
    const routes = createOccurrenceConversationRoutes({
      sendPortal: {
        send: async (input: unknown) => {
          calls.push(input)
          return { conversationId: 'conversation-1', conversationMessageId: 'message-1' }
        },
      },
    } as never)
    const route = routes.find(
      (candidate) =>
        candidate.method === 'POST' &&
        candidate.pathname === '/trip-occurrences/:id/conversations/:participant/messages',
    )
    const post = (body: unknown) =>
      route!.execute({
        context: {
          scope: { companyId: COMPANY_ID, userId: OPERATOR_ID },
        } as never,
        correlationId: 'correlation-1',
        pathParameters: { id: OCCURRENCE_ID, participant: 'contractor' },
        request: new Request('http://api.test/x', {
          body: JSON.stringify(body),
          headers: {
            'content-type': 'application/json',
            'idempotency-key': 'portal-operator-key-0001',
          },
          method: 'POST',
        }),
      } as never)

    const response = await post({ body: 'Recebemos.', channel: 'portal' })
    expect(response.status).toBe(202)
    expect(calls).toEqual([
      {
        actorUserId: OPERATOR_ID,
        attachmentIds: [],
        bodyText: 'Recebemos.',
        companyId: COMPANY_ID,
        forwardAttachmentIds: [],
        idempotencyKey: 'portal-operator-key-0001',
        occurrenceId: OCCURRENCE_ID,
      },
    ])
    await expect(post({ body: 'x', channel: 'portal', subject: 'y' })).rejects.toMatchObject({
      status: 400,
    })

    /** Spec 183 T702d: o anexo do motorista encaminhado passa ao caso de uso; id que não é UUID, não. */
    const forwarded = '00000000-0000-4000-8000-0000000000f1'
    calls.length = 0
    expect(
      (await post({ body: '', channel: 'portal', forwardAttachmentIds: [forwarded] })).status,
    ).toBe(202)
    expect(calls).toMatchObject([{ attachmentIds: [], forwardAttachmentIds: [forwarded] }])
    await expect(
      post({ body: '', channel: 'portal', forwardAttachmentIds: ['nao-e-uuid'] }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
