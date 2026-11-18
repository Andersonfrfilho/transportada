/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createUpdateCheckScheduler,
  UPDATE_CHECK_MIN_INTERVAL_MS,
} from '@/modules/driver-trip/shared/updateCheck.service'
import { formatAppBuildTime } from '@/modules/driver-trip/shared/appBuild.service'

function build(state: { now: number; visible: boolean }) {
  const calls = { checks: 0, midSession: 0 }
  const scheduler = createUpdateCheckScheduler({
    check: () => {
      calls.checks += 1
    },
    isVisible: () => state.visible,
    markMidSession: () => {
      calls.midSession += 1
    },
    now: () => state.now,
  })
  return { calls, scheduler }
}

describe('procura de versão nova do PWA', () => {
  it('procura ao voltar ao app e marca a versão achada como de meio de sessão', () => {
    const state = { now: 1_000_000, visible: true }
    const { calls, scheduler } = build(state)
    expect(scheduler.run()).toBe(true)
    expect(calls).toEqual({ checks: 1, midSession: 1 })
  })

  it('não procura com a tela escondida', () => {
    const { calls, scheduler } = build({ now: 1_000_000, visible: false })
    expect(scheduler.run()).toBe(false)
    expect(calls).toEqual({ checks: 0, midSession: 0 })
  })

  it('não repete antes do intervalo mínimo, e repete depois dele', () => {
    const state = { now: 1_000_000, visible: true }
    const { calls, scheduler } = build(state)
    scheduler.run()
    state.now += UPDATE_CHECK_MIN_INTERVAL_MS - 1
    expect(scheduler.run()).toBe(false)
    state.now += 1
    expect(scheduler.run()).toBe(true)
    expect(calls.checks).toBe(2)
  })
})

describe('versão do app na fila', () => {
  it('formata a hora do build e recusa data inválida', () => {
    expect(formatAppBuildTime('2026-11-18T17:05:12.000Z')).toMatch(/^\d{2}\/\d{2},? \d{2}:\d{2}$/u)
    expect(formatAppBuildTime('não é data')).toBeUndefined()
  })
})
