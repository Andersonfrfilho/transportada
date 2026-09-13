/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CargoLayoutStop } from '@adatechnology/cargo-placement'

import { createRequestCargoLayoutUseCase } from '../../src/trips/application/request-cargo-layout.use-case.js'
import type { CargoLayoutRequestPort } from '../../src/trips/application/cargo-layout-request.port.js'
import type { CargoLayoutRequestParams } from '../../src/trips/application/cargo-layout-request.types.js'
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

const BED = { heightM: '2', lengthM: '6', source: 'measured', widthM: '2.4' } as const

function createBaseParams(overrides: {
  readonly correlationId?: string
  readonly tripId?: string | null
}): RequestCargoLayoutParams {
  return {
    bedDimensions: BED,
    capacityM3: '28.8',
    companyId: COMPANY_ID,
    correlationId: overrides.correlationId ?? CORRELATION_ID,
    stops: [STOP],
    tripId: 'tripId' in overrides ? (overrides.tripId ?? null) : TRIP_ID,
  }
}

function createFakeRepository(): CargoLayoutRequestPort & {
  readonly calls: CargoLayoutRequestParams[]
} {
  const calls: CargoLayoutRequestParams[] = []
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

  /** D15: capacidade desconhecida não pede cálculo — responde `unavailable` sem tocar no repositório. */
  test('an unknown capacity answers unavailable without requesting a layout', async () => {
    const repository = createFakeRepository()
    const useCase = createRequestCargoLayoutUseCase({ repository })

    const result = await useCase.execute({ ...createBaseParams({}), capacityM3: null })

    expect(result).toEqual({ enqueued: false, layoutId: null, status: 'unavailable' })
    expect(repository.calls).toHaveLength(0)
  })

  /** D10: sem baú medido o pacote devolveria `placement: null`, que seria gravado `ready`. */
  test.each([
    ['null', null],
    ['absent', undefined],
  ])('a %s bed answers unavailable without requesting a layout', async (_name, bedDimensions) => {
    const repository = createFakeRepository()
    const useCase = createRequestCargoLayoutUseCase({ repository })
    const base = createBaseParams({})
    const withoutBed: RequestCargoLayoutParams = {
      capacityM3: base.capacityM3,
      companyId: base.companyId,
      correlationId: base.correlationId,
      stops: base.stops,
      tripId: base.tripId,
    }

    const result = await useCase.execute(
      bedDimensions === null ? { ...withoutBed, bedDimensions: null } : withoutBed,
    )

    expect(result).toEqual({ enqueued: false, layoutId: null, status: 'unavailable' })
    expect(repository.calls).toHaveLength(0)
  })

  test('capacity and bed known: the layout is requested', async () => {
    const repository = createFakeRepository()
    const useCase = createRequestCargoLayoutUseCase({ repository })

    const result = await useCase.execute(createBaseParams({}))

    expect(result).toEqual({ enqueued: true, layoutId: 'layout-1', status: 'queued' })
    expect(repository.calls).toHaveLength(1)
  })
})
