/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T012: as paradas da viagem projetadas para desenho.
 *
 * ⚠️ **Não é cópia do `mapProjection.service.ts` do portal do cliente**, apesar de a matemática se
 * parecer. Lá a janela é **fixa** em meio grau, porque o portal conhece um ponto só — o caminhão —
 * e qualquer enquadramento automático seria zoom sobre um ponto. Aqui há um roteiro inteiro, e uma
 * janela fixa cortaria pela metade um percurso intermunicipal. São regras diferentes para
 * problemas diferentes, não duplicação a unificar.
 */

export const MAP_VIEWBOX_SIZE = 100

/** Margem para o pino não encostar na borda: um ponto exatamente em 0 fica meio fora do desenho. */
const PADDING = 8

export type TripRouteStop = Readonly<{
  label: string
  latitude: null | string
  longitude: null | string
  sequence: number
}>

export type TripRoutePoint = Readonly<{
  label: string
  sequence: number
  x: number
  y: number
}>

export type TripRouteMap = Readonly<{
  points: readonly TripRoutePoint[]
  /**
   * As paradas que o mapa não desenha, **nomeadas**. Mesma regra da cidade sem polígono na aba
   * Regiões: roteiro visto pela metade é pior que roteiro visto inteiro com um aviso ao lado.
   */
  stopsWithoutLocation: readonly string[]
}>

type Located = TripRouteStop & { readonly point: { latitude: number; longitude: number } }

function toPoint(stop: TripRouteStop): Located | null {
  if (stop.latitude === null || stop.longitude === null) return null

  const latitude = Number(stop.latitude)
  const longitude = Number(stop.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null

  return { ...stop, point: { latitude, longitude } }
}

/**
 * `null` quando nenhuma parada tem coordenada: ausência de mapa é diferente de um mapa vazio, que
 * parece carregado e não é.
 *
 * ⚠️ A longitude é corrigida pelo cosseno da latitude — sem isso o roteiro sai esticado no sentido
 * leste-oeste, e a distância percebida entre duas paradas deixa de valer para quem lê.
 */
export function resolveTripRouteMap(input: {
  readonly stops: readonly TripRouteStop[]
}): null | TripRouteMap {
  const located = input.stops.map(toPoint).filter((stop): stop is Located => stop !== null)
  const stopsWithoutLocation = input.stops
    .filter((stop) => toPoint(stop) === null)
    .map((stop) => stop.label)

  if (located.length === 0) return null

  const latitudes = located.map((stop) => stop.point.latitude)
  const longitudes = located.map((stop) => stop.point.longitude)
  const centerLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2
  const longitudeScale = Math.max(Math.cos((centerLatitude * Math.PI) / 180), 0.01)

  const width = (Math.max(...longitudes) - Math.min(...longitudes)) * longitudeScale
  const height = Math.max(...latitudes) - Math.min(...latitudes)
  const span = Math.max(width, height)

  const drawable = MAP_VIEWBOX_SIZE - PADDING * 2
  const centerLongitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2
  const half = MAP_VIEWBOX_SIZE / 2

  /**
   * ⚠️ Sem extensão — uma parada só, ou várias no mesmo portão — dividir pela amplitude daria
   * `NaN` em toda coordenada, e o SVG desenharia nada sem dizer por quê. O ponto vai para o centro.
   */
  const scale = span === 0 ? 0 : drawable / span

  return {
    points: located.map((stop) => ({
      label: stop.label,
      sequence: stop.sequence,
      x: half + (stop.point.longitude - centerLongitude) * longitudeScale * scale,
      // O eixo y é invertido: no SVG ele cresce para baixo e a latitude cresce para o norte.
      y: half - (stop.point.latitude - centerLatitude) * scale,
    })),
    stopsWithoutLocation,
  }
}
