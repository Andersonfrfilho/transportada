/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.5 (ADR-0101 §9): o aviso do sino do motorista. O da ocorrência é o de sempre, byte a byte
 * (constantes capturadas antes da mudança); só ganha campos extras no `payload`. Nota e viagem usam
 * uma chave nova, sem o corpo e sem nome de pessoa.
 */
import { describe, expect, test } from 'bun:test'

import { buildNotificationTemplateSeeds } from '../../src/notification/application/notification-template-seed.service.js'
import {
  NOTIFICATION_CATALOG,
  NOTIFICATION_TEMPLATE_KEY,
} from '../../src/notification/domain/notification-catalog.constant.js'
import { NOTIFICATION_TEMPLATE_PREVIEW_PAYLOAD } from '../../src/notification/domain/notification-preview.constant.js'
import { createDriverConversationNotifier } from '../../src/occurrence-conversation/infrastructure/driver-conversation-notifier.gateway.js'
import { createOfficeSubjectNotifier } from '../../src/occurrence-conversation/infrastructure/office-subject-notifier.adapter.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000260001'
const RECIPIENT_ID = '00000000-0000-4000-8000-000000260002'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000260003'
const SUBJECT_ID = '00000000-0000-4000-8000-000000260004'
const MESSAGE_ID = '00000000-0000-4000-8000-000000260005'
const PROTOCOL = '261009-AB12'
const RECIPIENT_NAME = 'Joao Motorista da Silva'
const MESSAGE_BODY = 'Pode aguardar na doca 3?'

/** O que o notificador da ocorrência emitia antes da T2.5, capturado antes da mudança. */
const LEGACY_EMISSION = {
  category: 'trip',
  companyId: COMPANY_ID,
  dedupeKey: `trip.conversation-message:${MESSAGE_ID}`,
  payload: { occurrenceLabel: 'NF 4512/1' },
  recipientUserId: RECIPIENT_ID,
  templateKey: 'trip.conversation-message',
} as const

function createCapture(options: { readonly fails?: boolean } = {}) {
  const sent: Record<string, unknown>[] = []
  const warnings: { event: string; meta?: Record<string, unknown> }[] = []
  const notifier = createDriverConversationNotifier({
    logger: {
      warn: (event, meta) => void warnings.push({ event, ...(meta === undefined ? {} : { meta }) }),
    },
    send: async (params) => {
      if (options.fails === true) throw new Error('queue down')
      sent.push(params as Record<string, unknown>)
    },
  })
  return { notifier, sent, warnings }
}

describe('o aviso do sino da ocorrência continua o de sempre (spec 263 T2.5)', () => {
  test('chamada antiga, sem assunto: a emissão é idêntica à de antes, sem campo extra', async () => {
    const { notifier, sent } = createCapture()

    await notifier.notify({
      companyId: COMPANY_ID,
      dedupeKey: MESSAGE_ID,
      occurrenceLabel: 'NF 4512/1',
      recipientUserId: RECIPIENT_ID,
    })

    expect(sent).toEqual([LEGACY_EMISSION])
    expect(JSON.stringify(sent[0])).toBe(JSON.stringify(LEGACY_EMISSION))
  })

  test('a ocorrência com assunto: chave, categoria, dedupeKey e campo antigo iguais; só ganha os extras', async () => {
    const { notifier, sent } = createCapture()

    await notifier.notify({
      companyId: COMPANY_ID,
      dedupeKey: MESSAGE_ID,
      occurrenceLabel: 'NF 4512/1',
      protocol: PROTOCOL,
      recipientUserId: RECIPIENT_ID,
      subjectId: OCCURRENCE_ID,
      subjectType: 'occurrence',
    })

    const [emission] = sent
    const { payload, ...rest } = emission as { payload: Record<string, unknown> }
    const { payload: legacyPayload, ...legacyRest } = LEGACY_EMISSION
    expect(rest).toEqual(legacyRest)
    expect(payload).toEqual({
      ...legacyPayload,
      protocol: PROTOCOL,
      subjectId: OCCURRENCE_ID,
      subjectLabel: 'NF 4512/1',
      subjectType: 'occurrence',
    })
  })

  test('o catálogo da chave antiga não mudou: INBOX, marcador occurrenceLabel e o texto de sempre', () => {
    const entry = NOTIFICATION_CATALOG.find(
      (candidate) => candidate.templateKey === 'trip.conversation-message',
    )

    expect(entry).toEqual({
      category: 'trip',
      channels: ['inbox'],
      placeholders: ['occurrenceLabel'],
      templateKey: 'trip.conversation-message',
      templates: {
        inbox: {
          body: 'A operação mandou uma mensagem sobre a ocorrência {{occurrenceLabel}}. Abra a ocorrência no app para ler e responder.',
        },
      },
    })
  })

  test('falha da fila é registrada pelo nome e não sobe', async () => {
    const { notifier, warnings } = createCapture({ fails: true })

    await notifier.notify({
      companyId: COMPANY_ID,
      dedupeKey: MESSAGE_ID,
      occurrenceLabel: 'NF 4512/1',
      recipientUserId: RECIPIENT_ID,
    })

    expect(warnings).toEqual([
      {
        event: 'occurrence_conversation_driver_notice_failed',
        meta: { companyId: COMPANY_ID, errorName: 'Error' },
      },
    ])
  })
})

describe('o aviso do sino por assunto, para nota e viagem (spec 263 T2.5)', () => {
  const subjectCases: { subjectLabel: string; subjectType: 'document' | 'trip' }[] = [
    { subjectLabel: 'NF 4512/1', subjectType: 'document' },
    { subjectLabel: 'Viagem 09/10 · São Carlos', subjectType: 'trip' },
  ]

  test.each(subjectCases)(
    '$subjectType: chave nova, payload sem corpo nem nome, uma por mensagem',
    async ({ subjectLabel, subjectType }) => {
      const { notifier, sent } = createCapture()
      const adapter = createOfficeSubjectNotifier(notifier)

      await adapter.notify({
        companyId: COMPANY_ID,
        dedupeKey: MESSAGE_ID,
        protocol: PROTOCOL,
        recipientUserId: RECIPIENT_ID,
        subjectId: SUBJECT_ID,
        subjectLabel,
        subjectType,
      })

      expect(sent).toEqual([
        {
          category: 'trip',
          companyId: COMPANY_ID,
          dedupeKey: `trip.subject-conversation-message:${MESSAGE_ID}`,
          payload: { protocol: PROTOCOL, subjectId: SUBJECT_ID, subjectLabel, subjectType },
          recipientUserId: RECIPIENT_ID,
          templateKey: 'trip.subject-conversation-message',
        },
      ])
      const serialized = JSON.stringify(sent)
      expect(serialized).not.toContain(MESSAGE_BODY)
      expect(serialized).not.toContain(RECIPIENT_NAME)
      expect(serialized).not.toContain('occurrenceLabel')
    },
  )

  test('o adaptador ignora campos alheios ao contrato: nome e corpo passados por engano não saem', async () => {
    const { notifier, sent } = createCapture()
    const adapter = createOfficeSubjectNotifier(notifier)

    await adapter.notify({
      bodyText: MESSAGE_BODY,
      companyId: COMPANY_ID,
      dedupeKey: MESSAGE_ID,
      protocol: PROTOCOL,
      recipientName: RECIPIENT_NAME,
      recipientUserId: RECIPIENT_ID,
      subjectId: SUBJECT_ID,
      subjectLabel: 'NF 4512/1',
      subjectType: 'document',
    } as Parameters<typeof adapter.notify>[0])

    const serialized = JSON.stringify(sent)
    expect(serialized).not.toContain(MESSAGE_BODY)
    expect(serialized).not.toContain(RECIPIENT_NAME)
  })

  test('a repetição da mesma mensagem tem a mesma dedupeKey', async () => {
    const { notifier, sent } = createCapture()
    const adapter = createOfficeSubjectNotifier(notifier)
    const input = {
      companyId: COMPANY_ID,
      dedupeKey: MESSAGE_ID,
      protocol: PROTOCOL,
      recipientUserId: RECIPIENT_ID,
      subjectId: SUBJECT_ID,
      subjectLabel: 'NF 4512/1',
      subjectType: 'document',
    } as const

    await adapter.notify(input)
    await adapter.notify(input)

    expect(new Set(sent.map((emission) => emission.dedupeKey)).size).toBe(1)
  })

  test('falha da fila não sobe também no aviso por assunto', async () => {
    const { notifier, warnings } = createCapture({ fails: true })
    const adapter = createOfficeSubjectNotifier(notifier)

    await adapter.notify({
      companyId: COMPANY_ID,
      dedupeKey: MESSAGE_ID,
      protocol: PROTOCOL,
      recipientUserId: RECIPIENT_ID,
      subjectId: SUBJECT_ID,
      subjectLabel: 'NF 4512/1',
      subjectType: 'trip',
    })

    expect(warnings).toHaveLength(1)
  })

  test('o catálogo traz a chave nova: INBOX, marcador subjectLabel e o texto combinado', () => {
    expect(NOTIFICATION_TEMPLATE_KEY.TRIP_SUBJECT_CONVERSATION_MESSAGE).toBe(
      'trip.subject-conversation-message',
    )
    const entry = NOTIFICATION_CATALOG.find(
      (candidate) => candidate.templateKey === 'trip.subject-conversation-message',
    )

    expect(entry).toEqual({
      category: 'trip',
      channels: ['inbox'],
      placeholders: ['subjectLabel'],
      templateKey: 'trip.subject-conversation-message',
      templates: {
        inbox: {
          body: 'A operação mandou uma mensagem · {{subjectLabel}}. Abra Conversas no app para ler e responder.',
        },
      },
    })
  })

  test('a semente cria o template novo e o envio de teste tem exemplo para o marcador', () => {
    const seeds = buildNotificationTemplateSeeds({ companyId: COMPANY_ID })
    const created = seeds.filter((seed) => seed.key === 'trip.subject-conversation-message')

    expect(created.map((seed) => seed.channel)).toEqual(['inbox'])
    expect(created[0]?.body).toContain('{{subjectLabel}}')
    expect(NOTIFICATION_TEMPLATE_PREVIEW_PAYLOAD.subjectLabel).toBe('NF 4512/1')
    const legacy = seeds.filter((seed) => seed.key === 'trip.conversation-message')
    expect(legacy).toHaveLength(1)
    expect(legacy[0]?.body).toBe(
      'A operação mandou uma mensagem sobre a ocorrência {{occurrenceLabel}}. Abra a ocorrência no app para ler e responder.',
    )
  })
})
