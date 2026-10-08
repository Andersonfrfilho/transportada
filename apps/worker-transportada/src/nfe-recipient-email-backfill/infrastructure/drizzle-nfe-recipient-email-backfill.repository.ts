/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt, isNull } from 'drizzle-orm'

import { nfeDocuments, storedObjects } from '../../database/nfe.schema.js'
import type {
  NfeRecipientEmailBackfillRepository,
  NfeRecipientEmailPendingDocument,
} from '../application/nfe-recipient-email-backfill.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleNfeRecipientEmailBackfillRepository
  implements NfeRecipientEmailBackfillRepository
{
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async listDocumentsWithoutRecipientEmail(input: {
    readonly cursor: string | undefined
    readonly limit: number
  }): Promise<readonly NfeRecipientEmailPendingDocument[]> {
    return this.#database
      .select({
        bucket: storedObjects.bucket,
        companyId: nfeDocuments.companyId,
        documentId: nfeDocuments.id,
        objectKey: storedObjects.objectKey,
      })
      .from(nfeDocuments)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.id, nfeDocuments.xmlObjectId),
          eq(storedObjects.companyId, nfeDocuments.companyId),
        ),
      )
      .where(
        and(
          isNull(nfeDocuments.recipientEmail),
          input.cursor === undefined ? undefined : gt(nfeDocuments.id, input.cursor),
        ),
      )
      .orderBy(asc(nfeDocuments.id))
      .limit(input.limit)
  }

  async fillRecipientEmail(input: {
    readonly companyId: string
    readonly documentId: string
    readonly email: string
  }): Promise<boolean> {
    const rows = await this.#database
      .update(nfeDocuments)
      .set({ recipientEmail: input.email })
      .where(
        and(
          eq(nfeDocuments.id, input.documentId),
          eq(nfeDocuments.companyId, input.companyId),
          isNull(nfeDocuments.recipientEmail),
        ),
      )
      .returning({ id: nfeDocuments.id })
    return rows.length > 0
  }
}
