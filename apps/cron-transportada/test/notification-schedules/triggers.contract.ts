/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNotificationTrigger } from '../../src/notification-schedules/application/notification-trigger.service.js'
import { sweepDueInvoices } from '../../src/notification-schedules/application/sweep-due-invoices.use-case.js'
import {
  buildBillingInvoiceDueNotification,
  buildNfseRejectionNotification,
} from '../../src/notification-schedules/domain/notification-trigger.policy.js'
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TEMPLATE_KEY,
  NOTIFICATION_TEMPLATE_PLACEHOLDERS,
} from '../../src/notification-schedules/domain/notification-schedules.constant.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const INVOICE_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '55555555-5555-4555-8555-555555555555'

const SILENT_LOGGER = {
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

describe('contrato dos disparos de notificação do cron', () => {
  test('a fatura vencendo preenche exatamente os marcadores do catálogo', () => {
    const notification = buildBillingInvoiceDueNotification({
      actorUserId: ACTOR_ID,
      companyId: COMPANY_ID,
      dueDate: new Date('2026-08-20T03:00:00.000Z'),
      invoiceId: INVOICE_ID,
      invoiceNumber: 42n,
    })

    expect(notification.category).toBe(NOTIFICATION_CATEGORY.BILLING)
    expect(notification.recipientUserId).toBe(ACTOR_ID)
    expect(Object.keys(notification.payload).toSorted()).toEqual(
      [
        ...NOTIFICATION_TEMPLATE_PLACEHOLDERS[NOTIFICATION_TEMPLATE_KEY.BILLING_INVOICE_DUE],
      ].toSorted(),
    )
    // Fuso do produto: a fatura que vence dia 20 não pode virar dia 19 na caixa de entrada.
    expect(notification.payload.dueDate).toBe('20/08/2026')
    expect(notification.payload.invoiceNumber).toBe('42')
  })

  /** Uma janela do cron avisa uma vez por fatura: a chave é do agregado, não do ciclo. */
  test('a fatura vencendo repete a mesma chave entre ciclos', () => {
    const first = buildBillingInvoiceDueNotification({
      actorUserId: ACTOR_ID,
      companyId: COMPANY_ID,
      dueDate: new Date('2026-08-20T03:00:00.000Z'),
      invoiceId: INVOICE_ID,
      invoiceNumber: 42n,
    })
    const second = buildBillingInvoiceDueNotification({
      actorUserId: ACTOR_ID,
      companyId: COMPANY_ID,
      dueDate: new Date('2026-08-20T03:00:00.000Z'),
      invoiceId: INVOICE_ID,
      invoiceNumber: 42n,
    })

    expect(first.dedupeKey).toBe(second.dedupeKey)
    expect(first.dedupeKey).toContain(INVOICE_ID)
  })

  test('a rejeição de NFS-e preenche exatamente os marcadores do catálogo', () => {
    const notification = buildNfseRejectionNotification({
      actorUserId: ACTOR_ID,
      attemptId: '66666666-6666-4666-8666-666666666666',
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
      invoiceNumber: '2026/117',
      rejectionMessage: 'Serviço não cadastrado para o prestador',
    })

    expect(notification.category).toBe(NOTIFICATION_CATEGORY.NFSE)
    expect(notification.recipientUserId).toBe(ACTOR_ID)
    expect(Object.keys(notification.payload).toSorted()).toEqual(
      [
        ...NOTIFICATION_TEMPLATE_PLACEHOLDERS[NOTIFICATION_TEMPLATE_KEY.NFSE_INVOICE_REJECTED],
      ].toSorted(),
    )
  })

  /** A rejeição é por tentativa: reemitir e ser recusado de novo é aviso novo. */
  test('a rejeição de NFS-e deriva a chave da tentativa', () => {
    const first = buildNfseRejectionNotification({
      actorUserId: ACTOR_ID,
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
      invoiceNumber: '2026/117',
      rejectionMessage: 'motivo',
    })
    const second = buildNfseRejectionNotification({
      actorUserId: ACTOR_ID,
      attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
      invoiceNumber: '2026/117',
      rejectionMessage: 'motivo',
    })

    expect(first.dedupeKey).not.toBe(second.dedupeKey)
  })

  test('o disparo entrega ao dono do agregado, no idioma do produto', async () => {
    const sent: Record<string, unknown>[] = []
    const trigger = createNotificationTrigger({
      logger: SILENT_LOGGER,
      send: async (params) => {
        sent.push({ ...params })
      },
    })

    await trigger.notify(
      buildBillingInvoiceDueNotification({
        actorUserId: ACTOR_ID,
        companyId: COMPANY_ID,
        dueDate: new Date('2026-08-20T03:00:00.000Z'),
        invoiceId: INVOICE_ID,
        invoiceNumber: 42n,
      }),
    )

    expect(sent).toHaveLength(1)
    expect(sent[0]?.recipientUserId).toBe(ACTOR_ID)
    expect(sent[0]?.locale).toBe('pt-BR')
  })

  /** O ciclo do cron não pode morrer por causa de um aviso: a liquidação fiscal já aconteceu. */
  test('falha ao notificar não propaga para o ciclo', async () => {
    const warnings: string[] = []
    const trigger = createNotificationTrigger({
      logger: { ...SILENT_LOGGER, warn: (message) => warnings.push(message) },
      send: async () => {
        throw new Error('broker fora do ar')
      },
    })

    await trigger.notify(
      buildNfseRejectionNotification({
        actorUserId: ACTOR_ID,
        attemptId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        companyId: COMPANY_ID,
        invoiceId: INVOICE_ID,
        invoiceNumber: '2026/117',
        rejectionMessage: 'motivo',
      }),
    )

    expect(warnings).toEqual(['notification_trigger_failed'])
  })
})

describe('contrato da varredura de faturas vencendo', () => {
  const DUE = {
    actorUserId: ACTOR_ID,
    companyId: COMPANY_ID,
    dueDate: new Date('2026-08-20T03:00:00.000Z'),
    id: INVOICE_ID,
    invoiceNumber: 42n,
  } as const

  test('avisa o dono de cada fatura dentro da janela', async () => {
    const sent: Record<string, unknown>[] = []
    const swept: { readonly now: Date; readonly until: Date }[] = []

    const result = await sweepDueInvoices({
      logger: SILENT_LOGGER,
      now: new Date('2026-08-18T12:00:00.000Z'),
      selectDueInvoices: async (input) => {
        swept.push(input)
        return [DUE, { ...DUE, id: '99999999-9999-4999-8999-999999999999' }]
      },
      trigger: {
        notify: async (input) => {
          sent.push({ ...input })
        },
      },
    })

    expect(result).toBe(2)
    expect(sent).toHaveLength(2)
    // A janela é para frente: fatura já vencida é cobrança, não lembrete.
    expect(swept[0]?.until.getTime()).toBeGreaterThan(swept[0]?.now.getTime() ?? 0)
  })

  test('nenhuma fatura vencendo não é falha', async () => {
    const result = await sweepDueInvoices({
      logger: SILENT_LOGGER,
      now: new Date('2026-08-18T12:00:00.000Z'),
      selectDueInvoices: async () => [],
      trigger: { notify: async () => undefined },
    })

    expect(result).toBe(0)
  })
})
