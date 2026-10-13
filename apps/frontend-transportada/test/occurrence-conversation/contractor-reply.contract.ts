/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 248 T5.3 (RF6, RF13): o painel do retorno da contratante. O estado em texto, o tom do selo, o que o
 * operador pode fazer em cada estado, a nota do "tratado" e o cliente — estrito no retorno, tolerante no
 * item da linha do tempo, e sem mandar dado que a API não pediu.
 */
import { describe, expect, test } from 'bun:test'

import {
  canDeliverContractorReplyToDriver,
  canMarkContractorReplyHandled,
  createResendRequestIdempotencyKey,
  describeContractorReplyState,
  describeResendAction,
  isResendRequestEvent,
  resolveResendErrorKey,
  toContractorReplySummary,
  validateHandledNote,
} from '@/modules/occurrence-conversation/shared/contractorReply.service'
import { createContractorReplyClient } from '@/modules/occurrence-conversation/shared/contractorReplyClient.service'
import { OccurrenceConversationRequestError } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import {
  CONTRACTOR_REPLY_STATUSES,
  type ContractorReplyStatus,
} from '@/modules/occurrence-conversation/shared/contractorReply.types'

const NOW = new Date('2026-10-12T20:00:00.000Z')
const API_URL = 'https://api.example.test'

function reply(status: ContractorReplyStatus, extra: Record<string, unknown> = {}) {
  return {
    alertCount: 0,
    deadlineAt: '2026-10-12T18:00:00.000Z',
    reason: null,
    status,
    ...extra,
  } as const
}

describe('o estado do retorno em texto (spec 248 RF13)', () => {
  test('todo estado tem rótulo, e a chave nasce do estado', () => {
    for (const status of CONTRACTOR_REPLY_STATUSES) {
      expect(describeContractorReplyState(reply(status), NOW).labelKey).toBe(
        `contractorReply.status.${status}`,
      )
    }
  })

  test('atrasada conta os alertas; nos outros estados a contagem não aparece', () => {
    expect(describeContractorReplyState(reply('overdue', { alertCount: 3 }), NOW)).toMatchObject({
      alertCount: 3,
      tone: 'warning',
    })
    expect(
      describeContractorReplyState(reply('delivered', { alertCount: 3 }), NOW).alertCount,
    ).toBe(0)
  })

  test('precisa do operador diz o motivo; sem motivo, nada', () => {
    expect(
      describeContractorReplyState(reply('needs_operator', { reason: 'multiple_attachments' }), NOW)
        .reasonKey,
    ).toBe('contractorReply.reason.multiple_attachments')
    expect(describeContractorReplyState(reply('needs_operator'), NOW).reasonKey).toBeNull()
  })

  test('aguardando com o prazo vencido avisa, mesmo antes de o alarme virar atrasada', () => {
    expect(describeContractorReplyState(reply('awaiting_contractor'), NOW).isDeadlinePassed).toBe(
      true,
    )
    expect(
      describeContractorReplyState(
        reply('awaiting_contractor', { deadlineAt: '2026-10-12T21:00:00.000Z' }),
        NOW,
      ).isDeadlinePassed,
    ).toBe(false)
    expect(
      describeContractorReplyState(reply('awaiting_contractor', { deadlineAt: null }), NOW)
        .isDeadlinePassed,
    ).toBe(false)
  })

  test('entregue e tratado são verdes; cancelado é neutro; o resto pede atenção ou informa', () => {
    const tones = Object.fromEntries(
      CONTRACTOR_REPLY_STATUSES.map((status) => [
        status,
        describeContractorReplyState(reply(status), NOW).tone,
      ]),
    )
    expect(tones).toEqual({
      awaiting_contractor: 'info',
      awaiting_operator: 'warning',
      cancelled: 'secondary',
      delivered: 'success',
      handled: 'success',
      needs_operator: 'warning',
      overdue: 'warning',
      reply_received: 'info',
    })
  })
})

describe('o selo da listagem (spec 248 RF13, T5.2)', () => {
  test('lê estado e alertas; ausente, malformado ou estado desconhecido é "sem retorno"', () => {
    expect(toContractorReplySummary({ alertCount: 3, status: 'overdue' })).toEqual({
      alertCount: 3,
      status: 'overdue',
    })
    expect(toContractorReplySummary(undefined)).toBeNull()
    expect(toContractorReplySummary(null)).toBeNull()
    expect(toContractorReplySummary({ alertCount: '3', status: 'overdue' })).toBeNull()
    expect(toContractorReplySummary({ alertCount: 0, status: 'inventado' })).toBeNull()
  })
})

describe('o que o operador pode fazer (spec 248 RF6)', () => {
  test('tratar vale até o retorno ser entregue, tratado ou cancelado', () => {
    const handleable = CONTRACTOR_REPLY_STATUSES.filter(canMarkContractorReplyHandled)
    expect(handleable).toEqual([
      'awaiting_contractor',
      'overdue',
      'reply_received',
      'awaiting_operator',
      'needs_operator',
    ])
  })

  test('enviar ao motorista só com o boleto aceito parado no operador', () => {
    expect(
      canDeliverContractorReplyToDriver({ replyAttachmentId: 'a-1', status: 'awaiting_operator' }),
    ).toBe(true)
    expect(
      canDeliverContractorReplyToDriver({ replyAttachmentId: null, status: 'awaiting_operator' }),
    ).toBe(false)
    expect(
      canDeliverContractorReplyToDriver({ replyAttachmentId: 'a-1', status: 'delivered' }),
    ).toBe(false)
  })

  test('a nota é aparada, de 1 a 500', () => {
    expect(validateHandledNote('   ')).toEqual({ error: 'required' })
    expect(validateHandledNote('  Liguei.  ')).toEqual({ note: 'Liguei.' })
    expect(validateHandledNote('x'.repeat(500))).toEqual({ note: 'x'.repeat(500) })
    expect(validateHandledNote('x'.repeat(501))).toEqual({ error: 'tooLong' })
  })
})

function createClient(response: Response, requests: Request[] = []) {
  return createContractorReplyClient({
    apiUrl: API_URL,
    fetch: (request) => {
      requests.push(request)
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

async function failureCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise
  } catch (error) {
    return error instanceof OccurrenceConversationRequestError ? error.code : undefined
  }
  return undefined
}

const VIEW = {
  alertCount: 2,
  alertMaxCount: 24,
  deadlineAt: '2026-10-12T18:00:00.000Z',
  deliveries: [
    {
      id: 'd-1',
      reason: null,
      sentAt: '2026-10-12T19:00:00.000Z',
      status: 'sent',
      target: 'driver_app_chat',
    },
    { id: 'd-2', status: 'sent', target: 'telepatia' },
  ],
  events: [
    {
      actorKind: 'system',
      createdAt: '2026-10-12T18:30:00.000Z',
      fromStatus: 'awaiting_contractor',
      id: 'e-1',
      reason: null,
      toStatus: 'overdue',
    },
    { id: 'e-2', toStatus: 'inventado' },
  ],
  handledNote: null,
  reason: null,
  replyAttachmentId: null,
  status: 'overdue',
}

describe('o cliente do retorno (spec 248 RF13)', () => {
  test('lê o retorno; evento e entrega que o guard não reconhece saem, sem derrubar o painel', async () => {
    const requests: Request[] = []
    const client = createClient(Response.json({ data: VIEW }), requests)

    const view = await client.readReply({ occurrenceId: 'occurrence/1' })

    expect(view?.status).toBe('overdue')
    expect(view?.events.map((event) => event.id)).toEqual(['e-1'])
    expect(view?.deliveries.map((delivery) => delivery.id)).toEqual(['d-1'])
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.url).toBe(`${API_URL}/trip-occurrences/occurrence%2F1/contractor-reply`)
  })

  test('ocorrência sem retorno vem nula; estado desconhecido é resposta inválida', async () => {
    expect(
      await createClient(Response.json({ data: null })).readReply({ occurrenceId: 'o-1' }),
    ).toBeNull()
    const invalid = createClient(Response.json({ data: { ...VIEW, status: 'inventado' } }))
    expect(await failureCodeOf(invalid.readReply({ occurrenceId: 'o-1' }))).toBe(
      'OCCURRENCE_CONVERSATION_RESPONSE_INVALID',
    )
  })

  test('tratar manda só a nota; o erro chega pelo código da API', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json({ data: { kind: 'handled' } }, { status: 201 }),
      requests,
    )

    expect(await client.markHandled({ note: 'Liguei.', occurrenceId: 'o-1' })).toEqual({
      kind: 'handled',
    })
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe(`${API_URL}/trip-occurrences/o-1/contractor-reply/handled`)
    expect(await requests[0]?.json()).toEqual({ note: 'Liguei.' })

    const refused = createClient(
      Response.json(
        { error: { code: 'CONTRACTOR_REPLY_NOT_HANDLEABLE', message: 'x' } },
        { status: 409 },
      ),
    )
    expect(await failureCodeOf(refused.markHandled({ note: 'Liguei.', occurrenceId: 'o-1' }))).toBe(
      'CONTRACTOR_REPLY_NOT_HANDLEABLE',
    )
  })
})

describe('reenviar o pedido à contratante (spec 248 RF6)', () => {
  const allowed = { availableAt: null, canResend: true, reason: null } as const
  const tooSoon = {
    availableAt: '2026-10-12T21:00:00.000Z',
    canResend: false,
    reason: 'too_soon',
  } as const

  test('o botão vale só enquanto o retorno espera a contratante e a API liberou', () => {
    for (const status of CONTRACTOR_REPLY_STATUSES) {
      const isWaiting = status === 'awaiting_contractor' || status === 'overdue'
      expect(describeResendAction({ resend: allowed, status }).kind).toBe(
        isWaiting ? 'enabled' : 'hidden',
      )
    }
  })

  test('dentro do intervalo do alarme fica desabilitado, com o motivo e a hora em que volta', () => {
    expect(describeResendAction({ resend: tooSoon, status: 'overdue' })).toEqual({
      availableAt: '2026-10-12T21:00:00.000Z',
      kind: 'disabled',
      reasonKey: 'contractorReply.resend.tooSoon',
    })
  })

  test('API anterior à ação (sem o campo) ou resposta que já não espera: sem botão, nunca um botão que dá 409', () => {
    expect(describeResendAction({ resend: null, status: 'overdue' })).toEqual({ kind: 'hidden' })
    expect(
      describeResendAction({
        resend: { availableAt: null, canResend: false, reason: 'not_waiting' },
        status: 'overdue',
      }),
    ).toEqual({ kind: 'hidden' })
  })

  test('o evento do operador que deixa o retorno no mesmo estado de espera é o reenvio', () => {
    const event = { actorKind: 'user', fromStatus: 'overdue', toStatus: 'overdue' } as const
    expect(isResendRequestEvent(event)).toBe(true)
    expect(isResendRequestEvent({ ...event, actorKind: 'system' })).toBe(false)
    expect(isResendRequestEvent({ ...event, fromStatus: 'awaiting_contractor' })).toBe(false)
    expect(
      isResendRequestEvent({ actorKind: 'user', fromStatus: 'handled', toStatus: 'handled' }),
    ).toBe(false)
    expect(
      isResendRequestEvent({ actorKind: 'user', fromStatus: 'overdue', toStatus: 'handled' }),
    ).toBe(false)
  })

  test('a recusa sai pelo código estável da API; código desconhecido cai no texto genérico', () => {
    expect(resolveResendErrorKey('CONTRACTOR_REPLY_RESEND_TOO_SOON')).toBe(
      'contractorReply.resend.error.tooSoon',
    )
    expect(resolveResendErrorKey('CONTRACTOR_REPLY_NOT_RESENDABLE')).toBe(
      'contractorReply.resend.error.notResendable',
    )
    expect(resolveResendErrorKey('OCCURRENCE_CONVERSATION_NO_RECIPIENT')).toBe(
      'contractorReply.resend.error.noRecipient',
    )
    expect(resolveResendErrorKey('INVENTADO')).toBe('contractorReply.resend.error.send')
    expect(resolveResendErrorKey(null)).toBe('contractorReply.resend.error.send')
  })

  test('a chave da tentativa tem o prefixo da ação e o aleatório de quem chama', () => {
    expect(createResendRequestIdempotencyKey(() => 'abc')).toBe('contractor-reply-resend:abc')
  })

  test('a leitura traz o campo do reenvio; sem ele ou malformado é nulo, e o painel segue', async () => {
    const withResend = createClient(Response.json({ data: { ...VIEW, resend: tooSoon } }))
    expect((await withResend.readReply({ occurrenceId: 'o-1' }))?.resend).toEqual(tooSoon)

    const without = createClient(Response.json({ data: VIEW }))
    expect((await without.readReply({ occurrenceId: 'o-1' }))?.resend).toBeNull()

    const malformed = createClient(
      Response.json({ data: { ...VIEW, resend: { canResend: true, reason: 'inventado' } } }),
    )
    expect((await malformed.readReply({ occurrenceId: 'o-1' }))?.resend).toBeNull()
  })

  test('reenviar é um POST sem corpo, com a Idempotency-Key, e devolve quantos contatos receberam', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json({ data: { recipientCount: 2 } }, { status: 202 }),
      requests,
    )

    expect(
      await client.resendRequest({
        idempotencyKey: 'contractor-reply-resend:abc',
        occurrenceId: 'o-1',
      }),
    ).toEqual({ recipientCount: 2 })
    expect(requests[0]?.method).toBe('POST')
    expect(requests[0]?.url).toBe(`${API_URL}/trip-occurrences/o-1/contractor-reply/resend-request`)
    expect(requests[0]?.headers.get('idempotency-key')).toBe('contractor-reply-resend:abc')
    expect(await requests[0]?.text()).toBe('')
  })

  test('a recusa chega pelo código; resposta sem a contagem é inválida', async () => {
    const refused = createClient(
      Response.json(
        { error: { code: 'CONTRACTOR_REPLY_RESEND_TOO_SOON', message: 'x' } },
        { status: 409 },
      ),
    )
    expect(
      await failureCodeOf(
        refused.resendRequest({
          idempotencyKey: 'contractor-reply-resend:abc',
          occurrenceId: 'o-1',
        }),
      ),
    ).toBe('CONTRACTOR_REPLY_RESEND_TOO_SOON')

    const invalid = createClient(Response.json({ data: {} }, { status: 202 }))
    expect(
      await failureCodeOf(
        invalid.resendRequest({
          idempotencyKey: 'contractor-reply-resend:abc',
          occurrenceId: 'o-1',
        }),
      ),
    ).toBe('OCCURRENCE_CONVERSATION_RESPONSE_INVALID')
  })
})
