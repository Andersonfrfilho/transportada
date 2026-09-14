/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 106: traduz o cadastro de cobertura do motorista no conjunto de paradas que o veículo dele
 * pode servir — que é a única coisa que o solver entende.
 */
import { buildRegionCityKey, coversRegion } from './region-coverage.policy.js'

export type DriverCoverageEntry = {
  readonly city: string
  readonly regionCode: string
  readonly scope: 'city' | 'region'
  readonly state: string
}

export type CoverableStop = {
  readonly city: string
  readonly index: number
  readonly state: string
}

/**
 * `null` é **ausência de restrição**, e é o fallback decidido pelo usuário: motorista sem região
 * cadastrada serve tudo.
 *
 * ⚠️ Conjunto vazio ali seria o oposto — o roteirizador pararia de propor viagem numa instalação
 * que nunca configurou região, sem ninguém entender por quê. Quem não declarou não restringiu.
 */
export function resolveServableStops(input: {
  readonly coverage: readonly DriverCoverageEntry[]
  /** Cidade dobrada + UF → código da zona, de `freight_region_cities`. */
  readonly regionCodeByCityKey: ReadonlyMap<string, string>
  readonly stops: readonly CoverableStop[]
}): ReadonlySet<number> | null {
  if (input.coverage.length === 0) return null

  const cityScoped = new Set(
    input.coverage
      .filter((entry) => entry.scope === 'city')
      .map((entry) => buildRegionCityKey({ city: entry.city, state: entry.state })),
  )
  const zones = input.coverage
    .filter((entry) => entry.scope === 'region')
    .map((entry) => entry.regionCode)

  const servable = new Set<number>()
  for (const stop of input.stops) {
    const key = buildRegionCityKey({ city: stop.city, state: stop.state })
    /** A cidade solta vale por si, mesmo fora de qualquer zona coberta. */
    if (cityScoped.has(key)) {
      servable.add(stop.index)
      continue
    }

    /**
     * ⚠️ Cidade fora de `freight_region_cities` **não** é coberta por zona: ela não está na tabela,
     * e adivinhar a zona dela seria inventar. Vira sobra, e a tela diz que falta cadastrar.
     */
    const candidate = input.regionCodeByCityKey.get(key)
    if (candidate === undefined) continue

    if (zones.some((coverage) => coversRegion({ candidate, coverage }))) servable.add(stop.index)
  }

  return servable
}
