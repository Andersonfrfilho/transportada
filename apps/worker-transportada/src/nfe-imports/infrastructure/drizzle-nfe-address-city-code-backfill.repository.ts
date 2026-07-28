/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm'

import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  storedObjects,
} from '../../database/nfe.schema.js'
import type {
  NfeAddressCityCodeBackfillRepository,
  NfeAddressCityCodePendingAddress,
  NfeAddressCityCodePendingDocument,
} from '../application/nfe-address-city-code-backfill.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleNfeAddressCityCodeBackfillRepository
  implements NfeAddressCityCodeBackfillRepository
{
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async listDocumentsMissingCityCode(input: {
    readonly companyId: string
    readonly cursor: string | undefined
    readonly limit: number
  }): Promise<readonly NfeAddressCityCodePendingDocument[]> {
    const documents = await this.#database
      .selectDistinct({
        bucket: storedObjects.bucket,
        documentId: nfeDocuments.id,
        objectKey: storedObjects.objectKey,
      })
      .from(nfeAddresses)
      .innerJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.id, nfeAddresses.participantId),
          eq(nfeParticipants.companyId, nfeAddresses.companyId),
        ),
      )
      .innerJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.id, nfeParticipants.documentId),
          eq(nfeDocuments.companyId, nfeParticipants.companyId),
        ),
      )
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.id, nfeDocuments.xmlObjectId),
          eq(storedObjects.companyId, nfeDocuments.companyId),
        ),
      )
      .where(
        and(
          eq(nfeAddresses.companyId, input.companyId),
          isNull(nfeAddresses.cityCode),
          input.cursor === undefined ? undefined : gt(nfeDocuments.id, input.cursor),
        ),
      )
      .orderBy(asc(nfeDocuments.id))
      .limit(input.limit)

    if (documents.length === 0) return []

    const addresses = await this.#listPendingAddresses({
      companyId: input.companyId,
      documentIds: documents.map((document) => document.documentId),
    })

    return documents.map((document) => ({
      addresses: addresses.get(document.documentId) ?? [],
      bucket: document.bucket,
      documentId: document.documentId,
      objectKey: document.objectKey,
    }))
  }

  async applyCityCodes(input: {
    readonly cityCodeByAddressId: Readonly<Record<string, string>>
    readonly companyId: string
  }): Promise<number> {
    const entries = Object.entries(input.cityCodeByAddressId)
    if (entries.length === 0) return 0

    return this.#database.transaction(async (transaction) => {
      let updated = 0
      // Sequencial de propósito: são escritas na mesma transação, não I/O paralelizável.
      for (const [addressId, cityCode] of entries) {
        const rows = await transaction
          .update(nfeAddresses)
          .set({ cityCode })
          .where(
            and(
              eq(nfeAddresses.id, addressId),
              eq(nfeAddresses.companyId, input.companyId),
              isNull(nfeAddresses.cityCode),
            ),
          )
          .returning({ id: nfeAddresses.id })
        updated += rows.length
      }
      return updated
    })
  }

  async #listPendingAddresses(input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
  }): Promise<Map<string, readonly NfeAddressCityCodePendingAddress[]>> {
    const rows = await this.#database
      .select({
        addressId: nfeAddresses.id,
        documentId: nfeParticipants.documentId,
        role: nfeParticipants.role,
      })
      .from(nfeAddresses)
      .innerJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.id, nfeAddresses.participantId),
          eq(nfeParticipants.companyId, nfeAddresses.companyId),
        ),
      )
      .where(
        and(
          eq(nfeAddresses.companyId, input.companyId),
          isNull(nfeAddresses.cityCode),
          inArray(nfeParticipants.documentId, [...input.documentIds]),
        ),
      )

    const grouped = new Map<string, NfeAddressCityCodePendingAddress[]>()
    for (const row of rows) {
      const entries = grouped.get(row.documentId) ?? []
      entries.push({ addressId: row.addressId, role: row.role })
      grouped.set(row.documentId, entries)
    }

    return grouped
  }
}
