/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import {
  auditLogs,
  companyFiscalProfiles,
  idempotencyRecords,
} from '../../database/database.schema.js'
import type {
  DigitalCertificateAuditRecord,
  DigitalCertificateCursor,
  DigitalCertificateIdempotencyLookup,
  DigitalCertificateIdempotencyRecord,
  DigitalCertificateMetadata,
  DigitalCertificateRepositoryPort,
  DigitalCertificateTransactionPort,
} from '../application/digital-certificate.port.js'
import {
  deserializeDigitalCertificateResponse,
  serializeDigitalCertificateResponse,
} from './drizzle-digital-certificate.mapper.js'
import { replaceDigitalCertificate } from './drizzle-digital-certificate.persistence.js'
import { listDigitalCertificates } from './drizzle-digital-certificate-listing.service.js'
import type {
  DigitalCertificateDatabase,
  DigitalCertificateQueryable,
  DigitalCertificateTransaction,
} from './drizzle-digital-certificate.types.js'
import { acquireIdempotencyLock } from './drizzle-company-settings.support.js'

export class DrizzleDigitalCertificateRepository implements DigitalCertificateRepositoryPort {
  public constructor(private readonly database: DigitalCertificateDatabase) {}

  public execute<TResult>(
    operation: (transaction: DigitalCertificateTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(new DrizzleDigitalCertificateTransaction(transaction)),
    )
  }

  public async findCompanyProfile(input: {
    readonly companyId: string
  }): Promise<{ readonly cnpj: string } | null> {
    return await findCompanyProfile({ companyId: input.companyId, database: this.database })
  }

  public findIdempotency(
    input: DigitalCertificateIdempotencyLookup,
  ): Promise<DigitalCertificateIdempotencyRecord | null> {
    return findIdempotency({ database: this.database, lookup: input })
  }

  public async list(input: {
    readonly companyId: string
    readonly cursor?: DigitalCertificateCursor
    readonly limit: number
  }): Promise<{
    readonly items: readonly DigitalCertificateMetadata[]
    readonly nextCursor?: DigitalCertificateCursor
  }> {
    return await listDigitalCertificates({ ...input, database: this.database })
  }
}

class DrizzleDigitalCertificateTransaction implements DigitalCertificateTransactionPort {
  public constructor(private readonly transaction: DigitalCertificateTransaction) {}

  public async appendAudit(record: DigitalCertificateAuditRecord): Promise<void> {
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

  public async findIdempotency(
    input: DigitalCertificateIdempotencyLookup,
  ): Promise<DigitalCertificateIdempotencyRecord | null> {
    await acquireIdempotencyLock(this.transaction, [
      input.companyId,
      input.operation,
      input.idempotencyKey,
    ])
    return await findIdempotency({ database: this.transaction, lookup: input })
  }

  public async lockCompanyProfile(input: {
    readonly companyId: string
  }): Promise<{ readonly cnpj: string } | null> {
    return await findCompanyProfile({
      companyId: input.companyId,
      database: this.transaction,
      shouldLock: true,
    })
  }

  public replaceCertificate(
    input: Parameters<DigitalCertificateTransactionPort['replaceCertificate']>[0],
  ): ReturnType<DigitalCertificateTransactionPort['replaceCertificate']> {
    return replaceDigitalCertificate({ certificate: input, transaction: this.transaction })
  }

  public async saveIdempotency(record: DigitalCertificateIdempotencyRecord): Promise<void> {
    await this.transaction.insert(idempotencyRecords).values({
      companyId: record.companyId,
      idempotencyKey: record.idempotencyKey,
      operation: record.operation,
      requestFingerprint: record.fingerprint,
      response: serializeDigitalCertificateResponse(record.response),
      status: 'succeeded',
    })
  }
}

async function findCompanyProfile(input: {
  readonly companyId: string
  readonly database: DigitalCertificateQueryable
  readonly shouldLock?: boolean
}): Promise<{ readonly cnpj: string } | null> {
  const query = input.database
    .select({ cnpj: companyFiscalProfiles.cnpj })
    .from(companyFiscalProfiles)
    .where(eq(companyFiscalProfiles.companyId, input.companyId))
    .limit(1)
  const [profile] = input.shouldLock === true ? await query.for('update') : await query
  return profile ?? null
}

async function findIdempotency(input: {
  readonly database: DigitalCertificateQueryable
  readonly lookup: DigitalCertificateIdempotencyLookup
}): Promise<DigitalCertificateIdempotencyRecord | null> {
  const [record] = await input.database
    .select({
      fingerprint: idempotencyRecords.requestFingerprint,
      response: idempotencyRecords.response,
    })
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.companyId, input.lookup.companyId),
        eq(idempotencyRecords.operation, input.lookup.operation),
        eq(idempotencyRecords.idempotencyKey, input.lookup.idempotencyKey),
      ),
    )
    .limit(1)
  if (record === undefined) return null
  return {
    ...input.lookup,
    fingerprint: record.fingerprint,
    response: deserializeDigitalCertificateResponse(record.response),
  }
}
