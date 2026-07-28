/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, ilike, inArray, lt, max, or } from 'drizzle-orm'

import {
  auditLogs,
  cteEmissionProfileComponents,
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
  freightRules,
  freightRuleVersions,
  idempotencyRecords,
} from '../../database/database.schema.js'
import type { CteEmissionProfileStatus } from '../../database/cte-emission-profile.schema.js'
import type {
  CteEmissionProfileAuditRecord,
  CteEmissionProfileComponentInput,
  CteEmissionProfileDetail,
  CteEmissionProfileFilters,
  CteEmissionProfileFreightRuleInput,
  CteEmissionProfileMatcherInput,
  CteEmissionProfilePage,
  CteEmissionProfileSettings,
  CteEmissionProfileTransactionPort,
  CteEmissionProfilesUnitOfWorkPort,
} from '../application/cte-emission-profile.port.js'
import { mapFreightRule, mapProfile } from './cte-emission-profile.mapper.js'
import { isProfileNameConflict, NAME_TAKEN_SIGNAL } from './cte-emission-profile.support.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type ProfileRecord = typeof cteEmissionProfiles.$inferSelect

const FREIGHT_RULE_TYPE = 'percentage_of_invoice_total'
const CURSOR_SEPARATOR = '::'

export class DrizzleCteEmissionProfileRepository implements CteEmissionProfilesUnitOfWorkPort {
  public constructor(private readonly database: Database) {}

  public execute<TResponse>(
    operation: (transaction: CteEmissionProfileTransactionPort) => Promise<TResponse>,
  ): Promise<TResponse> {
    return this.database.transaction((transaction) =>
      operation(new DrizzleCteEmissionProfileTransaction(transaction)),
    )
  }
}

class DrizzleCteEmissionProfileTransaction implements CteEmissionProfileTransactionPort {
  public constructor(private readonly transaction: Transaction) {}

  public async appendAudit(record: CteEmissionProfileAuditRecord): Promise<void> {
    await this.transaction.insert(auditLogs).values({
      action: record.action,
      actorUserId: record.actorUserId,
      afterSnapshot: record.afterSnapshot,
      beforeSnapshot: record.beforeSnapshot,
      companyId: record.companyId,
      correlationId: record.correlationId,
      entityId: record.entityId,
      entityType: record.entityType,
      permission: 'settings.manage',
      targetId: record.entityId,
      targetType: record.entityType,
    })
  }

  public async createFreightRule(input: {
    readonly companyId: string
    readonly createdByUserId: string
    readonly description: string
    readonly name: string
    readonly priority: string
  }): Promise<{ readonly freightRuleId: string }> {
    const [record] = await this.transaction
      .insert(freightRules)
      .values({
        companyId: input.companyId,
        createdByUserId: input.createdByUserId,
        currentVersion: 1n,
        description: input.description,
        name: input.name,
        priority: BigInt(input.priority),
        status: 'draft',
        type: FREIGHT_RULE_TYPE,
      })
      .returning({ id: freightRules.id })
    if (record === undefined) throw new Error('CTE_PROFILE_FREIGHT_RULE_CREATE_FAILED')
    return { freightRuleId: record.id }
  }

  public async createProfile(input: {
    readonly companyId: string
    readonly createdByUserId: string
    readonly freightRule: CteEmissionProfileFreightRuleInput
    readonly freightRuleId: string
    readonly settings: CteEmissionProfileSettings
  }): Promise<CteEmissionProfileDetail> {
    const record = await this.insertProfile(input)
    return mapProfile({ components: [], freightRule: input.freightRule, matchers: [], record })
  }

  public async findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<{
    readonly fingerprint: string
    readonly response: CteEmissionProfileDetail
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
      response: record.response as CteEmissionProfileDetail,
    }
  }

  public async findProfile(input: {
    readonly companyId: string
    readonly profileId: string
  }): Promise<CteEmissionProfileDetail | null> {
    const [record] = await this.transaction
      .select()
      .from(cteEmissionProfiles)
      .where(
        and(
          eq(cteEmissionProfiles.companyId, input.companyId),
          eq(cteEmissionProfiles.id, input.profileId),
        ),
      )
      .limit(1)
    if (record === undefined) return null
    const [detail] = await this.hydrate([record])
    return detail ?? null
  }

  public async listProfiles(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: CteEmissionProfileFilters
    readonly limit: number
  }): Promise<CteEmissionProfilePage> {
    const cursor = decodeCursor(input.cursor)
    const records = await this.transaction
      .select()
      .from(cteEmissionProfiles)
      .where(
        and(
          eq(cteEmissionProfiles.companyId, input.companyId),
          cursor === null
            ? undefined
            : or(
                lt(cteEmissionProfiles.createdAt, cursor.createdAt),
                and(
                  eq(cteEmissionProfiles.createdAt, cursor.createdAt),
                  lt(cteEmissionProfiles.id, cursor.id),
                ),
              ),
          input.filters?.statusEq === undefined
            ? undefined
            : eq(cteEmissionProfiles.status, input.filters.statusEq),
          input.filters?.nameContains === undefined
            ? undefined
            : ilike(cteEmissionProfiles.name, `%${input.filters.nameContains}%`),
        ),
      )
      .orderBy(desc(cteEmissionProfiles.createdAt), desc(cteEmissionProfiles.id))
      .limit(input.limit + 1)

    const pageRecords = records.slice(0, input.limit)
    const last = pageRecords.at(-1)

    return {
      items: await this.hydrate(pageRecords),
      nextCursor:
        records.length > input.limit && last !== undefined
          ? `${last.createdAt.toISOString()}${CURSOR_SEPARATOR}${last.id}`
          : null,
    }
  }

  public async openFreightRuleVersion(input: {
    readonly companyId: string
    readonly createdByUserId: string
    readonly freightRule: CteEmissionProfileFreightRuleInput
    readonly freightRuleId: string
  }): Promise<{ readonly version: string }> {
    const [rule] = await this.transaction
      .select({ status: freightRules.status })
      .from(freightRules)
      .where(
        and(eq(freightRules.companyId, input.companyId), eq(freightRules.id, input.freightRuleId)),
      )
      .limit(1)
    if (rule === undefined) throw new Error('CTE_PROFILE_FREIGHT_RULE_NOT_FOUND')

    const [highest] = await this.transaction
      .select({ version: max(freightRuleVersions.version) })
      .from(freightRuleVersions)
      .where(
        and(
          eq(freightRuleVersions.companyId, input.companyId),
          eq(freightRuleVersions.freightRuleId, input.freightRuleId),
        ),
      )
    const version = (highest?.version ?? 0n) + 1n
    const snapshot = {
      freightRuleId: input.freightRuleId,
      maximumAmount: input.freightRule.maximumAmount,
      minimumAmount: input.freightRule.minimumAmount,
      percentage: input.freightRule.percentage,
      ruleVersion: version.toString(),
      type: FREIGHT_RULE_TYPE,
      validFrom: input.freightRule.validFrom,
      validUntil: input.freightRule.validUntil,
    }

    await this.transaction.insert(freightRuleVersions).values({
      companyId: input.companyId,
      createdByUserId: input.createdByUserId,
      filters: {},
      freightRuleId: input.freightRuleId,
      maximumAmount: input.freightRule.maximumAmount,
      minimumAmount: input.freightRule.minimumAmount,
      percentage: input.freightRule.percentage,
      snapshot,
      status: rule.status,
      validFrom: new Date(input.freightRule.validFrom),
      validUntil:
        input.freightRule.validUntil === null ? null : new Date(input.freightRule.validUntil),
      version,
    })
    await this.transaction
      .update(freightRules)
      .set({ currentVersion: version, updatedAt: new Date() })
      .where(
        and(eq(freightRules.companyId, input.companyId), eq(freightRules.id, input.freightRuleId)),
      )

    return { version: version.toString() }
  }

  public async replaceComponents(input: {
    readonly companyId: string
    readonly components: readonly CteEmissionProfileComponentInput[]
    readonly profileId: string
  }): Promise<void> {
    await this.transaction
      .delete(cteEmissionProfileComponents)
      .where(
        and(
          eq(cteEmissionProfileComponents.companyId, input.companyId),
          eq(cteEmissionProfileComponents.profileId, input.profileId),
        ),
      )
    if (input.components.length === 0) return
    await this.transaction.insert(cteEmissionProfileComponents).values(
      input.components.map((component) => ({
        amount: component.amount,
        calculationType: component.calculationType,
        companyId: input.companyId,
        label: component.label,
        ordinal: BigInt(component.ordinal),
        profileId: input.profileId,
        rate: component.rate,
        validFrom: new Date(component.validFrom),
        validUntil: component.validUntil === null ? null : new Date(component.validUntil),
      })),
    )
  }

  public async replaceMatchers(input: {
    readonly companyId: string
    readonly matchers: readonly CteEmissionProfileMatcherInput[]
    readonly profileId: string
  }): Promise<void> {
    await this.transaction
      .delete(cteEmissionProfileMatchers)
      .where(
        and(
          eq(cteEmissionProfileMatchers.companyId, input.companyId),
          eq(cteEmissionProfileMatchers.profileId, input.profileId),
        ),
      )
    if (input.matchers.length === 0) return
    await this.transaction.insert(cteEmissionProfileMatchers).values(
      input.matchers.map((matcher) => ({
        companyId: input.companyId,
        matchRole: matcher.matchRole,
        profileId: input.profileId,
        taxId: matcher.taxId,
      })),
    )
  }

  public async saveIdempotency(input: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: CteEmissionProfileDetail
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

  /** A rule only becomes applicable when its current version follows the rule status. */
  public async setFreightRuleStatus(input: {
    readonly companyId: string
    readonly freightRuleId: string
    readonly nextStatus: 'active' | 'inactive'
  }): Promise<void> {
    const [rule] = await this.transaction
      .update(freightRules)
      .set({ status: input.nextStatus, updatedAt: new Date() })
      .where(
        and(eq(freightRules.companyId, input.companyId), eq(freightRules.id, input.freightRuleId)),
      )
      .returning({ currentVersion: freightRules.currentVersion })
    if (rule === undefined) return
    await this.transaction
      .update(freightRuleVersions)
      .set({ status: input.nextStatus, updatedAt: new Date() })
      .where(
        and(
          eq(freightRuleVersions.companyId, input.companyId),
          eq(freightRuleVersions.freightRuleId, input.freightRuleId),
          eq(freightRuleVersions.version, rule.currentVersion),
        ),
      )
  }

  public async updateProfile(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly freightRule: CteEmissionProfileFreightRuleInput
    readonly profileId: string
    readonly settings: CteEmissionProfileSettings
  }): Promise<CteEmissionProfileDetail | null> {
    const record = await this.runGuarded(async () => {
      const [updated] = await this.transaction
        .update(cteEmissionProfiles)
        .set({
          ...toProfileColumns(input.settings),
          updatedAt: new Date(),
          version: BigInt(input.expectedVersion) + 1n,
        })
        .where(this.optimisticMatch(input))
        .returning()
      return updated
    })
    if (record === undefined) return null
    const [detail] = await this.hydrate([record], input.freightRule)
    return detail ?? null
  }

  public async updateProfileStatus(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly nextStatus: CteEmissionProfileStatus
    readonly profileId: string
  }): Promise<CteEmissionProfileDetail | null> {
    const [record] = await this.transaction
      .update(cteEmissionProfiles)
      .set({
        status: input.nextStatus,
        updatedAt: new Date(),
        version: BigInt(input.expectedVersion) + 1n,
      })
      .where(this.optimisticMatch(input))
      .returning()
    if (record === undefined) return null
    const [detail] = await this.hydrate([record])
    return detail ?? null
  }

  private async insertProfile(input: {
    readonly companyId: string
    readonly createdByUserId: string
    readonly freightRuleId: string
    readonly settings: CteEmissionProfileSettings
  }): Promise<ProfileRecord> {
    const record = await this.runGuarded(async () => {
      const [created] = await this.transaction
        .insert(cteEmissionProfiles)
        .values({
          ...toProfileColumns(input.settings),
          companyId: input.companyId,
          createdByUserId: input.createdByUserId,
          freightRuleId: input.freightRuleId,
          status: 'draft',
          version: 1n,
        })
        .returning()
      return created
    })
    if (record === undefined) throw new Error('CTE_PROFILE_CREATE_FAILED')
    return record
  }

  private async hydrate(
    records: readonly ProfileRecord[],
    freightRuleOverride?: CteEmissionProfileFreightRuleInput,
  ): Promise<readonly CteEmissionProfileDetail[]> {
    if (records.length === 0) return []
    const companyId = records[0]?.companyId ?? ''
    const profileIds = records.map((record) => record.id)

    const [matchers, components, freightRuleVersionRows] = await Promise.all([
      this.transaction
        .select()
        .from(cteEmissionProfileMatchers)
        .where(
          and(
            eq(cteEmissionProfileMatchers.companyId, companyId),
            inArray(cteEmissionProfileMatchers.profileId, profileIds),
          ),
        ),
      this.transaction
        .select()
        .from(cteEmissionProfileComponents)
        .where(
          and(
            eq(cteEmissionProfileComponents.companyId, companyId),
            inArray(cteEmissionProfileComponents.profileId, profileIds),
          ),
        )
        .orderBy(cteEmissionProfileComponents.ordinal),
      freightRuleOverride === undefined
        ? this.transaction
            .select({ version: freightRuleVersions })
            .from(freightRuleVersions)
            .innerJoin(
              freightRules,
              and(
                eq(freightRules.companyId, freightRuleVersions.companyId),
                eq(freightRules.id, freightRuleVersions.freightRuleId),
                eq(freightRules.currentVersion, freightRuleVersions.version),
              ),
            )
            .where(
              and(
                eq(freightRuleVersions.companyId, companyId),
                inArray(
                  freightRuleVersions.freightRuleId,
                  records.map((record) => record.freightRuleId),
                ),
              ),
            )
        : [],
    ])

    const freightRuleByRuleId = new Map(
      freightRuleVersionRows.map((row) => [row.version.freightRuleId, mapFreightRule(row.version)]),
    )

    return records.map((record) =>
      mapProfile({
        components: components.filter((component) => component.profileId === record.id),
        freightRule:
          freightRuleOverride ??
          freightRuleByRuleId.get(record.freightRuleId) ??
          EMPTY_FREIGHT_RULE,
        matchers: matchers.filter((matcher) => matcher.profileId === record.id),
        record,
      }),
    )
  }

  private optimisticMatch(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly profileId: string
  }): ReturnType<typeof and> {
    return and(
      eq(cteEmissionProfiles.companyId, input.companyId),
      eq(cteEmissionProfiles.id, input.profileId),
      eq(cteEmissionProfiles.version, BigInt(input.expectedVersion)),
    )
  }

  private async runGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
    try {
      return await operation()
    } catch (error) {
      if (isProfileNameConflict(error)) throw new Error(NAME_TAKEN_SIGNAL)
      throw error
    }
  }
}

const EMPTY_FREIGHT_RULE: CteEmissionProfileFreightRuleInput = {
  maximumAmount: null,
  minimumAmount: null,
  percentage: '0',
  validFrom: new Date(0).toISOString(),
  validUntil: null,
}

function toProfileColumns(
  settings: CteEmissionProfileSettings,
): Omit<
  typeof cteEmissionProfiles.$inferInsert,
  'companyId' | 'createdByUserId' | 'freightRuleId' | 'status' | 'version'
> {
  return {
    cargoInsuranceDeclared: settings.cargoInsuranceDeclared,
    cfopInternal: settings.cfopInternal,
    cfopInterstate: settings.cfopInterstate,
    chargeComponentLabel: settings.chargeComponentLabel,
    deliveryDays: BigInt(settings.deliveryDays),
    groupingMode: settings.groupingMode,
    icmsBaseReductionRate: settings.icmsBaseReductionRate,
    icmsCst: settings.icmsCst,
    icmsRate: settings.icmsRate,
    matchMode: settings.matchMode,
    modal: settings.modal,
    name: settings.name,
    observations: settings.observations,
    operationNature: settings.operationNature,
    pickupDetails: settings.pickupDetails,
    pickupIndicator: settings.pickupIndicator,
    predominantProductMode: settings.predominantProductMode,
    predominantProductName: settings.predominantProductName,
    priority: BigInt(settings.priority),
    receiverIeIndicator: settings.receiverIeIndicator,
    serviceType: settings.serviceType,
    taker: settings.taker,
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
