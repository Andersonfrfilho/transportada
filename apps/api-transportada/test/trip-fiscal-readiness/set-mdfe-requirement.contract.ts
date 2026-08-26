/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import type {
  TripDocumentReadiness,
  TripFiscalReadinessPort,
} from '../../src/trips/application/read-trip-fiscal-readiness.use-case.js'
import { setTripMdfeRequirement } from '../../src/trips/application/set-trip-mdfe-requirement.use-case.js'
import { TRIP_MDFE_REQUIREMENT_BLOCKS } from '../../src/trips/domain/trip-mdfe-requirement.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000a11'
const ACTOR_ID = '00000000-0000-4000-8000-000000000002'

function document(expectedDocument: 'cte' | 'nfse' | null): TripDocumentReadiness {
  return {
    cteAccessKey: null,
    cteFiscalDocumentId: null,
    expectedDocument,
    nfeDocumentId: null,
    reason: 'ok',
    rejectionCode: null,
    rejectionMessage: null,
    tripDocumentId: TRIP_ID,
  }
}

function buildWorld(input: { readonly documents: readonly TripDocumentReadiness[] | null }) {
  const saved: object[] = []
  const readinessRepository: TripFiscalReadinessPort = {
    countDischargeCities: () => Promise.resolve(0),
    hasLiveManifest: () => Promise.resolve(false),
    readDocumentReadiness: () => Promise.resolve(input.documents),
  }

  return {
    run: (call: { readonly reason: null | string; readonly requiresMdfe: boolean | null }) =>
      setTripMdfeRequirement({
        actorUserId: ACTOR_ID,
        companyId: COMPANY_ID,
        readinessRepository,
        reason: call.reason,
        repository: {
          saveRequirement: (saveCall) => {
            saved.push(saveCall)
            return Promise.resolve()
          },
        },
        requiresMdfe: call.requiresMdfe,
        tripId: TRIP_ID,
      }),
    saved,
  }
}

describe('sobrescrever a exigência de MDF-e da viagem', () => {
  it('grava a dispensa com o motivo e devolve o efetivo já derivado', async () => {
    const world = buildWorld({ documents: [document('cte'), document('nfse')] })

    const result = await world.run({ reason: 'carga volta hoje', requiresMdfe: false })

    expect(result).toEqual({
      effectiveRequiresMdfe: false,
      manifestableCount: 1,
      reason: 'carga volta hoje',
      requiresMdfe: false,
    })
    expect(world.saved).toEqual([
      {
        actorUserId: ACTOR_ID,
        companyId: COMPANY_ID,
        reason: 'carga volta hoje',
        requiresMdfe: false,
        tripId: TRIP_ID,
      },
    ])
  })

  /** A classificação vem da mesma consulta da prontidão, e não de um número que a tela mandou. */
  it('recusa a dispensa sem motivo e não grava nada', async () => {
    const world = buildWorld({ documents: [document('cte')] })

    await expect(world.run({ reason: null, requiresMdfe: false })).rejects.toMatchObject({
      code: TRIP_MDFE_REQUIREMENT_BLOCKS.reasonRequired,
      status: 422,
    })
    expect(world.saved).toEqual([])
  })

  it('recusa exigir manifesto de viagem só urbana', async () => {
    const world = buildWorld({ documents: [document('nfse')] })

    await expect(world.run({ reason: null, requiresMdfe: true })).rejects.toMatchObject({
      code: TRIP_MDFE_REQUIREMENT_BLOCKS.noManifestableDocuments,
    })
  })

  it('voltar ao derivado devolve o que a classificação diz', async () => {
    const world = buildWorld({ documents: [document('cte')] })

    const result = await world.run({ reason: null, requiresMdfe: null })

    expect(result.effectiveRequiresMdfe).toBe(true)
    expect(result.requiresMdfe).toBeNull()
  })

  it('viagem de outra empresa é 404, não sobrescrita silenciosa', async () => {
    const world = buildWorld({ documents: null })

    await expect(world.run({ reason: null, requiresMdfe: null })).rejects.toMatchObject({
      code: 'TRIP_NOT_FOUND',
    })
    expect(world.saved).toEqual([])
  })
})
