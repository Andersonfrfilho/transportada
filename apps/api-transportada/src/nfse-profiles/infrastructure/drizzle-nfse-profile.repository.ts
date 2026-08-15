/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, ilike, lt, or, sql } from 'drizzle-orm'

import {
  auditLogs,
  idempotencyRecords,
  nfseEmissionProfiles,
  nfseProviderCredentials,
} from '../../database/database.schema.js'
import type {
  NfseEmissionProfileDetail,
  NfseEmissionProfileFilters,
  NfseEmissionProfileOption,
  NfseEmissionProfilePage,
  NfseEmissionProfileSettings,
  NfseEmissionProfileStatus,
  NfseFiscalEnvironment,
  NfseProfileAuditEntry,
  NfseProfileTransactionPort,
  NfseProfileUnitOfWorkPort,
  NfseProvider,
  NfseProviderCredentialRecord,
  NfseProviderCredentialSummary,
} from '../application/nfse-profile.port.js'
import {
  mapCredentialRecord,
  mapCredentialSummary,
  mapProfile,
} from './nfse-emission-profile.mapper.js'
import { buildNfseEmissionProfileOptionFilters } from './nfse-emission-profile-options.query.js'
import { isProfileNameConflict, NFSE_PROFILE_NAME_TAKEN_SIGNAL } from './nfse-profile.support.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const AUDIT_PERMISSION = 'settings.manage'
const CURSOR_SEPARATOR = '::'

export class DrizzleNfseProfileRepository implements NfseProfileUnitOfWorkPort {
  public constructor(private readonly database: Database) {}

  public execute<TResponse>(
    operation: (transaction: NfseProfileTransactionPort) => Promise<TResponse>,
  ): Promise<TResponse> {
    return this.database.transaction((transaction) =>
      operation(new DrizzleNfseProfileTransaction(transaction)),
    )
  }
}

class DrizzleNfseProfileTransaction implements NfseProfileTransactionPort {
  public constructor(private readonly transaction: Transaction) {}

  public async appendAudit(entry: NfseProfileAuditEntry): Promise<void> {
    await this.transaction.insert(auditLogs).values({
      action: entry.action,
      actorUserId: entry.userId,
      afterSnapshot: entry.after,
      beforeSnapshot: entry.before,
      companyId: entry.companyId,
      correlationId: entry.correlationId,
      entityId: entry.targetId,
      entityType: entry.targetType,
      permission: AUDIT_PERMISSION,
      targetId: entry.targetId,
      targetType: entry.targetType,
    })
  }

  public async findCredential(input: {
    readonly companyId: string
    readonly fiscalEnvironment: NfseFiscalEnvironment
  }): Promise<NfseProviderCredentialRecord | null> {
    const record = await this.selectCredential(input)
    return record === undefined ? null : mapCredentialRecord(record)
  }

  public async findCredentialSummary(input: {
    readonly companyId: string
    readonly fiscalEnvironment: NfseFiscalEnvironment
  }): Promise<NfseProviderCredentialSummary | null> {
    const record = await this.selectCredential(input)
    return record === undefined ? null : mapCredentialSummary(record)
  }

  public async findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<{
    readonly fingerprint: string
    readonly response: NfseEmissionProfileDetail
  } | null> {
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
      fingerprint: record.fingerprint,
      response: record.response as NfseEmissionProfileDetail,
    }
  }

  public async findProfile(input: {
    readonly companyId: string
    readonly profileId: string
  }): Promise<NfseEmissionProfileDetail | null> {
    const [record] = await this.transaction
      .select()
      .from(nfseEmissionProfiles)
      .where(
        and(
          eq(nfseEmissionProfiles.companyId, input.companyId),
          eq(nfseEmissionProfiles.id, input.profileId),
        ),
      )
      .limit(1)
    return record === undefined ? null : mapProfile(record)
  }

  public async insertProfile(input: {
    readonly companyId: string
    readonly profileId: string
    readonly settings: NfseEmissionProfileSettings
    readonly userId: string
  }): Promise<NfseEmissionProfileDetail> {
    const record = await this.runGuarded(async () => {
      const [created] = await this.transaction
        .insert(nfseEmissionProfiles)
        .values({
          ...toProfileColumns(input.settings),
          companyId: input.companyId,
          createdByUserId: input.userId,
          id: input.profileId,
          status: 'draft',
          version: 1n,
        })
        .returning()
      return created
    })
    if (record === undefined) throw new Error('NFSE_PROFILE_CREATE_FAILED')
    return mapProfile(record)
  }

  public async listActiveProfileOptions(input: {
    readonly companyId: string
  }): Promise<readonly NfseEmissionProfileOption[]> {
    return this.transaction
      .select({
        descriptionTemplate: nfseEmissionProfiles.descriptionTemplate,
        id: nfseEmissionProfiles.id,
        name: nfseEmissionProfiles.name,
      })
      .from(nfseEmissionProfiles)
      .where(and(...buildNfseEmissionProfileOptionFilters({ companyId: input.companyId })))
      .orderBy(nfseEmissionProfiles.name)
  }

  public async listProfiles(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: NfseEmissionProfileFilters | undefined
    readonly limit: number
  }): Promise<NfseEmissionProfilePage> {
    const cursor = decodeCursor(input.cursor)
    const records = await this.transaction
      .select()
      .from(nfseEmissionProfiles)
      .where(
        and(
          eq(nfseEmissionProfiles.companyId, input.companyId),
          cursor === null
            ? undefined
            : or(
                lt(nfseEmissionProfiles.createdAt, cursor.createdAt),
                and(
                  eq(nfseEmissionProfiles.createdAt, cursor.createdAt),
                  lt(nfseEmissionProfiles.id, cursor.id),
                ),
              ),
          input.filters?.statusEq === undefined
            ? undefined
            : eq(nfseEmissionProfiles.status, input.filters.statusEq),
          input.filters?.nameContains === undefined
            ? undefined
            : ilike(nfseEmissionProfiles.name, `%${input.filters.nameContains}%`),
        ),
      )
      .orderBy(desc(nfseEmissionProfiles.createdAt), desc(nfseEmissionProfiles.id))
      .limit(input.limit + 1)

    const pageRecords = records.slice(0, input.limit)
    const last = pageRecords.at(-1)

    return {
      items: pageRecords.map(mapProfile),
      nextCursor:
        records.length > input.limit && last !== undefined
          ? `${last.createdAt.toISOString()}${CURSOR_SEPARATOR}${last.id}`
          : null,
    }
  }

  public async saveIdempotency(input: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: NfseEmissionProfileDetail
  }): Promise<void> {
    await this.transaction.insert(idempotencyRecords).values({
      companyId: input.companyId,
      idempotencyKey: input.idempotencyKey,
      operation: input.operation,
      requestFingerprint: input.fingerprint,
      response: input.response,
      status: 'succeeded',
    })
  }

  public async updateProfile(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly profileId: string
    readonly settings: NfseEmissionProfileSettings
  }): Promise<NfseEmissionProfileDetail | null> {
    const record = await this.runGuarded(async () => {
      const [updated] = await this.transaction
        .update(nfseEmissionProfiles)
        .set({
          ...toProfileColumns(input.settings),
          updatedAt: new Date(),
          version: BigInt(input.expectedVersion) + 1n,
        })
        .where(this.optimisticMatch(input))
        .returning()
      return updated
    })
    return record === undefined ? null : mapProfile(record)
  }

  public async updateProfileStatus(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly profileId: string
    readonly status: NfseEmissionProfileStatus
  }): Promise<NfseEmissionProfileDetail | null> {
    const [record] = await this.transaction
      .update(nfseEmissionProfiles)
      .set({
        status: input.status,
        updatedAt: new Date(),
        version: BigInt(input.expectedVersion) + 1n,
      })
      .where(this.optimisticMatch(input))
      .returning()
    return record === undefined ? null : mapProfile(record)
  }

  /**
   * O conflito é a unicidade `(company_id, provider, fiscal_environment)`: uma credencial por
   * ambiente fiscal. Gravar de novo rotaciona o segredo no lugar, sem criar uma segunda linha que
   * disputaria qual token vale.
   */
  public async upsertCredential(input: {
    readonly callbackTokenSha256: string
    readonly companyId: string
    readonly credentialId: string
    readonly fiscalEnvironment: NfseFiscalEnvironment
    readonly municipalRegistration: string
    readonly provider: NfseProvider
    readonly secretEnvelope: NfseProviderCredentialRecord['secretEnvelope']
    readonly status: NfseProviderCredentialSummary['status']
    readonly taxId: string
  }): Promise<NfseProviderCredentialSummary> {
    const [record] = await this.transaction
      .insert(nfseProviderCredentials)
      .values({
        callbackTokenSha256: input.callbackTokenSha256,
        companyId: input.companyId,
        fiscalEnvironment: input.fiscalEnvironment,
        id: input.credentialId,
        municipalRegistration: input.municipalRegistration,
        provider: input.provider,
        secretEnvelope: input.secretEnvelope,
        status: input.status,
        taxId: input.taxId,
        version: 1n,
      })
      .onConflictDoUpdate({
        set: {
          callbackTokenSha256: input.callbackTokenSha256,
          municipalRegistration: input.municipalRegistration,
          secretEnvelope: input.secretEnvelope,
          status: input.status,
          taxId: input.taxId,
          updatedAt: new Date(),
          version: sql`${nfseProviderCredentials.version} + 1`,
        },
        target: [
          nfseProviderCredentials.companyId,
          nfseProviderCredentials.provider,
          nfseProviderCredentials.fiscalEnvironment,
        ],
      })
      .returning()
    if (record === undefined) throw new Error('NFSE_CREDENTIAL_SAVE_FAILED')
    return mapCredentialSummary(record)
  }

  private optimisticMatch(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly profileId: string
  }): ReturnType<typeof and> {
    return and(
      eq(nfseEmissionProfiles.companyId, input.companyId),
      eq(nfseEmissionProfiles.id, input.profileId),
      eq(nfseEmissionProfiles.version, BigInt(input.expectedVersion)),
    )
  }

  private async runGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation()
    } catch (error) {
      if (isProfileNameConflict(error)) throw new Error(NFSE_PROFILE_NAME_TAKEN_SIGNAL)
      throw error
    }
  }

  private async selectCredential(input: {
    readonly companyId: string
    readonly fiscalEnvironment: NfseFiscalEnvironment
  }): Promise<typeof nfseProviderCredentials.$inferSelect | undefined> {
    const [record] = await this.transaction
      .select()
      .from(nfseProviderCredentials)
      .where(
        and(
          eq(nfseProviderCredentials.companyId, input.companyId),
          eq(nfseProviderCredentials.fiscalEnvironment, input.fiscalEnvironment),
        ),
      )
      .limit(1)
    return record
  }
}

function decodeCursor(
  value: string | null,
): { readonly createdAt: Date; readonly id: string } | null {
  if (value === null) return null
  const separator = value.lastIndexOf(CURSOR_SEPARATOR)
  if (separator < 0) return null
  const createdAt = new Date(value.slice(0, separator))
  const id = value.slice(separator + CURSOR_SEPARATOR.length)
  return Number.isNaN(createdAt.getTime()) || id.length === 0 ? null : { createdAt, id }
}

function toProfileColumns(
  settings: NfseEmissionProfileSettings,
): Omit<
  typeof nfseEmissionProfiles.$inferInsert,
  'companyId' | 'createdByUserId' | 'id' | 'status' | 'version'
> {
  return {
    chargeComponentLabel: settings.chargeComponentLabel,
    cnaeCode: settings.cnaeCode,
    descriptionMaxLength: BigInt(settings.descriptionMaxLength),
    descriptionTemplate: settings.descriptionTemplate,
    freightRuleId: settings.freightRuleId,
    issExigibility: settings.issExigibility,
    issRate: settings.issRate,
    issWithheld: settings.issWithheld,
    municipalityIbgeCode: settings.municipalityIbgeCode,
    municipalityName: settings.municipalityName,
    municipalTaxationCode: settings.municipalTaxationCode,
    name: settings.name,
    nbsCode: settings.nbsCode,
    observations: settings.observations,
    serviceListItem: settings.serviceListItem,
    taker: settings.taker,
  }
}
