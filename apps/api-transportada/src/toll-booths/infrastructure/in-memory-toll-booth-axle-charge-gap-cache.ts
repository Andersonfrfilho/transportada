/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154 T503, defeito 2: implementação em memória do processo — nunca distribuída (não há Redis
 * nem estado compartilhado entre réplicas envolvido aqui; cada instância da API recalcula a própria
 * cópia na primeira leitura depois de subir ou de uma invalidação, o que é aceitável porque o dado
 * é barato de recalcular e a janela de divergência entre réplicas é, no pior caso, a mesma latência
 * de uma leitura de banco).
 */
import type { TollBoothAxleChargeGapCachePort } from '../application/toll-booth-axle-charge-gap-cache.port.js'

export function createInMemoryTollBoothAxleChargeGapCache(): TollBoothAxleChargeGapCachePort {
  const countByCompanyId = new Map<string, number>()

  return {
    invalidate(companyId: string): void {
      countByCompanyId.delete(companyId)
    },
    invalidateAll(): void {
      countByCompanyId.clear()
    },
    read(companyId: string): number | undefined {
      return countByCompanyId.get(companyId)
    },
    write(companyId: string, count: number): void {
      countByCompanyId.set(companyId, count)
    },
  }
}
