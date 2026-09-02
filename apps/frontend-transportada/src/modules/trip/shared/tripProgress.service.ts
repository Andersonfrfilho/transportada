/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T010: quanto da viagem já andou, e quando ela deve terminar.
 *
 * Serviço puro porque o teste desta app não tem DOM — o comportamento se prova na função, e é aqui
 * que vivem as duas recusas que importam: rascunho não tem progresso, e uma parada concluída não
 * dá ritmo.
 */

const PERCENT = 100
const MINIMUM_SAMPLES_FOR_PACE = 2

export type TripProgressStop = Readonly<{
  arrivedAt: null | string
  completedAt: null | string
  sequence: number
}>

export type TripProgress = Readonly<{
  completedStops: number
  /**
   * `null` quando não há ritmo medido — e a tela é obrigada a dizer "sem previsão" em vez de
   * esconder a linha, senão ausência de previsão vira ausência de informação.
   */
  estimatedCompletionAt: null | string
  percent: number
  totalStops: number
}>

/**
 * ⚠️ **Rascunho não tem progresso nem previsão.** A viagem sem roteiro não começou, e um percentual
 * ali seria número sobre trabalho que não existe — `null`, nunca zero, pela mesma razão que a
 * ocupação devolve `null` sem capacidade conhecida.
 *
 * ⚠️ **Uma parada concluída não dá ritmo.** Com um ponto só não há intervalo para medir, e dividir
 * o tempo decorrido por 1 produziria previsão com cara de conta — pior que ausência, porque parece
 * medida. A partir de duas, o intervalo médio entre conclusões é o ritmo, e o que resta é o que
 * falta multiplicado por ele.
 */
export function resolveTripProgress(input: {
  readonly now: string
  readonly status: string
  readonly stops: readonly TripProgressStop[]
}): null | TripProgress {
  if (input.status === 'draft' || input.stops.length === 0) return null

  const completions = input.stops
    .filter((stop) => stop.completedAt !== null)
    .map((stop) => new Date(stop.completedAt ?? '').getTime())
    .toSorted((first, second) => first - second)

  const totalStops = input.stops.length
  const completedStops = completions.length
  const percent = Math.round((completedStops / totalStops) * PERCENT)
  const remaining = totalStops - completedStops

  if (remaining === 0 || completions.length < MINIMUM_SAMPLES_FOR_PACE) {
    return { completedStops, estimatedCompletionAt: null, percent, totalStops }
  }

  const first = completions[0] ?? 0
  const last = completions[completions.length - 1] ?? 0
  const pace = (last - first) / (completions.length - 1)

  /**
   * ⚠️ A conta parte do **mais recente entre a última conclusão e agora**, nunca só da última
   * conclusão. Um caminhão parado há duas horas tem `last` velho, e prever a partir dele daria uma
   * previsão no passado — a tela anunciaria um término que já deveria ter acontecido, e quem lê
   * concluiria que o sistema está errado em vez de que a viagem está atrasada.
   */
  const base = Math.max(last, new Date(input.now).getTime())

  return {
    completedStops,
    estimatedCompletionAt: new Date(base + pace * remaining).toISOString(),
    percent,
    totalStops,
  }
}
