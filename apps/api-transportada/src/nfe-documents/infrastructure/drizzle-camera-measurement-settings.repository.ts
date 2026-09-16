/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { companyCargoSettings } from '../../database/company-cargo-settings.schema.js'
import type { CameraMeasurementSettingsPort } from '../application/camera-measurement-settings.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * D14: lê a coluna partilhada com `GET /company-settings/cargo` (`companies` module) direto no
 * schema — sem importar o repositório de `companies`, que é `settings.manage`. É o mesmo dado, dois
 * consumidores com permissões diferentes.
 */
export class DrizzleCameraMeasurementSettingsRepository implements CameraMeasurementSettingsPort {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async readEnabled(input: { readonly companyId: string }): Promise<boolean> {
    const [row] = await this.#database
      .select({ cameraMeasurementEnabled: companyCargoSettings.cameraMeasurementEnabled })
      .from(companyCargoSettings)
      .where(eq(companyCargoSettings.companyId, input.companyId))
      .limit(1)

    return row?.cameraMeasurementEnabled ?? false
  }
}
