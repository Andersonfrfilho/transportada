/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNotificationTrigger } from '../../src/notification/application/notification-trigger.service.js'
import {
  buildCertificateExpiryNotification,
  buildCteBatchFailureNotification,
  classifyCertificateExpiry,
} from '../../src/notification/domain/notification-trigger.policy.js'
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

describe('contrato do aviso de certificado digital vencendo', () => {
  const NOW = new Date('2026-10-30T12:00:00.000Z')
  const DAY = 86_400_000
  const CERTIFICATE_ID = '55555555-5555-4555-8555-555555555555'

  function classify(daysAhead: number) {
    return classifyCertificateExpiry({
      expiresAt: new Date(NOW.getTime() + daysAhead * DAY),
      now: NOW,
    })
  }

  test('fora da janela de trinta dias não há aviso', () => {
    expect(classify(31)).toBeNull()
    expect(classify(400)).toBeNull()
  })

  test('cada degrau da régua cobre os dias até o seguinte', () => {
    expect(classify(30)).toEqual({ daysLeft: 30, kind: 'expiring', warningDay: 30 })
    expect(classify(16)).toEqual({ daysLeft: 16, kind: 'expiring', warningDay: 30 })
    expect(classify(15)).toEqual({ daysLeft: 15, kind: 'expiring', warningDay: 15 })
    expect(classify(4)).toEqual({ daysLeft: 4, kind: 'expiring', warningDay: 7 })
    expect(classify(3)).toEqual({ daysLeft: 3, kind: 'expiring', warningDay: 3 })
    expect(classify(1)).toEqual({ daysLeft: 1, kind: 'expiring', warningDay: 1 })
  })

  test('menos de um dia ainda conta como o último dia, e no instante exato já venceu', () => {
    expect(classify(0.5)).toEqual({ daysLeft: 1, kind: 'expiring', warningDay: 1 })
    expect(classify(0)).toEqual({ kind: 'expired' })
    expect(classify(-20)).toEqual({ kind: 'expired' })
  })

  test('o aviso de vencendo traz os marcadores do catálogo e uma chave por degrau', () => {
    const stage = classify(10)
    if (stage === null) throw new Error('esperava um degrau')
    const notification = buildCertificateExpiryNotification({
      certificateId: CERTIFICATE_ID,
      companyId: COMPANY_ID,
      expiresAt: new Date(NOW.getTime() + 10 * DAY),
      recipientUserId: OPERATOR_ID,
      stage,
    })

    expect(notification.category).toBe(NOTIFICATION_CATEGORY.FISCAL)
    expect(notification.templateKey).toBe(NOTIFICATION_TEMPLATE_KEY.FISCAL_CERTIFICATE_EXPIRING)
    expect(notification.recipientUserId).toBe(OPERATOR_ID)
    expect(Object.keys(notification.payload).toSorted()).toEqual(
      [
        ...NOTIFICATION_TEMPLATE_PLACEHOLDERS[
          NOTIFICATION_TEMPLATE_KEY.FISCAL_CERTIFICATE_EXPIRING
        ],
      ].toSorted(),
    )
    expect(notification.dedupeKey).toBe(`fiscal.certificate-expiring:${CERTIFICATE_ID}:15`)
  })

  test('o aviso de vencido traz os marcadores do catálogo e uma chave só por certificado', () => {
    const stage = classify(-3)
    if (stage === null) throw new Error('esperava vencido')
    const notification = buildCertificateExpiryNotification({
      certificateId: CERTIFICATE_ID,
      companyId: COMPANY_ID,
      expiresAt: new Date(NOW.getTime() - 3 * DAY),
      recipientUserId: OPERATOR_ID,
      stage,
    })

    expect(notification.templateKey).toBe(NOTIFICATION_TEMPLATE_KEY.FISCAL_CERTIFICATE_EXPIRED)
    expect(Object.keys(notification.payload).toSorted()).toEqual(
      [
        ...NOTIFICATION_TEMPLATE_PLACEHOLDERS[NOTIFICATION_TEMPLATE_KEY.FISCAL_CERTIFICATE_EXPIRED],
      ].toSorted(),
    )
    expect(notification.dedupeKey).toBe(`fiscal.certificate-expired:${CERTIFICATE_ID}`)
  })
})
