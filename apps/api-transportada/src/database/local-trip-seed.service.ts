/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { parseEnvironment } from '../config/environment.schema.js'
import { createIdempotencyFingerprintService } from '../companies/application/idempotency-fingerprint.service.js'
import { createUpdateCompanySettingsUseCase } from '../companies/application/update-company-settings.use-case.js'
import { DrizzleCompanySettingsRepository } from '../companies/infrastructure/drizzle-company-settings.repository.js'
import { DrizzleFuelPriceRepository } from '../companies/infrastructure/drizzle-fuel-price.repository.js'
import { createFreightRulesUseCase } from '../freight-rules/application/freight-rules.use-case.js'
import { createFleetDriverRegionsUseCase } from '../freight-regions/application/fleet-driver-regions.use-case.js'
import { createImportFreightRegionsUseCase } from '../freight-regions/application/import-freight-regions.use-case.js'
import { DrizzleFleetDriverRegionRepository } from '../freight-regions/infrastructure/drizzle-fleet-driver-region.repository.js'
import { DrizzleFreightRegionRepository } from '../freight-regions/infrastructure/drizzle-freight-region.repository.js'
import { DrizzleFreightRepository } from '../freight/infrastructure/drizzle-freight.repository.js'
import { createFleetDriverVehiclesUseCase } from '../fleet/application/fleet-driver-vehicles.use-case.js'
import { createFleetVehiclesUseCase } from '../fleet/application/fleet-vehicles.use-case.js'
import { DrizzleFleetDriverRepository } from '../fleet/infrastructure/drizzle-fleet-driver.repository.js'
import { DrizzleFleetDriverVehicleRepository } from '../fleet/infrastructure/drizzle-fleet-driver-vehicle.repository.js'
import { CompanyFuelPriceGateway } from '../fleet/infrastructure/company-fuel-price.gateway.js'
import { DrizzleFleetVehicleRepository } from '../fleet/infrastructure/drizzle-fleet-vehicle.repository.js'
import {
  LOCAL_COMPANY_ID,
  LOCAL_IDENTITY_USER_ID,
  LOCAL_MEMBERSHIP_ID,
} from './local-identity-seed.constant.js'
import { LOCAL_FISCAL_PROFILE_SETTINGS } from './local-fiscal-profile-seed.constant.js'
import { seedNfeDocuments } from './local-nfe-seed.service.js'
import {
  LOCAL_FREIGHT_REGIONS,
  LOCAL_FREIGHT_REGION_COVERAGE,
  LOCAL_FREIGHT_RULE,
  LOCAL_TRIP_SEED_DRIVER_VEHICLES,
  LOCAL_TRIP_SEED_VEHICLES,
} from './local-trip-seed.constant.js'

export type LocalTripSeedResult = {
  readonly driverRegionLinks: number
  readonly driverVehicleLinks: number
  readonly freightRegions: number
  readonly freightRuleSaved: boolean
  readonly fiscalProfileSaved: boolean
  readonly nfeBatches: number
  readonly nfeFiles: number
  readonly vehiclesCreated: number
  readonly vehiclesSkipped: number
}

type RunLocalTripSeedParams = {
  readonly appEnvironment: string
  readonly environment: Record<string, string | undefined>
}

const ALLOWED_ENVIRONMENTS = new Set(['local', 'test'])
const CORRELATION_ID = 'local-trip-seed'
const PAGE_LIMIT = 100
/**
 * Caminho padrão fora do versionamento: `tmp/` é ignorado pelo git. Ancorado na raiz do repositório
 * e não no cwd, porque a semente roda por `bun run --cwd apps/api-transportada` e um caminho
 * relativo resolveria para dentro da app.
 */
const DEFAULT_NFE_SEED_DIR = fileURLToPath(new URL('../../../../tmp/nfe-fixture', import.meta.url))

export async function runLocalTripSeed({
  appEnvironment,
  environment,
}: RunLocalTripSeedParams): Promise<LocalTripSeedResult> {
  if (!ALLOWED_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error('Local trip seed is restricted to local and test environments')
  }

  const config = parseEnvironment(environment)
  const provider = createDrizzleProvider({ connection: config.databaseUrl })

  try {
    const database = provider.db
    const vehicles = createFleetVehiclesUseCase({
      repository: new DrizzleFleetVehicleRepository({
        database,
        fuelPrices: new CompanyFuelPriceGateway(new DrizzleFuelPriceRepository(database)),
      }),
    })

    const context = { companyId: LOCAL_COMPANY_ID, userId: LOCAL_IDENTITY_USER_ID }

    /**
     * Reexecutar a semente não pode falhar por conflito de versão: `expectedVersion: null` grava o
     * perfil da constante por cima do que estiver lá, que é o certo para base descartável.
     */
    await createUpdateCompanySettingsUseCase({
      fingerprintService: createIdempotencyFingerprintService({
        key: config.cryptography.idempotencyHmacKey,
      }),
      unitOfWork: new DrizzleCompanySettingsRepository(database),
    }).execute({
      context: {
        companyId: LOCAL_COMPANY_ID,
        kind: 'company',
        membershipId: LOCAL_MEMBERSHIP_ID,
        permissions: new Set(['settings.manage'] as const),
        roles: ['company-admin'],
        userId: LOCAL_IDENTITY_USER_ID,
      },
      correlationId: CORRELATION_ID,
      idempotencyKey: `local-trip-seed-fiscal-profile-${LOCAL_COMPANY_ID}`,
      settings: LOCAL_FISCAL_PROFILE_SETTINGS,
    })
    const fiscalProfileSaved = true
    const page = await vehicles.list({ context, cursor: null, limit: PAGE_LIMIT })
    const existingByPlate = new Map(page.items.map((item) => [item.plate, item]))

    let vehiclesCreated = 0
    let vehiclesSkipped = 0

    /**
     * Reexecutar converge na constante em vez de pular: veículo já cadastrado com proprietário
     * antigo deixaria `ownedByDriver` falso para sempre, e é ele que faz o veículo do agregado vir
     * escolhido junto com o motorista.
     */
    for (const vehicle of LOCAL_TRIP_SEED_VEHICLES) {
      const existing = existingByPlate.get(vehicle.plate)
      if (existing === undefined) {
        await vehicles.create({ context, correlationId: CORRELATION_ID, vehicle })
        vehiclesCreated += 1
        continue
      }
      await vehicles.update({
        context,
        correlationId: CORRELATION_ID,
        expectedVersion: existing.version,
        status: existing.status,
        vehicle,
        vehicleId: existing.id,
      })
      vehiclesSkipped += 1
    }

    const driverVehicleLinks = await linkDriversToVehicles({ context, database })
    const { driverRegionLinks, freightRegions } = await seedFreightRegions({ context, database })
    const freightRuleSaved = await seedFreightRule({
      context,
      database,
      idempotencyHmacKey: config.cryptography.idempotencyHmacKey,
    })

    /**
     * As notas são opcionais e vêm de fora do repositório: XML fiscal é dado pessoal de terceiro e
     * não se versiona aqui — a mesma razão pela qual `deploy/staging-refresh/` não deixa o dump sair
     * do perímetro. Aponte `LOCAL_NFE_SEED_DIR` para a pasta de XML; sem ela, a semente pula.
     */
    const nfeDirectory = environment.LOCAL_NFE_SEED_DIR ?? DEFAULT_NFE_SEED_DIR
    const nfe = existsSync(nfeDirectory)
      ? await seedNfeDocuments({
          companyId: LOCAL_COMPANY_ID,
          correlationId: CORRELATION_ID,
          database,
          directory: nfeDirectory,
          environment,
          idempotencyHmacKey: config.cryptography.idempotencyHmacKey,
          membershipId: LOCAL_MEMBERSHIP_ID,
          userId: LOCAL_IDENTITY_USER_ID,
        })
      : { batches: 0, files: 0 }

    return {
      driverRegionLinks,
      driverVehicleLinks,
      freightRegions,
      freightRuleSaved,
      fiscalProfileSaved,
      nfeBatches: nfe.batches,
      nfeFiles: nfe.files,
      vehiclesCreated,
      vehiclesSkipped,
    }
  } finally {
    await provider.close()
  }
}

/**
 * O vínculo é reescrito por inteiro (`replace`), que é a semântica da rota: a semente descreve o
 * estado final, e não um incremento sobre o que já estava lá.
 */
async function linkDriversToVehicles(input: {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly database: ConstructorParameters<typeof DrizzleFleetDriverRepository>[0]
}): Promise<number> {
  const driverRepository = new DrizzleFleetDriverRepository(input.database)
  const useCase = createFleetDriverVehiclesUseCase({
    driverRepository,
    repository: new DrizzleFleetDriverVehicleRepository({
      database: input.database,
      fuelPrices: new CompanyFuelPriceGateway(new DrizzleFuelPriceRepository(input.database)),
    }),
  })

  const drivers = await driverRepository.list({
    companyId: input.context.companyId,
    cursor: null,
    limit: PAGE_LIMIT,
  })
  const vehicleRepository = new DrizzleFleetVehicleRepository({
    database: input.database,
    fuelPrices: new CompanyFuelPriceGateway(new DrizzleFuelPriceRepository(input.database)),
  })
  const vehiclePage = await vehicleRepository.list({
    companyId: input.context.companyId,
    cursor: null,
    limit: PAGE_LIMIT,
  })
  const vehicleIdByPlate = new Map(vehiclePage.items.map((item) => [item.plate, item.id]))

  let links = 0
  for (const driver of drivers.items) {
    const plates = LOCAL_TRIP_SEED_DRIVER_VEHICLES[driver.taxId]
    if (plates === undefined) continue

    const vehicleIds = plates
      .map((plate) => vehicleIdByPlate.get(plate))
      .filter((vehicleId): vehicleId is string => vehicleId !== undefined)
    if (vehicleIds.length === 0) continue

    await useCase.replace({
      context: input.context,
      correlationId: CORRELATION_ID,
      driverId: driver.id,
      vehicleIds,
    })
    links += vehicleIds.length
  }

  return links
}

/**
 * A tabela de custo por região e a cobertura de quem dirige. Sem a **cobertura** a tabela existe e
 * não alcança ninguém: o valor do agregado sai do cruzamento entre a região que ele cobre e a classe
 * do veículo, e não do destino da nota.
 */
async function seedFreightRegions(input: {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly database: ConstructorParameters<typeof DrizzleFreightRegionRepository>[0]
}): Promise<{ readonly driverRegionLinks: number; readonly freightRegions: number }> {
  const regionRepository = new DrizzleFreightRegionRepository(input.database)
  const summary = await createImportFreightRegionsUseCase({ repository: regionRepository }).import({
    context: input.context,
    regions: LOCAL_FREIGHT_REGIONS,
  })

  const stored = await regionRepository.listAll({ companyId: input.context.companyId })
  const regionIdByCode = new Map(stored.map((region) => [region.code, region.id]))

  const driverRepository = new DrizzleFleetDriverRepository(input.database)
  const coverage = createFleetDriverRegionsUseCase({
    drivers: {
      exists: async (query) => (await driverRepository.findById(query)) !== null,
    },
    repository: new DrizzleFleetDriverRegionRepository(input.database),
  })

  const drivers = await driverRepository.list({
    companyId: input.context.companyId,
    cursor: null,
    limit: PAGE_LIMIT,
  })

  let driverRegionLinks = 0
  for (const driver of drivers.items) {
    const codes = LOCAL_FREIGHT_REGION_COVERAGE[driver.taxId]
    if (codes === undefined) continue

    const entries = codes.flatMap((code) => {
      const regionId = regionIdByCode.get(code)
      /** `scope: 'region'` cobre a zona inteira; a cidade solta é o outro escopo, e não é o caso. */
      return regionId === undefined
        ? []
        : [{ city: '', regionId, scope: 'region' as const, state: '' }]
    })
    if (entries.length === 0) continue

    await coverage.replace({
      context: input.context,
      correlationId: CORRELATION_ID,
      driverId: driver.id,
      entries,
    })
    driverRegionLinks += entries.length
  }

  return { driverRegionLinks, freightRegions: summary.created + summary.updated }
}

/** A regra de bancada, criada **ativa** — inativa ela não entra na conta. */
async function seedFreightRule(input: {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly database: ConstructorParameters<typeof DrizzleFreightRepository>[0]
  readonly idempotencyHmacKey: Uint8Array
}): Promise<boolean> {
  const useCase = createFreightRulesUseCase({
    fingerprintService: createIdempotencyFingerprintService({ key: input.idempotencyHmacKey }),
    unitOfWork: new DrizzleFreightRepository(input.database),
  })

  /**
   * A existência é **consultada**, não deduzida de um erro. A primeira versão embrulhava a criação
   * num `catch` que devolvia "já existe": ela engoliu um `FREIGHT_PERCENTAGE_OUT_OF_RANGE` real e a
   * semente anunciou sucesso com zero regras no banco.
   */
  const existing = await useCase.list({ context: input.context, cursor: null, limit: PAGE_LIMIT })
  const found = existing.items.find((rule) => rule.name === LOCAL_FREIGHT_RULE.name)
  if (found !== undefined) {
    /**
     * A semente **converge** para o estado que descreve: encontrada inativa, ela é ativada. Pular
     * porque existe deixaria a bancada com uma regra que não entra na conta — e a tela voltaria a
     * responder zero, que é o sintoma que a regra veio resolver.
     */
    if (found.status === 'active') return false
    await useCase.activate({
      context: input.context,
      correlationId: CORRELATION_ID,
      freightRuleId: found.id,
    })
    return true
  }

  const created = await useCase.create({
    ...LOCAL_FREIGHT_RULE,
    context: input.context,
    correlationId: CORRELATION_ID,
    idempotencyKey: `local-trip-seed-freight-rule-${input.context.companyId}`,
  })
  /** Criada inativa ela não entra na conta, e a bancada continuaria respondendo zero. */
  await useCase.activate({
    context: input.context,
    correlationId: CORRELATION_ID,
    freightRuleId: created.id,
  })
  return true
}

if (import.meta.main) {
  const result = await runLocalTripSeed({
    appEnvironment: process.env.APP_ENV ?? '',
    environment: process.env,
  })
  process.stdout.write(
    `trip seed: fiscal profile ${result.fiscalProfileSaved ? 'saved' : 'skipped'}, ` +
      `${result.vehiclesCreated} vehicle(s) created, ${result.vehiclesSkipped} skipped, ` +
      `${result.driverVehicleLinks} driver-vehicle link(s), ` +
      `freight rule ${result.freightRuleSaved ? 'created' : 'already there'}, ` +
      `${result.freightRegions} region(s) with ${result.driverRegionLinks} coverage link(s), ` +
      `${result.nfeFiles} NF-e file(s) queued in ${result.nfeBatches} batch(es)\n`,
  )
}
