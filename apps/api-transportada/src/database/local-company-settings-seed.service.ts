/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A bancada local não tinha nenhuma configuração de custo da empresa — sem elas a conta da viagem
 * não tem diária, preço de combustível, regime fiscal nem tarifa de pedágio para descontar, e a
 * tela mostra a lacuna em vez do número. Este seeder grava, pelos casos de uso reais (nunca
 * `INSERT` bruto), toda configuração que tem porta de escrita hoje.
 *
 * `company_distribution_settings` e `company_route_optimization_settings` não têm caso de uso nem
 * repositório — só `*.schema.ts` (confirmado por grep no módulo `companies` e `routing`/`trips`
 * inteiros). Não há como semeá-las sem `INSERT` bruto, que é proibido; o `main` avisa isso no
 * stdout em vez de fingir que semeou.
 *
 * Todo `upsert`/`saveAdjustment`/`saveChoice`/`saveSettings` grava por `onConflictDoUpdate` — rodar
 * o seeder de novo reconcilia para o valor declarado aqui, e não só cria quando falta.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { parseEnvironment } from '../config/environment.schema.js'
import { createSetDriverAllowanceSettingsUseCase } from '../companies/application/driver-allowance-settings.use-case.js'
import { DrizzleDriverAllowanceSettingsRepository } from '../companies/infrastructure/drizzle-driver-allowance-settings.repository.js'
import { createAdjustFuelPriceUseCase } from '../companies/application/adjust-fuel-price.use-case.js'
import { DrizzleFuelPriceRepository } from '../companies/infrastructure/drizzle-fuel-price.repository.js'
import { createSetFederalTaxSettingsUseCase } from '../companies/application/federal-tax-settings.use-case.js'
import { DrizzleFederalTaxSettingsRepository } from '../companies/infrastructure/drizzle-federal-tax-settings.repository.js'
import { createAdjustTollBoothChargeUseCase } from '../companies/application/adjust-toll-booth-charge.use-case.js'
import { DrizzleTollBoothChargeRepository } from '../companies/infrastructure/drizzle-toll-booth-charge.repository.js'
import {
  createSetDefaultVolumeWeightUseCase,
  createSetCameraMeasurementEnabledUseCase,
} from '../companies/application/cargo-settings.use-case.js'
import { DrizzleCargoSettingsRepository } from '../companies/infrastructure/drizzle-cargo-settings.repository.js'
import { createSaveCargoVolumeFactorUseCase } from '../companies/application/cargo-volume-factor.use-case.js'
import { DrizzleCargoVolumeFactorRepository } from '../companies/infrastructure/drizzle-cargo-volume-factor.repository.js'
import { DEFAULT_CARGO_VOLUME_SPECIES } from '../companies/application/cargo-volume-factor.port.js'
import { createChooseEnergyDistributorUseCase } from '../companies/application/choose-energy-distributor.use-case.js'
import { DrizzleCompanyEnergyRepository } from '../companies/infrastructure/drizzle-company-energy.repository.js'
import { DrizzleDeliveryProofSettingsRepository } from '../trips/infrastructure/drizzle-delivery-proof-settings.repository.js'
import { DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS } from '../trips/domain/delivery-proof-settings.policy.js'
import { createDrizzleTollBoothRepository } from '../toll-booths/infrastructure/drizzle-toll-booth.repository.js'
import { createInMemoryTollBoothAxleChargeGapCache } from '../toll-booths/infrastructure/in-memory-toll-booth-axle-charge-gap-cache.js'
import { LOCAL_COMPANY_ID, LOCAL_IDENTITY_USER_ID } from './local-identity-seed.constant.js'

const ALLOWED_ENVIRONMENTS = new Set(['local', 'test'])
const CORRELATION_ID = 'local-company-settings-seed'

/**
 * R$ 200 é o valor que o operador citou como diária típica da bancada — mesmo número do padrão de
 * fábrica (`DEFAULT_DAILY_ALLOWANCE_AMOUNT`), gravado aqui como ajuste explícito da empresa para a
 * tela deixar de mostrar "diária não configurada".
 */
const LOCAL_DAILY_ALLOWANCE_AMOUNT = '200.0000'

/** Produto padrão da frota local — os seis veículos semeados por `local-trip-seed` são a diesel. */
const LOCAL_FUEL_PRODUCT = 'diesel-s10'

/**
 * Regime e alíquotas de bancada: Lucro Presumido com as alíquotas cumulativas de PIS/COFINS
 * (0,65% e 3%, Lei 9.718/1998) — o par mais comum fora do Simples, e dentro do teto de sanidade de
 * 20% que `checkFederalTaxRates` aplica.
 */
const LOCAL_FEDERAL_TAX_SETTINGS = {
  cofinsRate: '0.0300',
  federalRegime: 'presumed' as const,
  pisRate: '0.0065',
}

/** Peso padrão por volume: convenção de bancada (25 kg), só usada quando a NF-e não declara peso. */
const LOCAL_DEFAULT_VOLUME_WEIGHT = '25.0000'

/** Fator de cubagem padrão (spec 075): 1 m³ por unidade, convenção de bancada sem espécie declarada. */
const LOCAL_CARGO_VOLUME_FACTOR = {
  species: DEFAULT_CARGO_VOLUME_SPECIES,
  volumePerUnitM3: '1.0000',
}

/**
 * Distribuidora e fator de ajuste de bancada — CEMIG-D é a primeira distribuidora com referência
 * ANEEL vigente encontrada na coleta local; o fator 1.0000 é o padrão do domínio
 * (`DEFAULT_ENERGY_ADJUSTMENT_FACTOR`), sem majoração.
 */
const LOCAL_ENERGY_DISTRIBUTOR_CODE = 'CEMIG-D'
const LOCAL_ENERGY_ADJUSTMENT_FACTOR = '1.0000'

type RunLocalCompanySettingsSeedParams = {
  readonly appEnvironment: string
  readonly environment: Record<string, string | undefined>
}

export type LocalCompanySettingsSeedResult = {
  readonly seeded: readonly string[]
  readonly skipped: readonly { readonly reason: string; readonly table: string }[]
}

export async function runLocalCompanySettingsSeed({
  appEnvironment,
  environment,
}: RunLocalCompanySettingsSeedParams): Promise<LocalCompanySettingsSeedResult> {
  if (!ALLOWED_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error('Local company settings seed is restricted to local and test environments')
  }

  const config = parseEnvironment(environment)
  const provider = createDrizzleProvider({ connection: config.databaseUrl })
  const seeded: string[] = []

  try {
    const database = provider.db
    const actor = {
      companyId: LOCAL_COMPANY_ID,
      correlationId: CORRELATION_ID,
      userId: LOCAL_IDENTITY_USER_ID,
    }

    await createSetDriverAllowanceSettingsUseCase({
      settings: new DrizzleDriverAllowanceSettingsRepository(database),
    }).execute({ ...actor, amount: LOCAL_DAILY_ALLOWANCE_AMOUNT })
    seeded.push('company_driver_allowance_settings')

    const fuelPriceRepository = new DrizzleFuelPriceRepository(database)
    const facts = await fuelPriceRepository.loadFacts({ companyId: LOCAL_COMPANY_ID })
    const reference = facts.references.find(
      (row) => row.product === LOCAL_FUEL_PRODUCT && row.state === facts.state,
    )
    if (reference === undefined) {
      throw new Error(
        `No ANP reference for ${LOCAL_FUEL_PRODUCT}/${facts.state} — run the fuel reference seed first`,
      )
    }
    await createAdjustFuelPriceUseCase({ fuelPrices: fuelPriceRepository }).execute({
      companyId: LOCAL_COMPANY_ID,
      pricePerUnit: reference.pricePerUnit,
      product: LOCAL_FUEL_PRODUCT,
    })
    seeded.push('company_fuel_prices')

    await createSetFederalTaxSettingsUseCase({
      settings: new DrizzleFederalTaxSettingsRepository(database),
    }).execute({ ...actor, ...LOCAL_FEDERAL_TAX_SETTINGS })
    seeded.push('company_tax_settings')

    const tollBoothCatalog = createDrizzleTollBoothRepository(database)
    const [catalogEntry] = await tollBoothCatalog.readByNodeIds([25937851])
    if (catalogEntry === undefined) {
      throw new Error('Toll booth osmNodeId 25937851 missing from local catalog seed')
    }
    await createAdjustTollBoothChargeUseCase({
      axleChargeGapCache: createInMemoryTollBoothAxleChargeGapCache({
        clock: { now: () => new Date() },
      }),
      catalog: tollBoothCatalog,
      charges: new DrizzleTollBoothChargeRepository(database),
    }).execute({
      actorUserId: LOCAL_IDENTITY_USER_ID,
      chargeCar: catalogEntry.chargeCar,
      chargePerAxle: catalogEntry.chargePerAxle,
      chargePerAxleAutomatic: catalogEntry.chargePerAxleAutomatic,
      companyId: LOCAL_COMPANY_ID,
      observedOn: new Date().toISOString().slice(0, 10),
      osmNodeId: 25937851,
    })
    seeded.push('company_toll_booth_charges')

    const cargoSettings = new DrizzleCargoSettingsRepository(database)
    await createSetDefaultVolumeWeightUseCase({ cargoSettings }).execute({
      companyId: LOCAL_COMPANY_ID,
      defaultVolumeWeight: LOCAL_DEFAULT_VOLUME_WEIGHT,
    })
    await createSetCameraMeasurementEnabledUseCase({ cargoSettings }).execute({
      companyId: LOCAL_COMPANY_ID,
      enabled: false,
    })
    seeded.push('company_cargo_settings')

    await createSaveCargoVolumeFactorUseCase({
      factors: new DrizzleCargoVolumeFactorRepository(database),
    }).execute({ companyId: LOCAL_COMPANY_ID, ...LOCAL_CARGO_VOLUME_FACTOR })
    seeded.push('company_cargo_volume_factors')

    await createChooseEnergyDistributorUseCase({
      energy: new DrizzleCompanyEnergyRepository(database),
    }).execute({
      adjustmentFactor: LOCAL_ENERGY_ADJUSTMENT_FACTOR,
      companyId: LOCAL_COMPANY_ID,
      distributorCode: LOCAL_ENERGY_DISTRIBUTOR_CODE,
    })
    seeded.push('company_energy_settings')

    await new DrizzleDeliveryProofSettingsRepository(database).saveSettings({
      companyId: LOCAL_COMPANY_ID,
      settings: DEFAULT_COMPANY_DELIVERY_PROOF_SETTINGS,
    })
    seeded.push('company_delivery_proof_settings')

    return {
      seeded,
      skipped: [
        {
          reason: 'no use case or repository exposes a write path (schema only)',
          table: 'company_distribution_settings',
        },
        {
          reason: 'no use case or repository exposes a write path (schema only)',
          table: 'company_route_optimization_settings',
        },
      ],
    }
  } finally {
    await provider.close()
  }
}

if (import.meta.main) {
  const result = await runLocalCompanySettingsSeed({
    appEnvironment: process.env.APP_ENV ?? '',
    environment: process.env,
  })
  process.stdout.write(`company settings seed: ${result.seeded.join(', ')}\n`)
  for (const skip of result.skipped) {
    process.stdout.write(`skipped ${skip.table}: ${skip.reason}\n`)
  }
}
