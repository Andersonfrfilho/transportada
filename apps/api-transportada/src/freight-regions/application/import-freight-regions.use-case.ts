/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { FreightRegionVersionConflictError } from '../domain/freight-region.error.js'
import type {
  FreightRegion,
  FreightRegionCompanyContext,
  FreightRegionImportPort,
  FreightRegionImportSummary,
  FreightRegionInput,
} from './freight-region.port.js'

type ImportFreightRegionsInput = {
  readonly context: FreightRegionCompanyContext
  readonly regions: readonly FreightRegionInput[]
}

/**
 * A chave natural é o código impresso na tabela do cliente. Rota que sumiu do arquivo é inativada,
 * nunca apagada: o motorista está ligado a ela, e apagar levaria a cobertura junto por cascata.
 *
 * A escrita é uma transação por rota, não uma pelo arquivo inteiro. Um ciclo interrompido no meio
 * se corrige reimportando — o diff é sobre o estado, não sobre o que já foi gravado.
 */
export function createImportFreightRegionsUseCase(dependencies: {
  readonly repository: FreightRegionImportPort
}) {
  return {
    async import(input: ImportFreightRegionsInput): Promise<FreightRegionImportSummary> {
      const companyId = input.context.companyId
      const stored = await dependencies.repository.listAll({ companyId })
      const storedByCode = new Map(stored.map((region) => [region.code, region]))

      let created = 0
      let updated = 0
      for (const region of input.regions) {
        const current = storedByCode.get(region.code)
        if (current === undefined) {
          await dependencies.repository.create({ companyId, region })
          created += 1
          continue
        }
        if (matches(current, region)) continue
        await write({
          companyId,
          current,
          region,
          repository: dependencies.repository,
          status: 'active',
        })
        updated += 1
      }

      const importedCodes = new Set(input.regions.map((region) => region.code))
      let deactivated = 0
      for (const current of stored) {
        if (current.status !== 'active' || importedCodes.has(current.code)) continue
        await write({
          companyId,
          current,
          region: toInput(current),
          repository: dependencies.repository,
          status: 'inactive',
        })
        deactivated += 1
      }

      return { created, deactivated, updated }
    },
  }
}

async function write(input: {
  readonly companyId: string
  readonly current: FreightRegion
  readonly region: FreightRegionInput
  readonly repository: FreightRegionImportPort
  readonly status: 'active' | 'inactive'
}): Promise<void> {
  const written = await input.repository.update({
    companyId: input.companyId,
    expectedVersion: input.current.version,
    region: input.region,
    regionId: input.current.id,
    status: input.status,
  })
  // Escrita perdida por versão é edição concorrente: o resumo não pode dizer que gravou
  if (written === null) throw new FreightRegionVersionConflictError()
}

/** Reimportar o mesmo arquivo não pode nem subir a versão da rota que não mudou. */
function matches(current: FreightRegion, region: FreightRegionInput): boolean {
  return (
    current.status === 'active' &&
    current.name === region.name &&
    serializeCities(current) === serializeCities(region) &&
    serializeRates(current) === serializeRates(region)
  )
}

function serializeCities(region: FreightRegionInput): string {
  return region.cities.map((city) => `${city.city}/${city.state}`).join('|')
}

function serializeRates(region: FreightRegionInput): string {
  return region.rates.map((rate) => `${rate.freightClass}=${rate.driverAmount}`).join('|')
}

function toInput(region: FreightRegion): FreightRegionInput {
  return { cities: region.cities, code: region.code, name: region.name, rates: region.rates }
}
