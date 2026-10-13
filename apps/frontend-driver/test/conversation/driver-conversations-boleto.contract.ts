/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 248 T5.4 (RF7, RF14): o boleto que o escritório levou da contratante chega ao motorista como mensagem
 * `app` na conversa da ocorrência, com o PDF apontando para o objeto do bucket. Esta suíte prova, do lado do app,
 * que o aviso do sino abre a conversa e que a mensagem entra com "boleto.pdf" como documento e URL assinada.
 */
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { attachmentKindOf } from '../../src/modules/conversation/shared/driverConversationsMapper.service'
import { resolveNotificationDestination } from '../../src/modules/notification/shared/notificationDestination.service'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const OCCURRENCE_ID = '0b9a4b8e-0000-4000-8000-000000000248'
const SUBJECT = { subjectId: OCCURRENCE_ID, subjectType: 'occurrence' } as const
const SIGNED_URL = 'https://bucket.test/occurrence-conversations/opaque-token?X-Signature=abc'
const BOLETO_SIZE_BYTES = 52_480

const boletoMessage = {
  attachments: [
    {
      contentType: 'application/pdf',
      fileName: 'boleto.pdf',
      id: 'attachment-boleto',
      sizeBytes: BOLETO_SIZE_BYTES,
      url: SIGNED_URL,
    },
  ],
  authorName: 'Escritório',
  bodyText: 'Boleto atualizado da NF 717795.',
  createdAt: '2026-10-12T10:00:00.000Z',
  direction: 'outbound',
  id: 'message-boleto',
  status: null,
}

function createApi() {
  return createDriverConversationsApi({
    fallbackSubjectLabel: () => 'Ocorrência',
    http: createDriverConversationHttp({
      baseUrl: 'https://api.test/v1',
      fetch: () => Promise.resolve(new Response(JSON.stringify({ data: [boletoMessage] }))),
      getAccessToken: () => Promise.resolve('token'),
    }),
    isOnline: () => true,
    outbox: createConversationOutbox({
      getOwnerKey: () => 'owner-1',
      runExclusive: (run) => run(),
      store: createMemoryOutboxStore(),
    }),
  })
}

describe('boleto da contratante na conversa do motorista (spec 248 T5.4)', () => {
  it('o aviso do sino da entrega abre a conversa da ocorrência', () => {
    const payload = {
      occurrenceLabel: 'NF 717795 · prorrogação',
      protocol: '261012-B4K7',
      subjectId: OCCURRENCE_ID,
      subjectLabel: 'NF 717795 · prorrogação',
      subjectType: 'occurrence',
    }
    expect(
      resolveNotificationDestination({ payload, templateKey: 'trip.conversation-message' }),
    ).toEqual({ kind: 'conversation', subject: SUBJECT })
  })

  it('PDF é documento, não imagem nem áudio', () => {
    expect(attachmentKindOf('application/pdf')).toBe('document')
  })

  it('a mensagem do escritório chega com boleto.pdf como documento', async () => {
    const [message] = await createApi().fetchMessages(SUBJECT)

    expect(message?.direction).toBe('outbound')
    expect(message?.attachments).toEqual([
      {
        filename: 'boleto.pdf',
        id: 'attachment-boleto',
        kind: 'document',
        mimeType: 'application/pdf',
        sizeBytes: BOLETO_SIZE_BYTES,
      },
    ])
  })

  it('a URL assinada da leitura é a que o toque em boleto.pdf abre', async () => {
    const api = createApi()
    const [message] = await api.fetchMessages(SUBJECT)
    const attachment = message?.attachments[0]
    if (attachment === undefined) throw new Error('boleto attachment missing')

    expect(await api.resolveAttachmentUrl(attachment)).toBe(SIGNED_URL)
  })
})
