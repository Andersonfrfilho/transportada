/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  APP_UPDATE_CHECK_INTERVAL_MILLISECONDS,
  createAppUpdateStore,
  scheduleUpdateChecks,
} from '../src/modules/shared/appUpdate.service'

function environment(input: { online: boolean; visible: boolean }) {
  let tick: () => void = () => undefined
  let visibility: () => void = () => undefined
  let intervalMilliseconds = 0
  return {
    fire: () => tick(),
    changeVisibility: () => visibility(),
    get intervalMilliseconds() {
      return intervalMilliseconds
    },
    environment: {
      addVisibilityListener: (listener: () => void) => {
        visibility = listener
      },
      isOnline: () => input.online,
      isVisible: () => input.visible,
      setInterval: (handler: () => void, milliseconds: number) => {
        tick = handler
        intervalMilliseconds = milliseconds
      },
    },
  }
}

describe('aviso de nova versão', () => {
  test('a loja começa sem versão nova e avisa quem assina, uma vez só', async () => {
    const store = createAppUpdateStore()
    let notifications = 0
    store.subscribe(() => {
      notifications += 1
    })
    expect(store.isReady()).toBe(false)
    let applied = 0
    store.markReady(() => {
      applied += 1
      return Promise.resolve()
    })
    store.markReady(() => {
      applied += 10
      return Promise.resolve()
    })
    expect(store.isReady()).toBe(true)
    expect(notifications).toBe(1)
    await store.apply()
    expect(applied).toBe(10)
  })

  test('cancelar a assinatura para de avisar', () => {
    const store = createAppUpdateStore()
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })
    unsubscribe()
    store.markReady(() => Promise.resolve())
    expect(notifications).toBe(0)
  })

  test('pergunta por versão nova no intervalo, só com rede', () => {
    let updates = 0
    const registration = {
      update: () => {
        updates += 1
        return Promise.resolve()
      },
    }
    const online = environment({ online: true, visible: true })
    scheduleUpdateChecks(registration, online.environment)
    expect(online.intervalMilliseconds).toBe(APP_UPDATE_CHECK_INTERVAL_MILLISECONDS)
    online.fire()
    expect(updates).toBe(1)
    const offline = environment({ online: false, visible: true })
    scheduleUpdateChecks(registration, offline.environment)
    offline.fire()
    expect(updates).toBe(1)
  })

  test('pergunta ao voltar a aba para a frente, não ao escondê-la', () => {
    let updates = 0
    const registration = {
      update: () => {
        updates += 1
        return Promise.resolve()
      },
    }
    const visible = environment({ online: true, visible: true })
    scheduleUpdateChecks(registration, visible.environment)
    visible.changeVisibility()
    expect(updates).toBe(1)
    const hidden = environment({ online: true, visible: false })
    scheduleUpdateChecks(registration, hidden.environment)
    hidden.changeVisibility()
    expect(updates).toBe(1)
  })

  test('falha da pergunta nunca sobe', async () => {
    const registration = {
      update: () => Promise.reject(new Error('rede caiu')),
    }
    const online = environment({ online: true, visible: true })
    scheduleUpdateChecks(registration, online.environment)
    expect(() => online.fire()).not.toThrow()
    await Promise.resolve()
  })
})
