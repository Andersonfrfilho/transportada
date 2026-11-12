/* Copyright (c) 2026 Ada Technology. MIT License. */
/* eslint-disable @typescript-eslint/require-await -- dublês assíncronos do navegador e da API: a assinatura é assíncrona, o corpo não espera nada. */
import { describe, expect, test } from 'bun:test'

import {
  disablePush,
  enablePush,
  readPushState,
  type PushEnvironment,
  type PushSubscriptionLike,
} from '../../src/modules/notification/shared/devicePush.service'

const BYTES = new Uint8Array([1, 2, 3]).buffer

function subscription(unsubscribed: string[] = []): PushSubscriptionLike {
  return {
    endpoint: 'https://push.example/abc',
    expirationTime: null,
    getKey: () => BYTES,
    unsubscribe: async () => {
      unsubscribed.push('x')
      return true
    },
  }
}

type Overrides = Partial<PushEnvironment> & { stored?: { id: string | null } }

function environment(overrides: Overrides = {}) {
  const stored = overrides.stored ?? { id: null }
  const calls = { registered: 0, unregistered: [] as string[] }
  const base: PushEnvironment = {
    getSubscription: async () => null,
    getVapidPublicKey: async () => 'AQID',
    isSupported: () => true,
    permission: () => 'default',
    readStoredDeviceId: () => stored.id,
    registerWebPush: async () => {
      calls.registered += 1
      return { id: 'device-1' }
    },
    requestPermission: async () => 'granted',
    storeDeviceId: (id) => {
      stored.id = id
    },
    subscribe: async () => subscription(),
    timeoutMs: 50,
    unregisterDevice: async (id) => {
      calls.unregistered.push(id)
    },
  }
  return { calls, env: { ...base, ...overrides } as PushEnvironment, stored }
}

describe('push do aparelho do motorista', () => {
  test('ativar cadastra o aparelho e guarda o id', async () => {
    const { calls, env, stored } = environment()
    const result = await enablePush(env)
    expect(result).toEqual({ ok: true, state: 'on' })
    expect(calls.registered).toBe(1)
    expect(stored.id).toBe('device-1')
  })

  test('permissão negada diz o motivo e não cadastra nada', async () => {
    const { calls, env } = environment({ requestPermission: async () => 'denied' })
    expect(await enablePush(env)).toEqual({ ok: false, reason: 'denied' })
    expect(calls.registered).toBe(0)
  })

  test('servidor sem chave VAPID: motivo no_key, sem inscrição', async () => {
    let subscribed = false
    const { env } = environment({
      getVapidPublicKey: async () => {
        throw new Error('chave não retornada')
      },
      subscribe: async () => {
        subscribed = true
        return subscription()
      },
    })
    expect(await enablePush(env)).toEqual({ ok: false, reason: 'no_key' })
    expect(subscribed).toBe(false)
  })

  test('falha ao cadastrar na API não vira sucesso nem some', async () => {
    const { env, stored } = environment({
      registerWebPush: async () => {
        throw new Error('500')
      },
    })
    expect(await enablePush(env)).toEqual({ ok: false, reason: 'register_failed' })
    expect(stored.id).toBeNull()
  })

  test('espera longa vira timeout em vez de girar para sempre', async () => {
    const { env } = environment({ getVapidPublicKey: () => new Promise(() => undefined) })
    expect(await enablePush(env)).toEqual({ ok: false, reason: 'timeout' })
  })

  test('desativar cancela a inscrição, apaga o id e remove o aparelho na API', async () => {
    const unsubscribed: string[] = []
    const { calls, env, stored } = environment({
      getSubscription: async () => subscription(unsubscribed),
      stored: { id: 'device-1' },
    })
    expect(await disablePush(env)).toEqual({ ok: true, state: 'off' })
    expect(unsubscribed).toHaveLength(1)
    expect(calls.unregistered).toEqual(['device-1'])
    expect(stored.id).toBeNull()
  })

  test('API fora do ar ao desativar: o aparelho local já fica desligado e o erro é dito', async () => {
    const { env, stored } = environment({
      stored: { id: 'device-1' },
      unregisterDevice: async () => {
        throw new Error('rede')
      },
    })
    expect(await disablePush(env)).toEqual({ ok: false, reason: 'unregister_failed' })
    expect(stored.id).toBeNull()
  })

  test('o estado vem do navegador e do aparelho cadastrado', async () => {
    expect(await readPushState(environment({ isSupported: () => false }).env)).toBe('unsupported')
    expect(await readPushState(environment({ permission: () => 'denied' }).env)).toBe('denied')
    expect(await readPushState(environment({ permission: () => 'granted' }).env)).toBe('off')
    expect(
      await readPushState(
        environment({
          getSubscription: async () => subscription(),
          permission: () => 'granted',
          stored: { id: 'device-1' },
        }).env,
      ),
    ).toBe('on')
  })
})
