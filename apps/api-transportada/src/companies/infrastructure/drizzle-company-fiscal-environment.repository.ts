/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq } from 'drizzle-orm'

import type { FiscalEnvironment } from '../../database/company-fiscal-profile.schema.js'
import { companyFiscalProfiles } from '../../database/database.schema.js'
import type { CompanyFiscalEnvironmentPort } from '../application/company-fiscal-environment.port.js'
import type { CompanySettingsDatabase } from './drizzle-company-settings.types.js'

export class DrizzleCompanyFiscalEnvironmentRepository implements CompanyFiscalEnvironmentPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async readEnvironment(input: {
    readonly companyId: string
  }): Promise<FiscalEnvironment | null> {
    const [row] = await this.database
      .select({ environment: companyFiscalProfiles.environment })
      .from(companyFiscalProfiles)
      .where(eq(companyFiscalProfiles.companyId, input.companyId))
      .limit(1)

    return row?.environment ?? null
  }
}
