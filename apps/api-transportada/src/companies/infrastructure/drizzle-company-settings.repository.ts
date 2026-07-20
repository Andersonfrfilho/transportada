/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import { auditLogs, idempotencyRecords } from '../../database/database.schema.js'
import type {
  CompanySettingsAuditRecord,
  CompanySettingsIdempotencyRecord,
  CompanySettingsReaderPort,
  CompanySettingsResult,
  CompanySettingsTransactionPort,
  CompanySettingsUnitOfWorkPort,
} from '../application/company-settings.port.js'
import {
  deserializeCompanySettingsResponse,
  findCompanySettings,
  serializeCompanySettingsResponse,
} from './drizzle-company-settings.mapper.js'
import { saveCompanySettings } from './drizzle-company-settings.mutation.js'
import {
  acquireCompanySettingsLock,
  acquireIdempotencyLock,
} from './drizzle-company-settings.support.js'
import type {
  CompanySettingsDatabase,
  CompanySettingsTransaction,
} from './drizzle-company-settings.types.js'

export class DrizzleCompanySettingsRepository
  implements CompanySettingsReaderPort, CompanySettingsUnitOfWorkPort
{
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public findByCompanyId(input: {
    readonly companyId: string
  }): Promise<CompanySettingsResult | null> {
    return findCompanySettings(this.database, input.companyId)
  }

  public execute<TResult>(
    operation: (transaction: CompanySettingsTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(new DrizzleCompanySettingsTransaction(transaction)),
    )
  }
}

class DrizzleCompanySettingsTransaction implements CompanySettingsTransactionPort {
  public constructor(private readonly transaction: CompanySettingsTransaction) {}

  public async appendAudit(record: CompanySettingsAuditRecord): Promise<void> {
    await this.transaction.insert(auditLogs).values({
      action: record.action,
      actorUserId: record.actorUserId,
      afterSnapshot: record.afterSnapshot,
      beforeSnapshot: record.beforeSnapshot,
      companyId: record.companyId,
      correlationId: record.correlationId,
      entityId: record.entityId,
      entityType: record.entityType,
    })
  }

  public async findByCompanyId(input: {
    readonly companyId: string
  }): Promise<CompanySettingsResult | null> {
    await acquireCompanySettingsLock(this.transaction, input.companyId)
    return await findCompanySettings(this.transaction, input.companyId)
  }

  public async findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<CompanySettingsIdempotencyRecord | null> {
    await acquireIdempotencyLock(this.transaction, [
      input.companyId,
      input.operation,
      input.idempotencyKey,
    ])
    const [record] = await this.transaction
      .select({
        fingerprint: idempotencyRecords.requestFingerprint,
        response: idempotencyRecords.response,
      })
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.companyId, input.companyId),
          eq(idempotencyRecords.operation, input.operation),
          eq(idempotencyRecords.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
    if (record === undefined) return null
    return {
      companyId: input.companyId,
      fingerprint: record.fingerprint,
      idempotencyKey: input.idempotencyKey,
      operation: input.operation,
      response: deserializeCompanySettingsResponse(record.response),
    }
  }

  public async saveIdempotency(record: CompanySettingsIdempotencyRecord): Promise<void> {
    await this.transaction.insert(idempotencyRecords).values({
      companyId: record.companyId,
      idempotencyKey: record.idempotencyKey,
      operation: record.operation,
      requestFingerprint: record.fingerprint,
      response: serializeCompanySettingsResponse(record.response),
      status: 'succeeded',
    })
  }

  public saveSettings(input: {
    readonly companyId: string
    readonly settings: Parameters<CompanySettingsTransactionPort['saveSettings']>[0]['settings']
  }): Promise<CompanySettingsResult> {
    return saveCompanySettings(this.transaction, input)
  }
}
