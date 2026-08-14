/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createInMemoryNotificationCache } from '../../src/notification/infrastructure/in-memory-notification-cache.provider'
import {
  NOTIFICATION_WEBHOOK_PATH,
  notificationHttpFixture,
  notificationWebhookRequest,
} from '../fixtures/notification-http.fixture'

const WEBHOOK_SECRET = 'contract-webhook-secret'
const NOW = new Date('2026-08-13T12:00:00.000Z')
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000)
/** A janela do módulo é de 300s; um recibo com 10 minutos de atraso está fora dela. */
const STALE_SECONDS = NOW_SECONDS - 600

describe('Webhook de recibo de entrega', () => {
  test('aceita o recibo assinado dentro da janela de timestamp', async () => {
    const { calls, router } = notificationHttpFixture({
      cache: createInMemoryNotificationCache(),
      now: NOW,
      webhookSecret: WEBHOOK_SECRET,
    })

    const response = await router.handle(
      notificationWebhookRequest({ secret: WEBHOOK_SECRET, timestampSeconds: NOW_SECONDS }),
    )

    expect(response.status).toBe(204)
    expect(calls.receiveDeliveryReceipt).toHaveLength(1)
  })

  test('recusa assinatura inválida sem chegar ao caso de uso', async () => {
    const { calls, router } = notificationHttpFixture({
      cache: createInMemoryNotificationCache(),
      now: NOW,
      webhookSecret: WEBHOOK_SECRET,
    })

    const response = await router.handle(
      notificationWebhookRequest({
        secret: WEBHOOK_SECRET,
        signature: 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
        timestampSeconds: NOW_SECONDS,
      }),
    )

    expect(response.status).toBe(401)
    expect(calls.receiveDeliveryReceipt).toHaveLength(0)
  })

  test('recusa recibo assinado fora da janela de timestamp', async () => {
    const { calls, router } = notificationHttpFixture({
      cache: createInMemoryNotificationCache(),
      now: NOW,
      webhookSecret: WEBHOOK_SECRET,
    })

    const response = await router.handle(
      notificationWebhookRequest({ secret: WEBHOOK_SECRET, timestampSeconds: STALE_SECONDS }),
    )

    expect(response.status).toBe(401)
    expect(calls.receiveDeliveryReceipt).toHaveLength(0)
  })

  test('recusa o replay da mesma assinatura e entrega o recibo uma vez só', async () => {
    const { calls, router } = notificationHttpFixture({
      cache: createInMemoryNotificationCache(),
      now: NOW,
      webhookSecret: WEBHOOK_SECRET,
    })
    const build = () =>
      notificationWebhookRequest({ secret: WEBHOOK_SECRET, timestampSeconds: NOW_SECONDS })

    const first = await router.handle(build())
    const replay = await router.handle(build())

    expect(first.status).toBe(204)
    expect(replay.status).not.toBe(204)
    expect(calls.receiveDeliveryReceipt).toHaveLength(1)
  })

  test('sem cache o replay passa — é a razão de o módulo receber um', async () => {
    const { calls, router } = notificationHttpFixture({ now: NOW, webhookSecret: WEBHOOK_SECRET })
    const build = () =>
      notificationWebhookRequest({ secret: WEBHOOK_SECRET, timestampSeconds: NOW_SECONDS })

    await router.handle(build())
    await router.handle(build())

    expect(calls.receiveDeliveryReceipt).toHaveLength(2)
  })

  test('a rota de webhook é pública: não exige token', async () => {
    const { router } = notificationHttpFixture({
      authenticated: false,
      cache: createInMemoryNotificationCache(),
      now: NOW,
      webhookSecret: WEBHOOK_SECRET,
    })

    const response = await router.handle(
      notificationWebhookRequest({ secret: WEBHOOK_SECRET, timestampSeconds: NOW_SECONDS }),
    )

    expect(response.status).toBe(204)
    expect(router.match(new Request(`http://localhost${NOTIFICATION_WEBHOOK_PATH}`))).toBe(false)
  })
})

describe('Cache de nonce em memória', () => {
  test('conta a primeira reivindicação como 1 e a repetição como 2', async () => {
    const cache = createInMemoryNotificationCache()

    expect(await cache.increment({ key: 'nonce', ttlSeconds: 300 })).toBe(1)
    expect(await cache.increment({ key: 'nonce', ttlSeconds: 300 })).toBe(2)
  })

  test('esquece a chave depois do TTL', async () => {
    let current = NOW.getTime()
    const cache = createInMemoryNotificationCache({ now: () => new Date(current) })

    expect(await cache.increment({ key: 'nonce', ttlSeconds: 300 })).toBe(1)
    current += 301_000

    expect(await cache.increment({ key: 'nonce', ttlSeconds: 300 })).toBe(1)
  })

  test('guarda, lê e apaga valor com expiração', async () => {
    let current = NOW.getTime()
    const cache = createInMemoryNotificationCache({ now: () => new Date(current) })

    await cache.set({ key: 'chave', ttlSeconds: 60, value: 'valor' })
    expect(await cache.get('chave')).toBe('valor')

    await cache.delete('chave')
    expect(await cache.get('chave')).toBeUndefined()

    await cache.set({ key: 'chave', ttlSeconds: 60, value: 'valor' })
    current += 61_000
    expect(await cache.get('chave')).toBeUndefined()
  })
})
