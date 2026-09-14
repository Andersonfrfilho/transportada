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
 * A saída do barracão e a volta para ele (spec 097). ⚠️ **Não é `AssemblyLeg`**: ela não liga duas
 * entregas, não tem cidade de origem e não carrega tempo parado — o barracão não é uma entrega, e
 * pendurar os 20 min de descarga nele inflaria o roteiro por um serviço que ninguém presta ali.
 */
export type AssemblyDepotLeg = Readonly<{
  distanceKilometres: number
  drivingMinutes: number
  kind: 'outbound' | 'return'
}>

/**
 * Quantos trechos da resposta são do barracão, nas duas pontas. Zero quando a rota não pediu
 * barracão, e zero quando pediu e não achou coordenada (D2) — nos dois casos `legs` é a de sempre.
 */
function depotOffsets(geometry: RouteGeometry): Readonly<{ leading: number; trailing: number }> {
  const depot = geometry.depot ?? null
  if (depot === null) return { leading: 0, trailing: 0 }

  return { leading: depot.leadingLegs, trailing: depot.trailingLegs }
}

/**
 * Um trecho por par de paradas consecutivas.
 *
 * ⚠️ **A contagem esperada cresce com a perna do barracão** (spec 097). O roteirizador devolve um
 * trecho por par **enviado**, e desde a 097 quem envia põe o barracão na frente e, conforme a
 * política configurada, o retorno no fim. Comparar com `paradas - 1` como antes fazia a contagem
 * nunca bater, e esta função — que descarta tudo quando ela não bate — apagava **todos** os tempos
 * por parada de uma vez, sem erro nenhum na tela.
 *
 * O descarte em si continua: contagem diferente da esperada é resposta que não casa com o pedido, e
 * casar trecho com parada errada põe o tempo de um caminho ao pé de outro — plausível e errado, que
 * é exatamente o que esta função existe para não fazer.
 */
export function buildAssemblyLegs(input: {
  readonly geometry: RouteGeometry | null
  readonly points: readonly AssemblyMapPoint[]
}): readonly AssemblyLeg[] {
  const { geometry, points } = input
  if (geometry === null || geometry.source !== 'road') return []

  const { leading, trailing } = depotOffsets(geometry)
  const between = Math.max(points.length - 1, 0)
  if (geometry.legs.length !== leading + between + trailing) return []

  const legs: AssemblyLeg[] = []
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const measured = geometry.legs[leading + index - 1]
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

/**
 * Os trechos do barracão desta rota, na ordem em que o caminhão os roda (spec 097). Lista vazia
 * quando não há barracão na conta — e é ela que faz o total voltar a ser o de antes da 097 quando
 * a coordenada falta, sem nenhuma condição extra do lado de quem chama.
 */
export function buildAssemblyDepotLegs(input: {
  readonly geometry: RouteGeometry | null
  readonly points: readonly AssemblyMapPoint[]
}): readonly AssemblyDepotLeg[] {
  const { geometry, points } = input
  if (geometry === null || geometry.source !== 'road') return []

  const { leading, trailing } = depotOffsets(geometry)
  const between = Math.max(points.length - 1, 0)
  if (geometry.legs.length !== leading + between + trailing) return []

  const kinds = [
    ...(leading === 0 ? [] : [{ index: 0, kind: 'outbound' as const }]),
    ...(trailing === 0 ? [] : [{ index: geometry.legs.length - 1, kind: 'return' as const }]),
  ]

  return kinds.flatMap(({ index, kind }) => {
    const measured = geometry.legs[index]
    if (measured === undefined) return []

    return [
      {
        distanceKilometres: measured.distanceMetres / METRES_PER_KILOMETRE,
        drivingMinutes: Math.round(measured.durationSeconds / SECONDS_PER_MINUTE),
        kind,
      },
    ]
  })
}

/**
 * O total do roteiro, para a tela dizer se a viagem cabe no turno.
 *
 * ⚠️ Os trechos do barracão entram **só com o rodar** (spec 097): o tempo parado é da entrega, e o
 * barracão é origem, não destino (D3). Era este número que dizia 40 min numa viagem de 86.
 */
export function totalAssemblyMinutes(
  legs: readonly AssemblyLeg[],
  depotLegs: readonly AssemblyDepotLeg[] = [],
): number {
  return (
    legs.reduce((total, leg) => total + leg.minutes, 0) +
    depotLegs.reduce((total, leg) => total + leg.drivingMinutes, 0)
  )
}

/** "1 h 25 min" lê melhor que "85 min" a partir de uma hora, e igual abaixo dela. */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
