/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveTripCargoWeight } from '../../src/trips/domain/trip-cargo-weight.policy.js'

describe('trip cargo weight contract', () => {
  test('soma as notas e diz que o total é declarado', () => {
    expect(
      resolveTripCargoWeight({
        documents: [
          { grossWeightKilograms: '108.6700', source: 'xml' },
          { grossWeightKilograms: '41.3300', source: 'xml' },
        ],
      }),
    ).toEqual({ documentsWithoutWeight: 0, grossWeightKilograms: '150.0000', source: 'declared' })
  })

  /**
   * A mesma regra do volume, e pelo mesmo motivo: quem carrega decide pelo pior caso. Um total com
   * cara de medido porque a maioria das parcelas era medida é o número que faz alguém parar de
   * carregar, ou continuar.
   */
  test('uma nota estimada torna o total estimado', () => {
    expect(
      resolveTripCargoWeight({
        documents: [
          { grossWeightKilograms: '108.6700', source: 'xml' },
          { grossWeightKilograms: '200.0000', source: 'estimated' },
        ],
      }),
    ).toEqual({ documentsWithoutWeight: 0, grossWeightKilograms: '308.6700', source: 'estimated' })
  })

  /**
   * A estimada vem **primeiro** de propósito: contaminação de origem se implementa errado com
   * atribuição em vez de acumulação, e com a estimada por último os dois códigos dão o mesmo
   * resultado. Este caso é o que separa um do outro.
   */
  test('a ordem não importa: estimada primeiro também contamina o total', () => {
    expect(
      resolveTripCargoWeight({
        documents: [
          { grossWeightKilograms: '200.0000', source: 'estimated' },
          { grossWeightKilograms: '108.6700', source: 'xml' },
        ],
      }),
    ).toEqual({ documentsWithoutWeight: 0, grossWeightKilograms: '308.6700', source: 'estimated' })
  })

  /** Nota sem peso é dita à parte, nunca somada como zero — zero diria que a carga não pesa nada. */
  test('nota sem peso é contada à parte', () => {
    expect(
      resolveTripCargoWeight({
        documents: [
          { grossWeightKilograms: '108.6700', source: 'xml' },
          { grossWeightKilograms: null, source: null },
        ],
      }),
    ).toEqual({ documentsWithoutWeight: 1, grossWeightKilograms: '108.6700', source: 'declared' })
  })

  /** Viagem sem nota alguma com peso não tem peso: ausência, não um zero que parece medida. */
  test('sem nenhuma nota pesada não há peso', () => {
    expect(
      resolveTripCargoWeight({ documents: [{ grossWeightKilograms: null, source: null }] }),
    ).toBeNull()
  })

  test('viagem sem nota não tem peso', () => {
    expect(resolveTripCargoWeight({ documents: [] })).toBeNull()
  })
})
