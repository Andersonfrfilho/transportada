/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  PendingGeocodingAddress,
  PendingGeocodingAddressSource,
} from '../application/pending-address.port.js'

export type PendingAddressDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Os endereços de entrega que as notas já trouxeram e que ainda não têm coordenada.
 *
 * A chave é montada **em SQL** aqui, e isso é uma concessão consciente: a normalização de verdade
 * vive em `buildStopAddressKey` (spec 056), e uma segunda regra do que é a mesma parada discordaria
 * dela no dia em que alguém digitasse "Nº 45". Só que trazer a base inteira para o processo a cada
 * ciclo para normalizar em memória seria pior.
 *
 * O que torna isso seguro é o alcance: o pior caso de divergência é **adiantar a coordenada de uma
 * chave que ninguém vai consultar** — trabalho perdido, nunca dado errado. Quem consulta é sempre a
 * chave normalizada de verdade, e o que não casar simplesmente cai na RF2 e resolve na hora.
 *
 * ⚠️ Por isso o filtro é conservador: só nota com CEP de oito dígitos e município preenchido. O
 * complicado da normalização é o **número**, e ele não entra em nenhuma decisão dos degraus 1 e 2.
 */
export function createDrizzlePendingAddressSource(
  database: PendingAddressDatabase,
): PendingGeocodingAddressSource {
  return {
    async list(input) {
      const rows = (await database.execute(sql`
        select distinct
          concat_ws('|', a."city_code", regexp_replace(a."postal_code", '\\D', '', 'g'),
            upper(coalesce(nullif(trim(a."number"), ''), 'S/N'))) as address_key,
          a."city_code" as city_code,
          regexp_replace(a."postal_code", '\\D', '', 'g') as postal_code
        from nfe_addresses a
        join nfe_participants p
          on p."id" = a."participant_id" and p."company_id" = a."company_id"
        where p."role" = 'recipient'
          and length(regexp_replace(a."postal_code", '\\D', '', 'g')) = 8
          and coalesce(a."city_code", '') <> ''
          and not exists (
            select 1 from geocoded_addresses g
            where g."address_key" = concat_ws('|', a."city_code",
              regexp_replace(a."postal_code", '\\D', '', 'g'),
              upper(coalesce(nullif(trim(a."number"), ''), 'S/N')))
          )
          ${input.after === undefined ? sql`` : sql`and concat_ws('|', a."city_code", regexp_replace(a."postal_code", '\\D', '', 'g'), upper(coalesce(nullif(trim(a."number"), ''), 'S/N'))) > ${input.after}`}
        order by address_key
        limit ${input.limit}
      `)) as unknown as {
        readonly address_key: string
        readonly city_code: string
        readonly postal_code: string
      }[]

      return rows.map(toPendingAddress)
    },
  }
}

function toPendingAddress(row: {
  readonly address_key: string
  readonly city_code: string
  readonly postal_code: string
}): PendingGeocodingAddress {
  return {
    addressKey: row.address_key,
    cityCode: row.city_code,
    postalCode: row.postal_code,
  }
}
