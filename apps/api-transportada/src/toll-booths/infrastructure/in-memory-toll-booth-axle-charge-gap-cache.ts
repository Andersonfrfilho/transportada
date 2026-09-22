/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T503, defeito 2: implementação em memória do processo — nunca distribuída (não há Redis
 * nem estado compartilhado entre réplicas envolvido aqui). A consequência é que `invalidate` só
 * alcança a réplica que atendeu a mutação: a cópia das outras continuaria servindo o número velho
 * indefinidamente, e não pela latência de uma leitura de banco. `TOLL_BOOTH_AXLE_CHARGE_GAP_CACHE_TTL_MS`
 * é o teto dessa divergência — passado o prazo, a leitura recalcula sozinha.
 */
import { TOLL_BOOTH_AXLE_CHARGE_GAP_CACHE_TTL_MS } from '../application/toll-booth-catalog.constant.js'
import type { TollBoothAxleChargeGapCachePort } from '../application/toll-booth-axle-charge-gap-cache.port.js'

type CacheEntry = Readonly<{ count: number; writtenAtMs: number }>

type InMemoryTollBoothAxleChargeGapCacheDependencies = Readonly<{
  clock: Readonly<{ now(): Date }>
}>

export function createInMemoryTollBoothAxleChargeGapCache(
  dependencies: InMemoryTollBoothAxleChargeGapCacheDependencies,
): TollBoothAxleChargeGapCachePort {
  const entryByCompanyId = new Map<string, CacheEntry>()

  return {
    invalidate(companyId: string): void {
      entryByCompanyId.delete(companyId)
    },
    invalidateAll(): void {
      entryByCompanyId.clear()
    },
    read(companyId: string): number | undefined {
      const entry = entryByCompanyId.get(companyId)
      if (entry === undefined) return undefined
      const ageMs = dependencies.clock.now().getTime() - entry.writtenAtMs
      if (ageMs >= TOLL_BOOTH_AXLE_CHARGE_GAP_CACHE_TTL_MS) {
        entryByCompanyId.delete(companyId)
        return undefined
      }
      return entry.count
    },
    write(companyId: string, count: number): void {
      entryByCompanyId.set(companyId, { count, writtenAtMs: dependencies.clock.now().getTime() })
    },
  }
}
