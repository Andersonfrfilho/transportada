/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Trava de uma viagem por vez no pedido de prorrogação do motorista: a política pura e a leitura da flag.
 */
import { describe, expect, it } from 'bun:test'

import { assertDriverTripNotLocked } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import type {
  DriverTripLockPort,
  RegisterDriverOccurrenceInput,
} from '../../src/trips/application/register-driver-occurrence.types.js'
import { BILL_EXTENSION_OCCURRENCE_TYPE_NAME } from '../../src/shared/occurrence-type-catalog.constant.js'
import { DriverTripLockedError } from '../../src/trips/domain/trip.error.js'
import { isDriverTripLocked } from '../../src/trips/domain/driver-trip-lock.policy.js'

const CURRENT = 'trip-a'
const OTHER = 'trip-b'

const base = {
  enabled: true,
  minimumScore: 70,
  onRoadTripIds: [CURRENT, OTHER],
  score: 50 as null | number,
  tripId: OTHER,
}

describe('trava de uma viagem por vez (política)', () => {
  it('flag desligada nunca trava', () => {
    expect(isDriverTripLocked({ ...base, enabled: false })).toBe(false)
  })

  it('a viagem atual nunca é travada, qualquer que seja a nota', () => {
    expect(isDriverTripLocked({ ...base, score: 0, tripId: CURRENT })).toBe(false)
  })

  it('nota abaixo do corte trava a outra viagem na rua', () => {
    expect(isDriverTripLocked(base)).toBe(true)
  })

  it('nota igual ou acima do corte libera', () => {
    expect(isDriverTripLocked({ ...base, score: 70 })).toBe(false)
    expect(isDriverTripLocked({ ...base, score: 100 })).toBe(false)
  })

  it('sem nota conta como abaixo do corte', () => {
    expect(isDriverTripLocked({ ...base, score: null })).toBe(true)
  })

  it('viagem fora da rua (concluída) não é travada', () => {
    expect(isDriverTripLocked({ ...base, score: 0, tripId: 'trip-concluida' })).toBe(false)
  })
})

const DRIVER_ID = '00000000-0000-4000-8000-000000000003'

function buildLock(score: null | number, enabled = true): DriverTripLockPort {
  return {
    enabled,
    listOnRoadTripIds: async () => [CURRENT, OTHER],
    minimumScore: 70,
    readScore: async () => score,
  }
}

function buildInput(params: {
  readonly lock: DriverTripLockPort
  readonly office?: boolean
}): RegisterDriverOccurrenceInput {
  return {
    companyId: '00000000-0000-4000-8000-000000000001',
    driverId: DRIVER_ID,
    tripLock: params.lock,
    ...(params.office === true ? { target: { tripId: OTHER } } : {}),
  } as unknown as RegisterDriverOccurrenceInput
}

describe('trava de uma viagem por vez (registro)', () => {
  it('motorista de nota ruim na outra viagem é travado', async () => {
    const attempt = assertDriverTripNotLocked({
      input: buildInput({ lock: buildLock(40) }),
      tripId: OTHER,
      typeName: BILL_EXTENSION_OCCURRENCE_TYPE_NAME,
    })
    await expect(attempt).rejects.toBeInstanceOf(DriverTripLockedError)
  })

  it('motorista de nota boa passa', async () => {
    await assertDriverTripNotLocked({
      input: buildInput({ lock: buildLock(90) }),
      tripId: OTHER,
      typeName: BILL_EXTENSION_OCCURRENCE_TYPE_NAME,
    })
  })

  it('o escritório nunca é travado', async () => {
    await assertDriverTripNotLocked({
      input: buildInput({ lock: buildLock(0), office: true }),
      tripId: OTHER,
      typeName: BILL_EXTENSION_OCCURRENCE_TYPE_NAME,
    })
  })

  it('outro tipo de ocorrência não é travado', async () => {
    await assertDriverTripNotLocked({
      input: buildInput({ lock: buildLock(0) }),
      tripId: OTHER,
      typeName: 'Item avariado',
    })
  })

  it('flag desligada não trava', async () => {
    await assertDriverTripNotLocked({
      input: buildInput({ lock: buildLock(0, false) }),
      tripId: OTHER,
      typeName: BILL_EXTENSION_OCCURRENCE_TYPE_NAME,
    })
  })
})
