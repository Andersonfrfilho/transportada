/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 248 T5.4 (RF7, RF14): o boleto que o escritório levou da contratante chega ao motorista como mensagem
 * `app` na conversa da ocorrência, com o PDF apontando para o objeto do bucket. Esta suíte prova a cadeia inteira
 * do lado do app: o aviso do sino abre a conversa, a mensagem entra com "boleto.pdf" como documento, e a URL
 * assinada que a API devolve na leitura baixa o PDF como anexo.
 */
import { describe, expect, it } from 'bun:test'

import { createConversationOutbox } from '../../src/modules/conversation/shared/conversationOutbox.service'
import { createDriverConversationsApi } from '../../src/modules/conversation/shared/driverConversationsApi.service'
import { attachmentKindOf } from '../../src/modules/conversation/shared/driverConversationsMapper.service'
import { createDriverConversationHttp } from '../../src/modules/conversation/shared/driverConversationsHttp.service'
import { resolveNotificationDestination } from '../../src/modules/notification/shared/notificationDestination.service'
import { createConversationRoutes } from '../../scripts/driver-preview-conversations'
import { createConversationRepository } from '../../scripts/driver-preview-conversations-repository'
import { PREVIEW_BOLETO_ATTACHMENT } from '../../scripts/driver-preview-conversations-boleto'
import { PREVIEW_OCCURRENCE_IDS } from '../../scripts/driver-preview-conversations-seed'
import { createMemoryOutboxStore } from '../fixtures/memory-conversation-outbox-store.fixture'

const EXTENSION = PREVIEW_OCCURRENCE_IDS.extension
const ORIGIN = 'http://localhost:53901'
const PDF_MAGIC = '%PDF-'

function createHarness() {
  const routes = createConversationRoutes({
    corsHeaders: {},
    officeReplyDelayMs: 0,
    port: 53901,
    repository: createConversationRepository(),
  })
  const call = async (path: string): Promise<Response> => {
    const response = await routes(new Request(`${ORIGIN}${path}`), new URL(`${ORIGIN}${path}`))
    if (response === undefined) throw new Error(`ROUTE_NOT_SERVED_${path}`)
    return response
  }
  const api = createDriverConversationsApi({
    fallbackSubjectLabel: () => 'Ocorrência',
    http: createDriverConversationHttp({
      baseUrl: `${ORIGIN}/v1`,
      fetch: (request) => {
        const { pathname, search } = new URL(request.url)
        return call(`${pathname}${search}`)
      },
      getAccessToken: () => Promise.resolve('token'),
    }),
    isOnline: () => true,
    outbox: createConversationOutbox({
      getOwnerKey: () => 'owner-1',
      runExclusive: (run) => run(),
      store: createMemoryOutboxStore(),
    }),
  })
  return { api, call }
}

describe('boleto da contratante na conversa do motorista (spec 248 T5.4)', () => {
  it('o aviso do sino da entrega abre a conversa da ocorrência', () => {
    const payload = {
      occurrenceLabel: 'NF 717795 · prorrogação',
      protocol: '261012-B4K7',
      subjectId: EXTENSION,
      subjectLabel: 'NF 717795 · prorrogação',
      subjectType: 'occurrence',
    }
    expect(
      resolveNotificationDestination({ payload, templateKey: 'trip.conversation-message' }),
    ).toEqual({
      kind: 'conversation',
      subject: { subjectId: EXTENSION, subjectType: 'occurrence' },
    })
  })

  it('PDF é documento, não imagem nem áudio', () => {
    expect(attachmentKindOf('application/pdf')).toBe('document')
  })

  it('a mensagem do escritório chega com boleto.pdf como documento e o PDF segue o contrato do pacote', async () => {
    const { api } = createHarness()
    const messages = await api.fetchMessages({ subjectId: EXTENSION, subjectType: 'occurrence' })
    const withBoleto = messages.find((message) => message.attachments.length > 0)

    expect(withBoleto?.direction).toBe('outbound')
    expect(withBoleto?.attachments).toEqual([
      {
        filename: 'boleto.pdf',
        id: PREVIEW_BOLETO_ATTACHMENT.id,
        kind: 'document',
        mimeType: 'application/pdf',
        sizeBytes: PREVIEW_BOLETO_ATTACHMENT.sizeBytes,
      },
    ])
  })

  it('a URL assinada da leitura baixa o PDF como anexo', async () => {
    const { api, call } = createHarness()
    const messages = await api.fetchMessages({ subjectId: EXTENSION, subjectType: 'occurrence' })
    const attachment = messages.flatMap((message) => message.attachments)[0]
    if (attachment === undefined) throw new Error('boleto attachment missing')

    const url = await api.resolveAttachmentUrl(attachment)
    const { pathname } = new URL(url)
    const download = await call(pathname)

    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('application/pdf')
    expect(download.headers.get('content-disposition')).toBe('attachment; filename="boleto.pdf"')
    expect((await download.text()).startsWith(PDF_MAGIC)).toBe(true)
  })

  it('a rota antiga de ocorrência (queda) também entrega o anexo com URL', async () => {
    const { call } = createHarness()
    const response = await call(`/v1/me/trips/current/occurrences/${EXTENSION}/messages`)
    const { data } = (await response.json()) as {
      data: { attachments: { contentType: string; fileName: string; url: string }[] }[]
    }
    const [attachment] = data.flatMap((message) => message.attachments)

    expect(attachment).toMatchObject({ contentType: 'application/pdf', fileName: 'boleto.pdf' })
    expect(attachment?.url).toContain('/__conversation-storage/')
  })
})
