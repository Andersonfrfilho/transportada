/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 RF7 (ADR-0106): quem escolhe um modelo `occurrence` — tipos de ocorrência (ativos ou inativos) e
 * exceções de contratante. Lido depois do `FOR UPDATE` no modelo, então uma gravação concorrente que o
 * escolhe já terminou (ou espera, e então falha ao ver o modelo arquivado).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, sql } from 'drizzle-orm'

import { contractors } from '../../database/delivery-client.schema.js'
import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypes,
} from '../../database/trip.schema.js'
import { ContractorMailTemplateInUseError } from '../domain/contractor-mail-template.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function assertOccurrenceMailTemplateIsUnused(
  transaction: Transaction,
  params: { readonly companyId: string; readonly templateId: string },
): Promise<void> {
  const [types, exceptions] = await Promise.all([
    transaction
      .select({ name: companyOccurrenceTypes.name })
      .from(companyOccurrenceTypes)
      .where(
        and(
          eq(companyOccurrenceTypes.companyId, params.companyId),
          eq(companyOccurrenceTypes.contractorMailTemplateId, params.templateId),
        ),
      )
      .orderBy(asc(companyOccurrenceTypes.name)),
    transaction
      .select({
        contractorName: sql<string>`coalesce(nullif(btrim(${contractors.displayName}), ''), ${contractors.taxId})`,
        occurrenceTypeName: companyOccurrenceTypes.name,
      })
      .from(companyOccurrenceTypeContractorOverrides)
      .innerJoin(
        companyOccurrenceTypes,
        and(
          eq(companyOccurrenceTypes.companyId, companyOccurrenceTypeContractorOverrides.companyId),
          eq(companyOccurrenceTypes.id, companyOccurrenceTypeContractorOverrides.occurrenceTypeId),
        ),
      )
      .innerJoin(
        contractors,
        and(
          eq(contractors.companyId, companyOccurrenceTypeContractorOverrides.companyId),
          eq(contractors.id, companyOccurrenceTypeContractorOverrides.contractorId),
        ),
      )
      .where(
        and(
          eq(companyOccurrenceTypeContractorOverrides.companyId, params.companyId),
          eq(companyOccurrenceTypeContractorOverrides.contractorMailTemplateId, params.templateId),
        ),
      )
      .orderBy(asc(companyOccurrenceTypes.name), asc(contractors.displayName)),
  ])
  if (types.length === 0 && exceptions.length === 0) return
  throw new ContractorMailTemplateInUseError({
    contractorExceptions: exceptions,
    occurrenceTypeNames: types.map((type) => type.name),
  })
}
