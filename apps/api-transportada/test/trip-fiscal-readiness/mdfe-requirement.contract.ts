/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import type { TripFiscalReadinessSnapshot } from '../../src/trips/application/read-trip-fiscal-readiness.use-case.js'
import {
  checkTripAcceptsManifest,
  TRIP_MANIFEST_BLOCKS,
} from '../../src/trips/domain/trip-manifest.policy.js'
import {
  checkTripMdfeRequirement,
  resolveTripRequiresMdfe,
  TRIP_MDFE_REQUIREMENT_BLOCKS,
} from '../../src/trips/domain/trip-mdfe-requirement.policy.js'

const check = (input: {
  manifestableCount: number
  reason?: null | string
  requiresMdfe: boolean | null
}) =>
  checkTripMdfeRequirement({
    manifestableCount: input.manifestableCount,
    reason: input.reason ?? null,
    requiresMdfe: input.requiresMdfe,
  })

function readiness(manifestableCount: number): TripFiscalReadinessSnapshot {
  return {
    documents: [],
    manifestableCount,
    nfseCount: 0,
    readyCount: manifestableCount,
    state: manifestableCount > 0 ? 'ready' : 'not_applicable',
    totalCount: manifestableCount,
  }
}

describe('a exigência de MDF-e da viagem', () => {
  it('deriva da classificação quando ninguém sobrescreveu', () => {
    expect(resolveTripRequiresMdfe({ manifestableCount: 3, requiresMdfe: null })).toBe(true)
    expect(resolveTripRequiresMdfe({ manifestableCount: 0, requiresMdfe: null })).toBe(false)
  })

  it('a sobrescrita vence a derivação nos dois sentidos', () => {
    expect(resolveTripRequiresMdfe({ manifestableCount: 3, requiresMdfe: false })).toBe(false)
    expect(resolveTripRequiresMdfe({ manifestableCount: 0, requiresMdfe: true })).toBe(true)
  })

  it('aceita voltar ao derivado sem motivo, com ou sem nota de CT-e', () => {
    expect(check({ manifestableCount: 4, requiresMdfe: null })).toBeNull()
    expect(check({ manifestableCount: 0, requiresMdfe: null })).toBeNull()
  })

  /**
   * O caso perigoso: carga intermunicipal circulando sem manifesto é multa e retenção em barreira.
   * O produto não impede — a operação tem razões que ele não conhece —, mas não deixa calado.
   */
  it('exige motivo para dispensar viagem que tem nota de CT-e', () => {
    expect(check({ manifestableCount: 2, requiresMdfe: false })).toBe(
      TRIP_MDFE_REQUIREMENT_BLOCKS.reasonRequired,
    )
    expect(
      check({
        manifestableCount: 2,
        reason: 'frota própria, carga retorna hoje',
        requiresMdfe: false,
      }),
    ).toBeNull()
  })

  /** Viagem só urbana já não manifesta: dispensar o que não existe não precisa de justificativa. */
  it('dispensa sem motivo a viagem que não tem nota de CT-e', () => {
    expect(check({ manifestableCount: 0, requiresMdfe: false })).toBeNull()
  })

  it('recusa exigir manifesto de viagem sem nenhuma nota de CT-e', () => {
    expect(check({ manifestableCount: 0, requiresMdfe: true })).toBe(
      TRIP_MDFE_REQUIREMENT_BLOCKS.noManifestableDocuments,
    )
  })

  it('recusa motivo pendurado em quem não dispensou nada', () => {
    for (const requiresMdfe of [true, null]) {
      expect(check({ manifestableCount: 2, reason: 'qualquer', requiresMdfe })).toBe(
        TRIP_MDFE_REQUIREMENT_BLOCKS.reasonNotApplicable,
      )
    }
  })
})

describe('o portão do manifesto respeita a exigência da viagem', () => {
  it('recusa a viagem dispensada, mesmo pronta e despachada', () => {
    expect(
      checkTripAcceptsManifest({
        dischargeCityCount: 1,
        readiness: readiness(2),
        requiresMdfe: false,
        tripStatus: 'in_transit',
      }),
    ).toBe(TRIP_MANIFEST_BLOCKS.manifestNotRequired)
  })

  /** Sem sobrescrita, a viagem só de entrega urbana já não tem o que declarar. */
  it('recusa a viagem sem nota de CT-e sem ninguém precisar dispensá-la', () => {
    expect(
      checkTripAcceptsManifest({
        dischargeCityCount: 1,
        readiness: readiness(0),
        requiresMdfe: null,
        tripStatus: 'in_transit',
      }),
    ).toBe(TRIP_MANIFEST_BLOCKS.manifestNotRequired)
  })

  /**
   * "Já existe um manifesto vivo" vem antes de "não precisa": quem acabou de dispensar uma viagem
   * já manifestada precisa saber do manifesto, não da dispensa.
   */
  it('o manifesto vivo é o motivo, mesmo com a viagem dispensada', () => {
    expect(
      checkTripAcceptsManifest({
        dischargeCityCount: 1,
        readiness: { ...readiness(2), state: 'manifested' },
        requiresMdfe: false,
        tripStatus: 'in_transit',
      }),
    ).toBe(TRIP_MANIFEST_BLOCKS.manifestAlreadyLive)
  })
})
