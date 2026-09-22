/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { canReadTrip } from '../../src/modules/trip/shared/trip.constant'

/**
 * Spec 156 T8: `canReadTrip` substitui a leitura direta de `TRIP_READ_PERMISSION` em
 * `useTripWorkspace.hook.ts` — o `finance` (`trip.report-on-behalf`) abre a viagem sem `fleet.read`
 * (D11). A tela de `/ocorrencias` continua só em `fleet.read`, por constante própria.
 */
describe('canReadTrip (spec 156 D11)', () => {
  it('abre com fleet.read', () => {
    expect(canReadTrip(['fleet.read'])).toBe(true)
  })

  it('abre com trip.report-on-behalf, sem fleet.read', () => {
    expect(canReadTrip(['trip.report-on-behalf'])).toBe(true)
  })

  it('abre com as duas', () => {
    expect(canReadTrip(['fleet.read', 'trip.report-on-behalf'])).toBe(true)
  })

  it('fecha sem nenhuma das duas', () => {
    expect(canReadTrip([])).toBe(false)
    expect(canReadTrip(['trip.manage'])).toBe(false)
  })
})
