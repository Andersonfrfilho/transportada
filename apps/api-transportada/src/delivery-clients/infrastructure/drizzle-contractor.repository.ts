/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt, gte, ilike, lte } from 'drizzle-orm'

import { contractors, municipalHolidays } from '../../database/delivery-client.schema.js'
import type {
  Contractor,
  ContractorListFilters,
  ContractorPage,
  ContractorRepositoryPort,
  ContractorWriteInput,
  MunicipalHoliday,
  MunicipalHolidayRepositoryPort,
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

export class DrizzleMunicipalHolidayRepository implements MunicipalHolidayRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async list(input: {
    readonly cityIbgeCode?: string
    readonly companyId: string
    readonly from?: string
    readonly to?: string
  }): Promise<readonly MunicipalHoliday[]> {
    const rows = await this.database
      .select()
      .from(municipalHolidays)
      .where(
        and(
          eq(municipalHolidays.companyId, input.companyId),
          ...(input.cityIbgeCode === undefined
            ? []
            : [eq(municipalHolidays.cityIbgeCode, input.cityIbgeCode)]),
          ...(input.from === undefined ? [] : [gte(municipalHolidays.holidayOn, input.from)]),
          ...(input.to === undefined ? [] : [lte(municipalHolidays.holidayOn, input.to)]),
        ),
      )
      .orderBy(asc(municipalHolidays.holidayOn), asc(municipalHolidays.cityIbgeCode))

    return rows.map((row) => ({
      cityIbgeCode: row.cityIbgeCode,
      holidayOn: row.holidayOn,
      id: row.id,
      name: row.name,
    }))
  }

  public async remove(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<boolean> {
    const removed = await this.database
      .delete(municipalHolidays)
      .where(
        and(eq(municipalHolidays.companyId, input.companyId), eq(municipalHolidays.id, input.id)),
      )
      .returning({ id: municipalHolidays.id })

    return removed.length > 0
  }

  public async save(input: {
    readonly cityIbgeCode: string
    readonly companyId: string
    readonly holidayOn: string
    readonly name: string
  }): Promise<MunicipalHoliday> {
    /** Recadastrar o mesmo dia corrige o nome em vez de estourar unique: o operador está corrigindo. */
    const [saved] = await this.database
      .insert(municipalHolidays)
      .values(input)
      .onConflictDoUpdate({
        set: { name: input.name },
        target: [
          municipalHolidays.companyId,
          municipalHolidays.cityIbgeCode,
          municipalHolidays.holidayOn,
        ],
      })
      .returning()

    return {
      cityIbgeCode: saved!.cityIbgeCode,
      holidayOn: saved!.holidayOn,
      id: saved!.id,
      name: saved!.name,
    }
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
