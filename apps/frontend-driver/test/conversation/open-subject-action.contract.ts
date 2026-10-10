/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  resolveOpenAction,
  resolveOpenErrorKey,
  runOpenSubject,
  type OpenActionInput,
} from '../../src/modules/conversation/shared/openSubjectConversation.service'
import { DRIVER_CONVERSATION_ERROR } from '../../src/modules/conversation/shared/driverConversation.constant'
import { DriverConversationRequestError } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { buildDriverConversationPath } from '../../src/modules/shared/driverRoute.service'

/**
 * Spec 263 T3.3: o que o botão "Falar com o escritório" mostra e faz — funções puras, sem DOM.
 */
const DOCUMENT_SUBJECT = { subjectId: 'doc-1', subjectType: 'document' } as const
const TRIP_SUBJECT = { subjectId: 'trip-1', subjectType: 'trip' } as const

function actionInput(overrides: Partial<OpenActionInput> = {}): OpenActionInput {
  return {
    conversation: undefined,
    isOnline: true,
    isOpening: false,
    isUnavailable: false,
    ...overrides,
  }
}

describe('resolveOpenAction: estado do botão', () => {
  it('online e sem conversa conhecida: "open" que pede ao servidor', () => {
    expect(resolveOpenAction(actionInput())).toEqual({
      kind: 'open',
      shouldRequestServer: true,
      unreadCount: 0,
    })
  })

  it('abrindo: "opening" tem prioridade sobre tudo menos a API sem a rota', () => {
    expect(resolveOpenAction(actionInput({ isOpening: true })).kind).toBe('opening')
    expect(resolveOpenAction(actionInput({ isOpening: true, isUnavailable: true })).kind).toBe(
      'hidden',
    )
  })

  it('API sem a rota: o botão some', () => {
    expect(resolveOpenAction(actionInput({ isUnavailable: true })).kind).toBe('hidden')
  })

  it('sem rede e sem conversa: desabilitado (a conversa só nasce com o servidor)', () => {
    expect(resolveOpenAction(actionInput({ isOnline: false })).kind).toBe('offline')
  })

  it('sem rede mas com a conversa já conhecida: abre sem pedir ao servidor', () => {
    expect(
      resolveOpenAction(
        actionInput({ conversation: { status: 'open', unreadCount: 0 }, isOnline: false }),
      ),
    ).toEqual({ kind: 'open', shouldRequestServer: false, unreadCount: 0 })
  })

  it('não lidas aparecem como contagem no botão', () => {
    expect(
      resolveOpenAction(actionInput({ conversation: { status: 'open', unreadCount: 3 } })),
    ).toMatchObject({ kind: 'open', unreadCount: 3 })
  })

  it('conversa encerrada vira "Ver conversa", mesmo sem rede, e nunca pede ao servidor', () => {
    expect(
      resolveOpenAction(
        actionInput({ conversation: { status: 'closed', unreadCount: 1 }, isOnline: false }),
      ),
    ).toEqual({ kind: 'view', shouldRequestServer: false, unreadCount: 1 })
  })
})

describe('resolveOpenErrorKey', () => {
  it.each([
    [404, 'notFound'],
    [409, 'closed'],
    [429, 'rateLimited'],
    [500, 'failed'],
    [undefined, 'failed'],
  ] as const)('status %s → %s', (status, expected) => {
    expect(resolveOpenErrorKey(new DriverConversationRequestError('X', status))).toBe(expected)
  })

  it('erro que não é do adapter é falha genérica', () => {
    expect(resolveOpenErrorKey(new Error('boom'))).toBe('failed')
  })
})

describe('runOpenSubject: o toque', () => {
  function harness(openConversation: (subject: object) => Promise<unknown>) {
    const navigated: object[] = []
    const requested: object[] = []
    return {
      navigated,
      requested,
      run: (subject: typeof DOCUMENT_SUBJECT | typeof TRIP_SUBJECT, shouldRequestServer = true) =>
        runOpenSubject({
          navigate: (target) => navigated.push(target),
          openConversation: async (target) => {
            requested.push(target)
            await openConversation(target)
            return {} as never
          },
          shouldRequestServer,
          subject,
        }),
    }
  }

  it('abre no servidor e navega para a conversa da nota', async () => {
    const { navigated, requested, run } = harness(() => Promise.resolve())
    expect(await run(DOCUMENT_SUBJECT)).toEqual({ status: 'opened' })
    expect(requested).toEqual([DOCUMENT_SUBJECT])
    expect(navigated).toEqual([DOCUMENT_SUBJECT])
  })

  it('abre no servidor e navega para a conversa da viagem', async () => {
    const { navigated, run } = harness(() => Promise.resolve())
    await run(TRIP_SUBJECT)
    expect(navigated).toEqual([TRIP_SUBJECT])
  })

  it('sem pedir ao servidor, só navega', async () => {
    const { navigated, requested, run } = harness(() => Promise.resolve())
    expect(await run(DOCUMENT_SUBJECT, false)).toEqual({ status: 'opened' })
    expect(requested).toEqual([])
    expect(navigated).toEqual([DOCUMENT_SUBJECT])
  })

  it('erro vira chave de mensagem, sem navegar', async () => {
    const { navigated, run } = harness(() => {
      throw new DriverConversationRequestError('CONVERSATION_NOT_FOUND', 404)
    })
    expect(await run(DOCUMENT_SUBJECT)).toEqual({ errorKey: 'notFound', status: 'failed' })
    expect(navigated).toEqual([])
  })

  it('CONVERSATIONS_UNAVAILABLE vira "unavailable", sem navegar', async () => {
    const { navigated, run } = harness(() => {
      throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.CONVERSATIONS_UNAVAILABLE)
    })
    expect(await run(TRIP_SUBJECT)).toEqual({ status: 'unavailable' })
    expect(navigated).toEqual([])
  })
})

describe('navegação por assunto', () => {
  it('cada assunto cai na rota certa do app', () => {
    expect(buildDriverConversationPath(DOCUMENT_SUBJECT)).toBe('/conversas/document/doc-1')
    expect(buildDriverConversationPath(TRIP_SUBJECT)).toBe('/conversas/trip/trip-1')
  })
})
