/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

import { CNPJ_ROOT_PATTERN } from '../shared/tax-id.service.js'

/** Cor de destaque em hex de 6 dígitos, `#rrggbb` — sem atalho de 3 dígitos e sem alfa. */
export const LANDING_ACCENT_COLOR_PATTERN = /^#[0-9a-f]{6}$/u

/**
 * Sem linha para a raiz, o produto serve o padrão — a ausência é caso normal, não erro. Por isso
 * não há `NOT NULL` de marca aqui: uma linha pode existir só para registrar unidades ou seções,
 * com marca e cor no default do app.
 */
export const landingSettings = pgTable(
  'landing_settings',
  {
    cnpjRoot: varchar('cnpj_root', { length: 8 }).primaryKey(),
    brandName: text('brand_name'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    accentColor: varchar('accent_color', { length: 7 }),
    /**
     * Seções institucionais (herói, oferta, requisitos) por chave livre — a forma de cada seção é
     * validada no CHECK abaixo, não pelo Postgres campo a campo, porque o conjunto de seções ainda
     * varia por fase da spec (T010 acrescenta "onde estamos").
     */
    sections: jsonb('sections').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'landing_settings_cnpj_root_check',
      sql`${table.cnpjRoot} ~ ${sql.raw(`'${CNPJ_ROOT_PATTERN.source}'`)}`,
    ),
    check(
      'landing_settings_accent_color_check',
      sql`${table.accentColor} is null or ${table.accentColor} ~ '^#[0-9a-f]{6}$'`,
    ),
    check('landing_settings_sections_check', sql`jsonb_typeof(${table.sections}) = 'object'`),
  ],
)

export type LandingSettingsRow = typeof landingSettings.$inferSelect
export type NewLandingSettingsRow = typeof landingSettings.$inferInsert
