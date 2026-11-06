/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import type {
  FindDocumentIdsByAccessKeysParams,
  NfeDocumentAccessKeyCheckReaderPort,
} from '../application/nfe-document-access-key-check.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleNfeDocumentAccessKeyCheckRepository
  implements NfeDocumentAccessKeyCheckReaderPort
{
  public constructor(private readonly database: Database) {}

  public async findDocumentIdsByAccessKeys(
    params: FindDocumentIdsByAccessKeysParams,
  ): Promise<ReadonlyMap<string, string>> {
    const rows = await this.database
      .select({ accessKey: nfeDocuments.accessKey, id: nfeDocuments.id })
      .from(nfeDocuments)
      .where(
        and(
          eq(nfeDocuments.companyId, params.companyId),
          inArray(nfeDocuments.accessKey, [...params.accessKeys]),
        ),
      )
    return new Map(rows.map((row) => [row.accessKey, row.id]))
  }
}
