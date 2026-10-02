/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverTrip, DriverTripSnapshot } from '@/modules/driver-trip/shared/driverTrip.types'
import { findCurrentDriverTrip } from '@/modules/driver-trip/shared/driverTripCurrent.service'

function buildTrip(id: string, status: string): DriverTrip {
  return { id, manifest: null, status, stops: [], vehiclePlate: `PLACA-${id}` }
}

function buildSnapshot(trips: readonly DriverTrip[]): DriverTripSnapshot {
  return { isRegisteredDriver: true, pendingProofs: [], score: null, trips }
}

/**
 * Spec 224 T1.11: a API devolve a viagem concluída/cancelada por 15 min. A cópia legada do painel
 * pegava `trips[0]` cru e a exibiria como ativa.
 */
describe('a viagem que a cópia legada do painel exibe (spec 224 T1.11)', () => {
  it('sem snapshot, nenhuma viagem', () => {
    expect(findCurrentDriverTrip(undefined)).toBeUndefined()
  })

  it('a viagem aberta é a exibida', () => {
    const open = buildTrip('a', 'in_transit')

    expect(findCurrentDriverTrip(buildSnapshot([open]))).toBe(open)
  })

  it.each(['completed', 'cancelled'])('uma %s sozinha na lista não é exibida', (status) => {
    expect(findCurrentDriverTrip(buildSnapshot([buildTrip('a', status)]))).toBeUndefined()
  })

  it.each(['completed', 'cancelled'])('uma %s à frente de uma aberta cede a vez', (status) => {
    const open = buildTrip('b', 'dispatched')

    expect(findCurrentDriverTrip(buildSnapshot([buildTrip('a', status), open]))).toBe(open)
  })
})
