/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1: semeia o que a rotina do worker deixaria no banco — a entrada do cache global do
 * fornecedor e a linha da empresa que aponta para ela (feriado importado) —, para provar o que as rotas
 * da gestão fazem sobre ela. Em série, como o resto do calendário.
 */
import { and, asc, eq } from 'drizzle-orm'

import {
  holidayImportSuppressions,
  holidayProviderEntries,
  municipalHolidays,
  stateHolidays,
} from '../../src/database/database.schema.js'
import type { TestDatabase, Tenant } from './business-calendar-database.fixture.js'

export type SeedProviderEntryParams = {
  readonly holidayOn: string
  readonly ibgeCode: string
  readonly name?: string
  readonly removedAt?: Date
  readonly scope: 'city' | 'state'
}

export async function seedProviderEntry(
  database: TestDatabase,
  params: SeedProviderEntryParams,
): Promise<string> {
  const [entry] = await database.db
    .insert(holidayProviderEntries)
    .values({
      holidayOn: params.holidayOn,
      ibgeCode: params.ibgeCode,
      name: params.name ?? 'Feriado do fornecedor',
      providerType: params.scope === 'city' ? 'MUNICIPAL' : 'ESTADUAL',
      scope: params.scope,
      ...(params.removedAt === undefined ? {} : { removedAt: params.removedAt }),
    })
    .returning({ id: holidayProviderEntries.id })
  if (entry === undefined) throw new Error('provider entry was not inserted')
  return entry.id
}

export type SeedImportedHolidayParams = {
  readonly holidayOn: string
  readonly ibgeCode: string
  readonly name?: string
  readonly removedAt?: Date
}

/** A linha municipal importada: entrada do cache (cidade, mesmo dia) e a linha da empresa apontando para ela. */
export async function seedImportedMunicipalHoliday(
  database: TestDatabase,
  tenant: Tenant,
  params: SeedImportedHolidayParams,
) {
  const name = params.name ?? 'Aniversário (fornecedor)'
  const providerEntryId = await seedProviderEntry(database, {
    holidayOn: params.holidayOn,
    ibgeCode: params.ibgeCode,
    name,
    scope: 'city',
    ...(params.removedAt === undefined ? {} : { removedAt: params.removedAt }),
  })
  const [row] = await database.db
    .insert(municipalHolidays)
    .values({
      cityIbgeCode: params.ibgeCode,
      companyId: tenant.companyId,
      holidayOn: params.holidayOn,
      name,
      providerEntryId,
    })
    .returning()
  if (row === undefined) throw new Error('imported municipal holiday was not inserted')
  return row
}

/** A estadual importada é sempre `once` (D6): a UF no lugar da cidade. */
export async function seedImportedStateHoliday(
  database: TestDatabase,
  tenant: Tenant,
  params: SeedImportedHolidayParams,
) {
  const name = params.name ?? 'Data estadual (fornecedor)'
  const providerEntryId = await seedProviderEntry(database, {
    holidayOn: params.holidayOn,
    ibgeCode: params.ibgeCode,
    name,
    scope: 'state',
    ...(params.removedAt === undefined ? {} : { removedAt: params.removedAt }),
  })
  const [row] = await database.db
    .insert(stateHolidays)
    .values({
      companyId: tenant.companyId,
      holidayOn: params.holidayOn,
      name,
      providerEntryId,
      recurrence: 'once',
      stateIbgeCode: params.ibgeCode,
    })
    .returning()
  if (row === undefined) throw new Error('imported state holiday was not inserted')
  return row
}

export function readSuppressions(database: TestDatabase, companyId: string) {
  return database.db
    .select()
    .from(holidayImportSuppressions)
    .where(eq(holidayImportSuppressions.companyId, companyId))
    .orderBy(asc(holidayImportSuppressions.holidayOn), asc(holidayImportSuppressions.ibgeCode))
}

export async function findStateHolidayRow(
  database: TestDatabase,
  params: {
    readonly companyId: string
    readonly holidayOn: string
    readonly stateIbgeCode: string
  },
) {
  const [row] = await database.db
    .select()
    .from(stateHolidays)
    .where(
      and(
        eq(stateHolidays.companyId, params.companyId),
        eq(stateHolidays.stateIbgeCode, params.stateIbgeCode),
        eq(stateHolidays.holidayOn, params.holidayOn),
      ),
    )
  return row
}
