/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { MeshFeature } from '@/modules/shared/ibgeMesh.service'

export type MapProjection = (point: { readonly latitude: number; readonly longitude: number }) => {
  readonly x: number
  readonly y: number
}

export type TripBasemapInput = Readonly<{
  /** Códigos IBGE das paradas: é o recorte, e é ele que evita desenhar o estado inteiro. */
  cityCodes: readonly string[]
  features: readonly MeshFeature[]
  project: MapProjection
}>

/** Quatro casas ≈ 11 m: abaixo do que a qualidade mínima da malha resolve, e encurta o `d`. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

/**
 * O contorno dos municípios das paradas, projetado na **escala do mapa da viagem** — o mesmo
 * enquadramento dos pinos, senão o desenho e os pontos falariam de lugares diferentes.
 *
 * ⚠️ Só os municípios que a viagem toca. O estado inteiro num enquadramento de três paradas vizinhas
 * sairia como um borrão que cobre a tela sem localizar nada — e a malha já vem recortada por
 * município justamente para permitir esse corte.
 *
 * Município com ilha ou enclave vira **um** caminho com vários subcaminhos, como na aba Regiões:
 * desenhar anel por anel pintaria a mesma cidade duas vezes.
 */
export function buildTripBasemapPaths(input: TripBasemapInput): readonly string[] {
  const wanted = new Set(input.cityCodes.filter((code) => code !== ''))
  if (wanted.size === 0) return []

  return input.features
    .filter((feature) => wanted.has(feature.code))
    .map((feature) =>
      feature.rings
        .map((ring) =>
          ring
            .map(([longitude, latitude], index) => {
              const point = input.project({ latitude, longitude })
              return `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`
            })
            .join(' ')
            .concat(' Z'),
        )
        .join(' '),
    )
    .filter((path) => path !== '')
}
