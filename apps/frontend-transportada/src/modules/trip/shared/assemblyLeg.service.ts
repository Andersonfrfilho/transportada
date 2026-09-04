/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AssemblyMapPoint } from './assemblyMap.service'
import type { RouteGeometry } from './routeGeometry.service'

/**
 * O tempo e a distância entre uma parada e a seguinte, **medidos na estrada pelo roteirizador**.
 *
 * Os dois números vêm da **mesma resposta** que desenha a linha do mapa: o OSRM publica `distance` e
 * `duration` por trecho ao lado da geometria, e pedir a linha para depois estimar o tempo por conta
 * própria era descartar o número certo que já tinha chegado junto.
 *
 * ⚠️ **Sem o roteirizador não há tempo — e não há estimativa.** A ADR-0044 §5 é explícita: resultado
 * ruim disfarçado de bom é pior que ausência. A conta antiga (haversine × 1,3 ÷ 55 km/h) produzia um
 * número que parecia medido e não era, e a tela não tinha como dizer a diferença.
 */
export type AssemblyLeg = Readonly<{
  distanceKilometres: number
  /** Só o rodar, medido. O tempo parado entra no `minutes`, e é declarado, não medido. */
  drivingMinutes: number
  fromCityCode: string
  /** `drivingMinutes` mais o tempo parado da entrega — o que o operador compara com o turno. */
  minutes: number
  toCityCode: string
}>

/**
 * O tempo parado por entrega: descarregar, colher assinatura, sair. Constante operacional
 * **declarada** — o OSRM mede o trânsito, não o pátio do cliente. É o único termo desta conta que
 * não é medido, e é por isso que a tela ainda imprime "≈".
 */
const STOP_SERVICE_MINUTES = 20

const METRES_PER_KILOMETRE = 1000
const SECONDS_PER_MINUTE = 60

/**
 * Um trecho por par de paradas consecutivas — e nenhum antes da primeira: não se sabe de onde o
 * caminhão sai. A origem é o galpão, que esta tela não conhece.
 *
 * ⚠️ Lista vazia quando a estrada não veio, e **também** quando a contagem não bate com as paradas.
 * O roteirizador devolve um trecho por par enviado; contagem diferente é resposta que não casa com o
 * pedido, e casar trecho com parada errada põe o tempo de um caminho ao pé de outro — plausível e
 * errado, que é exatamente o que esta função existe para não fazer.
 */
export function buildAssemblyLegs(input: {
  readonly geometry: RouteGeometry | null
  readonly points: readonly AssemblyMapPoint[]
}): readonly AssemblyLeg[] {
  const { geometry, points } = input
  if (geometry === null || geometry.source !== 'road') return []
  if (geometry.legs.length !== Math.max(points.length - 1, 0)) return []

  const legs: AssemblyLeg[] = []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const measured = geometry.legs[index - 1]
    if (from === undefined || to === undefined || measured === undefined) return []

    const drivingMinutes = Math.round(measured.durationSeconds / SECONDS_PER_MINUTE)
    legs.push({
      distanceKilometres: measured.distanceMetres / METRES_PER_KILOMETRE,
      drivingMinutes,
      fromCityCode: from.cityCode,
      minutes: drivingMinutes + STOP_SERVICE_MINUTES,
      toCityCode: to.cityCode,
    })
  }
  return legs
}

/** O total do roteiro, para a tela dizer se a viagem cabe no turno. */
export function totalAssemblyMinutes(legs: readonly AssemblyLeg[]): number {
  return legs.reduce((total, leg) => total + leg.minutes, 0)
}

/** "1 h 25 min" lê melhor que "85 min" a partir de uma hora, e igual abaixo dela. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
