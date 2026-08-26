/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  compareToOperationAverage,
  resolveServiceTime,
  type ServiceTimeSample,
} from '../../src/routing/domain/service-time.policy.js'

const NOW = new Date('2026-08-26T12:00:00.000Z')

function sampleAt(daysAgo: number, durationSeconds: number): ServiceTimeSample {
  const observedAt = new Date(NOW)
  observedAt.setUTCDate(observedAt.getUTCDate() - daysAgo)
  return { durationSeconds, observedAt }
}

describe('service time measurement (spec 058 D6)', () => {
  /** Aceite da spec: abaixo do mínimo de amostras usa o padrão — aprender com três é aprender ruído. */
  test('uses the company default below the minimum sample size', () => {
    const resolved = resolveServiceTime({
      defaultSeconds: 600,
      minimumSamples: 5,
      now: NOW,
      samples: [sampleAt(1, 300), sampleAt(2, 320), sampleAt(3, 310)],
    })

    expect(resolved.source).toBe('default')
    expect(resolved.seconds).toBe(600)
    expect(resolved.sampleSize).toBe(3)
  })

  test('switches to the measurement once there is enough of it', () => {
    const resolved = resolveServiceTime({
      defaultSeconds: 600,
      minimumSamples: 5,
      now: NOW,
      samples: [
        sampleAt(1, 300),
        sampleAt(2, 320),
        sampleAt(3, 310),
        sampleAt(4, 290),
        sampleAt(5, 305),
      ],
    })

    expect(resolved.source).toBe('measured')
    expect(resolved.seconds).toBe(305)
    expect(resolved.sampleSize).toBe(5)
  })

  /**
   * **Mediana, não média**, e este teste é a razão: a parada em que o motorista almoçou é o outlier
   * que a média engole. Com estas amostras a média passaria de 1.000s; a mediana fica em 310.
   */
  test('ignores the stop where the driver had lunch, which is what median means here', () => {
    const resolved = resolveServiceTime({
      defaultSeconds: 600,
      minimumSamples: 5,
      now: NOW,
      samples: [
        sampleAt(1, 300),
        sampleAt(2, 310),
        sampleAt(3, 320),
        sampleAt(4, 290),
        sampleAt(5, 4_200),
      ],
    })

    expect(resolved.seconds).toBe(310)
  })

  /** Aceite da spec: janela de 3 meses — entrega de 100 dias atrás não entra na mediana. */
  test('drops a delivery from a hundred days ago, because the operation has moved on', () => {
    const resolved = resolveServiceTime({
      defaultSeconds: 600,
      minimumSamples: 3,
      now: NOW,
      samples: [
        sampleAt(1, 300),
        sampleAt(2, 310),
        sampleAt(100, 60),
        sampleAt(120, 60),
        sampleAt(200, 60),
      ],
    })

    expect(resolved.source).toBe('default')
    expect(resolved.sampleSize).toBe(2)
  })

  /** A origem viaja junto: um ETA que ninguém sabe de onde veio é um ETA em que ninguém confia. */
  test('always reports where the number came from and how big the sample was', () => {
    const resolved = resolveServiceTime({
      defaultSeconds: 600,
      minimumSamples: 1,
      now: NOW,
      samples: [sampleAt(1, 450)],
    })

    expect(resolved).toEqual({ sampleSize: 1, seconds: 450, source: 'measured' })
  })
})

describe('client versus operation (spec 058 D6)', () => {
  /** É o que transforma "esse cliente é difícil" em número — e sustenta renegociar a tabela. */
  test('says whether the client sits above or below the operation average', () => {
    expect(
      compareToOperationAverage({ clientMedianSeconds: 900, operationAverageSeconds: 600 }),
    ).toBe('above')
    expect(
      compareToOperationAverage({ clientMedianSeconds: 300, operationAverageSeconds: 600 }),
    ).toBe('below')
    expect(
      compareToOperationAverage({ clientMedianSeconds: 600, operationAverageSeconds: 600 }),
    ).toBe('even')
  })

  /** Operação sem média ainda não compara nada — e dividir por zero seria inventar um veredito. */
  test('refuses to rank a client against an operation with no history', () => {
    expect(compareToOperationAverage({ clientMedianSeconds: 900, operationAverageSeconds: 0 })).toBe(
      'even',
    )
  })
})
