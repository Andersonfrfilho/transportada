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
 * O catálogo é o **texto de partida**, não a fonte da verdade.
 *
 * Antes, todo deploy publicava a versão do código por cima: o texto ajustado no painel voltava ao
 * original na subida seguinte, sem aviso, e quem tivesse corrigido uma frase a perderia. Com o
 * painel de edição, isso deixa de ser proteção e vira perda de trabalho.
 *
 * Agora o seed só preenche o que **não existe** para aquele `(key, channel, locale)`. Template novo
 * no catálogo continua nascendo sozinho na primeira subida; template que alguém já editou fica.
 *
 * ⚠️ Consequência que vale saber: texto errado publicado pelo painel **não se conserta mais por
 * deploy**. O conserto é no painel — que é o preço de o painel existir.
 */
export async function seedNotificationTemplates({
  companyId,
  module,
}: {
  readonly companyId: string
  readonly module: NotificationModule
}): Promise<number> {
  const seeds = buildNotificationTemplateSeeds({ companyId })
  const existing = await module.useCases.listTemplates.execute({ companyId })
  const known = new Set(existing.map((template) => templateIdentityOf(template)))

  const missing = seeds.filter((seed) => !known.has(templateIdentityOf(seed)))
  await Promise.all(missing.map((seed) => module.useCases.upsertTemplate.execute(seed)))

  return missing.length
}

/** A chave natural do template: é por ela que o seed sabe se já existe texto para aquele aviso. */
function templateIdentityOf(template: {
  readonly channel: string
  readonly key: string
  readonly locale: string
}): string {
  return `${template.key}:${template.channel}:${template.locale}`
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
