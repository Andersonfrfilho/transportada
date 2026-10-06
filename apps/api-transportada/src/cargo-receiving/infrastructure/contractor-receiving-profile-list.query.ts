/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M4): os perfis da empresa numa consulta só, em ordem de id do
 * contratante — o painel deixa de ler o perfil de cada contratante para saber quem está ligado.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt, type SQL } from 'drizzle-orm'

import { contractorReceivingProfiles } from '../../database/contractor-receiving-profile.schema.js'
import type {
  ContractorReceivingProfilePage,
  ListContractorReceivingProfilesRecordParams,
} from '../application/contractor-receiving-profile.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function buildReceivingProfileListFilters(
  params: ListContractorReceivingProfilesRecordParams,
): SQL[] {
  const filters: (SQL | undefined)[] = [
    eq(contractorReceivingProfiles.companyId, params.companyId),
    params.enabled === undefined
      ? undefined
      : eq(contractorReceivingProfiles.isEnabled, params.enabled),
    params.paging.cursor === null
      ? undefined
      : gt(contractorReceivingProfiles.contractorId, params.paging.cursor),
  ]
  return filters.filter((filter): filter is SQL => filter !== undefined)
}

export async function selectReceivingProfilePage(
  database: Database,
  params: ListContractorReceivingProfilesRecordParams,
): Promise<ContractorReceivingProfilePage> {
  const rows = await database
    .select({
      contractorId: contractorReceivingProfiles.contractorId,
      isEnabled: contractorReceivingProfiles.isEnabled,
      previewEnabled: contractorReceivingProfiles.previewEnabled,
    })
    .from(contractorReceivingProfiles)
    .where(and(...buildReceivingProfileListFilters(params)))
    .orderBy(asc(contractorReceivingProfiles.contractorId))
    .limit(params.paging.limit + 1)
  const items = rows.slice(0, params.paging.limit)
  const last = items.at(-1)
  return {
    items,
    nextCursor: rows.length > params.paging.limit && last !== undefined ? last.contractorId : null,
  }
}
