/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 157 RF10 (T8), ADR-0068 §7: a nota na frota. A listagem pede a nota de todos os motoristas da
 * página numa leitura só; a ficha devolve nota e penalidades, e motorista inexistente ou de outra
 * empresa é o mesmo 404 — o repositório de nota nem é consultado.
 */
import { describe, expect, test } from 'bun:test'

import type { DriverScorePort } from '../../src/fleet/application/driver-score.port.js'
import { createFleetDriverScoresUseCase } from '../../src/fleet/application/fleet-driver-scores.use-case.js'
import type { FleetDriver } from '../../src/fleet/application/fleet.port.js'
import type { DriverScoreResult } from '../../src/fleet/domain/driver-score.policy.js'
import { ApiError } from '../../src/shared/api.error.js'
import { FLEET_CONTEXT } from '../fixtures/fleet-application.fixture'
import { DRIVER, DRIVER_ID } from '../fixtures/fleet-http-payload.fixture'

const NOW = new Date('2026-09-18T12:00:00.000Z')
const OTHER_DRIVER: FleetDriver = { ...DRIVER, id: '00000000-0000-4000-8000-0000000000d2' }
const IDLE_DRIVER: FleetDriver = { ...DRIVER, id: '00000000-0000-4000-8000-0000000000d3' }

const PENALTIES: DriverScoreResult = {
  penalties: [
    {
      deliveredAt: new Date('2026-09-17T11:00:00.000Z'),
      documentNumber: '1234',
      expiresAt: new Date('2026-12-16T11:00:00.000Z'),
      points: 10,
      reason: 'missing_proof',
      tripDocumentId: '00000000-0000-4000-8000-0000000000e1',
    },
  ],
  score: 90,
}

function buildScores(): { readonly asked: unknown[]; readonly scores: DriverScorePort } {
  const asked: unknown[] = []
  return {
    asked,
    scores: {
      async readPenalties(input) {
        asked.push({ penalties: input })
        return PENALTIES
      },
      async readScores(input) {
        asked.push({ scores: input })
        return new Map([
          [DRIVER.id, 85],
          [OTHER_DRIVER.id, 100],
          [IDLE_DRIVER.id, null],
        ])
      },
    },
  }
}

function buildUseCase(input: {
  readonly found: FleetDriver | null
  readonly scores: DriverScorePort
}) {
  return createFleetDriverScoresUseCase({
    clock: () => NOW,
    drivers: { findById: async () => input.found },
    listDrivers: async () => ({ items: [DRIVER, OTHER_DRIVER, IDLE_DRIVER], nextCursor: 'next' }),
    scores: input.scores,
  })
}

describe('fleet driver scores use case contract (spec 157 T8)', () => {
  test('lists the page with each score from a single read for every driver on it', async () => {
    const { asked, scores } = buildScores()

    const page = await buildUseCase({ found: DRIVER, scores }).list({
      context: FLEET_CONTEXT,
      cursor: null,
      limit: 25,
    })

    expect(page.nextCursor).toBe('next')
    expect(page.items.map((driver) => [driver.id, driver.score])).toEqual([
      [DRIVER.id, 85],
      [OTHER_DRIVER.id, 100],
      [IDLE_DRIVER.id, null],
    ])
    expect(asked).toEqual([
      {
        scores: {
          companyId: FLEET_CONTEXT.companyId,
          driverIds: [DRIVER.id, OTHER_DRIVER.id, IDLE_DRIVER.id],
          now: NOW,
        },
      },
    ])
  })

  test('reads the score and the penalties of a driver of the company', async () => {
    const { asked, scores } = buildScores()

    const result = await buildUseCase({ found: DRIVER, scores }).read({
      context: FLEET_CONTEXT,
      driverId: DRIVER_ID,
    })

    expect(result).toEqual(PENALTIES)
    expect(asked).toEqual([
      { penalties: { companyId: FLEET_CONTEXT.companyId, driverId: DRIVER_ID, now: NOW } },
    ])
  })

  test('answers 404 for a driver the company does not have, without reading any score', async () => {
    const { asked, scores } = buildScores()

    const attempt = buildUseCase({ found: null, scores }).read({
      context: FLEET_CONTEXT,
      driverId: DRIVER_ID,
    })

    await expect(attempt).rejects.toBeInstanceOf(ApiError)
    await expect(attempt).rejects.toMatchObject({ code: 'FLEET_DRIVER_NOT_FOUND', status: 404 })
    expect(asked).toEqual([])
  })
})
