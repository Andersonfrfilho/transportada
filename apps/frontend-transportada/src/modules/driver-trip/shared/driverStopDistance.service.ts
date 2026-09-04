/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverReportedLocation, DriverTripStop } from './driverTrip.types'

/**
 * Spec 082 D2: distância em linha reta (haversine) da última posição conhecida até a parada. É
 * orientação de bolso, não roteiro — o roteiro é do app de mapa (ADR-0045 §8).
 *
 * Sem posição ou sem coordenada da parada **não há distância**: inventar "0 km" mandaria o
 * motorista acreditar que chegou. Ausência vira `null`, e a tela não renderiza nada.
 */
const EARTH_RADIUS_KM = 6371

type Coordinate = Readonly<{ latitude: number; longitude: number }>

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function haversineDistanceKm(input: {
  readonly from: Coordinate
  readonly to: Coordinate
}): number {
  const deltaLatitude = toRadians(input.to.latitude - input.from.latitude)
  const deltaLongitude = toRadians(input.to.longitude - input.from.longitude)
  const half =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(input.from.latitude)) *
      Math.cos(toRadians(input.to.latitude)) *
      Math.sin(deltaLongitude / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(half))
}

function parseStopCoordinate(stop: DriverTripStop): Coordinate | null {
  if (stop.latitude === null || stop.longitude === null) return null
  const latitude = Number(stop.latitude)
  const longitude = Number(stop.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return { latitude, longitude }
}

/**
 * O rótulo pronto para a tela — `"3,2 km"`, vírgula porque o texto é pt-BR. Abaixo de 100 m o
 * arredondamento daria `"0,0 km"`, que lê como dado inventado: sobe para o piso de `"0,1 km"`.
 */
export function formatStopDistance(input: {
  readonly location: DriverReportedLocation | null
  readonly stop: DriverTripStop
}): string | null {
  if (input.location === null) return null
  const target = parseStopCoordinate(input.stop)
  if (target === null) return null

  const distanceKm = haversineDistanceKm({
    from: { latitude: input.location.latitude, longitude: input.location.longitude },
    to: target,
  })
  const floored = Math.max(distanceKm, 0.1)
  return `${floored.toFixed(1).replace('.', ',')} km`
}
