/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271: o módulo de notificação num banco descartável — as migrations do pacote rodam depois das da
 * aplicação, e os modelos de e-mail do módulo são semeados direto na `notification.templates`.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { runNotificationSchemaMigrations } from '../../src/database/notification-migration.service.js'
import { withDisposableDatabase as withDisposableDatabaseLifecycle } from './disposable-database.fixture.js'
import { databaseUrl, type TestDatabase } from './trip-field-office-database.fixture.js'

export async function withNotificationDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_271',
    migrate: async (connectionString) => {
      await runDatabaseMigrations({ connectionString })
      await runNotificationSchemaMigrations({ connectionString })
    },
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}

type SeedNotificationTemplateParams = {
  readonly active?: boolean
  readonly body?: string
  readonly channel?: string
  readonly companyId: string
  readonly key: string
  readonly locale?: string
  readonly subject?: null | string
  readonly version?: number
}

export async function seedNotificationTemplate(
  database: TestDatabase,
  params: SeedNotificationTemplateParams,
): Promise<void> {
  await database.db.execute(sql`
    insert into notification.templates (company_id, key, channel, locale, version, subject, body, active)
    values (
      ${params.companyId}::uuid, ${params.key}, ${params.channel ?? 'email'}, ${params.locale ?? 'pt-BR'},
      ${params.version ?? 1}, ${params.subject === undefined ? 'Ocorrência na nota {{numeroNota}}' : params.subject},
      ${params.body ?? 'Olá, {{contratante}}.\n\n{{linhasItens}}'}, ${params.active ?? true}
    )`)
}
