/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNull, ne, sql } from 'drizzle-orm'

import { geocodedAddresses } from '../../database/routing.schema.js'
import type {
  PendingRefinement,
  PendingRefinementSource,
  RefinedAddressRepository,
} from '../application/pending-refinement.port.js'

export type PendingRefinementDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Os endereços que ficaram no centroide do município e ainda não custaram uma chamada paga.
 *
 * ⚠️ A chave é remontada em SQL pela mesma normalização de `buildStopAddressKey`, **com o
 * `coalesce` no município** — `concat_ws` pula argumento nulo, e sem ele o endereço de `city_code`
 * nulo nunca casaria. É o mesmo defeito que já custou o degrau 2 manual na API.
 *
 * `source <> 'manual'` não é otimização: correção manual sempre vence (ADR-0044 §3), e selecioná-la
 * gastaria uma chamada para depois recusar a escrita.
 */
export function createDrizzlePendingRefinementSource(
  database: PendingRefinementDatabase,
): PendingRefinementSource {
  return {
    async list(input) {
      const rows = (await database.execute(sql`
        select
          g."address_key" as address_key,
          coalesce(a."city", '') as city,
          coalesce(a."city_code", '') as city_code,
          coalesce(a."district", '') as district,
          coalesce(a."number", '') as number,
          regexp_replace(coalesce(a."postal_code", ''), '\\D', '', 'g') as postal_code,
          coalesce(a."state", '') as state,
          coalesce(a."street", '') as street
        from geocoded_addresses g
        join lateral (
          select a.*
          from nfe_addresses a
          join nfe_participants p
            on p."id" = a."participant_id" and p."company_id" = a."company_id"
          where p."role" in ('recipient', 'delivery')
            and concat_ws('|', coalesce(a."city_code", ''),
              regexp_replace(a."postal_code", '\\D', '', 'g'),
              upper(coalesce(nullif(trim(a."number"), ''), 'S/N'))) = g."address_key"
          limit 1
        ) a on true
        where g."precision" = 'city'
          and g."paid_refined_at" is null
          and g."source" <> 'manual'
        order by g."address_key"
        limit ${input.limit}
      `)) as unknown as {
        readonly address_key: string
        readonly city: string
        readonly city_code: string
        readonly district: string
        readonly number: string
        readonly postal_code: string
        readonly state: string
        readonly street: string
      }[]

      return rows.map(toPendingRefinement)
    },
  }
}

/**
 * ⚠️ Este repositório **sobrescreve**, ao contrário do `save` da cascata
 * (`drizzle-geocoded-address.repository.ts`, que é `onConflictDoNothing` de propósito). Ele pode
 * porque quem chama já provou duas coisas: o que está em base é `city`, e o candidato é mais fino
 * que `city`. Fora desse recorte a escrita rebaixaria coordenada boa, e a degradação gruda — a
 * cascata nunca mais reconsulta o que já está em base.
 */
export function createDrizzleRefinedAddressRepository(
  database: PendingRefinementDatabase,
): RefinedAddressRepository {
  return {
    async markPaid(addressKey) {
      await database
        .update(geocodedAddresses)
        .set({ paidRefinedAt: new Date(), updatedAt: new Date() })
        .where(eq(geocodedAddresses.addressKey, addressKey))
    },

    async replace(input) {
      await database
        .update(geocodedAddresses)
        .set({
          externalPlaceId: input.externalPlaceId,
          geocodedAt: new Date(),
          latitude: input.latitude,
          longitude: input.longitude,
          paidRefinedAt: new Date(),
          precision: input.precision,
          source: 'google',
          updatedAt: new Date(),
        })
        /**
         * O `where` repete as duas condições da seleção: entre a leitura e a escrita cabe a marca
         * manual de um humano, e ela vence (ADR-0044 §3). Sem isto o pino arrastado seria desfeito
         * por uma compra que já estava em voo.
         */
        .where(
          and(
            eq(geocodedAddresses.addressKey, input.addressKey),
            eq(geocodedAddresses.precision, 'city'),
            ne(geocodedAddresses.source, 'manual'),
            isNull(geocodedAddresses.paidRefinedAt),
          ),
        )
    },
  }
}

function toPendingRefinement(row: {
  readonly address_key: string
  readonly city: string
  readonly city_code: string
  readonly district: string
  readonly number: string
  readonly postal_code: string
  readonly state: string
  readonly street: string
}): PendingRefinement {
  return {
    request: {
      addressKey: row.address_key,
      city: row.city,
      cityCode: row.city_code,
      district: row.district,
      number: row.number,
      postalCode: row.postal_code,
      state: row.state,
      street: row.street,
    },
  }
}
