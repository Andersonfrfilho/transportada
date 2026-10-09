/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantConversationEvent } from '@adatechnology/conversations-ui/participant'
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'
import {
  diffConversationSnapshots,
  type ConversationSnapshot,
} from '../../src/modules/conversation/shared/conversationSnapshot.service'
import {
  createConversationRefreshTicker,
  type ConversationRefreshTriggers,
} from '../../src/modules/conversation/shared/conversationRefreshTicker.service'
import { CONVERSATION_REFRESH_INTERVAL_MS } from '../../src/modules/conversation/shared/driverConversation.constant'

function snapshotOf(
  ...entries: readonly [string, string | null, number, (string | null)?][]
): ConversationSnapshot {
  return entries.map(([subjectId, lastMessageAt, unreadCount, officeReadAt]) => ({
    lastMessageAt,
    officeReadAt: officeReadAt ?? null,
    subject: { subjectId, subjectType: 'occurrence' },
    unreadCount,
  }))
}

describe('diffConversationSnapshots (spec 260)', () => {
  it('assunto novo conta como mudança', () => {
    const result = diffConversationSnapshots(
      snapshotOf(['a', 't1', 0]),
      snapshotOf(['a', 't1', 0], ['b', 't2', 1]),
    )
    expect(result.changedSubjects).toEqual([{ subjectId: 'b', subjectType: 'occurrence' }])
    expect(result.inboxChanged).toBe(true)
  })

  it('lastMessageAt maior conta como mudança', () => {
    const result = diffConversationSnapshots(snapshotOf(['a', 't1', 0]), snapshotOf(['a', 't2', 0]))
    expect(result.changedSubjects.map((subject) => subject.subjectId)).toEqual(['a'])
  })

  it('unreadCount diferente conta como mudança', () => {
    const result = diffConversationSnapshots(snapshotOf(['a', 't1', 0]), snapshotOf(['a', 't1', 2]))
    expect(result.changedSubjects.map((subject) => subject.subjectId)).toEqual(['a'])
    expect(result.inboxChanged).toBe(true)
  })

  it('officeReadAt novo ou diferente conta como mudança, com a lista igual (o escritório leu)', () => {
    const unread = snapshotOf(['a', 't1', 0])
    const read = snapshotOf(['a', 't1', 0, 'r1'])
    const readAgain = snapshotOf(['a', 't1', 0, 'r2'])
    expect(diffConversationSnapshots(unread, read).changedSubjects).toEqual([
      { subjectId: 'a', subjectType: 'occurrence' },
    ])
    expect(diffConversationSnapshots(read, readAgain).inboxChanged).toBe(true)
    expect(diffConversationSnapshots(read, read)).toEqual({
      changedSubjects: [],
      inboxChanged: false,
    })
  })

  it('nada mudou: sem assuntos e sem inbox', () => {
    const result = diffConversationSnapshots(snapshotOf(['a', 't1', 1]), snapshotOf(['a', 't1', 1]))
    expect(result).toEqual({ changedSubjects: [], inboxChanged: false })
  })
})

type Harness = ReturnType<typeof createHarness>

function createHarness(initial: { isOnline?: boolean; isVisible?: boolean } = {}) {
  let isOnline = initial.isOnline ?? true
  let isVisible = initial.isVisible ?? true
  let current = snapshotOf(['a', 't1', 0])
  let fetches = 0
  let activeTimers = 0
  let timerCallback: (() => void) | undefined
  let timersCreated = 0
  let triggers: ConversationRefreshTriggers | undefined
  let boundTriggers = 0
  const events: ParticipantConversationEvent[] = []
  const ticker = createConversationRefreshTicker({
    bindTriggers: (handlers) => {
      triggers = handlers
      boundTriggers += 1
      return () => {
        boundTriggers -= 1
      }
    },
    fetchSnapshot: () => {
      fetches += 1
      return Promise.resolve(current)
    },
    intervalMs: CONVERSATION_REFRESH_INTERVAL_MS,
    isOnline: () => isOnline,
    isVisible: () => isVisible,
    startTimer: (callback, intervalMs) => {
      expect(intervalMs).toBe(CONVERSATION_REFRESH_INTERVAL_MS)
      timerCallback = callback
      timersCreated += 1
      activeTimers += 1
      return () => {
        activeTimers -= 1
        timerCallback = undefined
      }
    },
  })
  return {
    activeTimers: () => activeTimers,
    boundTriggers: () => boundTriggers,
    events,
    fetches: () => fetches,
    setOnline: (next: boolean) => {
      isOnline = next
    },
    setSnapshot: (next: ConversationSnapshot) => {
      current = next
    },
    setVisible: (next: boolean) => {
      isVisible = next
    },
    subscribe: () => ticker.subscribe((event) => events.push(event)),
    tick: async () => {
      timerCallback?.()
      await settle()
    },
    ticker,
    timersCreated: () => timersCreated,
    triggers: () => triggers,
  }
}

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

async function startWithBaseline(harness: Harness): Promise<() => void> {
  const unsubscribe = harness.subscribe()
  await settle()
  return unsubscribe
}

describe('createConversationRefreshTicker (spec 260)', () => {
  it('o primeiro ciclo só grava o snapshot e não emite', async () => {
    const harness = createHarness()
    await startWithBaseline(harness)
    expect(harness.fetches()).toBe(1)
    expect(harness.events).toEqual([])
  })

  it('emite conversation-changed e inbox-changed no tique seguinte quando muda', async () => {
    const harness = createHarness()
    await startWithBaseline(harness)
    harness.setSnapshot(snapshotOf(['a', 't2', 1]))

    await harness.tick()

    expect(harness.events).toEqual([
      { subject: { subjectId: 'a', subjectType: 'occurrence' }, type: 'conversation-changed' },
      { type: 'inbox-changed' },
    ])
  })

  it('o escritório leu (só officeReadAt mudou): emite conversation-changed da conversa', async () => {
    const harness = createHarness()
    await startWithBaseline(harness)
    harness.setSnapshot(snapshotOf(['a', 't1', 0, '2026-10-09T12:00:00.000Z']))
    await harness.tick()
    expect(harness.events).toEqual([
      { subject: { subjectId: 'a', subjectType: 'occurrence' }, type: 'conversation-changed' },
      { type: 'inbox-changed' },
    ])
  })

  it('não emite quando nada mudou', async () => {
    const harness = createHarness()
    await startWithBaseline(harness)
    await harness.tick()
    expect(harness.fetches()).toBe(2)
    expect(harness.events).toEqual([])
  })

  it('oculto não busca; ao voltar a ficar visível dispara um ciclo imediato', async () => {
    const harness = createHarness()
    await startWithBaseline(harness)
    harness.setVisible(false)
    harness.triggers()?.syncVisibility()
    expect(harness.activeTimers()).toBe(0)
    await harness.tick()
    expect(harness.fetches()).toBe(1)

    harness.setSnapshot(snapshotOf(['a', 't3', 1]))
    harness.setVisible(true)
    harness.triggers()?.syncVisibility()
    await settle()

    expect(harness.activeTimers()).toBe(1)
    expect(harness.fetches()).toBe(2)
    expect(harness.events.at(-1)).toEqual({ type: 'inbox-changed' })
  })

  it('refreshNow (online/focus/sino) dispara um ciclo imediato', async () => {
    const harness = createHarness()
    await startWithBaseline(harness)
    harness.setSnapshot(snapshotOf(['a', 't2', 0]))
    harness.triggers()?.refreshNow()
    await settle()
    expect(harness.fetches()).toBe(2)
    expect(harness.events).toHaveLength(2)
  })

  it('dois assinantes dividem um único timer e um único fetch por ciclo', async () => {
    const harness = createHarness()
    const first = await startWithBaseline(harness)
    const second = harness.subscribe()
    await settle()
    expect(harness.timersCreated()).toBe(1)
    expect(harness.boundTriggers()).toBe(1)
    expect(harness.fetches()).toBe(1)
    first()
    second()
  })

  it('limpa timer e listeners quando sai o último assinante', async () => {
    const harness = createHarness()
    const first = await startWithBaseline(harness)
    const second = harness.subscribe()
    first()
    expect(harness.activeTimers()).toBe(1)
    second()
    expect(harness.activeTimers()).toBe(0)
    expect(harness.boundTriggers()).toBe(0)
  })

  it('offline não busca', async () => {
    const harness = createHarness({ isOnline: false })
    await startWithBaseline(harness)
    await harness.tick()
    expect(harness.fetches()).toBe(0)

    harness.setOnline(true)
    harness.triggers()?.refreshNow()
    await settle()
    expect(harness.fetches()).toBe(1)
  })

  it('requestRefresh sem assinantes não busca', async () => {
    const harness = createHarness()
    harness.ticker.requestRefresh()
    await settle()
    expect(harness.fetches()).toBe(0)
  })
})

describe('driverConversationsApi.subscribe com o ticker (spec 260)', () => {
  it('recebe conversation-changed quando a lista do servidor muda', async () => {
    let lastMessageAt = '2026-10-09T10:00:00.000Z'
    let timerCallback: (() => void) | undefined
    const events: ParticipantConversationEvent[] = []
    const api = createDriverConversationsApi({
      fallbackSubjectLabel: () => 'Ocorrência',
      http: createDriverConversationHttp({
        baseUrl: 'https://api.test/v1',
        fetch: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                data: [
                  {
                    awaitingDriver: false,
                    lastMessageAt,
                    status: 'open',
                    subjectId: 'occurrence-1',
                    subjectLabel: 'Avaria',
                    subjectType: 'occurrence',
                    unreadCount: 0,
                  },
                ],
              }),
              { status: 200 },
            ),
          ),
        getAccessToken: () => Promise.resolve('token'),
      }),
      outbox: createConversationOutbox({
        getOwnerKey: () => 'owner-1',
        random: () => 0.5,
        runExclusive: (run) => run(),
        store: createMemoryOutboxStore(),
      }),
      refreshEnvironment: {
        bindTriggers: () => () => undefined,
        isOnline: () => true,
        isVisible: () => true,
        startTimer: (callback) => {
          timerCallback = callback
          return () => undefined
        },
      },
    })
    const unsubscribe = api.subscribe?.((event) => events.push(event))
    await settle()
    lastMessageAt = '2026-10-09T10:00:04.000Z'

    timerCallback?.()
    await settle()

    expect(events.map((event) => event.type)).toEqual(['conversation-changed', 'inbox-changed'])
    unsubscribe?.()
  })
})

describe('driverConversationsApi: officeReadAt só no snapshot (spec 260 T5.5)', () => {
  it('a leitura do escritório dispara conversation-changed e não vaza para o resumo do pacote', async () => {
    const server: { officeReadAt?: string } = {}
    let timerCallback: (() => void) | undefined
    const events: ParticipantConversationEvent[] = []
    const api = createDriverConversationsApi({
      fallbackSubjectLabel: () => 'Viagem',
      http: createDriverConversationHttp({
        baseUrl: 'https://api.test/v1',
        fetch: () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                data: [
                  {
                    awaitingDriver: false,
                    lastMessageAt: '2026-10-09T10:00:00.000Z',
                    ...(server.officeReadAt === undefined
                      ? {}
                      : { officeReadAt: server.officeReadAt }),
                    status: 'open',
                    subjectId: 'trip-1',
                    subjectLabel: 'Viagem',
                    subjectType: 'trip',
                    unreadCount: 0,
                  },
                ],
                pagination: { nextCursor: null },
              }),
              { status: 200 },
            ),
          ),
        getAccessToken: () => Promise.resolve('token'),
      }),
      outbox: createConversationOutbox({
        getOwnerKey: () => 'owner-1',
        random: () => 0.5,
        runExclusive: (run) => run(),
        store: createMemoryOutboxStore(),
      }),
      refreshEnvironment: {
        bindTriggers: () => () => undefined,
        isOnline: () => true,
        isVisible: () => true,
        startTimer: (callback) => {
          timerCallback = callback
          return () => undefined
        },
      },
    })
    const unsubscribe = api.subscribe?.((event) => events.push(event))
    await settle()
    server.officeReadAt = '2026-10-09T10:05:00.000Z'

    timerCallback?.()
    await settle()

    expect(events).toEqual([
      { subject: { subjectId: 'trip-1', subjectType: 'trip' }, type: 'conversation-changed' },
      { type: 'inbox-changed' },
    ])
    const page = await api.listConversations()
    expect(page.data[0]).not.toHaveProperty('officeReadAt')
    unsubscribe?.()
  })
})
