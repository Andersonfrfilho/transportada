/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'

const NOW = new Date('2026-11-16T12:00:00.000Z')
const scores = { readScores: () => Promise.resolve(new Map<string, number>()) }

function build(findDriverPix?: () => Promise<null | { key: string; type: 'cpf' }>) {
  return findCurrentDriverTrip({
    companyId: 'company-1',
    membershipId: 'membership-1',
    now: NOW,
    repository: {
      findDriverIdByMembership: () => Promise.resolve('driver-1'),
      listActiveTrips: () => Promise.resolve([]),
      listPendingProofs: () => Promise.resolve([]),
      ...(findDriverPix === undefined ? {} : { findDriverPix }),
    },
    scores,
  })
}

describe('o PIX do cadastro do motorista na viagem atual', () => {
  it('devolve o PIX do cadastro para o app pré-preencher', async () => {
    const result = await build(() => Promise.resolve({ key: '42141220890', type: 'cpf' }))
    expect(result.registeredPix).toEqual({ key: '42141220890', type: 'cpf' })
  })

  it('devolve null sem PIX e quando a porta não oferece a leitura', async () => {
    expect((await build(() => Promise.resolve(null))).registeredPix).toBeNull()
    expect((await build()).registeredPix).toBeNull()
  })
})
