import type { ParticipantSubjectRef } from '@adatechnology/conversation-contracts'
import { describe, expect, it } from 'bun:test'

import { createComposerLockRenderer } from '../../src/modules/conversation/components/DriverComposerLock.component'
import { classifyDeliveryFailure } from '../../src/modules/conversation/shared/conversationOutboxFailure.service'
import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import type { DriverReopenEvent } from '../../src/modules/conversation/shared/driverConversationReopen.service'
import {
  DriverConversationRequestError,
  createDriverConversationHttp,
} from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const SUBJECT: ParticipantSubjectRef = { subjectId: 'occurrence-1', subjectType: 'occurrence' }
const OTHER: ParticipantSubjectRef = { subjectId: 'occurrence-2', subjectType: 'occurrence' }

type Mode = 'already-open' | 'cancelled' | 'network-down' | 'ok'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

/** Servidor falso: guarda o corpo de cada POST na ordem em que chegou, com a chave de idempotência. */
function createHarness(initialMode: Mode = 'ok') {
  let mode = initialMode
  let isOnline = true
  const posts: { body: Record<string, unknown>; key: string }[] = []
  const events: DriverReopenEvent[] = []
  const http = createDriverConversationHttp({
    baseUrl: 'https://api.test/v1',
    fetch: async (request) => {
      if (mode === 'network-down') throw new TypeError('Failed to fetch')
      const key = request.headers.get('idempotency-key') ?? ''
      posts.push({ body: JSON.parse(await request.text()) as Record<string, unknown>, key })
      if (mode === 'already-open') return json({ error: { code: 'OCCURRENCE_NOT_RESOLVED' } }, 409)
      if (mode === 'cancelled') return json({ error: { code: 'OCCURRENCE_CANCELLED' } }, 409)
      return json({ data: { id: `server-${posts.length}` } }, 201)
    },
    getAccessToken: () => Promise.resolve('token'),
  })
  const api = createDriverConversationsApi({
    fallbackSubjectLabel: () => 'Ocorrência',
    http,
    isOnline: () => isOnline,
    outbox: createConversationOutbox({
      getOwnerKey: () => 'owner-1',
      random: () => 0.5,
      runExclusive: (run) => run(),
      store: createMemoryOutboxStore(),
    }),
    refreshEnvironment: { isVisible: () => false },
  })
  api.reopen.subscribeEvents((event) => events.push(event))
  return {
    api,
    events,
    posts,
    setMode: (next: Mode) => {
      mode = next
    },
    setOnline: (next: boolean) => {
      isOnline = next
    },
  }
}

const send = (id: string, subject = SUBJECT) => ({
  clientMessageId: id,
  subject,
  text: `texto ${id}`,
})

describe('reabrir a ocorrência pelo chat (spec 266 T4.8)', () => {
  it('sem armar, a mensagem sai sem reopen', async () => {
    const harness = createHarness()
    await harness.api.sendMessage(send('m1'))
    expect(harness.posts[0]?.body).toEqual({ body: 'texto m1' })
  })

  it('armado, só a PRIMEIRA mensagem leva reopen:true e desarma o assunto', async () => {
    const harness = createHarness()
    harness.api.reopen.arm(SUBJECT)

    await harness.api.sendMessage(send('m1'))
    await harness.api.sendMessage(send('m2'))

    expect(harness.posts.map((post) => post.body)).toEqual([
      { body: 'texto m1', reopen: true },
      { body: 'texto m2' },
    ])
    expect(harness.api.reopen.isArmed(SUBJECT)).toBe(false)
    expect(harness.events).toEqual([{ subject: SUBJECT, type: 'reopen-sent' }])
  })

  it('armar um assunto não afeta outro', async () => {
    const harness = createHarness()
    harness.api.reopen.arm(SUBJECT)
    await harness.api.sendMessage(send('m1', OTHER))
    expect(harness.posts[0]?.body).toEqual({ body: 'texto m1' })
    expect(harness.api.reopen.isArmed(SUBJECT)).toBe(true)
  })

  it('o flag acompanha a mensagem: reenvio do pacote com o mesmo clientMessageId continua reabrindo', async () => {
    const harness = createHarness('cancelled')
    harness.api.reopen.arm(SUBJECT)
    await harness.api.sendMessage(send('m1')).catch(() => undefined)
    harness.setMode('ok')

    await harness.api.sendMessage(send('m1'))

    expect(harness.posts.map((post) => [post.key, post.body.reopen])).toEqual([
      ['m1', true],
      ['m1', true],
    ])
  })

  it('tocar em Reabrir e não enviar nada não grava nada na fila nem chama a API', async () => {
    const harness = createHarness()
    harness.api.reopen.arm(SUBJECT)
    harness.api.reopen.keepOnly(undefined)

    expect(harness.api.reopen.isArmed(SUBJECT)).toBe(false)
    expect(harness.posts).toEqual([])
    expect(await harness.api.outbox.listPending()).toEqual([])
  })

  it('sem rede, a fila grava o reopen e o flush o repete com a MESMA Idempotency-Key', async () => {
    const harness = createHarness()
    harness.api.reopen.arm(SUBJECT)
    harness.setOnline(false)

    expect(await harness.api.sendMessage(send('m1'))).toEqual({ outcome: 'queued' })
    expect(harness.posts).toEqual([])

    await harness.api.flushOutbox('immediate')

    expect(harness.posts).toEqual([{ body: { body: 'texto m1', reopen: true }, key: 'm1' }])
    expect(harness.events).toEqual([{ subject: SUBJECT, type: 'reopen-sent' }])
  })

  it('a fila esvazia em ordem (FIFO): a que reabre sai antes da seguinte', async () => {
    const harness = createHarness()
    harness.api.reopen.arm(SUBJECT)
    harness.setOnline(false)
    await harness.api.sendMessage(send('m1'))
    await harness.api.sendMessage(send('m2'))

    await harness.api.flushOutbox('immediate')

    expect(harness.posts.map((post) => [post.key, post.body.reopen])).toEqual([
      ['m1', true],
      ['m2', undefined],
    ])
  })

  it('409 OCCURRENCE_NOT_RESOLVED é recusa permanente: avisa a tela e não entra na fila', async () => {
    const harness = createHarness('already-open')
    harness.api.reopen.arm(SUBJECT)

    const failure = await harness.api.sendMessage(send('m1')).catch((error: unknown) => error)

    expect(failure).toMatchObject({ code: 'OCCURRENCE_NOT_RESOLVED', status: 409 })
    expect(await harness.api.outbox.listPending()).toEqual([])
    expect(harness.events).toEqual([
      { reason: 'alreadyOpen', subject: SUBJECT, type: 'reopen-refused' },
    ])
  })

  it('409 vindo da fila marca a mensagem como failed e não repete', async () => {
    const harness = createHarness()
    harness.api.reopen.arm(SUBJECT)
    harness.setOnline(false)
    await harness.api.sendMessage(send('m1'))
    harness.setMode('cancelled')

    await harness.api.flushOutbox('immediate')
    await harness.api.flushOutbox('immediate')

    expect(harness.posts).toHaveLength(1)
    expect((await harness.api.outbox.listPending())[0]?.state).toBe('failed')
    expect(harness.events).toEqual([
      { reason: 'cancelled', subject: SUBJECT, type: 'reopen-refused' },
    ])
  })

  it.each(['OCCURRENCE_NOT_RESOLVED', 'OCCURRENCE_CANCELLED'])(
    'classifica %s como permanente',
    (code) => {
      expect(classifyDeliveryFailure(new DriverConversationRequestError(code, 409))).toBe(
        'permanent',
      )
    },
  )
})

describe('a reabertura a caminho não trava o campo de novo (spec 266 T4.8)', () => {
  it('enviada e antes da lista atualizar: segue destravado; ao mostrar aberta, assenta', async () => {
    const harness = createHarness()
    harness.api.reopen.arm(SUBJECT)
    await harness.api.sendMessage(send('m1'))

    expect(harness.api.reopen.isArmed(SUBJECT)).toBe(false)
    expect(harness.api.reopen.isReopening(SUBJECT)).toBe(true)
    expect(harness.api.reopen.isReopening(OTHER)).toBe(false)

    harness.api.reopen.settle(SUBJECT)
    expect(harness.api.reopen.isReopening(SUBJECT)).toBe(false)
  })

  it('sem rede, a mensagem na fila mantém destravado', async () => {
    const harness = createHarness()
    harness.api.reopen.arm(SUBJECT)
    harness.setOnline(false)
    await harness.api.sendMessage(send('m1'))

    expect(harness.api.reopen.isReopening(SUBJECT)).toBe(true)
  })

  it('recusa 409 trava de novo', async () => {
    const harness = createHarness('already-open')
    harness.api.reopen.arm(SUBJECT)
    await harness.api.sendMessage(send('m1')).catch(() => undefined)

    expect(harness.api.reopen.isReopening(SUBJECT)).toBe(false)
  })

  it('recusa vinda da fila trava de novo', async () => {
    const harness = createHarness()
    harness.api.reopen.arm(SUBJECT)
    harness.setOnline(false)
    await harness.api.sendMessage(send('m1'))
    harness.setMode('cancelled')
    await harness.api.flushOutbox('immediate')

    expect(harness.api.reopen.isReopening(SUBJECT)).toBe(false)
  })

  it('keepOnly e clear (saída da tela) não apagam a reabertura a caminho', async () => {
    const harness = createHarness()
    harness.api.reopen.arm(SUBJECT)
    await harness.api.sendMessage(send('m1'))
    harness.api.reopen.keepOnly(undefined)
    harness.api.reopen.clear()

    expect(harness.api.reopen.isReopening(SUBJECT)).toBe(true)
  })
})

describe('trava do campo de texto (spec 266 RF9)', () => {
  const conversation = { subjectId: 'occurrence-1', subjectType: 'occurrence' } as never
  const render = (state: 'cancelled' | 'open' | 'resolved' | undefined, isArmed = false) =>
    createComposerLockRenderer({
      isArmed: () => isArmed,
      onReopen: () => undefined,
      stateByOccurrenceId: new Map(state === undefined ? [] : [['occurrence-1', state]]),
    })(conversation) as { props: { isCancelled: boolean; onReopen: () => void } } | undefined

  it('resolvida e não armada: aviso com o botão Reabrir', () => {
    expect(render('resolved')?.props.isCancelled).toBe(false)
  })

  it('cancelada: aviso sem botão', () => {
    expect(render('cancelled')?.props.isCancelled).toBe(true)
  })

  it.each([
    ['aberta', 'open'],
    ['desconhecida', undefined],
  ] as const)('%s: sem trava', (_label, state) => {
    expect(render(state)).toBeUndefined()
  })

  it('depois de armar, a trava some e o campo volta', () => {
    expect(render('resolved', true)).toBeUndefined()
  })

  it('conversa que não é de ocorrência nunca é travada', () => {
    const lock = createComposerLockRenderer({
      isArmed: () => false,
      onReopen: () => undefined,
      stateByOccurrenceId: new Map([['occurrence-1', 'resolved']]),
    })
    expect(lock({ subjectId: 'occurrence-1', subjectType: 'document' } as never)).toBeUndefined()
  })

  it('o botão chama onReopen com o assunto da conversa', () => {
    const opened: ParticipantSubjectRef[] = []
    const lock = createComposerLockRenderer({
      isArmed: () => false,
      onReopen: (subject) => opened.push(subject),
      stateByOccurrenceId: new Map([['occurrence-1', 'resolved']]),
    })
    const element = lock(conversation) as { props: { onReopen: () => void } }
    element.props.onReopen()
    expect(opened).toEqual([SUBJECT])
  })
})
