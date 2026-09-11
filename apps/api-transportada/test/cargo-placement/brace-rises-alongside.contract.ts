/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoPlacement,
  type CargoPlacement,
} from '../../src/trips/domain/cargo-placement.policy.js'
import { createMixedLoad, MIXED_BEDS, type MixedBed } from '../fixtures/mixed-cargo-bank.fixture.js'
import { simulateUnloading } from './unloading-simulation.js'

/**
 * Spec 142: **a vizinha só escora se sobe ao lado da caixa escorada.**
 *
 * ⚠️ A escora lia só o topo de cada ponto do baú, e esse topo podia ser o balanço de uma caixa apoiada
 * em 80% da base (spec 135) que **começa acima** da caixa escorada, com vão embaixo — prateleira, não
 * parede. Medido em `ccc09130`: 29 das 144 cargas mistas do banco da spec 139 com caixa sem apoio no
 * juiz da descarga, todas por isto; na proposta real toda medida, 5 caixas no Atego e 1 no Accelo.
 *
 * As duas cargas abaixo são as que reprovavam dentro do subconjunto que cabe no gate (Daily e Atego a
 * 50% do volume, 6 tamanhos, semente 1). A afirmação é de propriedade: toda caixa de pé em cada passo
 * da descarga — nunca a posição de uma caixa.
 */
const BANK_TEST_TIMEOUT_MS = 120_000

function bedOf(bed: MixedBed): Readonly<{ heightM: number; lengthM: number; widthM: number }> {
  return {
    heightM: Number(bed.bed.heightM),
    lengthM: Number(bed.bed.lengthM),
    widthM: Number(bed.bed.widthM),
  }
}

function place(bed: MixedBed): CargoPlacement {
  const load = createMixedLoad({ bed: bed.bed, occupancy: 0.5, seed: 1, shapeCount: 6 })
  const plan = resolveCargoPlacement({
    bed: bed.bed,
    boxes: load.boxes,
    loadingAccess: bed.loadingAccess,
    payloadRatio: bed.payloadRatio,
  })
  if (plan === null) throw new Error('a planta devia existir com o baú medido')

  return plan
}

describe('a escora sobe ao lado da caixa escorada (spec 142)', () => {
  for (const name of ['Daily', 'Atego']) {
    test(
      `${name} a 50%, 6 tamanhos: nenhuma caixa se escora em prateleira sobre vão`,
      () => {
        const bed = MIXED_BEDS.find((entry) => entry.name === name)
        if (bed === undefined) throw new Error(`baú ${name} fora do banco`)

        expect(simulateUnloading(place(bed), bedOf(bed)).unsupported).toEqual([])
      },
      BANK_TEST_TIMEOUT_MS,
    )
  }
})
