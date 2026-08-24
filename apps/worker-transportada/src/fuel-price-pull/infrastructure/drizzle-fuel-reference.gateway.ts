/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Quem decide o que é novidade é a chave natural `(produto, UF, semana)`: reprocessar a mesma
 * semana não reescreve preço já coletado nem levanta erro, e o que volta é quantas linhas entraram.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { fuelPriceReferences } from '../../database/fuel-reference.schema.js'
import type { FuelReferenceGatewayPort } from '../application/fuel-reference.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleFuelReferenceGateway(dependencies: {
  readonly db: Database
}): FuelReferenceGatewayPort {
  return {
    async insertMissing(input) {
      if (input.references.length === 0) {
        return { insertedCount: 0 }
      }

      const inserted = await dependencies.db
        .insert(fuelPriceReferences)
        .values(
          input.references.map((reference) => ({
            collectedAt: input.collectedAt,
            pricePerUnit: reference.pricePerUnit,
            product: reference.product,
            state: reference.state,
            stationCount: reference.stationCount,
            weekEndingOn: reference.weekEndingOn,
          })),
        )
        .onConflictDoNothing({
          target: [
            fuelPriceReferences.product,
            fuelPriceReferences.state,
            fuelPriceReferences.weekEndingOn,
          ],
        })
        .returning({ id: fuelPriceReferences.id })

      return { insertedCount: inserted.length }
    },
  }
}
