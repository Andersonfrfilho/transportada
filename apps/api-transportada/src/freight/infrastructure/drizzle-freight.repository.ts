/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import {
  aliasedTable,
  and,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'

import {
  auditLogs,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  idempotencyRecords,
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
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

const emitterParticipant = aliasedTable(nfeParticipants, 'emitter_participant')
const recipientParticipant = aliasedTable(nfeParticipants, 'recipient_participant')
const recipientAddress = aliasedTable(nfeAddresses, 'recipient_address')

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
    readonly filters?: {
      readonly createdFrom?: string
      readonly createdUntil?: string
      readonly currentVersionEq?: string
      readonly currentVersionNe?: string
      readonly descriptionContains?: string
      readonly maximumAmountEq?: string
      readonly maximumAmountGt?: string
      readonly maximumAmountGte?: string
      readonly maximumAmountLt?: string
      readonly maximumAmountLte?: string
      readonly maximumAmountNe?: string
      readonly minimumAmountEq?: string
      readonly minimumAmountGt?: string
      readonly minimumAmountGte?: string
      readonly minimumAmountLt?: string
      readonly minimumAmountLte?: string
      readonly minimumAmountNe?: string
      readonly nameContains?: string
      readonly percentageEq?: string
      readonly percentageGt?: string
      readonly percentageGte?: string
      readonly percentageLt?: string
      readonly percentageLte?: string
      readonly percentageNe?: string
      readonly priorityEq?: string
      readonly priorityGt?: string
      readonly priorityGte?: string
      readonly priorityLt?: string
      readonly priorityLte?: string
      readonly priorityNe?: string
      readonly statusEq?: FreightRuleStatus
      readonly statusNe?: FreightRuleStatus
      readonly typeEq?: 'percentage_of_invoice_total'
      readonly typeNe?: 'percentage_of_invoice_total'
      readonly updatedFrom?: string
      readonly updatedUntil?: string
      readonly validFromFrom?: string
      readonly validFromUntil?: string
      readonly validUntilFrom?: string
      readonly validUntilIsNull?: boolean
      readonly validUntilUntil?: string
    }
    readonly limit: number
  }): Promise<{
    readonly items: readonly FreightRuleSummary[]
    readonly nextCursor: string | null
  }> {
    return listRules(this.database, {
      companyId: input.context.companyId,
      cursor: input.cursor,
      limit: input.limit,
      ...(input.filters === undefined ? {} : { filters: input.filters }),
    })
  }
}

export class DrizzleFreightCalculationListRepository {
  public constructor(private readonly database: Database) {}

  public list(input: {
    readonly context: { readonly companyId: string }
    readonly cursor: string | null
    readonly filters?: {
      readonly baseAmountEq?: string
      readonly baseAmountGt?: string
      readonly baseAmountGte?: string
      readonly baseAmountLt?: string
      readonly baseAmountLte?: string
      readonly baseAmountNe?: string
      readonly calculatedAmountEq?: string
      readonly calculatedAmountGt?: string
      readonly calculatedAmountGte?: string
      readonly calculatedAmountLt?: string
      readonly calculatedAmountLte?: string
      readonly calculatedAmountNe?: string
      readonly createdFrom?: string
      readonly createdUntil?: string
      readonly freightRuleIdEq?: string
      readonly freightRuleIdNe?: string
      readonly freightRuleVersionIdEq?: string
      readonly freightRuleVersionIdNe?: string
      readonly maximumAmountEq?: string
      readonly maximumAmountGt?: string
      readonly maximumAmountGte?: string
      readonly maximumAmountLt?: string
      readonly maximumAmountLte?: string
      readonly maximumAmountNe?: string
      readonly minimumAmountEq?: string
      readonly minimumAmountGt?: string
      readonly minimumAmountGte?: string
      readonly minimumAmountLt?: string
      readonly minimumAmountLte?: string
      readonly minimumAmountNe?: string
      readonly percentageEq?: string
      readonly percentageGt?: string
      readonly percentageGte?: string
      readonly percentageLt?: string
      readonly percentageLte?: string
      readonly percentageNe?: string
      readonly ruleVersionEq?: string
      readonly ruleVersionNe?: string
      readonly statusEq?: 'snapshotted' | 'rejected'
      readonly statusNe?: 'snapshotted' | 'rejected'
      readonly totalAmountEq?: string
      readonly totalAmountGt?: string
      readonly totalAmountGte?: string
      readonly totalAmountLt?: string
      readonly totalAmountLte?: string
      readonly totalAmountNe?: string
      readonly updatedFrom?: string
      readonly updatedUntil?: string
    }
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
      ...(input.filters === undefined ? {} : { filters: input.filters }),
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
    readonly destinationCityCode?: string | null
    readonly destinationState?: string | null
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
    readonly senderTaxId?: string | null
  }): Promise<Record<string, string> | null> {
    return findApplicableVersion(this.transaction, input)
  }

  public findApplicableVersion(input: {
    readonly companyId: string
    readonly destinationCityCode?: string | null
    readonly destinationState?: string | null
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
    readonly senderTaxId?: string | null
  }): Promise<Record<string, string> | null> {
    return findApplicableVersion(this.transaction, input)
  }

  public async findDocument(input: {
    readonly companyId: string
    readonly documentId: string
  }): ReturnType<FreightSimulationTransactionPort['findDocument']> {
    const [record] = await this.transaction
      .select({
        destinationCityCode: recipientAddress.cityCode,
        destinationState: recipientAddress.state,
        document: nfeDocuments,
        senderTaxId: emitterParticipant.taxId,
      })
      .from(nfeDocuments)
      .leftJoin(
        emitterParticipant,
        and(
          eq(emitterParticipant.companyId, nfeDocuments.companyId),
          eq(emitterParticipant.documentId, nfeDocuments.id),
          eq(emitterParticipant.role, 'emitter'),
        ),
      )
      .leftJoin(
        recipientParticipant,
        and(
          eq(recipientParticipant.companyId, nfeDocuments.companyId),
          eq(recipientParticipant.documentId, nfeDocuments.id),
          eq(recipientParticipant.role, 'recipient'),
        ),
      )
      .leftJoin(
        recipientAddress,
        and(
          eq(recipientAddress.companyId, recipientParticipant.companyId),
          eq(recipientAddress.participantId, recipientParticipant.id),
        ),
      )
      .where(
        and(eq(nfeDocuments.companyId, input.companyId), eq(nfeDocuments.id, input.documentId)),
      )
      .limit(1)
    if (record === undefined) return null

    return {
      ...mapDocument(record.document),
      destinationCityCode: record.destinationCityCode,
      destinationState: record.destinationState,
      senderTaxId: record.senderTaxId,
    }
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
    readonly filters?: {
      readonly createdFrom?: string
      readonly createdUntil?: string
      readonly currentVersionEq?: string
      readonly currentVersionNe?: string
      readonly descriptionContains?: string
      readonly maximumAmountEq?: string
      readonly maximumAmountGt?: string
      readonly maximumAmountGte?: string
      readonly maximumAmountLt?: string
      readonly maximumAmountLte?: string
      readonly maximumAmountNe?: string
      readonly minimumAmountEq?: string
      readonly minimumAmountGt?: string
      readonly minimumAmountGte?: string
      readonly minimumAmountLt?: string
      readonly minimumAmountLte?: string
      readonly minimumAmountNe?: string
      readonly nameContains?: string
      readonly percentageEq?: string
      readonly percentageGt?: string
      readonly percentageGte?: string
      readonly percentageLt?: string
      readonly percentageLte?: string
      readonly percentageNe?: string
      readonly priorityEq?: string
      readonly priorityGt?: string
      readonly priorityGte?: string
      readonly priorityLt?: string
      readonly priorityLte?: string
      readonly priorityNe?: string
      readonly statusEq?: FreightRuleStatus
      readonly statusNe?: FreightRuleStatus
      readonly typeEq?: 'percentage_of_invoice_total'
      readonly typeNe?: 'percentage_of_invoice_total'
      readonly updatedFrom?: string
      readonly updatedUntil?: string
      readonly validFromFrom?: string
      readonly validFromUntil?: string
      readonly validUntilFrom?: string
      readonly validUntilIsNull?: boolean
      readonly validUntilUntil?: string
    }
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
  }): Promise<FreightRuleSummary | null> {
    const [record] = await this.transaction
      .update(freightRules)
      .set({ status: input.nextStatus, updatedAt: new Date() })
      .where(
        and(eq(freightRules.companyId, input.companyId), eq(freightRules.id, input.freightRuleId)),
      )
      .returning()
    return record === undefined ? null : mapRule(record)
  }

  public async setVersionsStatus(input: {
    readonly companyId: string
    readonly freightRuleId: string
    readonly nextStatus: 'active' | 'inactive'
  }): Promise<void> {
    const ruleScope = and(
      eq(freightRuleVersions.companyId, input.companyId),
      eq(freightRuleVersions.freightRuleId, input.freightRuleId),
    )
    await this.transaction.update(freightRuleVersions).set({ status: 'inactive' }).where(ruleScope)
    if (input.nextStatus !== 'active') return

    const [rule] = await this.transaction
      .select({ currentVersion: freightRules.currentVersion })
      .from(freightRules)
      .where(
        and(eq(freightRules.companyId, input.companyId), eq(freightRules.id, input.freightRuleId)),
      )
      .limit(1)
    if (rule === undefined) return

    await this.transaction
      .update(freightRuleVersions)
      .set({ status: 'active' })
      .where(and(ruleScope, eq(freightRuleVersions.version, rule.currentVersion)))
  }

  public async updateCurrentVersion(input: {
    readonly companyId: string
    readonly currentVersion: string
    readonly freightRuleId: string
    readonly previousVersion: string
  }): Promise<FreightRuleSummary | null> {
    const [record] = await this.transaction
      .update(freightRules)
      .set({ currentVersion: BigInt(input.currentVersion), updatedAt: new Date() })
      .where(
        and(
          eq(freightRules.companyId, input.companyId),
          eq(freightRules.id, input.freightRuleId),
          eq(freightRules.currentVersion, BigInt(input.previousVersion)),
        ),
      )
      .returning()
    return record === undefined ? null : mapRule(record)
  }
}

async function findApplicableVersion(
  queryable: Queryable,
  input: {
    readonly companyId: string
    readonly destinationCityCode?: string | null
    readonly destinationState?: string | null
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
    readonly senderTaxId?: string | null
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
        versionSelectorMatches('destinationCityCodes', input.destinationCityCode),
        versionSelectorMatches('destinationStates', input.destinationState),
        versionSelectorMatches('senderTaxIds', input.senderTaxId),
      ),
    )
    /**
     * Spec 065 D6: quem decide entre duas regras que casam é a **prioridade da regra**, e não a
     * especificidade do filtro. É explícito e previsível — a regra de Ribeirão vence a geral porque
     * alguém a colocou acima, não porque o sistema adivinhou. Ranquear por especificidade faria duas
     * regras trocarem de lugar sozinhas no dia em que alguém acrescentasse um filtro a uma delas.
     */
    .orderBy(desc(freightRules.priority), desc(freightRuleVersions.validFrom))
    .limit(1)
  return record === undefined ? null : mapApplicableVersion(record.version)
}

function versionSelectorMatches(selector: string, value: string | null | undefined): SQL {
  const unrestricted = sql`(not jsonb_exists(${freightRuleVersions.filters}, ${selector}) or jsonb_array_length(${freightRuleVersions.filters} -> ${selector}) = 0)`
  if (value === null || value === undefined || value.length === 0) return unrestricted

  return sql`(${unrestricted} or jsonb_exists(${freightRuleVersions.filters} -> ${selector}, ${value.toUpperCase()}))`
}

async function listRules(
  queryable: Queryable,
  input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: {
      readonly createdFrom?: string
      readonly createdUntil?: string
      readonly currentVersionEq?: string
      readonly currentVersionNe?: string
      readonly descriptionContains?: string
      readonly maximumAmountEq?: string
      readonly maximumAmountGt?: string
      readonly maximumAmountGte?: string
      readonly maximumAmountLt?: string
      readonly maximumAmountLte?: string
      readonly maximumAmountNe?: string
      readonly minimumAmountEq?: string
      readonly minimumAmountGt?: string
      readonly minimumAmountGte?: string
      readonly minimumAmountLt?: string
      readonly minimumAmountLte?: string
      readonly minimumAmountNe?: string
      readonly nameContains?: string
      readonly percentageEq?: string
      readonly percentageGt?: string
      readonly percentageGte?: string
      readonly percentageLt?: string
      readonly percentageLte?: string
      readonly percentageNe?: string
      readonly priorityEq?: string
      readonly priorityGt?: string
      readonly priorityGte?: string
      readonly priorityLt?: string
      readonly priorityLte?: string
      readonly priorityNe?: string
      readonly statusEq?: FreightRuleStatus
      readonly statusNe?: FreightRuleStatus
      readonly typeEq?: 'percentage_of_invoice_total'
      readonly typeNe?: 'percentage_of_invoice_total'
      readonly updatedFrom?: string
      readonly updatedUntil?: string
      readonly validFromFrom?: string
      readonly validFromUntil?: string
      readonly validUntilFrom?: string
      readonly validUntilIsNull?: boolean
      readonly validUntilUntil?: string
    }
    readonly limit: number
  },
): Promise<{ readonly items: readonly FreightRuleSummary[]; readonly nextCursor: string | null }> {
  const cursor = decodeCursor(input.cursor)
  const condition = and(
    eq(freightRules.companyId, input.companyId),
    cursor === null
      ? undefined
      : or(
          lt(freightRules.createdAt, cursor.createdAt),
          and(eq(freightRules.createdAt, cursor.createdAt), lt(freightRules.id, cursor.id)),
        ),
    createRuleListFilters(input.filters),
  )
  const rows = await queryable
    .select()
    .from(freightRules)
    .innerJoin(
      freightRuleVersions,
      and(
        eq(freightRuleVersions.companyId, freightRules.companyId),
        eq(freightRuleVersions.freightRuleId, freightRules.id),
        eq(freightRuleVersions.version, freightRules.currentVersion),
      ),
    )
    .where(condition)
    .orderBy(desc(freightRules.createdAt), desc(freightRules.id))
    .limit(input.limit + 1)
  const pageRows = rows.slice(0, input.limit)
  const last = pageRows.at(-1)?.freight_rules
  return {
    items: pageRows.map((row) => mapRule(row.freight_rules)),
    nextCursor:
      rows.length > input.limit && last !== undefined
        ? `${last.createdAt.toISOString()}::${last.id}`
        : null,
  }
}

function createRuleListFilters(
  input:
    | {
        readonly createdFrom?: string
        readonly createdUntil?: string
        readonly currentVersionEq?: string
        readonly currentVersionNe?: string
        readonly descriptionContains?: string
        readonly maximumAmountEq?: string
        readonly maximumAmountGt?: string
        readonly maximumAmountGte?: string
        readonly maximumAmountLt?: string
        readonly maximumAmountLte?: string
        readonly maximumAmountNe?: string
        readonly minimumAmountEq?: string
        readonly minimumAmountGt?: string
        readonly minimumAmountGte?: string
        readonly minimumAmountLt?: string
        readonly minimumAmountLte?: string
        readonly minimumAmountNe?: string
        readonly nameContains?: string
        readonly percentageEq?: string
        readonly percentageGt?: string
        readonly percentageGte?: string
        readonly percentageLt?: string
        readonly percentageLte?: string
        readonly percentageNe?: string
        readonly priorityEq?: string
        readonly priorityGt?: string
        readonly priorityGte?: string
        readonly priorityLt?: string
        readonly priorityLte?: string
        readonly priorityNe?: string
        readonly statusEq?: FreightRuleStatus
        readonly statusNe?: FreightRuleStatus
        readonly typeEq?: 'percentage_of_invoice_total'
        readonly typeNe?: 'percentage_of_invoice_total'
        readonly updatedFrom?: string
        readonly updatedUntil?: string
        readonly validFromFrom?: string
        readonly validFromUntil?: string
        readonly validUntilFrom?: string
        readonly validUntilIsNull?: boolean
        readonly validUntilUntil?: string
      }
    | undefined,
) {
  if (input === undefined) return undefined

  return and(
    input.createdFrom === undefined
      ? undefined
      : gte(freightRules.createdAt, new Date(input.createdFrom)),
    input.createdUntil === undefined
      ? undefined
      : lte(freightRules.createdAt, new Date(input.createdUntil)),
    input.currentVersionEq === undefined
      ? undefined
      : eq(freightRules.currentVersion, BigInt(input.currentVersionEq)),
    input.currentVersionNe === undefined
      ? undefined
      : ne(freightRules.currentVersion, BigInt(input.currentVersionNe)),
    input.descriptionContains === undefined
      ? undefined
      : ilike(freightRules.description, `%${input.descriptionContains}%`),
    input.maximumAmountEq === undefined
      ? undefined
      : eq(freightRuleVersions.maximumAmount, input.maximumAmountEq),
    input.maximumAmountGt === undefined
      ? undefined
      : sql`${freightRuleVersions.maximumAmount} > ${input.maximumAmountGt}`,
    input.maximumAmountGte === undefined
      ? undefined
      : sql`${freightRuleVersions.maximumAmount} >= ${input.maximumAmountGte}`,
    input.maximumAmountLt === undefined
      ? undefined
      : sql`${freightRuleVersions.maximumAmount} < ${input.maximumAmountLt}`,
    input.maximumAmountLte === undefined
      ? undefined
      : sql`${freightRuleVersions.maximumAmount} <= ${input.maximumAmountLte}`,
    input.maximumAmountNe === undefined
      ? undefined
      : ne(freightRuleVersions.maximumAmount, input.maximumAmountNe),
    input.minimumAmountEq === undefined
      ? undefined
      : eq(freightRuleVersions.minimumAmount, input.minimumAmountEq),
    input.minimumAmountGt === undefined
      ? undefined
      : sql`${freightRuleVersions.minimumAmount} > ${input.minimumAmountGt}`,
    input.minimumAmountGte === undefined
      ? undefined
      : sql`${freightRuleVersions.minimumAmount} >= ${input.minimumAmountGte}`,
    input.minimumAmountLt === undefined
      ? undefined
      : sql`${freightRuleVersions.minimumAmount} < ${input.minimumAmountLt}`,
    input.minimumAmountLte === undefined
      ? undefined
      : sql`${freightRuleVersions.minimumAmount} <= ${input.minimumAmountLte}`,
    input.minimumAmountNe === undefined
      ? undefined
      : ne(freightRuleVersions.minimumAmount, input.minimumAmountNe),
    input.nameContains === undefined
      ? undefined
      : ilike(freightRules.name, `%${input.nameContains}%`),
    input.percentageEq === undefined
      ? undefined
      : eq(freightRuleVersions.percentage, input.percentageEq),
    input.percentageGt === undefined
      ? undefined
      : sql`${freightRuleVersions.percentage} > ${input.percentageGt}`,
    input.percentageGte === undefined
      ? undefined
      : sql`${freightRuleVersions.percentage} >= ${input.percentageGte}`,
    input.percentageLt === undefined
      ? undefined
      : sql`${freightRuleVersions.percentage} < ${input.percentageLt}`,
    input.percentageLte === undefined
      ? undefined
      : sql`${freightRuleVersions.percentage} <= ${input.percentageLte}`,
    input.percentageNe === undefined
      ? undefined
      : ne(freightRuleVersions.percentage, input.percentageNe),
    input.priorityEq === undefined
      ? undefined
      : eq(freightRules.priority, BigInt(input.priorityEq)),
    input.priorityGt === undefined
      ? undefined
      : sql`${freightRules.priority} > ${BigInt(input.priorityGt)}`,
    input.priorityGte === undefined
      ? undefined
      : sql`${freightRules.priority} >= ${BigInt(input.priorityGte)}`,
    input.priorityLt === undefined
      ? undefined
      : sql`${freightRules.priority} < ${BigInt(input.priorityLt)}`,
    input.priorityLte === undefined
      ? undefined
      : sql`${freightRules.priority} <= ${BigInt(input.priorityLte)}`,
    input.priorityNe === undefined
      ? undefined
      : ne(freightRules.priority, BigInt(input.priorityNe)),
    input.statusEq === undefined ? undefined : eq(freightRules.status, input.statusEq),
    input.statusNe === undefined ? undefined : ne(freightRules.status, input.statusNe),
    input.typeEq === undefined ? undefined : eq(freightRules.type, input.typeEq),
    input.typeNe === undefined ? undefined : ne(freightRules.type, input.typeNe),
    input.updatedFrom === undefined
      ? undefined
      : gte(freightRules.updatedAt, new Date(input.updatedFrom)),
    input.updatedUntil === undefined
      ? undefined
      : lte(freightRules.updatedAt, new Date(input.updatedUntil)),
    input.validFromFrom === undefined
      ? undefined
      : gte(freightRuleVersions.validFrom, new Date(input.validFromFrom)),
    input.validFromUntil === undefined
      ? undefined
      : lte(freightRuleVersions.validFrom, new Date(input.validFromUntil)),
    input.validUntilFrom === undefined
      ? undefined
      : gte(freightRuleVersions.validUntil, new Date(input.validUntilFrom)),
    input.validUntilIsNull === undefined
      ? undefined
      : input.validUntilIsNull
        ? isNull(freightRuleVersions.validUntil)
        : sql`${freightRuleVersions.validUntil} is not null`,
    input.validUntilUntil === undefined
      ? undefined
      : lte(freightRuleVersions.validUntil, new Date(input.validUntilUntil)),
  )
}

async function listCalculations(
  queryable: Queryable,
  input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly documentId: string
    readonly filters?: {
      readonly baseAmountEq?: string
      readonly baseAmountGt?: string
      readonly baseAmountGte?: string
      readonly baseAmountLt?: string
      readonly baseAmountLte?: string
      readonly baseAmountNe?: string
      readonly calculatedAmountEq?: string
      readonly calculatedAmountGt?: string
      readonly calculatedAmountGte?: string
      readonly calculatedAmountLt?: string
      readonly calculatedAmountLte?: string
      readonly calculatedAmountNe?: string
      readonly createdFrom?: string
      readonly createdUntil?: string
      readonly freightRuleIdEq?: string
      readonly freightRuleIdNe?: string
      readonly freightRuleVersionIdEq?: string
      readonly freightRuleVersionIdNe?: string
      readonly maximumAmountEq?: string
      readonly maximumAmountGt?: string
      readonly maximumAmountGte?: string
      readonly maximumAmountLt?: string
      readonly maximumAmountLte?: string
      readonly maximumAmountNe?: string
      readonly minimumAmountEq?: string
      readonly minimumAmountGt?: string
      readonly minimumAmountGte?: string
      readonly minimumAmountLt?: string
      readonly minimumAmountLte?: string
      readonly minimumAmountNe?: string
      readonly percentageEq?: string
      readonly percentageGt?: string
      readonly percentageGte?: string
      readonly percentageLt?: string
      readonly percentageLte?: string
      readonly percentageNe?: string
      readonly ruleVersionEq?: string
      readonly ruleVersionNe?: string
      readonly statusEq?: 'snapshotted' | 'rejected'
      readonly statusNe?: 'snapshotted' | 'rejected'
      readonly totalAmountEq?: string
      readonly totalAmountGt?: string
      readonly totalAmountGte?: string
      readonly totalAmountLt?: string
      readonly totalAmountLte?: string
      readonly totalAmountNe?: string
      readonly updatedFrom?: string
      readonly updatedUntil?: string
    }
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
      ? and(baseCondition, createCalculationListFilters(input.filters))
      : and(
          baseCondition,
          createCalculationListFilters(input.filters),
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

function createCalculationListFilters(
  input:
    | {
        readonly baseAmountEq?: string
        readonly baseAmountGt?: string
        readonly baseAmountGte?: string
        readonly baseAmountLt?: string
        readonly baseAmountLte?: string
        readonly baseAmountNe?: string
        readonly calculatedAmountEq?: string
        readonly calculatedAmountGt?: string
        readonly calculatedAmountGte?: string
        readonly calculatedAmountLt?: string
        readonly calculatedAmountLte?: string
        readonly calculatedAmountNe?: string
        readonly createdFrom?: string
        readonly createdUntil?: string
        readonly freightRuleIdEq?: string
        readonly freightRuleIdNe?: string
        readonly freightRuleVersionIdEq?: string
        readonly freightRuleVersionIdNe?: string
        readonly maximumAmountEq?: string
        readonly maximumAmountGt?: string
        readonly maximumAmountGte?: string
        readonly maximumAmountLt?: string
        readonly maximumAmountLte?: string
        readonly maximumAmountNe?: string
        readonly minimumAmountEq?: string
        readonly minimumAmountGt?: string
        readonly minimumAmountGte?: string
        readonly minimumAmountLt?: string
        readonly minimumAmountLte?: string
        readonly minimumAmountNe?: string
        readonly percentageEq?: string
        readonly percentageGt?: string
        readonly percentageGte?: string
        readonly percentageLt?: string
        readonly percentageLte?: string
        readonly percentageNe?: string
        readonly ruleVersionEq?: string
        readonly ruleVersionNe?: string
        readonly statusEq?: 'snapshotted' | 'rejected'
        readonly statusNe?: 'snapshotted' | 'rejected'
        readonly totalAmountEq?: string
        readonly totalAmountGt?: string
        readonly totalAmountGte?: string
        readonly totalAmountLt?: string
        readonly totalAmountLte?: string
        readonly totalAmountNe?: string
        readonly updatedFrom?: string
        readonly updatedUntil?: string
      }
    | undefined,
) {
  if (input === undefined) return undefined

  return and(
    input.baseAmountEq === undefined
      ? undefined
      : eq(freightCalculations.baseAmount, input.baseAmountEq),
    input.baseAmountGt === undefined
      ? undefined
      : sql`${freightCalculations.baseAmount} > ${input.baseAmountGt}`,
    input.baseAmountGte === undefined
      ? undefined
      : sql`${freightCalculations.baseAmount} >= ${input.baseAmountGte}`,
    input.baseAmountLt === undefined
      ? undefined
      : sql`${freightCalculations.baseAmount} < ${input.baseAmountLt}`,
    input.baseAmountLte === undefined
      ? undefined
      : sql`${freightCalculations.baseAmount} <= ${input.baseAmountLte}`,
    input.baseAmountNe === undefined
      ? undefined
      : ne(freightCalculations.baseAmount, input.baseAmountNe),
    input.calculatedAmountEq === undefined
      ? undefined
      : eq(freightCalculations.calculatedAmount, input.calculatedAmountEq),
    input.calculatedAmountGt === undefined
      ? undefined
      : sql`${freightCalculations.calculatedAmount} > ${input.calculatedAmountGt}`,
    input.calculatedAmountGte === undefined
      ? undefined
      : sql`${freightCalculations.calculatedAmount} >= ${input.calculatedAmountGte}`,
    input.calculatedAmountLt === undefined
      ? undefined
      : sql`${freightCalculations.calculatedAmount} < ${input.calculatedAmountLt}`,
    input.calculatedAmountLte === undefined
      ? undefined
      : sql`${freightCalculations.calculatedAmount} <= ${input.calculatedAmountLte}`,
    input.calculatedAmountNe === undefined
      ? undefined
      : ne(freightCalculations.calculatedAmount, input.calculatedAmountNe),
    input.createdFrom === undefined
      ? undefined
      : gte(freightCalculations.createdAt, new Date(input.createdFrom)),
    input.createdUntil === undefined
      ? undefined
      : lte(freightCalculations.createdAt, new Date(input.createdUntil)),
    input.freightRuleIdEq === undefined
      ? undefined
      : eq(freightCalculations.freightRuleId, input.freightRuleIdEq),
    input.freightRuleIdNe === undefined
      ? undefined
      : ne(freightCalculations.freightRuleId, input.freightRuleIdNe),
    input.freightRuleVersionIdEq === undefined
      ? undefined
      : eq(freightCalculations.freightRuleVersionId, input.freightRuleVersionIdEq),
    input.freightRuleVersionIdNe === undefined
      ? undefined
      : ne(freightCalculations.freightRuleVersionId, input.freightRuleVersionIdNe),
    input.maximumAmountEq === undefined
      ? undefined
      : eq(freightCalculations.maximumAmount, input.maximumAmountEq),
    input.maximumAmountGt === undefined
      ? undefined
      : sql`${freightCalculations.maximumAmount} > ${input.maximumAmountGt}`,
    input.maximumAmountGte === undefined
      ? undefined
      : sql`${freightCalculations.maximumAmount} >= ${input.maximumAmountGte}`,
    input.maximumAmountLt === undefined
      ? undefined
      : sql`${freightCalculations.maximumAmount} < ${input.maximumAmountLt}`,
    input.maximumAmountLte === undefined
      ? undefined
      : sql`${freightCalculations.maximumAmount} <= ${input.maximumAmountLte}`,
    input.maximumAmountNe === undefined
      ? undefined
      : ne(freightCalculations.maximumAmount, input.maximumAmountNe),
    input.minimumAmountEq === undefined
      ? undefined
      : eq(freightCalculations.minimumAmount, input.minimumAmountEq),
    input.minimumAmountGt === undefined
      ? undefined
      : sql`${freightCalculations.minimumAmount} > ${input.minimumAmountGt}`,
    input.minimumAmountGte === undefined
      ? undefined
      : sql`${freightCalculations.minimumAmount} >= ${input.minimumAmountGte}`,
    input.minimumAmountLt === undefined
      ? undefined
      : sql`${freightCalculations.minimumAmount} < ${input.minimumAmountLt}`,
    input.minimumAmountLte === undefined
      ? undefined
      : sql`${freightCalculations.minimumAmount} <= ${input.minimumAmountLte}`,
    input.minimumAmountNe === undefined
      ? undefined
      : ne(freightCalculations.minimumAmount, input.minimumAmountNe),
    input.percentageEq === undefined
      ? undefined
      : eq(freightCalculations.percentage, input.percentageEq),
    input.percentageGt === undefined
      ? undefined
      : sql`${freightCalculations.percentage} > ${input.percentageGt}`,
    input.percentageGte === undefined
      ? undefined
      : sql`${freightCalculations.percentage} >= ${input.percentageGte}`,
    input.percentageLt === undefined
      ? undefined
      : sql`${freightCalculations.percentage} < ${input.percentageLt}`,
    input.percentageLte === undefined
      ? undefined
      : sql`${freightCalculations.percentage} <= ${input.percentageLte}`,
    input.percentageNe === undefined
      ? undefined
      : ne(freightCalculations.percentage, input.percentageNe),
    input.ruleVersionEq === undefined
      ? undefined
      : eq(freightCalculations.ruleVersion, BigInt(input.ruleVersionEq)),
    input.ruleVersionNe === undefined
      ? undefined
      : ne(freightCalculations.ruleVersion, BigInt(input.ruleVersionNe)),
    input.statusEq === undefined ? undefined : eq(freightCalculations.status, input.statusEq),
    input.statusNe === undefined ? undefined : ne(freightCalculations.status, input.statusNe),
    input.totalAmountEq === undefined
      ? undefined
      : eq(freightCalculations.totalAmount, input.totalAmountEq),
    input.totalAmountGt === undefined
      ? undefined
      : sql`${freightCalculations.totalAmount} > ${input.totalAmountGt}`,
    input.totalAmountGte === undefined
      ? undefined
      : sql`${freightCalculations.totalAmount} >= ${input.totalAmountGte}`,
    input.totalAmountLt === undefined
      ? undefined
      : sql`${freightCalculations.totalAmount} < ${input.totalAmountLt}`,
    input.totalAmountLte === undefined
      ? undefined
      : sql`${freightCalculations.totalAmount} <= ${input.totalAmountLte}`,
    input.totalAmountNe === undefined
      ? undefined
      : ne(freightCalculations.totalAmount, input.totalAmountNe),
    input.updatedFrom === undefined
      ? undefined
      : gte(freightCalculations.updatedAt, new Date(input.updatedFrom)),
    input.updatedUntil === undefined
      ? undefined
      : lte(freightCalculations.updatedAt, new Date(input.updatedUntil)),
  )
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
