/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 260 T3.1/T3.2 (ADR-0101, api-contract "Rotas do escritório"): o escritório abre e responde a
 * conversa de nota e de viagem no detalhe da viagem. Prende as formas das seis rotas, o mapeamento da
 * mensagem para o balão da 183, os estados (encerrada, sem motorista, não lidas), o portão de permissão
 * e — o ouro — que a conversa de ocorrência não foi tocada.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { createSubjectConversationClient } from '@/modules/occurrence-conversation/shared/subjectConversationClient.service'
import {
  countSubjectUnread,
  createSubjectMessageIdempotencyKey,
  findSubjectConversation,
  resolveSubjectConversationAccess,
  resolveSubjectConversationErrorKey,
} from '@/modules/occurrence-conversation/shared/subjectConversation.service'
import type { SubjectConversationSummary } from '@/modules/occurrence-conversation/shared/subjectConversation.types'
import { OccurrenceConversationRequestError } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'

const API_URL = 'https://api.example.test'
const TRIP_ID = '11111111-1111-4111-8111-111111111111'
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222'
const SUBJECT = { subjectId: DOCUMENT_ID, subjectType: 'document', tripId: TRIP_ID } as const

function createClient(response: Response, requests: Request[] = []) {
  return createSubjectConversationClient({
    apiUrl: API_URL,
    fetch: (request) => {
      requests.push(request)
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

const SUMMARY = {
  awaitingDriver: true,
  channels: ['app'],
  driverName: 'Marcos S.',
  lastMessageAt: '2026-10-09T12:00:00.000Z',
  lastMessagePreview: 'Pode entregar amanhã?',
  lastMessageDirection: 'outbound',
  protocol: '261009-K7M2',
  status: 'open',
  subjectId: DOCUMENT_ID,
  subjectLabel: 'NF 4521 · Casa Verde',
  subjectType: 'document',
  tripId: TRIP_ID,
  unreadCount: 2,
}

const OUTBOUND = {
  attachments: [],
  authorName: 'Operadora Lima',
  bodyText: 'Pode entregar amanhã?',
  channel: 'app',
  clientMessageId: 'subject-message:abc',
  createdAt: '2026-10-09T12:00:00.000Z',
  direction: 'outbound',
  id: 'message-1',
  status: 'delivered',
}

describe('cliente da conversa por assunto no escritório (spec 260 T3.1)', () => {
  test('lista a viagem: forma exata exigida, campo novo tolerado, mensagem de ocorrência fora', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json({
        data: [
          { ...SUMMARY, campoNovoDoFuturo: true },
          { ...SUMMARY, subjectId: 'other', subjectType: 'occurrence' },
          { ...SUMMARY, subjectId: 'broken', unreadCount: 'dois' },
          { ...SUMMARY, protocol: undefined, subjectId: 'no-protocol' },
        ],
      }),
      requests,
    )

    const list = await client.listConversations({ tripId: TRIP_ID })

    expect(list.map((summary) => summary.subjectId)).toEqual([DOCUMENT_ID])
    expect(list[0]).toMatchObject({ driverName: 'Marcos S.', protocol: '261009-K7M2' })
    expect(requests[0]?.url).toBe(`${API_URL}/trips/${TRIP_ID}/conversations`)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer synthetic-token')
  })

  test('canal fora do vocabulário sai do resumo; sem nome do motorista vira null', async () => {
    const client = createClient(
      Response.json({
        data: [{ ...SUMMARY, channels: ['app', 'telegram', 'whatsapp'], driverName: undefined }],
      }),
    )

    const [summary] = await client.listConversations({ tripId: TRIP_ID })

    expect(summary?.channels).toEqual(['app', 'whatsapp'])
    expect(summary?.driverName).toBeNull()
  })

  test('resposta que não é lista é resposta inválida, pelo código', async () => {
    const client = createClient(Response.json({ data: { oops: true } }))
    const failure = await client
      .listConversations({ tripId: TRIP_ID })
      .catch((error: unknown) => error)
    expect(failure).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_RESPONSE_INVALID' })
  })

  test('abrir: POST /open com o par do assunto (strict), devolve o resumo', async () => {
    const requests: Request[] = []
    const client = createClient(Response.json({ data: SUMMARY }, { status: 201 }), requests)

    const summary = await client.openConversation(SUBJECT)

    expect(summary.protocol).toBe('261009-K7M2')
    expect(requests[0]?.url).toBe(`${API_URL}/trips/${TRIP_ID}/conversations/open`)
    expect(requests[0]?.method).toBe('POST')
    expect(await requests[0]?.json()).toEqual({ subjectId: DOCUMENT_ID, subjectType: 'document' })
  })

  test('mensagens: o balão da 183 — saída é nossa, nome de quem escreveu, canal e status', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json({
        data: [
          OUTBOUND,
          {
            ...OUTBOUND,
            authorName: 'Marcos S.',
            direction: 'inbound',
            id: 'message-2',
            status: null,
          },
          { ...OUTBOUND, direction: 'sideways', id: 'broken' },
        ],
      }),
      requests,
    )

    const messages = await client.listMessages(SUBJECT)

    expect(requests[0]?.url).toBe(
      `${API_URL}/trips/${TRIP_ID}/conversations/document/${DOCUMENT_ID}/messages`,
    )
    expect(messages.map((message) => message.id)).toEqual(['message-1', 'message-2'])
    expect(messages[0]).toMatchObject({
      author: { kind: 'operation', name: 'Operadora Lima' },
      channel: 'app',
      direction: 'outbound',
      status: 'delivered',
      statusTimes: {},
    })
    expect(messages[1]).toMatchObject({
      author: { kind: 'driver', name: 'Marcos S.' },
      direction: 'inbound',
      status: null,
    })
  })

  test('enviar: Idempotency-Key no cabeçalho e só { body, attachmentIds? } — o corpo é strict', async () => {
    const requests: Request[] = []
    const client = createClient(Response.json({ data: OUTBOUND }, { status: 201 }), requests)

    await client.sendMessage({ ...SUBJECT, body: 'Oi', idempotencyKey: 'subject-message:key-0001' })
    await createClient(Response.json({ data: OUTBOUND }, { status: 201 }), requests).sendMessage({
      ...SUBJECT,
      attachmentIds: ['33333333-3333-4333-8333-333333333333'],
      body: '',
      idempotencyKey: 'subject-message:key-0002',
    })

    expect(requests[0]?.url).toBe(
      `${API_URL}/trips/${TRIP_ID}/conversations/document/${DOCUMENT_ID}/messages`,
    )
    expect(requests[0]?.headers.get('idempotency-key')).toBe('subject-message:key-0001')
    expect(await requests[0]?.json()).toEqual({ body: 'Oi' })
    expect(await requests[1]?.json()).toEqual({
      attachmentIds: ['33333333-3333-4333-8333-333333333333'],
      body: '',
    })
  })

  test('marcar lida e encerrar: POST por assunto; encerrar devolve o resumo', async () => {
    const readRequests: Request[] = []
    await createClient(new Response(null, { status: 204 }), readRequests).markRead(SUBJECT)
    expect(readRequests[0]?.url).toBe(
      `${API_URL}/trips/${TRIP_ID}/conversations/document/${DOCUMENT_ID}/messages/read`,
    )
    expect(readRequests[0]?.method).toBe('POST')

    const closeRequests: Request[] = []
    const closed = await createClient(
      Response.json({ data: { ...SUMMARY, status: 'closed' } }),
      closeRequests,
    ).closeConversation(SUBJECT)
    expect(closed.status).toBe('closed')
    expect(closeRequests[0]?.url).toBe(
      `${API_URL}/trips/${TRIP_ID}/conversations/document/${DOCUMENT_ID}/close`,
    )
  })

  test('anexo em duas etapas: o pedido declara só tipo, nome e tamanho; o PUT vai sem o token', async () => {
    const requests: Request[] = []
    const client = createClient(
      Response.json({
        data: { uploadId: 'upload-1', uploadUrl: 'https://storage.example.test/u' },
      }),
      requests,
    )

    const upload = await client.requestUpload({
      ...SUBJECT,
      contentType: 'image/png',
      fileName: 'foto.png',
      sizeBytes: 12,
    })
    await client.putUpload({
      file: new File(['x'], 'foto.png', { type: 'image/png' }),
      url: upload.uploadUrl,
    })

    expect(upload).toEqual({ uploadId: 'upload-1', uploadUrl: 'https://storage.example.test/u' })
    expect(requests[0]?.url).toBe(
      `${API_URL}/trips/${TRIP_ID}/conversations/document/${DOCUMENT_ID}/uploads`,
    )
    expect(await requests[0]?.json()).toEqual({
      contentType: 'image/png',
      fileName: 'foto.png',
      sizeBytes: 12,
    })
    expect(requests[1]?.method).toBe('PUT')
    expect(requests[1]?.headers.get('authorization')).toBeNull()
  })

  test('o erro da API chega pelo código, nunca pelo texto', async () => {
    const client = createClient(
      Response.json(
        { error: { code: 'CONVERSATION_NO_DRIVER', message: 'The trip has no active driver' } },
        { status: 409 },
      ),
    )
    const failure = await client.openConversation(SUBJECT).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(OccurrenceConversationRequestError)
    expect((failure as OccurrenceConversationRequestError).code).toBe('CONVERSATION_NO_DRIVER')
  })
})

const summary = (
  overrides: Partial<SubjectConversationSummary> = {},
): SubjectConversationSummary => ({
  awaitingDriver: false,
  channels: ['app'],
  driverName: 'Marcos S.',
  lastMessageAt: null,
  protocol: '261009-K7M2',
  status: 'open',
  subjectId: DOCUMENT_ID,
  subjectLabel: 'NF 4521',
  subjectType: 'document',
  tripId: TRIP_ID,
  unreadCount: 0,
  ...overrides,
})

describe('o que o escritório pode fazer na conversa (spec 260 T3.1, RF12)', () => {
  test('sem trip.manage: nunca abre, envia nem encerra; só vê a que já existe', () => {
    expect(
      resolveSubjectConversationAccess({
        canManage: false,
        summary: undefined,
        tripStatus: 'in_transit',
      }),
    ).toMatchObject({ canClose: false, canOpen: false, canSend: false, canView: false })
    expect(
      resolveSubjectConversationAccess({
        canManage: false,
        summary: summary(),
        tripStatus: 'in_transit',
      }),
    ).toMatchObject({ canClose: false, canOpen: false, canSend: false, canView: true })
  })

  test('com trip.manage e viagem em andamento: abre a que não existe; envia e encerra a aberta', () => {
    expect(
      resolveSubjectConversationAccess({
        canManage: true,
        summary: undefined,
        tripStatus: 'in_transit',
      }),
    ).toMatchObject({ canOpen: true, canSend: false, canView: false })
    expect(
      resolveSubjectConversationAccess({
        canManage: true,
        summary: summary(),
        tripStatus: 'in_transit',
      }),
    ).toMatchObject({ canClose: true, canOpen: false, canSend: true, isClosed: false })
  })

  test('encerrada fica legível, sem enviar; reabrir existe enquanto a viagem não terminou', () => {
    expect(
      resolveSubjectConversationAccess({
        canManage: true,
        summary: summary({ status: 'closed' }),
        tripStatus: 'in_transit',
      }),
    ).toMatchObject({
      canClose: false,
      canOpen: true,
      canSend: false,
      canView: true,
      isClosed: true,
    })
  })

  test('viagem concluída ou cancelada: nada de abrir, enviar, encerrar nem reabrir', () => {
    for (const tripStatus of ['completed', 'cancelled']) {
      for (const stored of ['open', 'closed'] as const) {
        expect(
          resolveSubjectConversationAccess({
            canManage: true,
            summary: summary({ status: stored }),
            tripStatus,
          }),
        ).toMatchObject({ canClose: false, canOpen: false, canSend: false, isClosed: true })
      }
      expect(
        resolveSubjectConversationAccess({ canManage: true, summary: undefined, tripStatus }),
      ).toMatchObject({ canOpen: false, canView: false })
    }
  })

  test('o código da API vira a mensagem certa; o desconhecido vira genérico', () => {
    const error = (code: string) => new OccurrenceConversationRequestError(code)
    expect(resolveSubjectConversationErrorKey(error('CONVERSATION_CLOSED'))).toBe('closed')
    expect(resolveSubjectConversationErrorKey(error('CONVERSATION_NO_DRIVER'))).toBe('noDriver')
    expect(resolveSubjectConversationErrorKey(error('CONVERSATION_NOT_FOUND'))).toBe('notFound')
    expect(
      resolveSubjectConversationErrorKey(error('OCCURRENCE_CONVERSATION_DRIVER_CHANGED')),
    ).toBe('driverChanged')
    expect(resolveSubjectConversationErrorKey(error('ANYTHING'))).toBe('generic')
    expect(resolveSubjectConversationErrorKey(new Error('rede'))).toBe('generic')
  })

  test('não lidas: soma só as abertas e acha o resumo pelo par do assunto', () => {
    const list = [
      summary({ unreadCount: 2 }),
      summary({ subjectId: 'trip-x', subjectType: 'trip', unreadCount: 3 }),
      summary({ status: 'closed', subjectId: 'old', unreadCount: 5 }),
    ]
    expect(countSubjectUnread(list)).toBe(5)
    expect(
      findSubjectConversation(list, { subjectId: 'trip-x', subjectType: 'trip' })?.unreadCount,
    ).toBe(3)
    expect(
      findSubjectConversation(list, { subjectId: 'trip-x', subjectType: 'document' }),
    ).toBeUndefined()
  })

  test('a chave da mensagem cabe na regra da API (16 a 256, sem caracteres soltos)', () => {
    const key = createSubjectMessageIdempotencyKey(() => '5f1e1e0e-0000-4000-8000-000000000000')
    expect(key).toMatch(/^[A-Za-z0-9:_.-]{16,256}$/u)
  })
})

async function source(path: string): Promise<string> {
  return readFile(new URL(`../../src/modules/${path}`, import.meta.url), 'utf8')
}

describe('a thread e as telas novas (spec 260 T3.2)', () => {
  test('o fio novo anuncia mensagem nova em região polite, como o da ocorrência', async () => {
    const thread = await source(
      'occurrence-conversation/components/SubjectConversationThread.component.tsx',
    )
    expect(thread).toMatch(/aria-live="polite"/u)
    expect(thread).toContain('countNewIncomingMessages')
  })

  test('a leitura se atualiza a cada 15 s e ao voltar o foco, sem nunca devolver false', async () => {
    const query = await source('occurrence-conversation/queries/subjectConversation.query.ts')
    expect(query).toContain('SUBJECT_CONVERSATION_REFETCH_MS = 15_000')
    expect(query).toContain("refetchOnWindowFocus: 'always'")
    expect(query).not.toMatch(/refetchInterval:[^\n]*false/u)
  })

  test('sem estilo inline, sem Tailwind e sem default export nos arquivos novos', async () => {
    const files = [
      'occurrence-conversation/components/SubjectConversationAction.component.tsx',
      'occurrence-conversation/components/SubjectConversationDialog.component.tsx',
      'occurrence-conversation/components/SubjectConversationPanel.component.tsx',
      'occurrence-conversation/components/SubjectConversationThread.component.tsx',
      'occurrence-conversation/components/SubjectConversationComposer.component.tsx',
      'occurrence-conversation/components/TripConversationsPanel.component.tsx',
    ]
    for (const file of files) {
      const text = await source(file)
      expect(text).not.toMatch(/style=\{\{/u)
      expect(text).not.toMatch(/export default/u)
      expect(text).toContain('Copyright (c) 2026 Ada Technology')
    }
  })

  test('o botão da nota e o painel da viagem só existem com permissão: a ação some sem trip.manage nem conversa', async () => {
    const action = await source(
      'occurrence-conversation/components/SubjectConversationAction.component.tsx',
    )
    expect(action).toContain('resolveSubjectConversationAccess')
    expect(action).toMatch(/!access\.canView && !access\.canOpen/u)
    const panel = await source(
      'occurrence-conversation/components/TripConversationsPanel.component.tsx',
    )
    expect(panel).toMatch(/canRead/u)
  })

  test('o detalhe da viagem encaixa a conversa por render prop opcional na linha da nota', async () => {
    const list = await source('trip/components/TripStopList.component.tsx')
    expect(list).toContain('renderConversation?: (documentId: string) => ReactNode')
    expect(list).toContain('actions.renderConversation?.(document.id)')
    const detail = await source('trip/components/TripDetail.component.tsx')
    expect(detail).toContain('<SubjectConversationAction')
    expect(detail).toContain('<TripConversationsPanel')
  })
})

describe('o ouro: a conversa de ocorrência não mudou (ADR-0101, regra do dono)', () => {
  test('nenhum arquivo antigo da conversa importa o que é novo', async () => {
    const oldFiles = [
      'occurrence-conversation/components/OccurrenceConversations.component.tsx',
      'occurrence-conversation/components/ConversationMessage.component.tsx',
      'occurrence-conversation/queries/occurrenceConversation.query.ts',
      'occurrence-conversation/shared/occurrenceConversationClient.service.ts',
      'occurrence-conversation/shared/occurrenceConversation.service.ts',
      'occurrence-conversation/shared/occurrenceConversation.types.ts',
    ]
    for (const file of oldFiles) {
      expect(await source(file)).not.toMatch(/subjectConversation|SubjectConversation/u)
    }
  })

  test('as strings novas moram em namespace próprio, não no da ocorrência', async () => {
    const occurrenceLocale = await source(
      'occurrence-conversation/locales/occurrenceConversation.locale.json',
    )
    expect(occurrenceLocale).not.toContain('Falar com o motorista')
  })
})
