/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'bun:test'

import {
  DIAGNOSTIC_EVENT_KINDS,
  DIAGNOSTIC_FAILURE_KINDS,
  DIAGNOSTIC_STEPS,
} from '@/modules/driver-trip/shared/clientDiagnostics.constant'
import { traceBaixaTotal } from '@/modules/driver-trip/shared/baixaTotalTrace.service'
import { reduceProofPhotoWithTiming } from '@/modules/driver-trip/shared/tracedProofPhotoReducer.service'
import { getDriverDiagnostics } from '@/modules/driver-trip/shared/driverTripClient.service'

const API_CONSTANT_PATH = resolve(
  import.meta.dir,
  '../../../api-transportada/src/trips/domain/trip-client-diagnostics.constant.ts',
)

function readApiList(name: string): readonly string[] {
  const source = readFileSync(API_CONSTANT_PATH, 'utf8')
  const match = new RegExp(`export const ${name} = \\[([^\\]]*)\\] as const`, 'u').exec(source)
  if (match?.[1] === undefined) throw new Error(`${name} não encontrada na API`)
  return [...match[1].matchAll(/'([^']+)'/gu)].map((item) => item[1] ?? '')
}

describe('spec 254: lista de diagnóstico igual na API e no driver', () => {
  const lists: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['DIAGNOSTIC_EVENT_KINDS', DIAGNOSTIC_EVENT_KINDS],
    ['DIAGNOSTIC_STEPS', DIAGNOSTIC_STEPS],
    ['DIAGNOSTIC_FAILURE_KINDS', DIAGNOSTIC_FAILURE_KINDS],
  ]
  it.each(lists)('%s', (name, driverList) => {
    expect([...driverList].sort()).toEqual([...readApiList(name)].sort())
  })
})

describe('spec 254: baixa_total mede do toque até a fila aceitar', () => {
  it('emite step_timing baixa_total com o tipo do relatório', async () => {
    const events: unknown[] = []
    let now = 1_000
    await traceBaixaTotal({
      clock: () => now,
      record: (event) => events.push(event),
      reportKind: 'deliver',
      run: () => {
        now = 1_750
        return Promise.resolve('queued')
      },
    })
    expect(events).toEqual([
      { durationMs: 750, eventKind: 'step_timing', reportKind: 'deliver', step: 'baixa_total' },
    ])
  })

  it('devolve o resultado do passo e, se ele lançar, registra send_failed e relança', async () => {
    const events: Array<Record<string, unknown>> = []
    const boom = new Error('IndexedDB cheio')
    let thrown: unknown
    try {
      await traceBaixaTotal({
        clock: () => 0,
        record: (event) => events.push(event),
        reportKind: 'deliver',
        run: () => Promise.reject(boom),
      })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBe(boom)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ eventKind: 'send_failed', step: 'baixa_total' })
  })
})

describe('spec 254: photo_reduce que lança vira send_failed', () => {
  it('registra send_failed local e relança o erro original', async () => {
    const recorded: Array<Record<string, unknown>> = []
    const diagnostics = getDriverDiagnostics()
    const original = diagnostics.record
    ;(diagnostics as { record: typeof diagnostics.record }).record = (event) => {
      recorded.push(event)
    }
    let isRethrown = false
    try {
      const notAnImage = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
      await reduceProofPhotoWithTiming(notAnImage).catch((error: unknown) => {
        isRethrown = error !== undefined
      })
    } finally {
      ;(diagnostics as { record: typeof diagnostics.record }).record = original
    }
    expect(isRethrown).toBe(true)
    const photoEvents = recorded.filter((event) => event.step === 'photo_reduce')
    expect(photoEvents).toHaveLength(1)
    expect(photoEvents[0]).toMatchObject({ eventKind: 'send_failed', failureKind: 'local' })
  })
})
