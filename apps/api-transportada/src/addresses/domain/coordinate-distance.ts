/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const EARTH_RADIUS_METRES = 6_371_008.8
const DEGREES_TO_RADIANS = Math.PI / 180

export type Coordinate = Readonly<{ latitude: string; longitude: string }>

/**
 * Quanto o provedor discorda da coordenada que já temos, em metros (spec 084, RF8).
 *
 * ⚠️ **Não é o veredito, é a régua.** Distância grande num endereço de precisão `city` é o esperado —
 * o centroide do município fica longe de tudo. O que a distância acrescenta é a ordem de grandeza do
 * conserto, e é ela que separa "o pino estava a 200 m" de "estava na cidade errada".
 *
 * Haversine sobre esfera: a 300 metros a diferença para um elipsoide é milimétrica, e o que se mede
 * aqui é da ordem de centenas de metros a quilômetros.
 */
export function distanceInMetres(from: Coordinate, to: Coordinate): null | number {
  const fromLatitude = Number(from.latitude)
  const fromLongitude = Number(from.longitude)
  const toLatitude = Number(to.latitude)
  const toLongitude = Number(to.longitude)

  const values = [fromLatitude, fromLongitude, toLatitude, toLongitude]
  if (values.some((value) => !Number.isFinite(value))) return null

  const deltaLatitude = (toLatitude - fromLatitude) * DEGREES_TO_RADIANS
  const deltaLongitude = (toLongitude - fromLongitude) * DEGREES_TO_RADIANS

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(fromLatitude * DEGREES_TO_RADIANS) *
      Math.cos(toLatitude * DEGREES_TO_RADIANS) *
      Math.sin(deltaLongitude / 2) ** 2

  const metres = 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(a)))

  return Math.round(metres * 100) / 100
}
