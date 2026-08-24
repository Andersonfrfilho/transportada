/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const MILLISECONDS_PER_SECOND = 1_000

type ResolveNextRunAtParams = {
  readonly intervalSeconds: number
  readonly now: Date
}

/**
 * A próxima janela conta do ciclo que **correu**, nunca da grade que ele deveria ter pegado. Numa
 * grade fixa a rotina atrasada dispararia de novo na batida seguinte, e outra vez na seguinte, até
 * alcançar o relógio; o intervalo é distância entre ciclos reais, e é por isso que o campo da tela
 * é um período e não uma expressão de cron.
 */
export function resolveNextRunAt(params: ResolveNextRunAtParams): Date {
  return new Date(params.now.getTime() + params.intervalSeconds * MILLISECONDS_PER_SECOND)
}
