/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.6b: a resposta da contratante entregue sozinha ao motorista avisa o sino dele com a MESMA emissão
 * do caminho do operador (`deliverContractorReplyToDriver` + `createDriverConversationNotifier`): template
 * `trip.conversation-message`, assunto ocorrência, chave de aviso pelo id da mensagem do chat do motorista.
 */
import { describe, expect, test } from 'bun:test'

import { createContractorReplyDeliveryNotifier } from '../../src/occurrence-conversation/infrastructure/contractor-reply-delivery-notifier.adapter.js'
import { createDriverConversationNotifier } from '../../src/occurrence-conversation/infrastructure/driver-conversation-notifier.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000248201'
const RECIPIENT_ID = '00000000-0000-4000-8000-000000248202'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000248203'
const MESSAGE_ID = '00000000-0000-4000-8000-000000248204'

function createCapture() {
  const sent: Record<string, unknown>[] = []
  const driverNotifier = createDriverConversationNotifier({
    logger: { warn: () => undefined },
    send: async (params) => {
      sent.push(params as Record<string, unknown>)
    },
  })
  return { notifier: createContractorReplyDeliveryNotifier({ driverNotifier }), sent }
}

describe('o aviso do sino na entrega automática do boleto (spec 248 T4.6b)', () => {
  test('é a mesma emissão do operador: chave, categoria, assunto, protocolo e chave de aviso', async () => {
    const { notifier, sent } = createCapture()

    await notifier.notify({
      companyId: COMPANY_ID,
      delivery: {
        messageId: MESSAGE_ID,
        occurrenceId: OCCURRENCE_ID,
        occurrenceLabel: 'NF 4512/1',
        protocol: '261012-AB12',
        recipientUserId: RECIPIENT_ID,
      },
    })

    expect(sent).toEqual([
      {
        category: 'trip',
        companyId: COMPANY_ID,
        dedupeKey: `trip.conversation-message:${MESSAGE_ID}`,
        payload: {
          occurrenceLabel: 'NF 4512/1',
          protocol: '261012-AB12',
          subjectId: OCCURRENCE_ID,
          subjectLabel: 'NF 4512/1',
          subjectType: 'occurrence',
        },
        recipientUserId: RECIPIENT_ID,
        templateKey: 'trip.conversation-message',
      },
    ])
  })
})
