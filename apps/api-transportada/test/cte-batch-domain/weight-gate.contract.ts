/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CTE_BATCH_BLOCK_REASON,
  checkDocumentEligibility,
} from '../../src/cte-batches/domain/cte-batch-eligibility.policy.js'
import {
  CARGO_WEIGHT_SOURCE,
  resolveCargoWeight,
} from '../../src/nfe-documents/domain/cargo-weight.policy.js'

/** A 883663/2 da Zaragoza: vinte volumes, massa 0,000 — o caso que originou a spec 067. */
const ZARAGOZA_VOLUMES = { volumeGrossWeight: '0.0000', volumeQuantity: '20.0000' }

/** A 883658 da mesma carga, que veio com peso: onze volumes, 108,670 kg. */
const WEIGHED_VOLUMES = { volumeGrossWeight: '108.6700', volumeQuantity: '11.0000' }

describe('peso efetivo da carga', () => {
  test('o peso do XML vence, mesmo com peso padrão configurado', () => {
    const resolved = resolveCargoWeight({ ...WEIGHED_VOLUMES, defaultWeightPerVolume: '9.0000' })

    expect(resolved).toEqual({ grossWeight: '108.6700', source: CARGO_WEIGHT_SOURCE.xml })
  })

  test('sem peso no XML, estima pelo padrão da empresa vezes a quantidade de volumes', () => {
    const resolved = resolveCargoWeight({
      ...ZARAGOZA_VOLUMES,
      defaultWeightPerVolume: '9.8800',
    })

    expect(resolved).toEqual({ grossWeight: '197.6000', source: CARGO_WEIGHT_SOURCE.estimated })
  })

  /** Estimativa é opt-in: empresa que não configurou não passa a mandar número inventado à SEFAZ. */
  test('sem peso no XML e sem padrão configurado, não há peso', () => {
    expect(resolveCargoWeight({ ...ZARAGOZA_VOLUMES, defaultWeightPerVolume: null })).toBeNull()
  })

  /** Sem volume não há de onde estimar, e peso fixo por nota seria uma segunda regra de peso. */
  test('sem quantidade de volumes, o padrão não estima nada', () => {
    const resolved = resolveCargoWeight({
      defaultWeightPerVolume: '9.8800',
      volumeGrossWeight: '0.0000',
      volumeQuantity: '0.0000',
    })

    expect(resolved).toBeNull()
  })

  test('nota sem nenhum volume registrado não estima nada', () => {
    const resolved = resolveCargoWeight({
      defaultWeightPerVolume: '9.8800',
      volumeGrossWeight: null,
      volumeQuantity: null,
    })

    expect(resolved).toBeNull()
  })
})

const DOCUMENT = {
  recipientCity: 'Ribeirão Preto',
  recipientState: 'SP',
  recipientTaxId: '07531737000180',
  senderCity: 'Taubaté',
  senderState: 'SP',
  senderTaxId: '05868574001090',
  status: 'authorized',
  totalAmount: '916.8000',
  variant: 'complete',
} as const

describe('gate de peso do CT-e', () => {
  test('a nota sem peso e sem estimativa segue bloqueada', () => {
    const eligibility = checkDocumentEligibility({ ...DOCUMENT, grossWeight: null })

    expect(eligibility.reason).toBe(CTE_BATCH_BLOCK_REASON.missingWeight)
  })

  test('a nota com peso estimado passa no gate', () => {
    const resolved = resolveCargoWeight({ ...ZARAGOZA_VOLUMES, defaultWeightPerVolume: '9.8800' })
    const eligibility = checkDocumentEligibility({
      ...DOCUMENT,
      grossWeight: resolved?.grossWeight ?? null,
    })

    expect(eligibility.reason).toBeUndefined()
    expect(eligibility.chargeable?.totalAmount).toBe('916.8000')
  })
})
