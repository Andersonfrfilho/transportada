/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.10 (RF5): o aviso do alerta — chave por alerta, template e marcadores do catálogo, destinatário
 * quem despachou a viagem, e a falha de entrega que sobe em vez de ser engolida.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TEMPLATE_KEY,
  NOTIFICATION_TEMPLATE_PLACEHOLDERS,
} from '../../src/notification/notification.constant.js'
import { createContractorReplyAlertNotifier } from '../../src/occurrence-contractor-reply-alert/infrastructure/contractor-reply-alert-notifier.gateway.js'

const API_CATALOG_SOURCE = readFileSync(
  fileURLToPath(
    new URL(
      '../../../api-transportada/src/notification/domain/notification-catalog.constant.ts',
      import.meta.url,
    ),
  ),
  'utf8',
)

function buildNotifier() {
  const sent: Record<string, unknown>[] = []
  const notifier = createContractorReplyAlertNotifier({
    send: async (params) => {
      sent.push({ ...params })
    },
  })
  return { notifier, sent }
}

const BASE = {
  companyId: 'company-a',
  recipient: { occurrenceLabel: 'NF 123/1', recipientUserId: 'user-1' },
  replyId: 'reply-1',
} as const

describe('contractor reply alert notifier', () => {
  test('dedupes by reply and alert number, so every alert is a new notification', async () => {
    const { notifier, sent } = buildNotifier()

    await notifier.notify({ ...BASE, alertNumber: 1 })
    await notifier.notify({ ...BASE, alertNumber: 2 })
    await notifier.notify({ ...BASE, alertNumber: 1 })

    expect(sent.map((item) => item.dedupeKey)).toEqual([
      'reply:reply-1:1',
      'reply:reply-1:2',
      'reply:reply-1:1',
    ])
  })

  test('uses the trip category, the overdue template and exactly its placeholders', async () => {
    const { notifier, sent } = buildNotifier()

    await notifier.notify({ ...BASE, alertNumber: 3 })

    const [notification] = sent
    expect(notification?.category).toBe(NOTIFICATION_CATEGORY.TRIP)
    expect(notification?.templateKey).toBe(
      NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_CONTRACTOR_REPLY_OVERDUE,
    )
    expect(notification?.recipientUserId).toBe('user-1')
    expect(notification?.payload).toEqual({ alertNumber: '3', occurrenceLabel: 'NF 123/1' })
    expect(Object.keys(notification?.payload as object).toSorted()).toEqual([
      ...NOTIFICATION_TEMPLATE_PLACEHOLDERS['trip.occurrence-contractor-reply-overdue'],
    ])
  })

  test('the API catalog declares the same key and placeholders', () => {
    const key = NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_CONTRACTOR_REPLY_OVERDUE
    expect(API_CATALOG_SOURCE).toContain(`'${key}'`)

    const entryStart = API_CATALOG_SOURCE.indexOf(
      'templateKey: NOTIFICATION_TEMPLATE_KEY.TRIP_OCCURRENCE_CONTRACTOR_REPLY_OVERDUE',
    )
    const before = API_CATALOG_SOURCE.slice(0, entryStart).trimEnd()
    const placeholders = /placeholders: \[([^\]]*)\],?$/u.exec(before)?.[1] ?? ''
    for (const marker of NOTIFICATION_TEMPLATE_PLACEHOLDERS[key]) {
      expect(placeholders).toContain(`'${marker}'`)
    }
  })

  test('a delivery failure is not swallowed', async () => {
    const notifier = createContractorReplyAlertNotifier({
      send: async () => {
        throw new Error('queue down')
      },
    })

    await expect(notifier.notify({ ...BASE, alertNumber: 1 })).rejects.toThrow('queue down')
  })
})
