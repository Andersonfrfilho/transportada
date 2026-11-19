/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { formatAppBuildTime } from '@/modules/driver-trip/shared/appBuild.service'

describe('versão do app na fila', () => {
  it('formata a hora do build e recusa data inválida', () => {
    expect(typeof formatAppBuildTime('2026-11-18T17:05:12.000Z')).toBe('string')
    expect(formatAppBuildTime('não é data')).toBeUndefined()
  })
})
