/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, gte, isNull, lt, lte, or } from 'drizzle-orm'

import {
  auditLogs,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  idempotencyRecords,
  nfeDocuments,
} from '../../database/database.schema.js'
import type {
  FreightCalculationDetail,
  FreightSimulationTransactionPort,
  FreightSimulationUnitOfWorkPort,
} from '../../freight-calculations/application/freight-simulation.use-case.js'
import type {
  FreightRuleStatus,
  FreightRuleSummary,
  FreightRulesTransactionPort,
  FreightRulesUnitOfWorkPort,
} from '../../freight-rules/application/freight-rules.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Database | Transaction
type RuleRecord = typeof freightRules.$inferSelect
type RuleVersionRecord = typeof freightRuleVersions.$inferSelect
type CalculationRecord = typeof freightCalculations.$inferSelect
type DocumentRecord = typeof nfeDocuments.$inferSelect

export class DrizzleFreightRepository implements FreightRulesUnitOfWorkPort {
  public constructor(private readonly database: Database) {}

  public execute<TResponse>(
    operation: (transaction: FreightRulesTransactionPort) => Promise<TResponse>,
  ): Promise<TResponse> {
    return this.database.transaction((transaction) =>
      operation(
        new DrizzleFreightTransaction(transaction) as unknown as FreightRulesTransactionPort,
      ),
    )
  }
}

export class DrizzleFreightSimulationRepository implements FreightSimulationUnitOfWorkPort {
  public constructor(private readonly database: Database) {}

  public execute<TResponse>(
    operation: (transaction: FreightSimulationTransactionPort) => Promise<TResponse>,
  ): Promise<TResponse> {
    return this.database.transaction((transaction) =>
      operation(
        new DrizzleFreightTransaction(transaction) as unknown as FreightSimulationTransactionPort,
      ),
    )
  }
}

export class DrizzleFreightRuleListRepository {
  public constructor(private readonly database: Database) {}

  public list(input: {
    readonly context: { readonly companyId: string }
    readonly cursor: string | null
    readonly limit: number
  }): Promise<{
    readonly items: readonly FreightRuleSummary[]
    readonly nextCursor: string | null
  }> {
    return listRules(this.database, {
      companyId: input.context.companyId,
      cursor: input.cursor,
      limit: input.limit,
    })
  }
}

export class DrizzleFreightCalculationListRepository {
  public constructor(private readonly database: Database) {}

  public list(input: {
    readonly context: { readonly companyId: string }
    readonly cursor: string | null
    readonly documentId: string
    readonly limit: number
  }): Promise<{
    readonly items: readonly FreightCalculationDetail[]
    readonly nextCursor: string | null
  }> {
    return listCalculations(this.database, {
      companyId: input.context.companyId,
      cursor: input.cursor,
      documentId: input.documentId,
      limit: input.limit,
    })
  }
}

class DrizzleFreightTransaction {
  public constructor(private readonly transaction: Transaction) {}

  public async appendAudit(input: Record<string, unknown>): Promise<void> {
    await this.transaction.insert(auditLogs).values(input as typeof auditLogs.$inferInsert)
  }

  public async createCalculation(
    input: Record<string, unknown>,
  ): Promise<FreightCalculationDetail> {
    const [record] = await this.transaction
      .insert(freightCalculations)
      .values(toCalculationInsert(input))
      .returning()
    if (record === undefined) throw new Error('FREIGHT_CALCULATION_CREATE_FAILED')
    return mapCalculation(record)
  }

  public async createRule(input: Record<string, string>): Promise<FreightRuleSummary> {
    const [record] = await this.transaction
      .insert(freightRules)
      .values({
        companyId: requiredString(input.companyId),
        createdByUserId: requiredString(input.createdByUserId),
        currentVersion: BigInt(requiredString(input.currentVersion)),
        description: requiredString(input.description),
        name: requiredString(input.name),
        priority: BigInt(requiredString(input.priority)),
        status: requiredString(input.status) as FreightRuleStatus,
        type: 'percentage_of_invoice_total',
      })
      .returning()
    if (record === undefined) throw new Error('FREIGHT_RULE_CREATE_FAILED')
    return mapRule(record)
  }

  public async createRuleVersion(input: Record<string, unknown>): Promise<{
    readonly freightRuleVersionId: string
    readonly version: string
  }> {
    const [record] = await this.transaction
      .insert(freightRuleVersions)
      .values(toRuleVersionInsert(input))
      .returning()
    if (record === undefined) throw new Error('FREIGHT_RULE_VERSION_CREATE_FAILED')
    return { freightRuleVersionId: record.id, version: record.version.toString() }
  }

  public findApplicableRule(input: {
    readonly companyId: string
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
  }): Promise<Record<string, string> | null> {
    return findApplicableVersion(this.transaction, input)
  }

  public findApplicableVersion(input: {
    readonly companyId: string
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
  }): Promise<Record<string, string> | null> {
    return findApplicableVersion(this.transaction, input)
  }

  public async findDocument(input: {
    readonly companyId: string
    readonly documentId: string
  }): ReturnType<FreightSimulationTransactionPort['findDocument']> {
    const [record] = await this.transaction
      .select()
      .from(nfeDocuments)
      .where(
        and(eq(nfeDocuments.companyId, input.companyId), eq(nfeDocuments.id, input.documentId)),
      )
      .limit(1)
    return record === undefined ? null : mapDocument(record)
  }

  public async findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<{
    readonly fingerprint: string
    readonly response: FreightCalculationDetail | FreightRuleSummary
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
      response: record.response as FreightCalculationDetail | FreightRuleSummary,
    }
  }

  public listRules(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly limit: number
  }): Promise<{
    readonly items: readonly FreightRuleSummary[]
    readonly nextCursor: string | null
  }> {
    return listRules(this.transaction, input)
  }

  public async saveIdempotency(input: Record<string, unknown>): Promise<void> {
    await this.transaction.insert(idempotencyRecords).values({
      companyId: String(input.companyId),
      idempotencyKey: String(input.idempotencyKey),
      operation: String(input.operation),
      requestFingerprint: String(input.fingerprint),
      response: input.response,
      status: 'succeeded',
    })
  }

  public async setRuleStatus(input: {
    readonly companyId: string
    readonly freightRuleId: string
    readonly nextStatus: 'active' | 'inactive'
  }): Promise<void> {
    await this.transaction
      .update(freightRules)
      .set({ status: input.nextStatus, updatedAt: new Date() })
      .where(
        and(eq(freightRules.companyId, input.companyId), eq(freightRules.id, input.freightRuleId)),
      )
  }

  public async updateCurrentVersion(input: {
    readonly companyId: string
    readonly currentVersion: string
    readonly freightRuleId: string
    readonly previousVersion: string
  }): Promise<void> {
    await this.transaction
      .update(freightRules)
      .set({ currentVersion: BigInt(input.currentVersion), updatedAt: new Date() })
      .where(
        and(
          eq(freightRules.companyId, input.companyId),
          eq(freightRules.id, input.freightRuleId),
          eq(freightRules.currentVersion, BigInt(input.previousVersion)),
        ),
      )
  }
}

async function findApplicableVersion(
  queryable: Queryable,
  input: {
    readonly companyId: string
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
  },
): Promise<Record<string, string> | null> {
  const issuedAt = new Date(input.issuedAt)
  const [record] = await queryable
    .select({ rule: freightRules, version: freightRuleVersions })
    .from(freightRuleVersions)
    .innerJoin(
      freightRules,
      and(
        eq(freightRules.companyId, freightRuleVersions.companyId),
        eq(freightRules.id, freightRuleVersions.freightRuleId),
      ),
    )
    .where(
      and(
        eq(freightRuleVersions.companyId, input.companyId),
        eq(freightRules.type, input.ruleType),
        eq(freightRules.status, 'active'),
        eq(freightRuleVersions.status, 'active'),
        lte(freightRuleVersions.validFrom, issuedAt),
        or(isNull(freightRuleVersions.validUntil), gte(freightRuleVersions.validUntil, issuedAt)),
      ),
    )
    .orderBy(desc(freightRules.priority), desc(freightRuleVersions.validFrom))
    .limit(1)
  return record === undefined ? null : mapApplicableVersion(record.version)
}

async function listRules(
  queryable: Queryable,
  input: { readonly companyId: string; readonly cursor: string | null; readonly limit: number },
): Promise<{ readonly items: readonly FreightRuleSummary[]; readonly nextCursor: string | null }> {
  const cursor = decodeCursor(input.cursor)
  const condition =
    cursor === null
      ? eq(freightRules.companyId, input.companyId)
      : and(
          eq(freightRules.companyId, input.companyId),
          or(
            lt(freightRules.createdAt, cursor.createdAt),
            and(eq(freightRules.createdAt, cursor.createdAt), lt(freightRules.id, cursor.id)),
          ),
        )
  const rows = await queryable
    .select()
    .from(freightRules)
    .where(condition)
    .orderBy(desc(freightRules.createdAt), desc(freightRules.id))
    .limit(input.limit + 1)
  const pageRows = rows.slice(0, input.limit)
  const last = pageRows.at(-1)
  return {
    items: pageRows.map(mapRule),
    nextCursor:
      rows.length > input.limit && last !== undefined
        ? `${last.createdAt.toISOString()}::${last.id}`
        : null,
  }
}

async function listCalculations(
  queryable: Queryable,
  input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly documentId: string
    readonly limit: number
  },
): Promise<{
  readonly items: readonly FreightCalculationDetail[]
  readonly nextCursor: string | null
}> {
  const cursor = decodeCursor(input.cursor)
  const baseCondition = and(
    eq(freightCalculations.companyId, input.companyId),
    eq(freightCalculations.nfeDocumentId, input.documentId),
  )
  const condition =
    cursor === null
      ? baseCondition
      : and(
          baseCondition,
          or(
            lt(freightCalculations.createdAt, cursor.createdAt),
            and(
              eq(freightCalculations.createdAt, cursor.createdAt),
              lt(freightCalculations.id, cursor.id),
            ),
          ),
        )
  const rows = await queryable
    .select()
    .from(freightCalculations)
    .where(condition)
    .orderBy(desc(freightCalculations.createdAt), desc(freightCalculations.id))
    .limit(input.limit + 1)
  const pageRows = rows.slice(0, input.limit)
  const last = pageRows.at(-1)
  return {
    items: pageRows.map(mapCalculation),
    nextCursor:
      rows.length > input.limit && last !== undefined
        ? `${last.createdAt.toISOString()}::${last.id}`
        : null,
  }
}

function decodeCursor(
  value: string | null,
): { readonly createdAt: Date; readonly id: string } | null {
  if (value === null) return null
  const separator = value.lastIndexOf('::')
  if (separator < 0) return null
  const createdAt = new Date(value.slice(0, separator))
  const id = value.slice(separator + 2)
  return Number.isNaN(createdAt.getTime()) || id.length === 0 ? null : { createdAt, id }
}

function mapApplicableVersion(record: RuleVersionRecord): Record<string, string> {
  return {
    companyId: record.companyId,
    freightRuleId: record.freightRuleId,
    freightRuleVersionId: record.id,
    maximumAmount: record.maximumAmount ?? '',
    minimumAmount: record.minimumAmount ?? '',
    percentage: record.percentage,
    validFrom: record.validFrom.toISOString(),
    validUntil: record.validUntil?.toISOString() ?? '',
    version: record.version.toString(),
  }
}

function mapCalculation(record: CalculationRecord): FreightCalculationDetail {
  return {
    adjustments: record.adjustments as FreightCalculationDetail['adjustments'],
    baseAmount: record.baseAmount,
    calculatedAmount: record.calculatedAmount,
    calculationDetails: record.calculationDetails as FreightCalculationDetail['calculationDetails'],
    companyId: record.companyId,
    correlationId: record.correlationId,
    createdAt: record.createdAt.toISOString(),
    createdByUserId: record.createdByUserId,
    freightRuleId: record.freightRuleId,
    freightRuleVersionId: record.freightRuleVersionId,
    id: record.id,
    maximumAmount: record.maximumAmount,
    minimumAmount: record.minimumAmount,
    nfeDocumentId: record.nfeDocumentId,
    percentage: record.percentage,
    ruleSnapshot: record.ruleSnapshot as FreightCalculationDetail['ruleSnapshot'],
    ruleVersion: record.ruleVersion.toString(),
    status: record.status,
    totalAmount: record.totalAmount,
    updatedAt: record.updatedAt.toISOString(),
  }
}

function mapDocument(
  record: DocumentRecord,
): NonNullable<Awaited<ReturnType<FreightSimulationTransactionPort['findDocument']>>> {
  return {
    companyId: record.companyId,
    id: record.id,
    issuedAt: record.issuedAt.toISOString(),
    status: record.status,
    totalAmount: record.totalValue,
    variant: 'complete',
  }
}

function requiredString(value: string | undefined): string {
  if (value === undefined) throw new Error('FREIGHT_REQUIRED_FIELD_MISSING')
  return value
}

function mapRule(record: RuleRecord): FreightRuleSummary {
  return {
    companyId: record.companyId,
    createdAt: record.createdAt.toISOString(),
    createdByUserId: record.createdByUserId,
    currentVersion: record.currentVersion.toString(),
    description: record.description ?? '',
    id: record.id,
    name: record.name,
    priority: record.priority.toString(),
    status: record.status,
    type: record.type,
    updatedAt: record.updatedAt.toISOString(),
  }
}

function toCalculationInsert(
  input: Record<string, unknown>,
): typeof freightCalculations.$inferInsert {
  return {
    adjustments: input.adjustments,
    baseAmount: String(input.baseAmount),
    calculatedAmount: String(input.calculatedAmount),
    calculationDetails: input.calculationDetails,
    companyId: String(input.companyId),
    correlationId: String(input.correlationId),
    createdByUserId: String(input.createdByUserId),
    freightRuleId: String(input.freightRuleId),
    freightRuleVersionId: String(input.freightRuleVersionId),
    idempotencyKey: String(input.idempotencyKey),
    maximumAmount: input.maximumAmount === null ? null : String(input.maximumAmount),
    minimumAmount: input.minimumAmount === null ? null : String(input.minimumAmount),
    nfeDocumentId: String(input.nfeDocumentId),
    percentage: String(input.percentage),
    requestFingerprint: String(input.requestFingerprint),
    ruleSnapshot: input.ruleSnapshot,
    ruleVersion: BigInt(String(input.ruleVersion)),
    status: 'snapshotted',
    totalAmount: String(input.totalAmount),
  }
}

function toRuleVersionInsert(
  input: Record<string, unknown>,
): typeof freightRuleVersions.$inferInsert {
  return {
    companyId: String(input.companyId),
    createdByUserId: String(input.createdByUserId),
    filters: input.filters ?? {},
    freightRuleId: String(input.freightRuleId),
    maximumAmount: input.maximumAmount === null ? null : String(input.maximumAmount),
    minimumAmount: input.minimumAmount === null ? null : String(input.minimumAmount),
    percentage: String(input.percentage),
    snapshot: input.snapshot,
    status: input.status as FreightRuleStatus,
    validFrom: new Date(String(input.validFrom)),
    validUntil: input.validUntil === null ? null : new Date(String(input.validUntil)),
    version: BigInt(String(input.version)),
  }
}
