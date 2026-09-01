/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import type { TripStatus } from '../../src/database/trip.schema.js'
import {
  issueTripManifestAutomatically,
  type AutomaticManifestTripPort,
} from '../../src/mdfe-manifests/application/issue-trip-manifest-automatically.use-case.js'
import type { MdfeManifestDetail } from '../../src/mdfe-manifests/application/mdfe-manifest.port.js'
import type { TripFiscalReadinessSnapshot } from '../../src/trips/application/read-trip-fiscal-readiness.use-case.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000002'
const TRIP_ID = '00000000-0000-4000-8000-000000000003'
const MANIFEST_ID = '00000000-0000-4000-8000-000000000004'

function readiness(state: TripFiscalReadinessSnapshot['state']): TripFiscalReadinessSnapshot {
  return {
    documents: [],
    manifestableCount: 1,
    nfseCount: 0,
    readyCount: 1,
    state,
    totalCount: 1,
  }
}

function buildWorld(
  input: {
    readonly createError?: unknown
    readonly isAutomaticEnabled?: boolean
    readonly state?: TripFiscalReadinessSnapshot['state']
    readonly tripRequiresMdfe?: boolean | null
    readonly tripStatus?: TripStatus | null
  } = {},
) {
  const createCalls: object[] = []
  const refusalNotices: object[] = []
  const repository: AutomaticManifestTripPort = {
    findTrip: () => {
      const status = input.tripStatus === undefined ? 'in_transit' : input.tripStatus
      return Promise.resolve(
        status === null ? null : { requiresMdfe: input.tripRequiresMdfe ?? null, status },
      )
    },
    isAutomaticEnabled: () => Promise.resolve(input.isAutomaticEnabled ?? true),
    readReadiness: () => Promise.resolve(readiness(input.state ?? 'ready')),
  }

  return {
    createCalls,
    refusalNotices,
    run: () =>
      issueTripManifestAutomatically({
        context: { companyId: COMPANY_ID, userId: USER_ID },
        correlationId: 'correlation-automatic',
        createManifest: {
          execute: (call) => {
            createCalls.push(call)
            if (input.createError !== undefined) return Promise.reject(input.createError)
            return Promise.resolve({ id: MANIFEST_ID } as unknown as MdfeManifestDetail)
          },
        },
        notifier: {
          notifyRefusal: (notice) => {
            refusalNotices.push(notice)
            return Promise.resolve()
          },
        },
        repository,
        tripId: TRIP_ID,
      }),
  }
}

describe('o MDF-e que se emite sozinho', () => {
  /** O caso que faz o automático existir: o lote autoriza com o caminhão na rua. */
  it('emite com a carga na rua e a prontidão completa', async () => {
    const world = buildWorld()

    expect(await world.run()).toEqual({
      manifestId: MANIFEST_ID,
      outcome: 'issued',
      refusalCode: null,
    })
    expect(world.createCalls).toHaveLength(1)
  })

  it('não age com a opção desligada', async () => {
    const world = buildWorld({ isAutomaticEnabled: false })

    expect((await world.run()).outcome).toBe('automatic_disabled')
    expect(world.createCalls).toHaveLength(0)
  })

  /** Viagem só de entrega urbana não tem o que manifestar — e o automático não fica esperando. */
  it('não age quando não há o que manifestar', async () => {
    const world = buildWorld({ state: 'not_applicable' })

    expect((await world.run()).outcome).toBe('not_eligible')
    expect(world.createCalls).toHaveLength(0)
  })

  it('não age com a carga ainda no barracão', async () => {
    const world = buildWorld({ tripStatus: 'separating' })

    expect((await world.run()).outcome).toBe('not_eligible')
  })

  /** Dois eventos chegando juntos: o segundo encontra manifesto vivo e relata, não estoura. */
  it('viagem já manifestada relata em vez de emitir de novo', async () => {
    const world = buildWorld({ state: 'manifested' })

    expect((await world.run()).outcome).toBe('already_manifested')
    expect(world.createCalls).toHaveLength(0)
  })

  /**
   * A decisão que dá forma a esta rota: **quem chama é uma máquina**. Um `409` devolvido a um
   * consumer vira reentrega, e reentrega de recusa definitiva é fila que nunca drena e alerta que
   * ninguém mais lê. A recusa de negócio volta como `outcome`, com o código estável junto.
   */
  it('recusa de negócio vira relato, com o código estável', async () => {
    const world = buildWorld({
      createError: new ApiError({
        code: 'MDFE_MANIFEST_DESTINATION_STATE_REQUIRED',
        message: 'ambiguous',
        status: 422,
      }),
    })

    expect(await world.run()).toEqual({
      manifestId: null,
      outcome: 'refused',
      refusalCode: 'MDFE_MANIFEST_DESTINATION_STATE_REQUIRED',
    })
  })

  /** O imprevisto **sobe**: é ele que a reentrega conserta, e engoli-lo esconderia falha real. */
  it('o imprevisto sobe como erro, para o trilho reentregar', async () => {
    const world = buildWorld({ createError: new Error('connection terminated') })

    await expect(world.run()).rejects.toThrow('connection terminated')
  })

  it('erro de servidor também sobe', async () => {
    const world = buildWorld({
      createError: new ApiError({ code: 'PROVIDER_DOWN', message: 'down', status: 502 }),
    })

    await expect(world.run()).rejects.toBeInstanceOf(ApiError)
  })

  it('viagem de outra empresa não emite nada', async () => {
    const world = buildWorld({ tripStatus: null })

    expect(await world.run()).toMatchObject({
      outcome: 'not_eligible',
      refusalCode: 'TRIP_NOT_FOUND',
    })
  })

  /**
   * Spec 065 D2b: **a recusa avisa, e só ela.** Sem isto a recusa existe só em log, e a viagem
   * circula sem manifesto até alguém abrir a tela por outro motivo.
   */
  it('avisa quando a emissão recusou, com o código do motivo', async () => {
    const world = buildWorld({
      createError: new ApiError({
        code: 'MDFE_MANIFEST_CREW_REQUIRED',
        message: 'crew required',
        status: 422,
      }),
    })

    const result = await world.run()

    expect(result.outcome).toBe('refused')
    expect(world.refusalNotices).toEqual([
      { companyId: COMPANY_ID, refusalCode: 'MDFE_MANIFEST_CREW_REQUIRED', tripId: TRIP_ID },
    ])
  })

  /**
   * "A viagem ainda não saiu" e "a empresa não optou" são estados normais. Avisar sobre eles a cada
   * CT-e autorizado transformaria o aviso em ruído — e ruído deixa de ser lido quando importa.
   */
  it('não avisa nos desfechos que não são falha', async () => {
    for (const world of [
      buildWorld({ tripStatus: 'draft' }),
      buildWorld({ isAutomaticEnabled: false }),
      buildWorld({ state: 'manifested' }),
      buildWorld({}),
    ]) {
      await world.run()
      expect(world.refusalNotices).toEqual([])
    }
  })

  /** O imprevisto sobe para a reentrega consertar — e não vira aviso de recusa definitiva. */
  it('não avisa quando o erro é imprevisto', async () => {
    const world = buildWorld({ createError: new Error('banco fora') })

    await expect(world.run()).rejects.toThrow('banco fora')
    expect(world.refusalNotices).toEqual([])
  })
})
