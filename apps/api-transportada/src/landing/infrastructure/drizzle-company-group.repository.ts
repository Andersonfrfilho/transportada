/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { resolveCompanyDisplayName } from '../../companies/domain/company-display-name.policy.js'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, like } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/database.schema.js'
import { resolveCompanyGroupRoot } from '../../shared/tax-id.service.js'
import type { CompanyGroupRepositoryPort } from '../application/company-group.port.js'
import { orderGroupUnits } from '../domain/company-group.policy.js'

export type CompanyGroupDatabase = ReturnType<typeof createDrizzleProvider>['db']

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
          displayNameMode: companyFiscalProfiles.displayNameMode,
          district: companyFiscalProfiles.district,
          number: companyFiscalProfiles.number,
          phone: companyFiscalProfiles.phone,
          postalCode: companyFiscalProfiles.postalCode,
          state: companyFiscalProfiles.state,
          street: companyFiscalProfiles.street,
          legalName: companyFiscalProfiles.legalName,
          tradeName: companyFiscalProfiles.tradeName,
        })
        .from(companyFiscalProfiles)
        .where(like(companyFiscalProfiles.cnpj, `${root}%`))

      return orderGroupUnits(
        rows.map(({ displayNameMode, legalName, ...unit }) => ({
          ...unit,
          displayName: resolveCompanyDisplayName({
            displayNameMode,
            legalName,
            tradeName: unit.tradeName,
          }),
        })),
      )
    },
  }
}
