/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CargoLayoutStop } from '@adatechnology/cargo-placement'

import { createRequestCargoLayoutUseCase } from '../../src/trips/application/request-cargo-layout.use-case.js'
import type { CargoLayoutRequestPort } from '../../src/trips/application/cargo-layout-request.port.js'
import type { UpsertCargoLayoutRequestParams } from '../../src/trips/application/cargo-layout-request.types.js'
import type { RequestCargoLayoutParams } from '../../src/trips/application/request-cargo-layout.types.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-0000000000a1'
const CORRELATION_ID = '00000000-0000-4000-8000-0000000000c1'

const STOP: CargoLayoutStop = {
  boxes: [],
  documentsWithoutVolume: 0,
  label: 'Depósito central',
  sequence: 1,
  volumeM3: null,
}

function createBaseParams(overrides: {
  readonly correlationId?: string
  readonly tripId?: string | null
}): RequestCargoLayoutParams {
  return {
    capacityM3: null,
    companyId: COMPANY_ID,
    correlationId: overrides.correlationId ?? CORRELATION_ID,
    stops: [STOP],
    tripId: 'tripId' in overrides ? (overrides.tripId ?? null) : TRIP_ID,
  }
}

function createFakeRepository(): CargoLayoutRequestPort & {
  readonly calls: UpsertCargoLayoutRequestParams[]
} {
  const calls: UpsertCargoLayoutRequestParams[] = []
  return {
    calls,
    async requestLayout(params) {
      calls.push(params)
      return { enqueued: true, layoutId: 'layout-1', status: 'queued' }
    },
  }
}

describe('request cargo layout contract (spec 145 D6/D8)', () => {
  /** D6: mesma entrada é a mesma planta — o hash que o repositório recebe não pode variar. */
  test('sends the same hash for the same input, every time', async () => {
    const repository = createFakeRepository()
    const useCase = createRequestCargoLayoutUseCase({ repository })

    await useCase.execute(createBaseParams({}))
    await useCase.execute(createBaseParams({}))

    expect(repository.calls).toHaveLength(2)
    expect(repository.calls[0]?.inputHash).toBe(repository.calls[1]?.inputHash)
  })

  /** D3: a prévia da montagem pede planta de uma viagem que ainda não existe. */
  test('accepts a null trip id, which is what the preview sends', async () => {
    const repository = createFakeRepository()
    const useCase = createRequestCargoLayoutUseCase({ repository })

    await useCase.execute(createBaseParams({ tripId: null }))

    expect(repository.calls[0]?.tripId).toBeNull()
  })

  /** D5: a coluna `input` é a entrada de `resolveCargoLayout` — nem mais (o envelope), nem menos (o rótulo). */
  test('stores the layout input with the stop label and without the request envelope', async () => {
    const repository = createFakeRepository()
    const useCase = createRequestCargoLayoutUseCase({ repository })

    await useCase.execute(createBaseParams({}))

    const stored = repository.calls[0]?.input
    expect(stored?.stops[0]?.label).toBe('Depósito central')
    expect(stored).not.toHaveProperty('companyId')
    expect(stored).not.toHaveProperty('correlationId')
    expect(stored).not.toHaveProperty('tripId')
  })

  test('passes the correlation id through, unchanged', async () => {
    const repository = createFakeRepository()
    const useCase = createRequestCargoLayoutUseCase({ repository })

    await useCase.execute(createBaseParams({ correlationId: 'trace-42' }))

    expect(repository.calls[0]?.correlationId).toBe('trace-42')
  })
})
