/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, sql } from 'drizzle-orm'

import {
  companyEntryKinds,
  type CompanyEntryKindSide,
} from '../../database/trip-financial.schema.js'
import type {
  CompanyEntryKind,
  CompanyEntryKindPort,
} from '../application/company-entry-kind.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

function toView(row: {
  readonly active: boolean
  readonly displayOrder: number
  readonly id: string
  readonly name: string
  readonly side: CompanyEntryKindSide
}): CompanyEntryKind {
  return {
    active: row.active,
    displayOrder: row.displayOrder,
    id: row.id,
    name: row.name,
    side: row.side,
  }
}

export class DrizzleCompanyEntryKindRepository implements CompanyEntryKindPort {
  public constructor(private readonly database: Database) {}

  public async create(input: {
    readonly companyId: string
    readonly name: string
    readonly side: CompanyEntryKindSide
  }): Promise<CompanyEntryKind> {
    const [nextOrder] = await this.database
      .select({ value: sql<number>`coalesce(max(${companyEntryKinds.displayOrder}), 0) + 1` })
      .from(companyEntryKinds)
      .where(
        and(
          eq(companyEntryKinds.companyId, input.companyId),
          eq(companyEntryKinds.side, input.side),
        ),
      )

    const [created] = await this.database
      .insert(companyEntryKinds)
      .values({
        companyId: input.companyId,
        displayOrder: nextOrder?.value ?? 1,
        name: input.name,
        side: input.side,
      })
      .returning()

    if (created === undefined) throw new Error('company_entry_kinds insert returned no row')

    return toView(created)
  }

  public async deactivate(input: {
    readonly companyId: string
    readonly entryKindId: string
  }): Promise<CompanyEntryKind | null> {
    const [updated] = await this.database
      .update(companyEntryKinds)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(companyEntryKinds.companyId, input.companyId),
          eq(companyEntryKinds.id, input.entryKindId),
        ),
      )
      .returning()

    return updated === undefined ? null : toView(updated)
  }

  public async existsByName(input: {
    readonly companyId: string
    readonly name: string
    readonly side: CompanyEntryKindSide
  }): Promise<boolean> {
    const [row] = await this.database
      .select({ id: companyEntryKinds.id })
      .from(companyEntryKinds)
      .where(
        and(
          eq(companyEntryKinds.companyId, input.companyId),
          eq(companyEntryKinds.side, input.side),
          eq(companyEntryKinds.name, input.name),
        ),
      )
      .limit(1)

    return row !== undefined
  }

  public async listActiveBySide(input: {
    readonly companyId: string
    readonly side: CompanyEntryKindSide
  }): Promise<readonly CompanyEntryKind[]> {
    const rows = await this.database
      .select()
      .from(companyEntryKinds)
      .where(
        and(
          eq(companyEntryKinds.companyId, input.companyId),
          eq(companyEntryKinds.side, input.side),
          eq(companyEntryKinds.active, true),
        ),
      )
      .orderBy(asc(companyEntryKinds.displayOrder))

    return rows.map(toView)
  }

  public async listByCompany(input: {
    readonly companyId: string
  }): Promise<readonly CompanyEntryKind[]> {
    const rows = await this.database
      .select()
      .from(companyEntryKinds)
      .where(eq(companyEntryKinds.companyId, input.companyId))
      .orderBy(asc(companyEntryKinds.side), asc(companyEntryKinds.displayOrder))

    return rows.map(toView)
  }
}
