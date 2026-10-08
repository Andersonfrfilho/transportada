/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt, ilike } from 'drizzle-orm'

import { contractors } from '../../database/delivery-client.schema.js'
import type {
  Contractor,
  ContractorListFilters,
  ContractorPage,
  ContractorRepositoryPort,
  ContractorWriteInput,
} from '../application/contractor.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type ContractorRow = typeof contractors.$inferSelect

export class DrizzleContractorRepository implements ContractorRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async create(input: {
    readonly companyId: string
    readonly taxId: string
    readonly values: ContractorWriteInput
  }): Promise<Contractor> {
    const [created] = await this.database
      .insert(contractors)
      .values({ companyId: input.companyId, taxId: input.taxId, ...input.values })
      .returning()

    return toContractor(created as ContractorRow)
  }

  public async findById(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<Contractor | null> {
    const [row] = await this.database
      .select()
      .from(contractors)
      .where(and(eq(contractors.companyId, input.companyId), eq(contractors.id, input.id)))
      .limit(1)

    return row === undefined ? null : toContractor(row)
  }

  public async findByTaxId(input: {
    readonly companyId: string
    readonly taxId: string
  }): Promise<Contractor | null> {
    const [row] = await this.database
      .select()
      .from(contractors)
      .where(and(eq(contractors.companyId, input.companyId), eq(contractors.taxId, input.taxId)))
      .limit(1)

    return row === undefined ? null : toContractor(row)
  }

  public async list(input: {
    readonly companyId: string
    readonly filters: ContractorListFilters
  }): Promise<ContractorPage> {
    const { filters } = input
    const rows = await this.database
      .select()
      .from(contractors)
      .where(
        and(
          eq(contractors.companyId, input.companyId),
          ...(filters.cursor === undefined ? [] : [gt(contractors.id, filters.cursor)]),
          ...(filters.status === undefined ? [] : [eq(contractors.status, filters.status)]),
          ...(filters.nameContains === undefined
            ? []
            : [ilike(contractors.displayName, `%${filters.nameContains}%`)]),
        ),
      )
      .orderBy(asc(contractors.id))
      .limit(filters.limit + 1)

    const page = rows.slice(0, filters.limit)

    return {
      items: page.map(toContractor),
      nextCursor: rows.length > filters.limit ? (page.at(-1)?.id ?? null) : null,
    }
  }

  public async update(input: {
    readonly companyId: string
    readonly id: string
    readonly values: ContractorWriteInput
  }): Promise<Contractor | null> {
    const [updated] = await this.database
      .update(contractors)
      .set({ ...input.values, updatedAt: new Date() })
      .where(and(eq(contractors.companyId, input.companyId), eq(contractors.id, input.id)))
      .returning()

    return updated === undefined ? null : toContractor(updated)
  }
}

function toContractor(row: ContractorRow): Contractor {
  return {
    closingPeriod: row.closingPeriod,
    displayName: row.displayName,
    id: row.id,
    notes: row.notes,
    reportEmail: row.reportEmail,
    status: row.status,
    taxId: row.taxId,
  }
}
