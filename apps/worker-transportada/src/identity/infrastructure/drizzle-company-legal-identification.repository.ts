/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { companyFiscalProfiles } from '../../database/invitation-delivery.schema.js'
import type {
  CompanyLegalIdentification,
  CompanyLegalIdentificationPort,
} from '../application/company-legal-identification.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCompanyLegalIdentificationRepository implements CompanyLegalIdentificationPort {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  /**
   * Empresa sem cadastro fiscal ainda é ausência, não erro: o rodapé fica sem a identificação legal
   * e o e-mail sai. Um código de acesso não espera cadastro para chegar.
   */
  async find(params: {
    readonly companyId: string
  }): Promise<CompanyLegalIdentification | undefined> {
    const [row] = await this.#database
      .select({
        city: companyFiscalProfiles.city,
        complement: companyFiscalProfiles.complement,
        district: companyFiscalProfiles.district,
        email: companyFiscalProfiles.email,
        phone: companyFiscalProfiles.phone,
        legalName: companyFiscalProfiles.legalName,
        number: companyFiscalProfiles.number,
        postalCode: companyFiscalProfiles.postalCode,
        state: companyFiscalProfiles.state,
        street: companyFiscalProfiles.street,
        taxId: companyFiscalProfiles.cnpj,
      })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, params.companyId))
      .limit(1)

    return row
  }
}
