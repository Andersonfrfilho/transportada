/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, type SQL } from 'drizzle-orm'

import { contractorReceivingProfiles } from '../../database/contractor-receiving-profile.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type { ContractorReceivingProfileRepositoryPort } from '../application/contractor-receiving-profile.port.js'
import type {
  ContractorReceivingProfile,
  ContractorReceivingProfileLookup,
  ContractorReceivingProfilePage,
  ContractorReceivingProfileRules,
  FindContractorReceivingProfileParams,
  ListContractorReceivingProfilesRecordParams,
  SaveContractorReceivingProfileRecordParams,
} from '../application/contractor-receiving-profile.types.js'
import { selectReceivingProfilePage } from './contractor-receiving-profile-list.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type ProfileRow = typeof contractorReceivingProfiles.$inferSelect

const AUDIT_ACTION = 'contractor-receiving-profile.saved'
const AUDIT_ENTITY_TYPE = 'contractor-receiving-profile'
const AUDIT_PERMISSION = 'settings.manage'
const AUDIT_TARGET_TYPE = 'contractor'
const PERCENT_DECIMALS = 2

export function buildReceivingProfileContractorFilters(
  params: FindContractorReceivingProfileParams,
): SQL[] {
  return [eq(contractors.companyId, params.companyId), eq(contractors.id, params.contractorId)]
}

export function buildReceivingProfileFilters(params: FindContractorReceivingProfileParams): SQL[] {
  return [
    eq(contractorReceivingProfiles.companyId, params.companyId),
    eq(contractorReceivingProfiles.contractorId, params.contractorId),
  ]
}

export class DrizzleContractorReceivingProfileRepository
  implements ContractorReceivingProfileRepositoryPort
{
  public constructor(private readonly database: Database) {}

  public list(
    params: ListContractorReceivingProfilesRecordParams,
  ): Promise<ContractorReceivingProfilePage> {
    return selectReceivingProfilePage(this.database, params)
  }

  public async find(
    params: FindContractorReceivingProfileParams,
  ): Promise<ContractorReceivingProfileLookup> {
    const [row] = await this.database
      .select({ profile: contractorReceivingProfiles })
      .from(contractors)
      .leftJoin(contractorReceivingProfiles, and(...buildReceivingProfileFilters(params)))
      .where(and(...buildReceivingProfileContractorFilters(params)))
      .limit(1)

    if (row === undefined) return { isContractorFound: false }
    return {
      isContractorFound: true,
      profile: row.profile === null ? null : toProfile(row.profile),
    }
  }

  /**
   * O contratante é travado com `for no key update`: serializa dois `PUT` do mesmo perfil (a trilha
   * compara com o que estava gravado) sem bloquear quem só cria FK para `contractors`.
   */
  public async save(
    params: SaveContractorReceivingProfileRecordParams,
  ): Promise<ContractorReceivingProfile | null> {
    return this.database.transaction(async (transaction) => {
      const [contractor] = await transaction
        .select({ id: contractors.id })
        .from(contractors)
        .where(and(...buildReceivingProfileContractorFilters(params)))
        .for('no key update')
      if (contractor === undefined) return null

      const [existing] = await transaction
        .select()
        .from(contractorReceivingProfiles)
        .where(and(...buildReceivingProfileFilters(params)))
      if (
        existing !== undefined &&
        isSameRules({ requested: params.rules, stored: toRules(existing) })
      ) {
        return toProfile(existing)
      }

      const saved = await upsertProfile(transaction, params)
      await transaction.insert(auditLogs).values({
        action: AUDIT_ACTION,
        actorUserId: params.actorUserId,
        companyId: params.companyId,
        correlationId: params.correlationId,
        entityId: saved.id,
        entityType: AUDIT_ENTITY_TYPE,
        metadata: {
          after: params.rules,
          before: existing === undefined ? null : toRules(existing),
        },
        permission: AUDIT_PERMISSION,
        targetId: params.contractorId,
        targetType: AUDIT_TARGET_TYPE,
      })
      return toProfile(saved)
    })
  }
}

async function upsertProfile(
  transaction: Transaction,
  params: SaveContractorReceivingProfileRecordParams,
): Promise<ProfileRow> {
  const columns = toColumns(params.rules)
  const [row] = await transaction
    .insert(contractorReceivingProfiles)
    .values({ ...columns, companyId: params.companyId, contractorId: params.contractorId })
    .onConflictDoUpdate({
      set: { ...columns, updatedAt: new Date() },
      target: [contractorReceivingProfiles.companyId, contractorReceivingProfiles.contractorId],
    })
    .returning()

  if (row === undefined) throw new Error('CONTRACTOR_RECEIVING_PROFILE_UPSERT_RETURNED_NOTHING')
  return row
}

function toColumns(rules: ContractorReceivingProfileRules) {
  return {
    ...rules,
    weightTolerancePercent: rules.weightTolerancePercent.toFixed(PERCENT_DECIMALS),
  }
}

function toRules(row: ProfileRow): ContractorReceivingProfileRules {
  return {
    arrivalReferenceLabel: row.arrivalReferenceLabel,
    deliveryDeadlineBusinessDays: row.deliveryDeadlineBusinessDays,
    isEnabled: row.isEnabled,
    matchWindowDays: row.matchWindowDays,
    previewColumnMap: row.previewColumnMap,
    previewEnabled: row.previewEnabled,
    previewSheetName: row.previewSheetName,
    requiresDamageCheck: row.requiresDamageCheck,
    separationWindowHours: row.separationWindowHours,
    weightTolerancePercent: Number(row.weightTolerancePercent),
  }
}

function toProfile(row: ProfileRow): ContractorReceivingProfile {
  return { ...toRules(row), contractorId: row.contractorId, updatedAt: row.updatedAt.toISOString() }
}

/** O `jsonb` não guarda a ordem das chaves: compara-se a forma canônica, não o objeto. */
function isSameRules(params: {
  readonly requested: ContractorReceivingProfileRules
  readonly stored: ContractorReceivingProfileRules
}): boolean {
  return canonicalize(params.stored) === canonicalize(params.requested)
}

function canonicalize(rules: ContractorReceivingProfileRules): string {
  const columnMap =
    rules.previewColumnMap === null ? null : Object.entries(rules.previewColumnMap).sort()
  return JSON.stringify(
    Object.entries({ ...toColumns(rules), previewColumnMap: columnMap }).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}
