/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm'

import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  storedObjects,
} from '../../database/nfe.schema.js'
import type {
  NfePartyContactApplyResult,
  NfePartyContactBackfillRepository,
  NfePartyContactPendingDocument,
  NfePartyContactPendingParty,
} from '../application/nfe-party-contact-backfill.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleNfePartyContactBackfillRepository implements NfePartyContactBackfillRepository {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async listDocumentsMissingPartyContact(input: {
    readonly companyId: string
    readonly cursor: string | undefined
    readonly limit: number
  }): Promise<readonly NfePartyContactPendingDocument[]> {
    const documents = await this.#database
      .selectDistinct({
        bucket: storedObjects.bucket,
        documentId: nfeDocuments.id,
        objectKey: storedObjects.objectKey,
      })
      .from(nfeParticipants)
      .leftJoin(
        nfeAddresses,
        and(
          eq(nfeAddresses.participantId, nfeParticipants.id),
          eq(nfeAddresses.companyId, nfeParticipants.companyId),
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
          eq(nfeParticipants.companyId, input.companyId),
          or(isNull(nfeParticipants.tradeName), isNull(nfeAddresses.phone)),
          input.cursor === undefined ? undefined : gt(nfeDocuments.id, input.cursor),
        ),
      )
      .orderBy(asc(nfeDocuments.id))
      .limit(input.limit)

    if (documents.length === 0) return []

    const parties = await this.#listPendingParties({
      companyId: input.companyId,
      documentIds: documents.map((document) => document.documentId),
    })

    return documents.map((document) => ({
      bucket: document.bucket,
      documentId: document.documentId,
      objectKey: document.objectKey,
      parties: parties.get(document.documentId) ?? [],
    }))
  }

  async applyPartyContacts(input: {
    readonly companyId: string
    readonly phoneByAddressId: Readonly<Record<string, string>>
    readonly tradeNameByParticipantId: Readonly<Record<string, string>>
  }): Promise<NfePartyContactApplyResult> {
    const tradeNames = Object.entries(input.tradeNameByParticipantId)
    const phones = Object.entries(input.phoneByAddressId)
    if (tradeNames.length === 0 && phones.length === 0) {
      return { addressesUpdated: 0, participantsUpdated: 0 }
    }

    return this.#database.transaction(async (transaction) => {
      let participantsUpdated = 0
      let addressesUpdated = 0
      // Sequencial de propósito: são escritas na mesma transação, não I/O paralelizável.
      for (const [participantId, tradeName] of tradeNames) {
        const rows = await transaction
          .update(nfeParticipants)
          .set({ tradeName })
          .where(
            and(
              eq(nfeParticipants.id, participantId),
              eq(nfeParticipants.companyId, input.companyId),
              isNull(nfeParticipants.tradeName),
            ),
          )
          .returning({ id: nfeParticipants.id })
        participantsUpdated += rows.length
      }
      for (const [addressId, phone] of phones) {
        const rows = await transaction
          .update(nfeAddresses)
          .set({ phone })
          .where(
            and(
              eq(nfeAddresses.id, addressId),
              eq(nfeAddresses.companyId, input.companyId),
              isNull(nfeAddresses.phone),
            ),
          )
          .returning({ id: nfeAddresses.id })
        addressesUpdated += rows.length
      }
      return { addressesUpdated, participantsUpdated }
    })
  }

  async #listPendingParties(input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
  }): Promise<Map<string, readonly NfePartyContactPendingParty[]>> {
    const rows = await this.#database
      .select({
        addressId: nfeAddresses.id,
        documentId: nfeParticipants.documentId,
        participantId: nfeParticipants.id,
        role: nfeParticipants.role,
      })
      .from(nfeParticipants)
      .leftJoin(
        nfeAddresses,
        and(
          eq(nfeAddresses.participantId, nfeParticipants.id),
          eq(nfeAddresses.companyId, nfeParticipants.companyId),
        ),
      )
      .where(
        and(
          eq(nfeParticipants.companyId, input.companyId),
          or(isNull(nfeParticipants.tradeName), isNull(nfeAddresses.phone)),
          inArray(nfeParticipants.documentId, [...input.documentIds]),
        ),
      )

    const grouped = new Map<string, NfePartyContactPendingParty[]>()
    for (const row of rows) {
      const entries = grouped.get(row.documentId) ?? []
      entries.push({
        addressId: row.addressId,
        participantId: row.participantId,
        role: row.role,
      })
      grouped.set(row.documentId, entries)
    }

    return grouped
  }
}
