/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { createDrizzleMunicipalityCentroidRepository } from '../infrastructure/drizzle-municipality-centroid.repository.js'

import type { MunicipalityCentroid } from './municipality-centroid.port.js'
import { createSaveMunicipalityCentroidsUseCase } from './save-municipality-centroids.use-case.js'

const SEED_FILE = new URL('../../database/seeds/municipality-centroids.json', import.meta.url)

/**
 * Carrega os 5.570 centroides do IBGE (spec 069, T007). O arquivo é gerado **uma vez**, à mão, por
 * `scripts/municipality-centroid-build.py`, e vai versionado: este degrau da cascata só é consultado
 * quando o provedor e o CEP já falharam, e é o pior lugar possível para depender de rede.
 *
 * Roda em **todo** ambiente, ao contrário do seed de identidade — a divisão territorial não é dado
 * de desenvolvimento. Reexecutar é seguro: o upsert é por `city_code`.
 */
export async function runMunicipalityCentroidSeed({
  connectionString,
}: {
  readonly connectionString: string
}): Promise<{ readonly saved: number }> {
  if (connectionString.length === 0) {
    throw new Error('DATABASE_URL is required to seed the municipality centroids')
  }

  const centroids = (await Bun.file(SEED_FILE).json()) as readonly MunicipalityCentroid[]
  if (centroids.length === 0) {
    throw new Error('Municipality centroid seed file is empty')
  }

  const provider = createDrizzleProvider({
    connection: { adapter: 'postgres', max: 1, url: connectionString },
  })

  try {
    const useCase = createSaveMunicipalityCentroidsUseCase({
      repository: createDrizzleMunicipalityCentroidRepository(provider.db),
    })

    return await useCase.save(centroids)
  } finally {
    await provider.close()
  }
}

if (import.meta.main) {
  const { saved } = await runMunicipalityCentroidSeed({
    connectionString: process.env.DATABASE_URL ?? '',
  })
  process.stdout.write(`municipality centroids seeded: ${saved}\n`)
}
