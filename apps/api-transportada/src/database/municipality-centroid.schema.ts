/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { char, check, numeric, pgTable, timestamp } from 'drizzle-orm/pg-core'

const CITY_CODE_PATTERN = '^[0-9]{7}$'
const STATE_PATTERN = '^[A-Z]{2}$'

/**
 * O último degrau da cascata (adendo 2026-09-01 da ADR-0044): quando nem o provedor nem o CEP
 * resolvem, a parada recebe o centroide do município — que é palpite de ~8 km e por isso entra
 * marcado e **fora** da otimização automática (ADR-0044 §5).
 *
 * Tabela semeada, e não consulta a terceiro, porque este degrau só roda **quando todo o resto já
 * falhou** — que é o pior lugar possível para depender de mais uma chamada de rede.
 *
 * Sem `company_id`, como `geocoded_addresses`, `fuel_price_references` e `energy_tariff_references`:
 * a divisão territorial do IBGE é dado público, idêntico para toda empresa da instalação, sem PII e
 * sem efeito fiscal. A ausência é assertada em contrato para não passar por esquecimento.
 */
export const municipalityCentroids = pgTable(
  'municipality_centroids',
  {
    /** Código IBGE de sete dígitos — o mesmo que `nfe_addresses.city_code` carrega. */
    cityCode: char('city_code', { length: 7 }).primaryKey(),
    state: char({ length: 2 }).notNull(),
    latitude: numeric({ precision: 10, scale: 7 }).notNull(),
    longitude: numeric({ precision: 10, scale: 7 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'municipality_centroids_city_code_check',
      sql`${table.cityCode} ~ ${sql.raw(`'${CITY_CODE_PATTERN}'`)}`,
    ),
    check(
      'municipality_centroids_state_check',
      sql`${table.state} ~ ${sql.raw(`'${STATE_PATTERN}'`)}`,
    ),
    check('municipality_centroids_latitude_check', sql`${table.latitude} between -90 and 90`),
    check('municipality_centroids_longitude_check', sql`${table.longitude} between -180 and 180`),
  ],
)
