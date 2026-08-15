/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNotificationTrigger } from '../../src/notification/application/notification-trigger.service.js'
import { buildCteBatchFailureNotification } from '../../src/notification/domain/notification-trigger.policy.js'
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TEMPLATE_KEY,
  NOTIFICATION_TEMPLATE_PLACEHOLDERS,
} from '../../src/notification/notification.constant.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const BATCH_ID = '33333333-3333-4333-8333-333333333333'
const OPERATOR_ID = '44444444-4444-4444-8444-444444444444'

const BATCH_FAILURE = {
  batchId: BATCH_ID,
  batchName: 'Lote 12',
  companyId: COMPANY_ID,
  failedCount: 3,
  operatorUserId: OPERATOR_ID,
} as const

describe('contrato dos disparos de notificação do worker', () => {
  test('a falha do lote vira uma notificação com os marcadores do catálogo', () => {
    const notification = buildCteBatchFailureNotification(BATCH_FAILURE)

    expect(notification.category).toBe(NOTIFICATION_CATEGORY.CTE_BATCH)
    expect(notification.templateKey).toBe(NOTIFICATION_TEMPLATE_KEY.CTE_BATCH_ISSUANCE_FAILED)
    expect(notification.recipientUserId).toBe(OPERATOR_ID)
    expect(Object.keys(notification.payload).toSorted()).toEqual(
      [
        ...NOTIFICATION_TEMPLATE_PLACEHOLDERS[NOTIFICATION_TEMPLATE_KEY.CTE_BATCH_ISSUANCE_FAILED],
      ].toSorted(),
    )
  })

  /** A chave sai do agregado, não do relógio: reentrega da mesma mensagem não vira segundo aviso. */
  test('a chave de deduplicação é derivada do lote e não muda entre chamadas', () => {
    const first = buildCteBatchFailureNotification(BATCH_FAILURE)
    const second = buildCteBatchFailureNotification({
      ...BATCH_FAILURE,
      batchName: 'Lote 12 renomeado',
      failedCount: 9,
    })

    expect(first.dedupeKey).toBe(second.dedupeKey)
    expect(first.dedupeKey).toContain(BATCH_ID)
  })

  test('o disparo entrega ao dono do lote, no idioma do produto', async () => {
    const sent: Record<string, unknown>[] = []
    const trigger = createNotificationTrigger({
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      send: async (params) => {
        sent.push({ ...params })
      },
    })

    await trigger.notify(buildCteBatchFailureNotification(BATCH_FAILURE))

    expect(sent).toHaveLength(1)
    expect(sent[0]?.recipientUserId).toBe(OPERATOR_ID)
    expect(sent[0]?.companyId).toBe(COMPANY_ID)
    expect(sent[0]?.locale).toBe('pt-BR')
  })

  /**
   * Aviso é efeito colateral do processamento fiscal: se a notificação estourar, o CT-e já foi
   * liquidado e a mensagem não pode voltar para a fila por causa disso.
   */
  test('falha ao notificar não propaga para quem estava liquidando a emissão', async () => {
    const warnings: string[] = []
    const trigger = createNotificationTrigger({
      logger: {
        error: () => undefined,
        info: () => undefined,
        warn: (message) => warnings.push(message),
      },
      send: async () => {
        throw new Error('provedor fora do ar')
      },
    })

    await trigger.notify(buildCteBatchFailureNotification(BATCH_FAILURE))

    expect(warnings).toEqual(['notification_trigger_failed'])
  })
})
