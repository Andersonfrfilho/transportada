/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { NotificationModule } from '@adatechnology/notification-module'

import { parseEnvironment } from '../../config/environment.schema.js'
import { createApiNotificationModule } from '../infrastructure/notification-module.factory.js'

import {
  NOTIFICATION_CATALOG,
  type NotificationProductChannel,
} from '../domain/notification-catalog.constant.js'
import { NOTIFICATION_DEFAULT_LOCALE } from '../notification.constant.js'

export type NotificationTemplateSeed = {
  readonly active: boolean
  readonly body: string
  readonly channel: NotificationProductChannel
  readonly companyId: string
  readonly key: string
  readonly locale: string
  readonly subject?: string
}

/** Um upsert por canal declarado no catálogo — a lista é derivada, nunca escrita à mão. */
export function buildNotificationTemplateSeeds({
  companyId,
}: {
  readonly companyId: string
}): readonly NotificationTemplateSeed[] {
  return NOTIFICATION_CATALOG.flatMap((entry) =>
    entry.channels.map((channel) => {
      const template = entry.templates[channel]
      if (template === undefined) {
        throw new Error(`Notification catalog entry ${entry.templateKey} lacks ${channel} text`)
      }

      return {
        active: true,
        body: template.body,
        channel,
        companyId,
        key: entry.templateKey,
        locale: NOTIFICATION_DEFAULT_LOCALE,
        ...(template.subject === undefined ? {} : { subject: template.subject }),
      }
    }),
  )
}

/**
 * O upsert é idempotente por `(key, channel, locale)`: rodar a cada subida devolve o texto do
 * catálogo, e é assim que um deploy velho de template não sobrevive à atualização do código.
 */
export async function seedNotificationTemplates({
  companyId,
  module,
}: {
  readonly companyId: string
  readonly module: NotificationModule
}): Promise<number> {
  const seeds = buildNotificationTemplateSeeds({ companyId })
  await Promise.all(seeds.map((seed) => module.useCases.upsertTemplate.execute(seed)))

  return seeds.length
}

/**
 * Passo manual do deploy, ao lado de `db:migrate` e `db:provision` — nunca no startup do servidor.
 * Ambiente que ainda não declarou empresa não tem a quem pertencer o template, e sai calado.
 */
if (import.meta.main) {
  const config = parseEnvironment(process.env)
  if (config.companyId === undefined) {
    process.stdout.write(`${JSON.stringify({ templates: 'skipped' })}\n`)
  } else {
    const provider = createDrizzleProvider({
      connection: { adapter: 'postgres', max: 1, url: config.databaseUrl },
    })
    try {
      const seeded = await seedNotificationTemplates({
        companyId: config.companyId,
        module: createApiNotificationModule({ config, db: provider.db }),
      })
      process.stdout.write(`${JSON.stringify({ companyId: config.companyId, seeded })}\n`)
    } finally {
      await provider.close()
    }
  }
}
