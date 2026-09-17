/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T302: o caso de uso real de recarga sobre portas dubladas que registram a ordem das
 * chamadas em `events` — é o que permite ao contrato afirmar "baixa antes de travar".
 */
import { ObjectStorageError } from '@adatechnology/object-storage-provider'

import { createReloadTollBoothCatalogUseCase } from '../../src/toll-booths/application/reload-toll-booth-catalog.use-case.js'
import type { TollBoothSeedRecord } from '../../src/toll-booths/application/toll-booth.port.js'
import type { TollBoothCatalogReloadAuditInput } from '../../src/toll-booths/application/toll-booth-catalog-reload.port.js'
import { TollBoothCatalogReloadInProgressError } from '../../src/toll-booths/domain/toll-booth-extract.error.js'
import type { TollBoothExtractRow } from '../../src/toll-booths/domain/toll-booth-extract.policy.js'
import { createInMemoryTollBoothAxleChargeGapCache } from '../../src/toll-booths/infrastructure/in-memory-toll-booth-axle-charge-gap-cache.js'

const RELOADED_AT = new Date('2026-09-17T12:00:00.000Z')

export type ReloadPortParams = {
  readonly catalogBoothCount?: number
  readonly extract?: TollBoothExtractRow | undefined
  readonly isLocked?: boolean
  readonly objectBytes?: Uint8Array | undefined
  readonly objectContentLength?: number
  /** Storage indisponível na hora do `head` (spec 154 T402 item 3). */
  readonly storageUnavailable?: boolean
}

export function createReloadPorts(params: ReloadPortParams) {
  const events: string[] = []
  const savedBooths: TollBoothSeedRecord[] = []
  const audits: TollBoothCatalogReloadAuditInput[] = []
  const markedMissing: unknown[] = []
  const markedReloaded: unknown[] = []
  const axleChargeGapCache = createInMemoryTollBoothAxleChargeGapCache()
  const useCase = createReloadTollBoothCatalogUseCase({
    axleChargeGapCache,
    catalogReload: {
      async runExclusive(work) {
        events.push('runExclusive')
        if (params.isLocked === true) throw new TollBoothCatalogReloadInProgressError()
        return work({
          async insertAudit(input) {
            events.push('insertAudit')
            audits.push(input)
          },
          async markReloaded(input) {
            events.push('markReloaded')
            markedReloaded.push(input)
            const row = params.extract as TollBoothExtractRow
            return {
              ...row,
              reloadedAt: RELOADED_AT,
              reloadedBoothCount: input.reloadedBoothCount,
              reloadedByUserId: input.reloadedByUserId,
            }
          },
          async readCatalogSummary() {
            events.push('readCatalogSummary')
            return { boothCount: params.catalogBoothCount ?? 1, latestObservedOn: '2026-09-14' }
          },
          async saveMany(booths) {
            events.push('saveMany')
            savedBooths.push(...booths)
            return booths.length
          },
        })
      },
    },
    extracts: {
      async create() {
        throw new Error('not used by the reload')
      },
      async find(input) {
        events.push(`find:${input.dataset}:${input.observedOn}`)
        return params.extract
      },
      async list() {
        return []
      },
      async markObjectMissing(input) {
        events.push('markObjectMissing')
        markedMissing.push(input)
      },
    },
    logger: { warn() {} },
    storage: {
      async head() {
        events.push('head')
        if (params.storageUnavailable === true) {
          throw new ObjectStorageError(
            'OBJECT_STORAGE_UNAVAILABLE',
            'Object storage is unavailable',
          )
        }
        if (params.objectBytes === undefined) return undefined
        return { contentLength: params.objectContentLength ?? params.objectBytes.byteLength }
      },
      async putCreateOnly() {
        throw new Error('not used by the reload')
      },
      async read() {
        events.push('read')
        return params.objectBytes as Uint8Array
      },
    },
  })

  return { audits, axleChargeGapCache, events, markedMissing, markedReloaded, savedBooths, useCase }
}
