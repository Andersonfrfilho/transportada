/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect } from 'bun:test'

import { drizzle } from 'drizzle-orm/bun-sql'
import type {
  DeliveryAttemptResult,
  NotificationJob,
  QueuePort,
  ResolvedRecipient,
  SendEmailParams,
} from '@adatechnology/notification-contracts'
import { createNotificationModule } from '@adatechnology/notification-module'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { runNotificationSchemaMigrations } from '../../src/database/notification-migration.service.js'
import { testWithPostgres, withDisposableDatabase } from '../database-migration/support.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const RECIPIENT_ID = '22222222-2222-4222-8222-222222222222'
const SUPPRESSION_KEY = Buffer.alloc(32, 5).toString('base64')

const RECIPIENT: ResolvedRecipient = {
  displayName: 'Destinatária',
  email: 'destinatario@example.test',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
}

type EmailAttempt = { readonly to: string }

/** Coleta os jobs em vez de publicar: o que importa aqui é quantos saíram, não por onde. */
function collectingQueue(): { readonly jobs: NotificationJob[]; readonly queue: QueuePort } {
  const jobs: NotificationJob[] = []
  return {
    jobs,
    queue: {
      async close() {},
      async consume() {},
      async enqueue({ job }) {
        jobs.push(job)
      },
    },
  }
}

function emailDriver(result: DeliveryAttemptResult): {
  readonly attempts: EmailAttempt[]
  readonly driver: {
    readonly driver: string
    send(params: SendEmailParams): Promise<DeliveryAttemptResult>
  }
} {
  const attempts: EmailAttempt[] = []
  return {
    attempts,
    driver: {
      driver: 'contract',
      async send(params) {
        attempts.push({ to: params.to })
        return result
      },
    },
  }
}

/**
 * O comportamento que o produto compra do módulo, exercido contra Postgres de verdade: a chave de
 * negócio não duplica entrega, e um endereço recusado pelo provedor para de receber. Fora do banco
 * os dois seriam encenação — quem garante é o índice único e a tabela de supressão.
 */
describe('contrato de comportamento da entrega de notificações', () => {
  testWithPostgres('dedupeKey repetida produz uma entrega só', async () => {
    await withDisposableDatabase(async (_database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      await runNotificationSchemaMigrations({ connectionString })

      const { jobs, queue } = collectingQueue()
      const { driver } = emailDriver({ outcome: 'sent' })
      const module = createNotificationModule({
        config: {
          defaultLocale: 'pt-BR',
          defaultTimezone: 'America/Sao_Paulo',
          suppressionHmacKey: SUPPRESSION_KEY,
        },
        db: drizzle(connectionString) as never,
        features: { email: true },
        providers: {
          channels: { email: driver },
          queue,
          recipientResolver: { resolve: async () => RECIPIENT },
        },
      })
      await module.useCases.upsertTemplate.execute({
        active: true,
        body: 'Corpo do aviso.',
        channel: 'email',
        companyId: COMPANY_ID,
        key: 'generic',
        locale: 'pt-BR',
        subject: 'Aviso',
      })

      const first = await module.useCases.sendNotification.execute({
        category: 'security',
        channels: ['email'],
        companyId: COMPANY_ID,
        dedupeKey: 'mesma-chave',
        recipientUserId: RECIPIENT_ID,
        templateKey: 'generic',
      })
      const second = await module.useCases.sendNotification.execute({
        category: 'security',
        channels: ['email'],
        companyId: COMPANY_ID,
        dedupeKey: 'mesma-chave',
        recipientUserId: RECIPIENT_ID,
        templateKey: 'generic',
      })

      expect(first.deduplicated).toBe(false)
      expect(second.deduplicated).toBe(true)
      expect(second.notificationId).toBe(first.notificationId)
      expect(jobs).toHaveLength(1)
    })
  })

  testWithPostgres('endereço recusado é suprimido e o envio seguinte não sai', async () => {
    await withDisposableDatabase(async (_database, connectionString) => {
      await runDatabaseMigrations({ connectionString })
      await runNotificationSchemaMigrations({ connectionString })

      const { jobs, queue } = collectingQueue()
      const { attempts, driver } = emailDriver({
        errorCode: 'invalid_recipient',
        outcome: 'invalid_target',
        suppressionReason: 'bounce',
      })
      const module = createNotificationModule({
        config: {
          defaultLocale: 'pt-BR',
          defaultTimezone: 'America/Sao_Paulo',
          suppressionHmacKey: SUPPRESSION_KEY,
        },
        db: drizzle(connectionString) as never,
        features: { email: true },
        providers: {
          channels: { email: driver },
          queue,
          recipientResolver: { resolve: async () => RECIPIENT },
        },
      })
      await module.useCases.upsertTemplate.execute({
        active: true,
        body: 'Corpo do aviso.',
        channel: 'email',
        companyId: COMPANY_ID,
        key: 'generic',
        locale: 'pt-BR',
        subject: 'Aviso',
      })

      await module.useCases.sendNotification.execute({
        category: 'security',
        channels: ['email'],
        companyId: COMPANY_ID,
        dedupeKey: 'primeira',
        recipientUserId: RECIPIENT_ID,
        templateKey: 'generic',
      })
      await module.useCases.dispatchDelivery.execute(jobs[0] as NotificationJob)
      expect(attempts).toHaveLength(1)

      await module.useCases.sendNotification.execute({
        category: 'security',
        channels: ['email'],
        companyId: COMPANY_ID,
        dedupeKey: 'segunda',
        recipientUserId: RECIPIENT_ID,
        templateKey: 'generic',
      })
      for (const job of jobs.slice(1)) {
        await module.useCases.dispatchDelivery.execute(job)
      }

      // O driver não é chamado de novo: quem barra é a supressão, antes do provedor.
      expect(attempts).toHaveLength(1)
    })
  })
})
