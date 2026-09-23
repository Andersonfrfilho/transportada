/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Geocodifica os endereços de entrega da bancada pelo centroide do município — o último degrau da
 * cascata que o worker percorre.
 *
 * ⚠️ Quem geocodifica endereço em produção é a fila do worker (`geocoding-backfill`), e **nenhum
 * worker roda nesta bancada**. Sem coordenada não há rota: a viagem não congela roteiro, e sem
 * distância a conta não tem o que multiplicar por km/l nem por diária. Toda nota vinculada a partir
 * de um endereço novo caía nisso, e o sintoma aparecia como "roteiro ainda não calculado".
 *
 * A precisão é de cidade, e o registro diz isso (`source`/`precision` = `city`): é bancada, não
 * medição de rua. Endereço já geocodificado nunca é sobrescrito — quem tem rua continua com rua.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { parseEnvironment } from '../config/environment.schema.js'
import { geocodeCompanyDepot } from '../routing/application/geocode-company-depot.use-case.js'
import { createDrizzleGeocodedAddressRepository } from '../routing/infrastructure/drizzle-geocoded-address.repository.js'
import { createDrizzleMunicipalityCentroidRepository } from '../routing/infrastructure/drizzle-municipality-centroid.repository.js'

const ALLOWED_ENVIRONMENTS = new Set(['local', 'test'])

export type LocalDeliveryGeocodingSeedResult = {
  readonly alreadyGeocoded: number
  readonly geocoded: number
  readonly withoutCentroid: number
}

type RunLocalDeliveryGeocodingSeedParams = {
  readonly appEnvironment: string
  readonly environment: Record<string, string | undefined>
}

export async function runLocalDeliveryGeocodingSeed({
  appEnvironment,
  environment,
}: RunLocalDeliveryGeocodingSeedParams): Promise<LocalDeliveryGeocodingSeedResult> {
  if (!ALLOWED_ENVIRONMENTS.has(appEnvironment)) {
    throw new Error('Local delivery geocoding seed is restricted to local and test environments')
  }

  const config = parseEnvironment(environment)
  const provider = createDrizzleProvider({ connection: config.databaseUrl })

  try {
    const database = provider.db
    const addresses = createDrizzleGeocodedAddressRepository(database)
    const centroids = createDrizzleMunicipalityCentroidRepository(database)

    const pending = await database.execute<{
      readonly address_key: string
      readonly city_code: string
    }>(sql`
      select distinct
        a.city_code || '|' || a.postal_code || '|' || a.number as address_key,
        a.city_code
      from nfe_addresses a
      where a.city_code is not null
        and a.postal_code is not null
        and a.number is not null
    `)

    let geocoded = 0
    let alreadyGeocoded = 0
    let withoutCentroid = 0

    for (const row of pending) {
      const result = await geocodeCompanyDepot(
        { centroids, geocodedAddresses: addresses },
        { addressKey: row.address_key, cityIbgeCode: row.city_code },
      )
      if (result.status === 'geocoded') geocoded += 1
      else if (result.status === 'already_geocoded') alreadyGeocoded += 1
      else withoutCentroid += 1
    }

    return { alreadyGeocoded, geocoded, withoutCentroid }
  } finally {
    await provider.close()
  }
}

if (import.meta.main) {
  const result = await runLocalDeliveryGeocodingSeed({
    appEnvironment: process.env.APP_ENV ?? '',
    environment: process.env,
  })
  process.stdout.write(
    `delivery geocoding seed: ${result.geocoded} geocoded, ` +
      `${result.alreadyGeocoded} already geocoded, ${result.withoutCentroid} without centroid\n`,
  )
}
