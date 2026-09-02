/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { municipalityCentroids } from '../../database/routing.schema.js'
import type { CentroidPort } from '../application/geocode-address.use-case.js'

export type MunicipalityCentroidDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * O último degrau da cascata (adendo 2026-09-01 da ADR-0044). Lê a tabela semeada com a malha do
 * IBGE, e **não fala com ninguém**: este degrau só roda quando o CEP já falhou, que é o pior lugar
 * possível para depender de mais uma chamada de rede.
 *
 * A coordenada sai como `city` — palpite de ~8 km. É de propósito: ela põe o endereço no mapa para o
 * conferente ver que aquilo é palpite, e **sai da otimização automática** (ADR-0044 §5). Marcá-la
 * como `postal_code` a colocaria dentro da rota, que é o modo de falha da §1.
 */
export function createMunicipalityCentroidGateway(
  database: MunicipalityCentroidDatabase,
): CentroidPort {
  return {
    async byCityCode(cityCode) {
      const code = cityCode.trim()
      if (code.length === 0) return null

      const [row] = await database
        .select({
          latitude: municipalityCentroids.latitude,
          longitude: municipalityCentroids.longitude,
        })
        .from(municipalityCentroids)
        .where(eq(municipalityCentroids.cityCode, code))
        .limit(1)

      if (row === undefined) return null

      return {
        /** Vazio: `place_id` é do provedor pago, e o CHECK só o exige de linha `google`. */
        externalPlaceId: '',
        latitude: row.latitude,
        longitude: row.longitude,
        precision: 'city',
        source: 'city',
      }
    },
  }
}
