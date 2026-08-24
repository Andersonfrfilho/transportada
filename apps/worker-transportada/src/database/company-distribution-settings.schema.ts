/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia da tabela de opt-in que a API versiona, só para leitura. Migration só roda na API —
 * mudou lá, mude aqui.
 */
import { boolean, pgTable, uuid } from 'drizzle-orm/pg-core'

export const companyDistributionSettings = pgTable('company_distribution_settings', {
  companyId: uuid('company_id').primaryKey(),
  scheduledDistributionEnabled: boolean('scheduled_distribution_enabled').notNull().default(false),
})
