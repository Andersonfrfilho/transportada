/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'

import { resolvePartyByRole } from '../domain/nfe-participant-role.constant.js'
import { safeLogError } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'

const DEFAULT_BATCH_SIZE = 100

export type NfeAddressCityCodePendingAddress = {
  readonly addressId: string
  readonly role: string
}

export type NfeAddressCityCodePendingDocument = {
  readonly addresses: readonly NfeAddressCityCodePendingAddress[]
  readonly bucket: string
  readonly documentId: string
  readonly objectKey: string
}

export type NfeAddressCityCodeBackfillRepository = {
  applyCityCodes(input: {
    readonly cityCodeByAddressId: Readonly<Record<string, string>>
    readonly companyId: string
  }): Promise<number>
  listDocumentsMissingCityCode(input: {
    readonly companyId: string
    readonly cursor: string | undefined
    readonly limit: number
  }): Promise<readonly NfeAddressCityCodePendingDocument[]>
}

export type NfeAddressCityCodeBackfillStorage = {
  readXml(input: { readonly bucket: string; readonly key: string }): Promise<string>
}

export type NfeAddressCityCodeBackfillImporter = {
  importXml(input: { readonly xml: string }): Promise<ImportedNfeXml>
}

export type NfeAddressCityCodeBackfillResult = {
  readonly addressesUpdated: number
  readonly documentsFailed: number
  readonly documentsScanned: number
  readonly documentsSkipped: number
}

export type NfeAddressCityCodeBackfill = {
  execute(input: {
    readonly batchSize?: number
    readonly companyId: string
  }): Promise<NfeAddressCityCodeBackfillResult>
}

export function createNfeAddressCityCodeBackfill(dependencies: {
  readonly importer: NfeAddressCityCodeBackfillImporter
  readonly logger?: WorkerLogger
  readonly repository: NfeAddressCityCodeBackfillRepository
  readonly storage: NfeAddressCityCodeBackfillStorage
}): NfeAddressCityCodeBackfill {
  return {
    async execute(input): Promise<NfeAddressCityCodeBackfillResult> {
      const limit = input.batchSize ?? DEFAULT_BATCH_SIZE
      let addressesUpdated = 0
      let documentsFailed = 0
      let documentsScanned = 0
      let documentsSkipped = 0
      let cursor: string | undefined

      for (;;) {
        const pending = await dependencies.repository.listDocumentsMissingCityCode({
          companyId: input.companyId,
          cursor,
          limit,
        })
        if (pending.length === 0) break

        for (const document of pending) {
          documentsScanned += 1
          try {
            const cityCodeByAddressId = await resolveCityCodes({
              dependencies,
              document,
            })
            if (Object.keys(cityCodeByAddressId).length === 0) {
              documentsSkipped += 1
              continue
            }
            addressesUpdated += await dependencies.repository.applyCityCodes({
              cityCodeByAddressId,
              companyId: input.companyId,
            })
          } catch (error: unknown) {
            documentsFailed += 1
            logFailure({ document, error, logger: dependencies.logger })
          }
        }

        cursor = pending[pending.length - 1]?.documentId
      }

      return { addressesUpdated, documentsFailed, documentsScanned, documentsSkipped }
    },
  }
}

async function resolveCityCodes(input: {
  readonly dependencies: {
    readonly importer: NfeAddressCityCodeBackfillImporter
    readonly storage: NfeAddressCityCodeBackfillStorage
  }
  readonly document: NfeAddressCityCodePendingDocument
}): Promise<Record<string, string>> {
  const xml = await input.dependencies.storage.readXml({
    bucket: input.document.bucket,
    key: input.document.objectKey,
  })
  const imported = await input.dependencies.importer.importXml({ xml })
  if (imported.kind === 'nfe-event') return {}

  const cityCodeByAddressId: Record<string, string> = {}
  for (const address of input.document.addresses) {
    const cityCode = resolvePartyByRole({
      document: imported.document,
      role: address.role,
    })?.address?.cityCode
    if (cityCode !== undefined) cityCodeByAddressId[address.addressId] = cityCode
  }

  return cityCodeByAddressId
}

function logFailure(input: {
  readonly document: NfeAddressCityCodePendingDocument
  readonly error: unknown
  readonly logger: WorkerLogger | undefined
}): void {
  if (input.logger === undefined) return
  safeLogError({
    logger: input.logger,
    message: 'nfe_address_city_code_backfill_failed',
    metadata: {
      documentId: input.document.documentId,
      reason: input.error instanceof Error ? input.error.message : 'unknown',
    },
  })
}
