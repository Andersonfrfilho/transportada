/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.6b: o aviso do sino do motorista no caminho automático é o MESMO que a API manda quando o
 * operador entrega o boleto — template `trip.conversation-message`, assunto ocorrência, chave de aviso
 * `trip.conversation-message:<id da mensagem>` — para o mesmo envio nunca virar dois avisos. Os marcadores
 * conferem com o catálogo da API; a falha é registrada pelo nome e não sobe.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'bun:test'

import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TEMPLATE_KEY,
  NOTIFICATION_TEMPLATE_PLACEHOLDERS,
} from '../../src/notification/notification.constant.js'
import {
  createDriverReplyNotifier,
  DRIVER_REPLY_NOTIFIER_LOG,
} from '../../src/occurrence-conversation/infrastructure/driver-reply-notifier.gateway.js'

const API_CATALOG_SOURCE = readFileSync(
  fileURLToPath(
    new URL(
      '../../../api-transportada/src/notification/domain/notification-catalog.constant.ts',
      import.meta.url,
    ),
  ),
  'utf8',
)
const API_NOTIFIER_SOURCE = readFileSync(
  fileURLToPath(
    new URL(
      '../../../api-transportada/src/occurrence-conversation/infrastructure/driver-conversation-notifier.gateway.ts',
      import.meta.url,
    ),
  ),
  'utf8',
)

const NOTICE = {
  companyId: '00000000-0000-4000-8000-000000248101',
  driverMessageId: '00000000-0000-4000-8000-000000248102',
  driverUserId: '00000000-0000-4000-8000-000000248103',
  occurrenceId: '00000000-0000-4000-8000-000000248104',
  occurrenceLabel: 'NF 4512/1',
  protocol: '261012-AB12',
} as const

function buildNotifier(options: { readonly fails?: boolean } = {}) {
  const sent: Record<string, unknown>[] = []
  const warnings: { message: string; metadata?: Record<string, unknown> }[] = []
  const notifier = createDriverReplyNotifier({
    logger: {
      debug: () => undefined,
      error: () => undefined,
      info: () => undefined,
      warn: (message: string, metadata?: Record<string, unknown>) => {
        warnings.push({ message, ...(metadata === undefined ? {} : { metadata }) })
      },
    } as never,
    send: async (params) => {
      if (options.fails === true) throw new Error('queue down')
      sent.push({ ...params })
    },
  })
  return { notifier, sent, warnings }
}

describe('o aviso do sino do motorista na entrega automática (spec 248 T4.6b)', () => {
  test('emite o mesmo aviso do operador: categoria, template, assunto e chave de aviso', async () => {
    const { notifier, sent } = buildNotifier()

    await notifier.notify(NOTICE)

    expect(sent).toEqual([
      {
        category: NOTIFICATION_CATEGORY.TRIP,
        companyId: NOTICE.companyId,
        dedupeKey: `trip.conversation-message:${NOTICE.driverMessageId}`,
        locale: 'pt-BR',
        payload: {
          occurrenceLabel: 'NF 4512/1',
          protocol: '261012-AB12',
          subjectId: NOTICE.occurrenceId,
          subjectLabel: 'NF 4512/1',
          subjectType: 'occurrence',
        },
        recipientUserId: NOTICE.driverUserId,
        templateKey: 'trip.conversation-message',
      },
    ])
  })

  test('o payload carrega os marcadores do template e nada do texto nem do anexo', async () => {
    const { notifier, sent } = buildNotifier()

    await notifier.notify(NOTICE)

    const payload = (sent[0]?.payload ?? {}) as Record<string, unknown>
    for (const marker of NOTIFICATION_TEMPLATE_PLACEHOLDERS['trip.conversation-message']) {
      expect(payload).toHaveProperty(marker)
    }
    expect(Object.keys(payload).toSorted()).toEqual([
      'occurrenceLabel',
      'protocol',
      'subjectId',
      'subjectLabel',
      'subjectType',
    ])
  })

  test('a API declara a mesma chave, os mesmos marcadores e a mesma chave de aviso', () => {
    const key = NOTIFICATION_TEMPLATE_KEY.TRIP_CONVERSATION_MESSAGE
    expect(API_CATALOG_SOURCE).toContain(`'${key}'`)
    const entryStart = API_CATALOG_SOURCE.indexOf(
      'templateKey: NOTIFICATION_TEMPLATE_KEY.TRIP_CONVERSATION_MESSAGE',
    )
    const before = API_CATALOG_SOURCE.slice(0, entryStart).trimEnd()
    const placeholders = /placeholders: \[([^\]]*)\],?$/u.exec(before)?.[1] ?? ''
    for (const marker of NOTIFICATION_TEMPLATE_PLACEHOLDERS[key]) {
      expect(placeholders).toContain(`'${marker}'`)
    }
    expect(API_NOTIFIER_SOURCE).toContain('dedupeKey: `${templateKey}:${dedupeKey}`')
    expect(API_NOTIFIER_SOURCE).toContain(
      'subjectType === OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE',
    )
    expect(API_NOTIFIER_SOURCE).toContain('subjectLabel: occurrenceLabel')
  })

  test('a falha de entrega é registrada só pelo nome e não sobe', async () => {
    const { notifier, warnings } = buildNotifier({ fails: true })

    await expect(notifier.notify(NOTICE)).resolves.toBeUndefined()

    expect(warnings).toEqual([
      {
        message: DRIVER_REPLY_NOTIFIER_LOG.failed,
        metadata: { companyId: NOTICE.companyId, errorName: 'Error' },
      },
    ])
    expect(JSON.stringify(warnings)).not.toContain(NOTICE.driverUserId)
    expect(JSON.stringify(warnings)).not.toContain(NOTICE.occurrenceLabel)
  })
})
