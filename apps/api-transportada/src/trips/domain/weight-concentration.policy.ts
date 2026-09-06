/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Acima disto o peso está concentrado o bastante para valer um aviso. Não é limite legal de eixo —
 * é o ponto em que o desenho do baú deixa de descrever a carga real.
 */
const DEFAULT_THRESHOLD = 0.4

export type WeightConcentrationStop = {
  readonly stopId: string
  readonly weightKilograms: string | null
}

export type WeightConcentration = {
  readonly share: number
  readonly stopId: string
}

/**
 * A parada que domina o peso da viagem (spec 085 G006). O painel desenha fileiras de **volume**, e
 * volume não conta esta história: mil caixas de papel higiênico e cem caixas de bebida ocupam o
 * mesmo baú com pesos que não se parecem.
 *
 * ⚠️ Viagem de uma parada **não** acusa: ali a concentração é 100% por definição e não há nada a
 * fazer com o aviso. Acusá-la transformaria o alerta em ruído que se aprende a ignorar — e aí ele
 * deixa de servir na viagem em que importa.
 */
export function detectWeightConcentration(input: {
  readonly stops: readonly WeightConcentrationStop[]
  readonly threshold?: number
}): WeightConcentration | null {
  if (input.stops.length < 2) return null

  const weighted = input.stops.flatMap((stop) => {
    const weight = stop.weightKilograms === null ? 0 : Number(stop.weightKilograms)
    return Number.isFinite(weight) && weight > 0 ? [{ stopId: stop.stopId, weight }] : []
  })
  const total = weighted.reduce((sum, stop) => sum + stop.weight, 0)
  if (total <= 0) return null

  const heaviest = weighted.reduce((current, stop) =>
    stop.weight > current.weight ? stop : current,
  )
  /**
   * ⚠️ O piso é **a fatia igualitária**, não o limite fixo: com duas paradas, meio a meio é a carga
   * mais equilibrada que existe e passaria de 40% — o alerta dispararia em toda viagem de duas
   * paradas e viraria ruído que se aprende a ignorar. Concentrar é carregar **mais que a própria
   * fatia**, e quantas fatias há depende de quantas paradas há.
   */
  const share = heaviest.weight / total
  if (share <= Math.max(input.threshold ?? DEFAULT_THRESHOLD, 1 / weighted.length)) return null

  return { share, stopId: heaviest.stopId }
}
