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
    ).toEqual({
      documentsWithoutWeight: 0,
      grossWeightKilograms: '150.0000',
      maxPayloadKg: null,
      payloadRatio: null,
      source: 'declared',
    })
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
    ).toEqual({
      documentsWithoutWeight: 0,
      grossWeightKilograms: '308.6700',
      maxPayloadKg: null,
      payloadRatio: null,
      source: 'estimated',
    })
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
    ).toEqual({
      documentsWithoutWeight: 0,
      grossWeightKilograms: '308.6700',
      maxPayloadKg: null,
      payloadRatio: null,
      source: 'estimated',
    })
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
    ).toEqual({
      documentsWithoutWeight: 1,
      grossWeightKilograms: '108.6700',
      maxPayloadKg: null,
      payloadRatio: null,
      source: 'declared',
    })
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

/**
 * Spec 093: o teto que sempre esteve no banco. `fleet_vehicles.capacity_kg` é o `capKG` do MDF-e e
 * está preenchida em 10 dos 12 veículos desta base — o que faltava era alguém lê-la fora da emissão
 * fiscal, e por isso a montagem somava o peso sem comparar com nada.
 */
describe('trip cargo weight ceiling contract', () => {
  test('divide a carga pelo teto da ficha, e diz qual é o teto', () => {
    expect(
      resolveTripCargoWeight({
        documents: [{ grossWeightKilograms: '2100.0000', source: 'xml' }],
        maxPayloadKg: '4200.0000',
      }),
    ).toEqual({
      documentsWithoutWeight: 0,
      grossWeightKilograms: '2100.0000',
      maxPayloadKg: '4200.0000',
      payloadRatio: '0.5000',
      source: 'declared',
    })
  })

  /**
   * ⚠️ Ausência é `null`, **nunca 100% nem zero** — a mesma regra da ocupação. Veículo sem carga
   * cadastrada com carga dentro é justamente o caso em que um número inventado faria alguém parar
   * de carregar, ou continuar.
   */
  test('sem teto cadastrado não há percentual, e zero é ausência', () => {
    for (const maxPayloadKg of [null, '0.0000']) {
      expect(
        resolveTripCargoWeight({
          documents: [{ grossWeightKilograms: '2100.0000', source: 'xml' }],
          maxPayloadKg,
        }),
      ).toMatchObject({ maxPayloadKg: null, payloadRatio: null })
    }
  })

  /** Estouro sai como está: acima de 100% é o que o conferente precisa ver, não um número aparado. */
  test('não apara o estouro do teto', () => {
    expect(
      resolveTripCargoWeight({
        documents: [{ grossWeightKilograms: '8400.0000', source: 'xml' }],
        maxPayloadKg: '4200.0000',
      }),
    ).toMatchObject({ payloadRatio: '2.0000' })
  })
})
