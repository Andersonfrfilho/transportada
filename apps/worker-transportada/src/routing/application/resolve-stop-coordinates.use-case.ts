/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { parseStopAddressKey } from '../domain/stop-address-key.js'

import type { GeocodeAddressRequest, GeocodedAddressRecord } from './geocoding.port.js'
import type { RouteOptimizationStop } from './route-optimization.effect.js'

/**
 * ADR-0044 §5: `city` é palpite de ~8 km, e não entra na otimização — vai marcada, no fim, esperando
 * o humano. A regra mora aqui e em `readStops`, que a aplica sobre o que já está em base.
 */
export function isOptimizablePrecision(precision: string): boolean {
  return precision !== 'city'
}

/**
 * Os endereços que a sugestão precisa resolver antes de pedir a matriz: os das paradas que estão
 * fora da otimização por não terem coordenada fina.
 *
 * A requisição é montada **da própria chave**, e não de um `join` com `nfe_addresses`, porque a
 * cascata do worker precisa só de CEP e município (degraus 1 e 2) — e os dois estão na chave. Se um
 * provedor que leia logradouro algum dia vier para cá, é aqui que a requisição precisa engordar
 * primeiro; hoje, o `join` seria trabalho especulativo.
 */
export function buildGeocodeRequests(
  stops: readonly RouteOptimizationStop[],
): readonly GeocodeAddressRequest[] {
  const byKey = new Map<string, GeocodeAddressRequest>()

  for (const stop of stops) {
    if (!stop.excludedFromOptimization) continue
    if (byKey.has(stop.addressKey)) continue

    const parts = parseStopAddressKey(stop.addressKey)
    if (parts === null) continue

    byKey.set(stop.addressKey, {
      addressKey: stop.addressKey,
      city: '',
      cityCode: parts.cityCode,
      district: '',
      number: parts.number,
      postalCode: parts.postalCode,
      state: '',
      street: '',
    })
  }

  return [...byKey.values()]
}

/**
 * Aplica em memória o que a cascata acabou de resolver, em vez de reler o contexto inteiro do banco.
 *
 * A parada só **entra** na otimização; nenhuma sai. Uma coordenada recém-resolvida que viesse pior
 * que a que já está lá não deveria existir — a cascata só resolve o que estava ausente —, e tratar
 * esse caso aqui daria a impressão de que ele acontece.
 */
export function applyResolvedCoordinates(input: {
  readonly resolved: ReadonlyMap<string, GeocodedAddressRecord>
  readonly stops: readonly RouteOptimizationStop[]
}): readonly RouteOptimizationStop[] {
  if (input.resolved.size === 0) return input.stops

  return input.stops.map((stop) => {
    if (!stop.excludedFromOptimization) return stop

    const record = input.resolved.get(stop.addressKey)
    if (record === undefined) return stop

    return {
      ...stop,
      excludedFromOptimization: !isOptimizablePrecision(record.precision),
      latitude: record.latitude,
      longitude: record.longitude,
    }
  })
}
