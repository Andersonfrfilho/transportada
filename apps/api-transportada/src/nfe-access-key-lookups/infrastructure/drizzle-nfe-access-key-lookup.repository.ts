/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, gt, inArray } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { nfeAccessKeyLookups, nfeDocuments, nfeImports } from '../../database/nfe.schema.js'
import { processingOutbox } from '../../database/processing.schema.js'
import { DEFINITIVE_REFUSAL_REASONS } from '../application/nfe-access-key-lookup.constant.js'
import type {
  AccessKeyLookupLocator,
  AccessKeyLookupOutboxParams,
  AccessKeyLookupReaderPort,
  AccessKeyLookupView,
  AttachLookupImportParams,
  ClaimAccessKeyLookupParams,
  CreateLookupImportParams,
  NfeFiscalEnvironment,
  RequestAccessKeyLookupTransactionPort,
  RequestAccessKeyLookupUnitOfWorkPort,
} from '../application/nfe-access-key-lookup.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const ACTIVE_STATUSES = ['queued', 'querying', 'waiting'] as const

const VIEW_COLUMNS = {
  documentId: nfeAccessKeyLookups.documentId,
  id: nfeAccessKeyLookups.id,
  notBefore: nfeAccessKeyLookups.notBefore,
  reason: nfeAccessKeyLookups.reason,
  status: nfeAccessKeyLookups.status,
} as const

export class DrizzleNfeAccessKeyLookupRepository
  implements RequestAccessKeyLookupUnitOfWorkPort, AccessKeyLookupReaderPort
{
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: DrizzleAccessKeyLookupTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(new DrizzleAccessKeyLookupTransaction(transaction)),
    )
  }

  public async findById(input: {
    readonly companyId: string
    readonly lookupId: string
  }): Promise<AccessKeyLookupView | null> {
    const [row] = await this.database
      .select(VIEW_COLUMNS)
      .from(nfeAccessKeyLookups)
      .where(
        and(
          eq(nfeAccessKeyLookups.companyId, input.companyId),
          eq(nfeAccessKeyLookups.id, input.lookupId),
        ),
      )
      .limit(1)
    return row === undefined ? null : mapView(row)
  }
}

class DrizzleAccessKeyLookupTransaction implements RequestAccessKeyLookupTransactionPort {
  public constructor(private readonly transaction: Transaction) {}

  public async attachImport(input: AttachLookupImportParams): Promise<void> {
    await this.transaction
      .update(nfeAccessKeyLookups)
      .set({ importId: input.importId, updatedAt: new Date() })
      .where(
        and(
          eq(nfeAccessKeyLookups.companyId, input.companyId),
          eq(nfeAccessKeyLookups.id, input.lookupId),
        ),
      )
  }

  /** O índice único parcial decide a corrida: `do nothing` devolve vazio a quem perdeu. */
  public async claimLookup(input: ClaimAccessKeyLookupParams): Promise<string | null> {
    const [row] = await this.transaction
      .insert(nfeAccessKeyLookups)
      .values({
        accessKey: input.accessKey,
        companyId: input.companyId,
        correlationId: input.correlationId,
        environment: input.environment,
        requestedByUserId: input.requestedByUserId,
        status: 'queued',
      })
      .onConflictDoNothing()
      .returning({ id: nfeAccessKeyLookups.id })
    return row?.id ?? null
  }

  public async createImport(input: CreateLookupImportParams): Promise<string> {
    const [row] = await this.transaction
      .insert(nfeImports)
      .values({
        companyId: input.companyId,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        requestedByUserId: input.requestedByUserId,
        source: 'access_key',
        status: 'queued',
        triggeredBy: 'user',
      })
      .returning({ id: nfeImports.id })
    if (row === undefined) throw new Error('Access key lookup import was not persisted')
    return row.id
  }

  public async findActiveLookup(
    input: AccessKeyLookupLocator,
  ): Promise<AccessKeyLookupView | null> {
    const [row] = await this.transaction
      .select(VIEW_COLUMNS)
      .from(nfeAccessKeyLookups)
      .where(
        and(...locatorConditions(input), inArray(nfeAccessKeyLookups.status, [...ACTIVE_STATUSES])),
      )
      .limit(1)
    return row === undefined ? null : mapView(row)
  }

  public async findDocumentId(input: {
    readonly accessKey: string
    readonly companyId: string
  }): Promise<string | null> {
    const [row] = await this.transaction
      .select({ id: nfeDocuments.id })
      .from(nfeDocuments)
      .where(
        and(
          eq(nfeDocuments.companyId, input.companyId),
          eq(nfeDocuments.accessKey, input.accessKey),
        ),
      )
      .limit(1)
    return row?.id ?? null
  }

  public async findRecentRefusal(
    input: AccessKeyLookupLocator & { readonly finishedAfter: Date },
  ): Promise<AccessKeyLookupView | null> {
    const [row] = await this.transaction
      .select(VIEW_COLUMNS)
      .from(nfeAccessKeyLookups)
      .where(
        and(
          ...locatorConditions(input),
          eq(nfeAccessKeyLookups.status, 'refused'),
          inArray(nfeAccessKeyLookups.reason, [...DEFINITIVE_REFUSAL_REASONS]),
          gt(nfeAccessKeyLookups.finishedAt, input.finishedAfter),
        ),
      )
      .orderBy(desc(nfeAccessKeyLookups.finishedAt))
      .limit(1)
    return row === undefined ? null : mapView(row)
  }

  public async readFiscalEnvironment(input: {
    readonly companyId: string
  }): Promise<NfeFiscalEnvironment | null> {
    const [row] = await this.transaction
      .select({ environment: companyFiscalProfiles.environment })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)
    return row?.environment ?? null
  }

  public async saveOutbox(input: AccessKeyLookupOutboxParams): Promise<void> {
    await this.transaction
      .insert(processingOutbox)
      .values({ ...input, eventVersion: BigInt(input.eventVersion), triggeredBy: 'user' })
  }
}

function locatorConditions(input: AccessKeyLookupLocator) {
  return [
    eq(nfeAccessKeyLookups.companyId, input.companyId),
    eq(nfeAccessKeyLookups.environment, input.environment),
    eq(nfeAccessKeyLookups.accessKey, input.accessKey),
  ]
}

function mapView(row: {
  readonly documentId: string | null
  readonly id: string
  readonly notBefore: Date | null
  readonly reason: AccessKeyLookupView['reason']
  readonly status: AccessKeyLookupView['status']
}): AccessKeyLookupView {
  return {
    documentId: row.documentId,
    id: row.id,
    notBefore: row.notBefore?.toISOString() ?? null,
    reason: row.reason,
    status: row.status,
  }
}
