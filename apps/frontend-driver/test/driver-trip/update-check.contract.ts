/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createUpdateCheckScheduler,
  UPDATE_CHECK_MIN_INTERVAL_MS,
} from '@/modules/driver-trip/shared/updateCheck.service'

function build(state: { fail: boolean; now: number; visible: boolean }) {
  const calls = { checks: 0 }
  const scheduler = createUpdateCheckScheduler({
    check: () => {
      calls.checks += 1
      return state.fail ? Promise.reject(new Error('offline')) : Promise.resolve()
    },
    isVisible: () => state.visible,
    now: () => state.now,
  })
  return { calls, scheduler }
}

describe('procura de versão nova do PWA', () => {
  it('procura ao voltar ao app', async () => {
    const { calls, scheduler } = build({ fail: false, now: 1_000_000, visible: true })
    expect(await scheduler.run()).toBe(true)
    expect(calls).toEqual({ checks: 1 })
  })

  it('não procura com a tela escondida', async () => {
    const { calls, scheduler } = build({ fail: false, now: 1_000_000, visible: false })
    expect(await scheduler.run()).toBe(false)
    expect(calls).toEqual({ checks: 0 })
  })

  it('não repete antes do intervalo mínimo, e repete depois dele', async () => {
    const state = { fail: false, now: 1_000_000, visible: true }
    const { calls, scheduler } = build(state)
    await scheduler.run()
    state.now += UPDATE_CHECK_MIN_INTERVAL_MS - 1
    expect(await scheduler.run()).toBe(false)
    state.now += 1
    expect(await scheduler.run()).toBe(true)
    expect(calls.checks).toBe(2)
  })

  it('procura que falhou (sem rede) não gasta o intervalo', async () => {
    const state = { fail: true, now: 1_000_000, visible: true }
    const { calls, scheduler } = build(state)
    expect(await scheduler.run()).toBe(false)
    state.fail = false
    state.now += 1_000
    expect(await scheduler.run()).toBe(true)
    expect(calls.checks).toBe(2)
  })

  it('não começa uma procura enquanto outra está em andamento', async () => {
    const state = { now: 1_000_000, visible: true }
    let release: () => void = () => undefined
    let checks = 0
    const scheduler = createUpdateCheckScheduler({
      check: () => {
        checks += 1
        return new Promise<void>((resolve) => {
          release = resolve
        })
      },
      isVisible: () => state.visible,
      now: () => state.now,
    })
    const first = scheduler.run()
    expect(await scheduler.run()).toBe(false)
    release()
    expect(await first).toBe(true)
    expect(checks).toBe(1)
  })
})
