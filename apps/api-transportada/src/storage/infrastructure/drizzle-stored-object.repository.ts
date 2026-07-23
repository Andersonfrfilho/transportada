/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { storedObjects } from '../../database/storage.schema.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleStoredObjectRepository {
  public constructor(private readonly database: Database) {}

  public async saveImportSource(input: {
    readonly bucket: string
    readonly companyId: string
    readonly id: string
    readonly mimeType: string
    readonly objectKey: string
    readonly provider: string
    readonly sha256: string
    readonly sizeBytes: bigint
  }): Promise<void> {
    await this.database
      .insert(storedObjects)
      .values({
        bucket: input.bucket,
        companyId: input.companyId,
        id: input.id,
        mimeType: input.mimeType,
        objectKey: input.objectKey,
        provider: input.provider,
        purpose: 'import_source',
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
        status: 'staging',
      })
      .onConflictDoNothing()
  }
}
