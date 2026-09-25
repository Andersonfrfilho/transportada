/* Copyright (c) 2026 Ada Technology. MIT License. */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { isSmokeAuthBypassEnabled } from '../../src/modules/identity/shared/smokeAuthBypass.service'

const FLAG = 'VITE_SMOKE_AUTH_BYPASS'

describe('isSmokeAuthBypassEnabled', () => {
  const previousFlag = process.env[FLAG]
  const previousLocation = globalThis.location

  beforeEach(() => {
    delete process.env[FLAG]
  })

  afterEach(() => {
    if (previousFlag === undefined) delete process.env[FLAG]
    else process.env[FLAG] = previousFlag
    Object.defineProperty(globalThis, 'location', { configurable: true, value: previousLocation })
  })

  function stubHostname(hostname: string): void {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { hostname },
    })
  }

  test('is off without the flag, even on localhost', () => {
    stubHostname('localhost')

    expect(isSmokeAuthBypassEnabled()).toBe(false)
  })

  test('is off with the flag on a non-local hostname', () => {
    process.env[FLAG] = 'true'
    stubHostname('motorista.staging.fernandes-transportadora.com.br')

    expect(isSmokeAuthBypassEnabled()).toBe(false)
  })

  test('is on only with the flag and a local hostname', () => {
    process.env[FLAG] = 'true'
    stubHostname('localhost')

    expect(isSmokeAuthBypassEnabled()).toBe(true)

    stubHostname('127.0.0.1')

    expect(isSmokeAuthBypassEnabled()).toBe(true)
  })
})
