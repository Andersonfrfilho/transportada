/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Semeia os parâmetros de custo da bancada pelos casos de uso do produto — diária do motorista e
 * preço do combustível —, nunca por escrita direta na tabela.
 *
 * Os dois caminhos gravam por `upsert`, então reexecutar reconcilia para o valor declarado aqui em
 * vez de duplicar ou ignorar. Semente que só cria quando falta deixa a bancada divergindo em
 * silêncio do arquivo que a descreve.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { createAdjustFuelPriceUseCase } from '../companies/application/adjust-fuel-price.use-case.js'
import { createSetDriverAllowanceSettingsUseCase } from '../companies/application/driver-allowance-settings.use-case.js'
import { DrizzleDriverAllowanceSettingsRepository } from '../companies/infrastructure/drizzle-driver-allowance-settings.repository.js'
import { DrizzleFuelPriceRepository } from '../companies/infrastructure/drizzle-fuel-price.repository.js'
import { parseEnvironment } from '../config/environment.schema.js'

import {
  LOCAL_DRIVER_DAILY_ALLOWANCE,
  LOCAL_FUEL_PRICE_PER_UNIT,
  LOCAL_FUEL_PRODUCT,
} from './local-cost-parameter-seed.constant.js'
import { LOCAL_COMPANY_ID, LOCAL_IDENTITY_USER_ID } from './local-identity-seed.constant.js'

const ALLOWED_ENVIRONMENTS = new Set(['local', 'test'])
const CORRELATION_ID = 'local-cost-parameter-seed'

export type LocalCostParameterSeedResult = {
  readonly dailyAllowance: string
  readonly fuelPricePerUnit: string
  readonly fuelProduct: string
}

type RunLocalCostParameterSeedParams = {
  readonly appEnvironment: string
  readonly environment: Record<string, string | undefined>
}

export async function runLocalCostParameterSeed({
  appEnvironment,
  environment,
}: RunLocalCostParameterSeedParams): Promise<LocalCostParameterSeedResult> {
  if (!ALLOWED_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error('Local cost parameter seed is restricted to local and test environments')
  }

  const config = parseEnvironment(environment)
  const provider = createDrizzleProvider({ connection: config.databaseUrl })

  try {
    const database = provider.db

    const allowance = createSetDriverAllowanceSettingsUseCase({
      settings: new DrizzleDriverAllowanceSettingsRepository(database),
    })
    const saved = await allowance.execute({
      amount: LOCAL_DRIVER_DAILY_ALLOWANCE,
      companyId: LOCAL_COMPANY_ID,
      correlationId: CORRELATION_ID,
      userId: LOCAL_IDENTITY_USER_ID,
    })

    const fuelPrices = createAdjustFuelPriceUseCase({
      fuelPrices: new DrizzleFuelPriceRepository(database),
    })
    const effective = await fuelPrices.execute({
      companyId: LOCAL_COMPANY_ID,
      pricePerUnit: LOCAL_FUEL_PRICE_PER_UNIT,
      product: LOCAL_FUEL_PRODUCT,
    })

    return {
      dailyAllowance: saved.amount,
      fuelPricePerUnit: effective.effectivePricePerUnit ?? LOCAL_FUEL_PRICE_PER_UNIT,
      fuelProduct: LOCAL_FUEL_PRODUCT,
    }
  } finally {
    await provider.close()
  }
}

if (import.meta.main) {
  const result = await runLocalCostParameterSeed({
    appEnvironment: process.env.APP_ENV ?? '',
    environment: process.env,
  })
  process.stdout.write(
    `cost parameters seeded: daily allowance ${result.dailyAllowance}, ` +
      `${result.fuelProduct} at ${result.fuelPricePerUnit}\n`,
  )
}
