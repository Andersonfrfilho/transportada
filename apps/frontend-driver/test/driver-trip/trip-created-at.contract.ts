/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'
import { formatTripCreatedAt } from '@/modules/driver-trip/shared/tripIdentifier.service'

function buildPayload(trip: Record<string, unknown>): unknown {
  return { data: { isRegisteredDriver: true, pendingProofs: [], score: null, trips: [trip] } }
}

const TRIP = {
  createdAt: '2026-09-18T09:00:00.000Z',
  id: '00000000-0000-4000-8000-000000000100',
  manifest: null,
  status: 'dispatched',
  stops: [],
  vehiclePlate: 'GCQ8E47',
}

describe('a data de criação da viagem', () => {
  it('atravessa a validação como veio da API', () => {
    const snapshot = toDriverTripSnapshot(buildPayload(TRIP))
    expect(snapshot?.trips[0]?.createdAt).toBe('2026-09-18T09:00:00.000Z')
  })

  /**
   * O celular guarda o último snapshot: um cache gravado antes deste campo existir não pode
   * derrubar a tela. Ausente vira vazio, e a linha da data some.
   */
  it('snapshot antigo, sem o campo, continua abrindo a viagem', () => {
    const withoutCreatedAt: Record<string, unknown> = { ...TRIP }
    delete withoutCreatedAt.createdAt
    const snapshot = toDriverTripSnapshot(buildPayload(withoutCreatedAt))
    expect(snapshot?.trips).toHaveLength(1)
    expect(snapshot?.trips[0]?.createdAt).toBe('')
  })

  it('a data sai no fuso e no formato do Brasil, e lixo não vira "Invalid Date"', () => {
    expect(formatTripCreatedAt('2026-09-18T12:00:00.000Z')).toMatch(/^18\/09\/2026/u)
    expect(formatTripCreatedAt('')).toBe('')
    expect(formatTripCreatedAt('não é data')).toBe('')
  })
})
