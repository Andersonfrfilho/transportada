/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CARGO_VOLUME_SOURCE,
  resolveCargoVolume,
} from '../../src/nfe-documents/domain/cargo-volume.policy.js'

/** A carga real da Zaragoza: vinte volumes por nota, e nenhuma medida no XML. */
const ZARAGOZA = { volumeQuantity: '20.0000' }

/** O fator decidido na spec 075 (D5): uma caixa de ~37 cm de lado. */
const FATOR = '0.050000'

describe('cubagem efetiva da carga (spec 075)', () => {
  test('estima pela quantidade de volumes vezes o fator da espécie', () => {
    const resolved = resolveCargoVolume({ ...ZARAGOZA, volumeFactor: FATOR })

    expect(resolved).toEqual({ source: CARGO_VOLUME_SOURCE.estimated, volumeM3: '1.000000' })
  })

  /**
   * A NF-e **não tem campo de cubagem** — não existe origem declarada para volume, ao contrário do
   * peso, onde o `pesoB` vence a estimativa. Por isso a origem tem dois estados, não três (D3).
   */
  test('a única origem possível hoje é a estimativa', () => {
    expect(Object.values(CARGO_VOLUME_SOURCE)).toEqual(['estimated'])
  })

  /** Estimativa é opt-in: sem fator configurado, a nota não ganha cubagem inventada. */
  test('sem fator configurado, não há cubagem', () => {
    expect(resolveCargoVolume({ ...ZARAGOZA, volumeFactor: null })).toBeNull()
  })

  /**
   * ⚠️ Ausência é `null`, nunca zero — a mesma decisão da ADR-0052. Zero declararia que a carga não
   * ocupa espaço nenhum, e somaria como se fosse medida.
   */
  test('sem quantidade de volumes, não há de onde estimar', () => {
    expect(resolveCargoVolume({ volumeFactor: FATOR, volumeQuantity: null })).toBeNull()
    expect(resolveCargoVolume({ volumeFactor: FATOR, volumeQuantity: '0.0000' })).toBeNull()
  })

  /** Fator zerado é o mesmo que desligado: o CHECK do banco o recusa, e a política não confia nele. */
  test('fator zerado não vira cubagem zero', () => {
    expect(resolveCargoVolume({ ...ZARAGOZA, volumeFactor: '0.000000' })).toBeNull()
  })

  /** Um volume só é o caso de fundo, e precisa dar exatamente o fator. */
  test('um volume vale um fator', () => {
    expect(resolveCargoVolume({ volumeFactor: FATOR, volumeQuantity: '1.0000' })?.volumeM3).toBe(
      '0.050000',
    )
  })

  /** Decimal de verdade: a multiplicação não passa por float binário em nenhum ponto. */
  test('multiplica em decimal, sem erro binário', () => {
    const resolved = resolveCargoVolume({ volumeFactor: '0.070000', volumeQuantity: '3.0000' })

    expect(resolved?.volumeM3).toBe('0.210000')
  })
})
