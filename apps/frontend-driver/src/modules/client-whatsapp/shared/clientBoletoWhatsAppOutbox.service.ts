/* Copyright (c) 2026 Ada Technology. MIT License. */
import { classifyDeliveryFailure } from '@/modules/conversation/shared/conversationOutboxFailure.service'
import { isRetryDue, type DrainOrigin } from '@/modules/driver-trip/shared/retryBackoff.service'

import type {
  ClientBoletoWhatsAppOutboxItem,
  ClientBoletoWhatsAppOutboxStore,
  ClientBoletoWhatsAppSendRequest,
} from './clientBoletoWhatsApp.types'

export const CLIENT_BOLETO_WHATSAPP_OUTBOX_OWNER_MISSING =
  'CLIENT_BOLETO_WHATSAPP_OUTBOX_OWNER_MISSING'

export type ClientBoletoWhatsAppOutboxDependencies = Readonly<{
  /** `undefined` = sem sessão: nada é lido nem gravado, para não vazar envio de outra conta. */
  getOwnerKey: () => string | undefined
  now?: () => Date
  random?: () => number
  /** Entrega o envio ao servidor; o `idempotencyKey` do pedido é o mesmo em toda tentativa. */
  send: (request: ClientBoletoWhatsAppSendRequest) => Promise<unknown>
  store: ClientBoletoWhatsAppOutboxStore
}>

export type ClientBoletoWhatsAppOutbox = Readonly<{
  discard: (idempotencyKey: string) => Promise<void>
  enqueue: (request: ClientBoletoWhatsAppSendRequest) => Promise<void>
  flush: (origin: DrainOrigin) => Promise<void>
  listPending: () => Promise<readonly ClientBoletoWhatsAppOutboxItem[]>
  requeue: (idempotencyKey: string) => Promise<void>
  subscribe: (listener: () => void) => () => void
}>

/**
 * Spec 281 T8 (RF6): o "Enviar por WhatsApp" sem sinal vira item desta fila, com a mesma `idempotencyKey` de
 * toda tentativa — se a resposta se perde e o item volta, a API devolve `already_queued` em vez de mandar o
 * boleto duas vezes. Rede, sessão e servidor com defeito mantêm o item na fila; recusa (409, 400) o marca
 * `failed` e espera o motorista.
 */
export function createClientBoletoWhatsAppOutbox(
  dependencies: ClientBoletoWhatsAppOutboxDependencies,
): ClientBoletoWhatsAppOutbox {
  const { getOwnerKey, store } = dependencies
  const now = dependencies.now ?? (() => new Date())
  const listeners = new Set<() => void>()
  let isFlushing = false

  function emit(): void {
    for (const listener of listeners) listener()
  }

  async function readOwned(): Promise<readonly ClientBoletoWhatsAppOutboxItem[]> {
    const ownerKey = getOwnerKey()
    if (ownerKey === undefined) return []
    return (await store.readAll())
      .filter((item) => item.ownerKey === ownerKey)
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  /** Relê antes de gravar: o que foi descartado no meio do envio não ressuscita. */
  async function patch(
    idempotencyKey: string,
    changes: Partial<ClientBoletoWhatsAppOutboxItem>,
  ): Promise<void> {
    const current = (await readOwned()).find(
      (item) => item.request.idempotencyKey === idempotencyKey,
    )
    if (current === undefined) return
    await store.put({ ...current, ...changes })
    emit()
  }

  async function attempt(item: ClientBoletoWhatsAppOutboxItem): Promise<void> {
    try {
      await dependencies.send(item.request)
    } catch (error) {
      await patch(item.request.idempotencyKey, {
        attempts: item.attempts + 1,
        lastAttemptAt: now().toISOString(),
        state: classifyDeliveryFailure(error) === 'retry' ? 'queued' : 'failed',
      })
      return
    }
    await store.remove(item.request.idempotencyKey)
    emit()
  }

  return {
    async discard(idempotencyKey) {
      await store.remove(idempotencyKey)
      emit()
    },
    async enqueue(request) {
      const ownerKey = getOwnerKey()
      if (ownerKey === undefined) throw new Error(CLIENT_BOLETO_WHATSAPP_OUTBOX_OWNER_MISSING)
      await store.put({
        attempts: 0,
        createdAt: now().toISOString(),
        ownerKey,
        request,
        state: 'queued',
      })
      emit()
    },
    async flush(origin) {
      if (isFlushing) return
      isFlushing = true
      try {
        const queued = (await readOwned()).filter((item) => item.state === 'queued')
        const due = queued.filter(
          (item) =>
            origin === 'immediate' || isRetryDue({ item, now: now(), random: dependencies.random }),
        )
        await Promise.all(due.map((item) => attempt(item)))
      } finally {
        isFlushing = false
      }
    },
    listPending: readOwned,
    requeue: (idempotencyKey) =>
      patch(idempotencyKey, { attempts: 0, lastAttemptAt: undefined, state: 'queued' }),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
