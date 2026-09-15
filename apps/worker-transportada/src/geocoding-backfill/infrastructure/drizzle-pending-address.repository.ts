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
 * ⚠️ **`coalesce` no município não é enfeite, e a falta dele era defeito.** `concat_ws` **pula
 * argumento nulo**: com `city_code` nulo a chave saía com duas partes (`14015000|100`), enquanto
 * `buildStopAddressKey` produz três (`|14015000|100`) — porque a normalização dela transforma nulo em
 * vazio. Medido no Postgres, não suposto.
 *
 * O filtro antigo escondia isso exigindo município preenchido, o que era **seguro e caro**: nenhuma
 * nota sem `city_code` era adiantada, e `nfe_addresses.city_code` é nulo com frequência — a ponto de
 * existir um backfill próprio só para ele (`nfe-address-city-code-backfill.main.ts`).
 *
 * Município vazio não atrapalha esta rotina: ela resolve pelo **CEP** e declina o centroide de
 * município de propósito, então o campo que faltava não era usado para nada aqui.
 */
export function createDrizzlePendingAddressSource(
  database: PendingAddressDatabase,
): PendingGeocodingAddressSource {
  return {
    async list(input) {
      const rows = (await database.execute(sql`
        with candidates as (
          select n."city_code", n."postal_code", n."number"
          from nfe_addresses n
          join nfe_participants p
            on p."id" = n."participant_id" and p."company_id" = n."company_id"
          where p."role" in ('recipient', 'delivery')
          union all
          -- Spec 097 D7: o barracão sem configuração é o endereço fiscal da empresa.
          select f."city_ibge_code", f."postal_code", f."number"
          from company_fiscal_profiles f
        ), keyed as (
          select
            concat_ws('|', coalesce(a."city_code", ''), regexp_replace(a."postal_code", '\\D', '', 'g'),
              upper(coalesce(nullif(trim(a."number"), ''), 'S/N'))) as address_key,
            coalesce(a."city_code", '') as city_code,
            regexp_replace(a."postal_code", '\\D', '', 'g') as postal_code
          from candidates a
          where length(regexp_replace(a."postal_code", '\\D', '', 'g')) = 8
        )
        select distinct k.address_key, k.city_code, k.postal_code
        from keyed k
        where not exists (select 1 from geocoded_addresses g where g."address_key" = k.address_key)
          ${input.after === undefined ? sql`` : sql`and k.address_key > ${input.after}`}
        order by k.address_key
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
