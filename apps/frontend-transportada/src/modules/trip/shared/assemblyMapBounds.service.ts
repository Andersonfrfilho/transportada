/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Um canto do mapa, em grau. */
export type AssemblyMapBounds = Readonly<{
  east: number
  north: number
  south: number
  west: number
}>

type TextualPoint = Readonly<{ latitude: string; longitude: string }>
type NumericPoint = Readonly<{ latitude: number; longitude: number }>

/**
 * O envelope de tudo que a viagem desenha: as paradas, o barracão e o traçado.
 *
 * ⚠️ **O barracão e a estrada entram na conta.** O quadro saía só das paradas, e o ponto de partida
 * — marcado no mapa, e de onde o caminhão sai — caía fora da tela; quem abria a montagem via as
 * entregas e concluía que a rota começava na primeira delas. A estrada entra pela mesma razão: ela
 * faz volta, sai do envelope dos pontos que liga, e o corte apareceria justamente no trecho que fez
 * alguém olhar o mapa.
 *
 * ⚠️ O que ficou **fora da seleção** não entra, de propósito: são centenas de notas espalhadas pelo
 * estado, e enquadrá-las afastaria a câmera até esta viagem virar um borrão. Elas são contexto de
 * fundo, não destino.
 */
export function resolveAssemblyMapBounds(input: {
  readonly depotOrigin: null | TextualPoint
  readonly routePoints: readonly TextualPoint[]
  readonly stops: readonly NumericPoint[]
}): AssemblyMapBounds | null {
  const points: NumericPoint[] = [...input.stops]
  for (const point of [
    ...input.routePoints,
    ...(input.depotOrigin === null ? [] : [input.depotOrigin]),
  ]) {
    const parsed = parsePoint(point)
    if (parsed !== null) points.push(parsed)
  }

  const usable = points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  )
  const first = usable[0]
  /** Ausência é ausência: um quadro em zero abriria o mapa no golfo da Guiné. */
  if (first === undefined) return null

  let bounds: AssemblyMapBounds = {
    east: first.longitude,
    north: first.latitude,
    south: first.latitude,
    west: first.longitude,
  }
  for (const point of usable.slice(1)) {
    bounds = {
      east: Math.max(bounds.east, point.longitude),
      north: Math.max(bounds.north, point.latitude),
      south: Math.min(bounds.south, point.latitude),
      west: Math.min(bounds.west, point.longitude),
    }
  }
  return bounds
}

/** Coordenada que não vira número é descartada — nunca lida como zero. */
function parsePoint(point: TextualPoint): NumericPoint | null {
  const latitude = Number(point.latitude)
  const longitude = Number(point.longitude)
  if (point.latitude.trim() === '' || point.longitude.trim() === '') return null
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}
