/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { eq, sql } from 'drizzle-orm'

import { geocodedAddressCorrections, geocodedAddresses } from '../../database/database.schema.js'
import type { GeocodedAddressCorrectionRepository } from '../application/geocoding.port.js'
import type { GeocodedAddressDatabase } from './drizzle-geocoded-address.repository.js'

/**
 * A correção humana, com trilha, numa transação só (spec 084, G1).
 *
 * ⚠️ **Antes desta implementação o produto tinha correção sem histórico e histórico sem correção.**
 * O `PATCH /geocoded-addresses/:key` já estava em produção gravando coordenada e não deixando
 * registro de quem gravou — e o relatório da 084 depende justamente desse registro para dizer se
 * comprar precisão fina vale a pena.
 */
export function createDrizzleGeocodedAddressCorrectionRepository(
  database: GeocodedAddressDatabase,
): GeocodedAddressCorrectionRepository {
  return {
    async applyCorrection(input) {
      return database.transaction(async (transaction) => {
        const [previous] = await transaction
          .select({
            addressKey: geocodedAddresses.addressKey,
            externalPlaceId: geocodedAddresses.externalPlaceId,
            latitude: geocodedAddresses.latitude,
            longitude: geocodedAddresses.longitude,
            precision: geocodedAddresses.precision,
            source: geocodedAddresses.source,
          })
          .from(geocodedAddresses)
          .where(eq(geocodedAddresses.addressKey, input.addressKey))
          .limit(1)

        /**
         * ⚠️ **`excluded.source = 'manual'` no `where`, e é a correção de um defeito.** O guarda
         * original era `source <> 'manual'`, e a intenção documentada é impedir que
         * **geocodificação automática** desfaça o pino que alguém arrastou. Do jeito que estava, ele
         * também descartava a correção de um **segundo humano**: a rota respondia `200` com a
         * coordenada nova e o banco ficava com a antiga, calado.
         */
        const updated = await transaction
          .insert(geocodedAddresses)
          .values({
            addressKey: input.addressKey,
            externalPlaceId: '',
            latitude: input.latitude,
            longitude: input.longitude,
            precision: 'rooftop',
            source: 'manual',
          })
          .onConflictDoUpdate({
            set: {
              externalPlaceId: sql`excluded.external_place_id`,
              geocodedAt: sql`now()`,
              latitude: sql`excluded.latitude`,
              longitude: sql`excluded.longitude`,
              precision: sql`excluded.precision`,
              source: sql`excluded.source`,
              updatedAt: sql`now()`,
            },
            target: geocodedAddresses.addressKey,
            where: sql`${geocodedAddresses.source} <> 'manual' or excluded.source = 'manual'`,
          })
          .returning({ addressKey: geocodedAddresses.addressKey })

        const applied = updated.length > 0
        /** Trilha só do que aconteceu: registrar correção descartada faria o relatório contar duas. */
        if (!applied) return { applied, previous: previous ?? null }

        await transaction.insert(geocodedAddressCorrections).values({
          actorUserId: input.actorUserId,
          addressKey: input.addressKey,
          companyId: input.companyId,
          newLatitude: input.latitude,
          newLongitude: input.longitude,
          newPrecision: 'rooftop',
          newSource: 'manual',
          origin: 'operator',
          ...(previous === undefined
            ? {}
            : {
                previousLatitude: previous.latitude,
                previousLongitude: previous.longitude,
                previousPrecision: previous.precision,
                previousSource: previous.source,
              }),
        })

        return { applied, previous: previous ?? null }
      })
    },
  }
}
