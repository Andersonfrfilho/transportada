/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { nfeAddresses, nfeParticipants } from '../../database/database.schema.js'
import type { AddressComponentsSource } from '../application/refine-address.port.js'

export type AddressComponentsDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * O endereço por extenso para o degrau 2. A busca é **escopada pela empresa do contexto**: a
 * coordenada não tem tenant, mas o endereço vem da nota, e ler a nota de outra empresa para montar a
 * consulta ao provedor seria vazamento com outro nome.
 *
 * A chave é remontada em SQL pela mesma normalização de `buildStopAddressKey` (spec 056) — e é por
 * isso que a forma dela é travada por contrato (T016): três lugares a conhecem.
 */
export function createDrizzleAddressComponentsSource(
  database: AddressComponentsDatabase,
): AddressComponentsSource {
  return {
    async byAddressKey(input) {
      const [row] = await database
        .select({
          city: nfeAddresses.city,
          cityCode: nfeAddresses.cityCode,
          district: nfeAddresses.district,
          number: nfeAddresses.number,
          postalCode: nfeAddresses.postalCode,
          state: nfeAddresses.state,
          street: nfeAddresses.street,
        })
        .from(nfeAddresses)
        .innerJoin(
          nfeParticipants,
          and(
            eq(nfeParticipants.id, nfeAddresses.participantId),
            eq(nfeParticipants.companyId, nfeAddresses.companyId),
          ),
        )
        .where(
          and(
            eq(nfeAddresses.companyId, input.companyId),
            sql`concat_ws('|', ${nfeAddresses.cityCode}, regexp_replace(${nfeAddresses.postalCode}, '\\D', '', 'g'), upper(coalesce(nullif(trim(${nfeAddresses.number}), ''), 'S/N'))) = ${input.addressKey}`,
          ),
        )
        .limit(1)

      if (row === undefined) return null

      return {
        addressKey: input.addressKey,
        city: row.city ?? '',
        cityCode: row.cityCode ?? '',
        district: row.district ?? '',
        number: row.number ?? '',
        postalCode: (row.postalCode ?? '').replace(/\D/gu, ''),
        state: row.state ?? '',
        street: row.street ?? '',
      }
    },
  }
}
