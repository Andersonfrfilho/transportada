/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 279 T6 (RF6): a fila offline do "Enviar ao cliente". A chave de idempotência é a mesma em toda tentativa
 * (o envio não duplica), rede caída mantém o item, recusa o marca `failed`, e outra conta não vê nem entrega.
 */
import { describe, expect, it } from 'bun:test'

import type {
  ClientBoletoEmailOutboxItem,
  ClientBoletoEmailOutboxStore,
  ClientBoletoEmailSendRequest,
} from '../../src/modules/client-email/shared/clientBoletoEmail.types'
import { createClientBoletoEmailOutbox } from '../../src/modules/client-email/shared/clientBoletoEmailOutbox.service'
import { DriverConversationRequestError } from '../../src/modules/conversation/shared/driverConversationsHttp.service'

const REQUEST: ClientBoletoEmailSendRequest = {
  idempotencyKey: 'key-1',
  newAddress: 'novo@x.com',
  occurrenceId: '0b9a4b8e-0000-4000-8000-000000000279',
  save: true,
}

function createMemoryStore(): ClientBoletoEmailOutboxStore {
  const records = new Map<string, ClientBoletoEmailOutboxItem>()
  return {
    put: (item) => {
      records.set(item.request.idempotencyKey, item)
      return Promise.resolve()
    },
    readAll: () => Promise.resolve([...records.values()]),
    remove: (key) => {
      records.delete(key)
      return Promise.resolve()
    },
  }
}

function createOutbox(input: {
  readonly owner?: string | undefined
  readonly send: (request: ClientBoletoEmailSendRequest) => Promise<unknown>
  readonly store?: ClientBoletoEmailOutboxStore
}) {
  return createClientBoletoEmailOutbox({
    getOwnerKey: () => ('owner' in input ? input.owner : 'owner-1'),
    send: input.send,
    store: input.store ?? createMemoryStore(),
  })
}

describe('fila offline do envio ao cliente (spec 279 T6)', () => {
  it('entrega com a mesma idempotencyKey e esvazia a fila', async () => {
    const sent: ClientBoletoEmailSendRequest[] = []
    const outbox = createOutbox({
      send: (request) => {
        sent.push(request)
        return Promise.resolve({})
      },
    })
    await outbox.enqueue(REQUEST)
    expect(await outbox.listPending()).toHaveLength(1)
    await outbox.flush('immediate')
    expect(sent).toEqual([REQUEST])
    expect(await outbox.listPending()).toHaveLength(0)
  })

  it('rede caída mantém o item e a próxima tentativa repete a mesma chave', async () => {
    const keys: string[] = []
    let isOffline = true
    const outbox = createOutbox({
      send: (request) => {
        keys.push(request.idempotencyKey)
        return isOffline
          ? Promise.reject(new DriverConversationRequestError('DRIVER_CONVERSATION_REQUEST_FAILED'))
          : Promise.resolve({})
      },
    })
    await outbox.enqueue(REQUEST)
    await outbox.flush('immediate')
    const [queued] = await outbox.listPending()
    expect(queued?.state).toBe('queued')
    expect(queued?.attempts).toBe(1)

    isOffline = false
    await outbox.flush('immediate')
    expect(keys).toEqual(['key-1', 'key-1'])
    expect(await outbox.listPending()).toHaveLength(0)
  })

  it('o temporizador respeita o backoff e o "agora" o ignora', async () => {
    let calls = 0
    const outbox = createOutbox({
      send: () => {
        calls += 1
        return Promise.reject(new DriverConversationRequestError('X', 503))
      },
    })
    await outbox.enqueue(REQUEST)
    await outbox.flush('immediate')
    await outbox.flush('timer')
    expect(calls).toBe(1)
    await outbox.flush('immediate')
    expect(calls).toBe(2)
  })

  it('recusa do servidor marca failed, não reenvia sozinha, e permite descartar ou tentar de novo', async () => {
    let calls = 0
    const outbox = createOutbox({
      send: () => {
        calls += 1
        return Promise.reject(
          new DriverConversationRequestError('OCCURRENCE_CLIENT_EMAIL_OFF', 409),
        )
      },
    })
    await outbox.enqueue(REQUEST)
    await outbox.flush('immediate')
    await outbox.flush('immediate')
    expect(calls).toBe(1)
    expect((await outbox.listPending())[0]?.state).toBe('failed')

    await outbox.requeue('key-1')
    expect((await outbox.listPending())[0]?.state).toBe('queued')
    await outbox.flush('immediate')
    expect(calls).toBe(2)

    await outbox.discard('key-1')
    expect(await outbox.listPending()).toHaveLength(0)
  })

  it('não grava sem sessão e não entrega item de outra conta', async () => {
    const store = createMemoryStore()
    const noSession = createOutbox({ owner: undefined, send: () => Promise.resolve({}), store })
    const error = await noSession.enqueue(REQUEST).then(
      () => undefined,
      (cause: unknown) => cause,
    )
    expect((error as Error).message).toBe('CLIENT_BOLETO_EMAIL_OUTBOX_OWNER_MISSING')

    const first = createOutbox({ owner: 'owner-1', send: () => Promise.resolve({}), store })
    await first.enqueue(REQUEST)

    let delivered = 0
    const other = createOutbox({
      owner: 'owner-2',
      send: () => {
        delivered += 1
        return Promise.resolve({})
      },
      store,
    })
    expect(await other.listPending()).toHaveLength(0)
    await other.flush('immediate')
    expect(delivered).toBe(0)
    expect(await first.listPending()).toHaveLength(1)
  })
})
