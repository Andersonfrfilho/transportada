/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ServiceTimeSource } from '../../database/route-suggestion.schema.js'

/** A janela móvel da spec 058 D6: mais que isso é memória de uma operação que já mudou. */
export const SERVICE_TIME_WINDOW_DAYS = 90

export type ServiceTimeSample = Readonly<{
  /** Segundos entre `arrived_at` e `completed_at` de uma parada real. */
  durationSeconds: number
  observedAt: Date
}>

export type ResolvedServiceTime = Readonly<{
  sampleSize: number
  seconds: number
  source: ServiceTimeSource
}>

/**
 * Spec 058 D6: o tempo de parada começa como palpite e vira medição.
 *
 * **Mediana, não média.** Uma parada em que o motorista almoçou é um outlier que a média engole e a
 * mediana ignora — e é justamente o tipo de parada que mais aparece numa amostra pequena.
 *
 * Abaixo do mínimo de amostras, o padrão da empresa: aprender com três entregas é aprender ruído.
 * A origem viaja junto na resposta, porque um ETA que ninguém sabe de onde veio é um ETA em que
 * ninguém confia.
 */
export function resolveServiceTime(input: {
  readonly defaultSeconds: number
  readonly minimumSamples: number
  readonly now: Date
  readonly samples: readonly ServiceTimeSample[]
}): ResolvedServiceTime {
  const cutoff = subtractDays(input.now, SERVICE_TIME_WINDOW_DAYS)
  const withinWindow = input.samples
    .filter((sample) => sample.observedAt >= cutoff)
    .map((sample) => sample.durationSeconds)

  if (withinWindow.length < input.minimumSamples) {
    return { sampleSize: withinWindow.length, seconds: input.defaultSeconds, source: 'default' }
  }

  return {
    sampleSize: withinWindow.length,
    seconds: medianOf(withinWindow),
    source: 'measured',
  }
}

/**
 * Como aquele cliente se compara com a operação (spec 058 D6). É o que transforma "esse cliente é
 * difícil" em número — e é o que sustenta a conversa de renegociar a tabela.
 */
export function compareToOperationAverage(input: {
  readonly clientMedianSeconds: number
  readonly operationAverageSeconds: number
}): 'above' | 'below' | 'even' {
  if (input.operationAverageSeconds === 0) return 'even'
  if (input.clientMedianSeconds > input.operationAverageSeconds) return 'above'
  if (input.clientMedianSeconds < input.operationAverageSeconds) return 'below'

  return 'even'
}

function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)

  // Amostra par: a média dos dois do meio, que continua sendo mediana e não média da amostra
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
  }

  return sorted[middle] ?? 0
}

function subtractDays(from: Date, days: number): Date {
  const result = new Date(from)
  result.setUTCDate(result.getUTCDate() - days)
  return result
}
