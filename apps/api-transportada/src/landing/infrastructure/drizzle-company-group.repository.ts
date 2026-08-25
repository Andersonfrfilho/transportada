/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, like } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/database.schema.js'
import { resolveCompanyGroupRoot } from '../../shared/tax-id.service.js'
import { orderGroupUnits, type CompanyGroupUnit } from '../domain/company-group.policy.js'

export type CompanyGroupDatabase = ReturnType<typeof createDrizzleProvider>['db']

export type CompanyGroupRepositoryPort = Readonly<{
  listGroupUnits: (input: { readonly companyId: string }) => Promise<readonly CompanyGroupUnit[]>
}>

export function createDrizzleCompanyGroupRepository(
  database: CompanyGroupDatabase,
): CompanyGroupRepositoryPort {
  return {
    async listGroupUnits({ companyId }) {
      const [own] = await database
        .select({ cnpj: companyFiscalProfiles.cnpj })
        .from(companyFiscalProfiles)
        .where(eq(companyFiscalProfiles.companyId, companyId))
        .limit(1)

      if (!own) {
        return []
      }

      const root = resolveCompanyGroupRoot(own.cnpj)
      const rows = await database
        .select({
          city: companyFiscalProfiles.city,
          cnpj: companyFiscalProfiles.cnpj,
          companyId: companyFiscalProfiles.companyId,
          complement: companyFiscalProfiles.complement,
          district: companyFiscalProfiles.district,
          number: companyFiscalProfiles.number,
          phone: companyFiscalProfiles.phone,
          postalCode: companyFiscalProfiles.postalCode,
          state: companyFiscalProfiles.state,
          street: companyFiscalProfiles.street,
          tradeName: companyFiscalProfiles.tradeName,
        })
        .from(companyFiscalProfiles)
        .where(like(companyFiscalProfiles.cnpj, `${root}%`))

      return orderGroupUnits(rows)
    },
  }
}
