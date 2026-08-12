/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type {
  CteBatchNameQuery,
  CteBatchPreviewDocument,
  CteBatchPreviewLink,
  CteBatchPreviewNfseLink,
  CteBatchPreviewQuery,
  CteBatchPreviewReaderPort,
} from '../application/cte-batch-preview.port.js'
import {
  findActiveBatchLinks,
  findActiveNfseLinks,
  findBatchNamesByPrefix,
  findSelectionDocuments,
} from './cte-batch-selection.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCteBatchPreviewRepository implements CteBatchPreviewReaderPort {
  public constructor(private readonly database: Database) {}

  public findActiveBatchLinks(
    query: CteBatchPreviewQuery,
  ): Promise<readonly CteBatchPreviewLink[]> {
    return findActiveBatchLinks(this.database, query)
  }

  public findActiveNfseLinks(
    query: CteBatchPreviewQuery,
  ): Promise<readonly CteBatchPreviewNfseLink[]> {
    return findActiveNfseLinks(this.database, query)
  }

  public findBatchNamesStartingWith(query: CteBatchNameQuery): Promise<readonly string[]> {
    return findBatchNamesByPrefix(this.database, query)
  }

  public findPreviewDocuments(
    query: CteBatchPreviewQuery,
  ): Promise<readonly CteBatchPreviewDocument[]> {
    return findSelectionDocuments(this.database, query)
  }
}
