/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T3.1/T3.2 (RF12, ADR-0101 D4): "Falar com o motorista" na nota e na viagem, pelo DOM
 * renderizado. Sem `trip.manage` e sem conversa a ação não existe; com ela abre (idempotente) e mostra
 * a conversa; encerrada fica legível sem compositor; sem motorista a API recusa e a tela explica.
 * O cliente HTTP é trocado uma vez (`mock.module` não se desfaz); dados sintéticos.
 */
import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { OccurrenceConversationRequestError } from '../../src/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import type { OccurrenceConversationMessage } from '../../src/modules/occurrence-conversation/shared/occurrenceConversation.types'
import type { SubjectConversationClient } from '../../src/modules/occurrence-conversation/shared/subjectConversationClient.service'
import type { SubjectConversationSummary } from '../../src/modules/occurrence-conversation/shared/subjectConversation.types'

import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

const TRIP_ID = 'trip-1'
const DOCUMENT_ID = 'document-1'

const fakes: {
  closed: unknown[]
  markedRead: unknown[]
  messages: OccurrenceConversationMessage[]
  openError: Error | undefined
  opened: unknown[]
  quickReplies: { id: string; text: string }[]
  sent: unknown[]
  summaries: SubjectConversationSummary[]
} = {
  closed: [],
  markedRead: [],
  messages: [],
  openError: undefined,
  opened: [],
  quickReplies: [],
  sent: [],
  summaries: [],
}

function summary(overrides: Partial<SubjectConversationSummary> = {}): SubjectConversationSummary {
  return {
    awaitingDriver: false,
    channels: ['app'],
    driverName: 'Marcos S.',
    lastMessageAt: null,
    protocol: '261009-K7M2',
    status: 'open',
    subjectId: DOCUMENT_ID,
    subjectLabel: 'NF 4521 · Casa Verde',
    subjectType: 'document',
    tripId: TRIP_ID,
    unreadCount: 0,
    ...overrides,
  }
}

const client: SubjectConversationClient = {
  closeConversation: (input) => {
    fakes.closed.push(input)
    return Promise.resolve(summary({ status: 'closed' }))
  },
  listConversations: () => Promise.resolve([...fakes.summaries]),
  listMessages: () => Promise.resolve([...fakes.messages]),
  markRead: (input) => {
    fakes.markedRead.push(input)
    return Promise.resolve()
  },
  openConversation: (input) => {
    fakes.opened.push(input)
    if (fakes.openError !== undefined) return Promise.reject(fakes.openError)
    const opened = summary()
    fakes.summaries = [opened]
    return Promise.resolve(opened)
  },
  putUpload: () => Promise.resolve(),
  requestUpload: () => Promise.resolve({ uploadId: 'u', uploadUrl: 'https://storage.test/u' }),
  sendMessage: (input) => {
    fakes.sent.push(input)
    return Promise.resolve(null)
  },
}

void mock.module(
  '../../src/modules/occurrence-conversation/shared/subjectConversationClient.provider',
  () => ({ getSubjectConversationClient: () => client }),
)

void mock.module('../../src/modules/occurrence-conversation/queries/quickReplies.query', () => ({
  QUICK_REPLIES_QUERY_KEY: 'occurrence-quick-replies',
  useComposerQuickRepliesQuery: () => ({ data: fakes.quickReplies }),
  useQuickRepliesQuery: () => ({ data: [] }),
  useQuickReplyMutations: () => ({}),
}))

const { SubjectConversationAction } = await import(
  '../../src/modules/occurrence-conversation/components/SubjectConversationAction.component'
)
const { TripConversationsPanel } = await import(
  '../../src/modules/occurrence-conversation/components/TripConversationsPanel.component'
)

type ActionOverrides = Partial<Parameters<typeof SubjectConversationAction>[0]>

function renderAction(overrides: ActionOverrides = {}) {
  return renderWithQueryClient(
    createElement(SubjectConversationAction, {
      canManage: true,
      canRead: true,
      subjectId: DOCUMENT_ID,
      subjectType: 'document',
      tripId: TRIP_ID,
      tripStatus: 'in_transit',
      ...overrides,
    }),
  )
}

const labelOf = (button: Element): string =>
  button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''

const buttonLabels = (): string[] => [...document.body.querySelectorAll('button')].map(labelOf)

async function clickButton(label: RegExp): Promise<void> {
  const button = [...document.body.querySelectorAll('button')].find((candidate) =>
    label.test(labelOf(candidate)),
  )
  if (button === undefined) throw new Error(`BUTTON_NOT_FOUND:${label.source}`)
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
  await settle()
}

beforeEach(() => {
  fakes.closed = []
  fakes.markedRead = []
  fakes.messages = []
  fakes.openError = undefined
  fakes.opened = []
  fakes.quickReplies = []
  fakes.sent = []
  fakes.summaries = []
})

describe('o botão da conversa com o motorista (spec 260 T3.1)', () => {
  it('sem trip.manage e sem conversa: nenhum botão', async () => {
    await renderAction({ canManage: false })
    await settle()

    expect(buttonLabels()).toEqual([])
  })

  it('sem fleet.read: nem consulta a lista', async () => {
    let listed = 0
    const original = client.listConversations
    ;(client as { listConversations: typeof original }).listConversations = (input) => {
      listed += 1
      return original(input)
    }
    await renderAction({ canRead: false })
    await settle()
    ;(client as { listConversations: typeof original }).listConversations = original

    expect(listed).toBe(0)
    expect(buttonLabels()).toEqual([])
  })

  it('viagem concluída sem conversa: nada a oferecer', async () => {
    await renderAction({ tripStatus: 'completed' })
    await settle()

    expect(buttonLabels()).toEqual([])
  })

  it('com trip.manage: abre a conversa (par do assunto) e mostra o diálogo', async () => {
    await renderAction()
    await waitFor(() => expect(buttonLabels()).toContain('Falar com o motorista'))

    await clickButton(/Falar com o motorista/u)

    expect(fakes.opened).toEqual([
      { subjectId: DOCUMENT_ID, subjectType: 'document', tripId: TRIP_ID },
    ])
    await waitFor(() => {
      expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
      expect(document.body.textContent).toContain('261009-K7M2')
      expect(document.body.querySelector('textarea')).not.toBeNull()
    })
  })

  it('a conversa que já existe mostra o protocolo e as não lidas ao lado do botão', async () => {
    fakes.summaries = [summary({ unreadCount: 2 })]
    await renderAction()

    await waitFor(() => {
      expect(document.body.textContent).toContain('261009-K7M2')
      expect(document.body.textContent).toContain('2 novas')
    })
    expect(fakes.opened).toEqual([])
  })

  it('sem trip.manage, a conversa existente abre só para ler: sem compositor, sem encerrar', async () => {
    fakes.summaries = [summary()]
    await renderAction({ canManage: false })
    await waitFor(() =>
      expect(buttonLabels().some((label) => /Ver conversa/u.test(label))).toBe(true),
    )

    await clickButton(/Ver conversa/u)

    await waitFor(() => expect(document.body.querySelector('[role="dialog"]')).not.toBeNull())
    expect(document.body.querySelector('textarea')).toBeNull()
    expect(buttonLabels().some((label) => /Encerrar conversa/u.test(label))).toBe(false)
  })

  it('encerrada: legível, avisa, sem compositor, e oferece reabrir', async () => {
    fakes.summaries = [summary({ status: 'closed' })]
    await renderAction()
    await waitFor(() =>
      expect(buttonLabels().some((label) => /Ver conversa/u.test(label))).toBe(true),
    )

    await clickButton(/Ver conversa/u)

    await waitFor(() => expect(document.body.textContent).toContain('Conversa encerrada'))
    expect(document.body.querySelector('textarea')).toBeNull()
    expect(buttonLabels()).toContain('Reabrir conversa')
  })

  it('escrever envia o texto com uma chave por mensagem; encerrar chama a rota de encerrar', async () => {
    fakes.summaries = [summary()]
    await renderAction()
    await waitFor(() =>
      expect(buttonLabels().some((label) => /Conversa com o motorista/u.test(label))).toBe(true),
    )
    await clickButton(/Conversa com o motorista/u)
    await waitFor(() => expect(document.body.querySelector('textarea')).not.toBeNull())

    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    await act(async () => {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
      descriptor?.set?.bind(textarea)('Pode entregar amanhã?')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await Promise.resolve()
    })
    await clickButton(/^Enviar$/u)
    await waitFor(() => expect(fakes.sent).toHaveLength(1))
    expect(fakes.sent[0]).toMatchObject({
      body: 'Pode entregar amanhã?',
      subjectId: DOCUMENT_ID,
      subjectType: 'document',
      tripId: TRIP_ID,
    })
    expect((fakes.sent[0] as { idempotencyKey: string }).idempotencyKey).toMatch(
      /^subject-message:/u,
    )

    await clickButton(/Encerrar conversa/u)
    await waitFor(() => expect(fakes.closed).toHaveLength(1))
  })

  it('com respostas prontas do escritório ao motorista: escolher PREENCHE o campo e não envia', async () => {
    fakes.summaries = [summary()]
    fakes.quickReplies = [{ id: 'qr-1', text: 'Pode descarregar na doca 2.' }]
    await renderAction()
    await waitFor(() =>
      expect(buttonLabels().some((label) => /Conversa com o motorista/u.test(label))).toBe(true),
    )
    await clickButton(/Conversa com o motorista/u)
    await waitFor(() => expect(document.body.querySelector('textarea')).not.toBeNull())

    await clickButton(/doca 2/u)

    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('Pode descarregar na doca 2.')
    expect(fakes.sent).toEqual([])
  })

  it('sem respostas prontas cadastradas: nenhum chip no compositor', async () => {
    fakes.summaries = [summary()]
    await renderAction()
    await waitFor(() =>
      expect(buttonLabels().some((label) => /Conversa com o motorista/u.test(label))).toBe(true),
    )
    await clickButton(/Conversa com o motorista/u)
    await waitFor(() => expect(document.body.querySelector('textarea')).not.toBeNull())

    expect(buttonLabels().some((label) => /doca 2/u.test(label))).toBe(false)
    expect(document.body.querySelector('[aria-label="Respostas rápidas"]')).toBeNull()
  })

  it('o fio é o do escritório: a bolha da empresa é a própria, a do motorista não, e a leitura chama a rota', async () => {
    const base = {
      attachments: [],
      bodyText: 'Pode entregar amanhã?',
      channel: 'app',
      createdAt: '2026-10-09T12:00:00.000Z',
      statusTimes: {},
    } as const
    fakes.messages = [
      {
        ...base,
        author: { kind: 'operation', name: 'Operadora Lima', userId: '' },
        direction: 'outbound',
        id: 'm-1',
        status: 'read',
      },
      {
        ...base,
        author: { kind: 'driver', name: 'Marcos S.', userId: '' },
        bodyText: 'Pode sim',
        direction: 'inbound',
        id: 'm-2',
        status: null,
      },
    ]
    fakes.summaries = [summary({ unreadCount: 1 })]
    await renderAction()
    await waitFor(() =>
      expect(buttonLabels().some((label) => /Conversa com o motorista/u.test(label))).toBe(true),
    )
    await clickButton(/Conversa com o motorista/u)

    await waitFor(() =>
      expect(document.body.querySelectorAll('.cv-p-bubble--mine')).toHaveLength(1),
    )
    expect(document.body.querySelector('.cv-p-bubble--mine')?.textContent).toContain(
      'Pode entregar',
    )
    expect(document.body.textContent).toContain('Motorista: Marcos S.')
    await waitFor(() =>
      expect(fakes.markedRead).toEqual([
        { subjectId: DOCUMENT_ID, subjectType: 'document', tripId: TRIP_ID },
      ]),
    )
  })

  it('viagem sem motorista: a recusa da API vira frase clara, sem diálogo', async () => {
    fakes.openError = new OccurrenceConversationRequestError('CONVERSATION_NO_DRIVER')
    await renderAction()
    await waitFor(() => expect(buttonLabels()).toContain('Falar com o motorista'))

    await clickButton(/Falar com o motorista/u)

    await waitFor(() =>
      expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
        'não tem motorista',
      ),
    )
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('conversa encerrada pelo servidor ao abrir (409): a frase explica o porquê', async () => {
    fakes.openError = new OccurrenceConversationRequestError('CONVERSATION_CLOSED')
    await renderAction()
    await waitFor(() => expect(buttonLabels()).toContain('Falar com o motorista'))

    await clickButton(/Falar com o motorista/u)

    await waitFor(() =>
      expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('encerrada'),
    )
  })
})

describe('o painel Conversas da viagem (spec 260 T3.2)', () => {
  it('lista protocolo, assunto, motorista, canais, estado e a soma das não lidas', async () => {
    fakes.summaries = [
      summary({ channels: ['app', 'whatsapp'], unreadCount: 2 }),
      summary({
        subjectId: TRIP_ID,
        subjectLabel: 'Viagem de 09/10',
        subjectType: 'trip',
        protocol: '261009-ABCD',
        unreadCount: 1,
      }),
    ]
    await renderWithQueryClient(
      createElement(TripConversationsPanel, {
        canManage: true,
        canRead: true,
        tripId: TRIP_ID,
        tripStatus: 'in_transit',
      }),
    )

    await waitFor(() => {
      const text = document.body.textContent ?? ''
      expect(text).toContain('NF 4521 · Casa Verde')
      expect(text).toContain('Viagem de 09/10')
      expect(text).toContain('Marcos S.')
      expect(text).toContain('WhatsApp')
      expect(text).toContain('3 mensagens novas')
    })
    expect(document.body.textContent).toContain('261009-K7M2')
    expect(document.body.textContent).toContain('261009-ABCD')
  })

  it('sem fleet.read o painel não aparece', async () => {
    await renderWithQueryClient(
      createElement(TripConversationsPanel, {
        canManage: true,
        canRead: false,
        tripId: TRIP_ID,
        tripStatus: 'in_transit',
      }),
    )
    await settle()

    expect(document.body.querySelector('section')).toBeNull()
  })
})
