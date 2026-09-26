/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Page, Route } from '@playwright/test'

import { mockTripWorkspaceApi } from './trip-smoke.helper'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

export const DOCUMENT_OCCURRENCE_ID = '00000000-0000-4000-8000-000000183001'
export const STOP_OCCURRENCE_ID = '00000000-0000-4000-8000-000000183002'
const TRIP_ID = '00000000-0000-4000-8000-000000183010'

const DOCUMENT_OCCURRENCE = {
  actorName: 'Operador Sintético',
  case: {
    decision: null,
    redeliveryPolicy: 'allowed',
    settlementTotal: null,
    status: 'recorded',
    updatedAt: '2026-09-24T14:12:00.000Z',
  },
  channel: 'driver_app',
  conversation: { contractorState: 'replied', driverUnreadCount: 2 },
  createdAt: '2026-09-24T14:12:00.000Z',
  description: 'Recebedor está cobrando taxa de descarga para liberar a doca.',
  document: {
    contractor: {
      contractorId: '00000000-0000-4000-8000-000000183020',
      name: 'Contratante Alfa Indústria',
      taxId: '11222333000181',
    },
    destination: {
      city: 'Guarulhos',
      label: 'Avenida da Doca, 500 - Guarulhos/SP',
      origin: 'delivery',
      postalCode: '07000000',
      recipientName: 'Galpão de entrega Beta',
      state: 'SP',
    },
    nfeDocumentId: '00000000-0000-4000-8000-000000183030',
    totalValue: '48320.0000',
  },
  driver: {
    driverId: '00000000-0000-4000-8000-000000183040',
    email: 'motorista.sintetico@example.test',
    name: 'Motorista Sintético Alves',
    phone: '11999990001',
    picturePath: null,
    whatsappPhone: '5511999990001',
  },
  driverName: 'Motorista Sintético Alves',
  hasAttachment: false,
  id: DOCUMENT_OCCURRENCE_ID,
  invoiceNumber: '4512',
  invoiceSeries: '1',
  items: [
    { code: 'ZG-4410', description: 'Azulejo 30x30 caixa', quantity: '3.500', unit: 'CX' },
    { code: 'ZG-4411', description: 'Rejunte cinza 5 kg', quantity: null, unit: null },
  ],
  notifies: false,
  onBehalfOfDriverName: null,
  source: 'document',
  stage: 'delivery',
  stopLabel: 'Parada 2 · Guarulhos',
  tripId: TRIP_ID,
  typeName: 'Cobrança inesperada no local',
  vehiclePlate: 'ABC1D23',
} as const

const STOP_OCCURRENCE = {
  ...DOCUMENT_OCCURRENCE,
  actorName: 'Escritório Sintético',
  case: null,
  channel: 'office',
  conversation: { contractorState: 'none', driverUnreadCount: 0 },
  createdAt: '2026-09-24T13:47:00.000Z',
  description: 'Doca fechada no horário combinado.',
  document: null,
  driver: null,
  driverName: '',
  id: STOP_OCCURRENCE_ID,
  invoiceNumber: null,
  invoiceSeries: null,
  items: [],
  onBehalfOfDriverName: 'Motorista Sintético Alves',
  source: 'stop',
  stage: null,
  typeName: 'dock_closed',
} as const

const FEED_ITEMS = [DOCUMENT_OCCURRENCE, STOP_OCCURRENCE] as const

/** Spec 183 T206: a história da ocorrência de nota — registro, fotos, aviso, resposta e decisão. */
const DOCUMENT_TIMELINE = {
  events: [
    {
      actor: { kind: 'driver', name: 'Motorista Sintético Alves' },
      id: 'occurrence.recorded:1',
      isKey: true,
      kind: 'occurrence.recorded',
      occurredAt: '2026-09-24T14:12:00.000Z',
      sincePreviousSeconds: null,
    },
    {
      actor: { kind: 'driver', name: 'Motorista Sintético Alves' },
      id: 'occurrence.photo:1',
      isKey: false,
      kind: 'occurrence.photo',
      occurredAt: '2026-09-24T14:12:00.000Z',
      photoCount: 2,
      sincePreviousSeconds: 0,
    },
    {
      actor: { kind: 'system', name: null },
      deliveryStatus: 'sent',
      id: 'contractor.mail.sent:1',
      interpretation: null,
      isKey: false,
      kind: 'contractor.mail.sent',
      occurredAt: '2026-09-24T14:13:00.000Z',
      sincePreviousSeconds: 60,
    },
    {
      actor: { kind: 'operation', name: 'Operador Sintético' },
      fromStatus: 'under_review',
      id: 'case.transition:2',
      isKey: false,
      kind: 'case.transition',
      note: '',
      occurredAt: '2026-09-24T14:30:00.000Z',
      sincePreviousSeconds: 1020,
      toStatus: 'awaiting_contractor',
    },
    {
      actor: { kind: 'contractor', name: null },
      deliveryStatus: null,
      id: 'contractor.mail.received:2',
      interpretation: 'message',
      isKey: false,
      kind: 'contractor.mail.received',
      occurredAt: '2026-09-24T15:05:00.000Z',
      sincePreviousSeconds: 2100,
    },
    {
      actor: { kind: 'contractor', name: 'Compradora Sintética' },
      fromStatus: 'awaiting_contractor',
      id: 'case.transition:3',
      isKey: true,
      kind: 'case.transition',
      note: 'Pode descarregar, a taxa é nossa.',
      occurredAt: '2026-09-24T15:20:00.000Z',
      sincePreviousSeconds: 900,
      toStatus: 'decided',
    },
  ],
  timings: {
    contractorAskedAt: '2026-09-24T14:13:00.000Z',
    contractorRepliedAt: '2026-09-24T15:05:00.000Z',
    driverReleasedAt: '2026-09-24T15:20:00.000Z',
    openSince: '2026-09-24T14:12:00.000Z',
    openUntil: null,
  },
} as const

const STOP_TIMELINE = {
  events: [
    {
      actor: { kind: 'operation', name: 'Escritório Sintético' },
      id: 'occurrence.recorded:2',
      isKey: true,
      kind: 'occurrence.recorded',
      occurredAt: '2026-09-24T13:47:00.000Z',
      sincePreviousSeconds: null,
    },
  ],
  timings: {
    contractorAskedAt: null,
    contractorRepliedAt: null,
    driverReleasedAt: null,
    openSince: '2026-09-24T13:47:00.000Z',
    openUntil: null,
  },
} as const

async function fulfillOptions(route: Route): Promise<void> {
  await route.fulfill({ headers: CORS_HEADERS, status: 204 })
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status: 200,
  })
}

/**
 * Spec 183 T204: a lista e o detalhe da ocorrência para os prints da revisão de design. Estende
 * `mockTripWorkspaceApi` (sessão, permissões, marca da instalação) e registra por último as rotas
 * de ocorrência, que vencem as dele.
 */
export async function mockOccurrenceDetailPrintsApi(
  input: Readonly<{ page: Page; permissions: readonly string[] }>,
): Promise<void> {
  await mockTripWorkspaceApi({
    mode: 'all-authorized',
    page: input.page,
    permissions: input.permissions,
  })

  await input.page.route(/\/trip-occurrences(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    return fulfillJson(route, { data: FEED_ITEMS, pagination: { nextCursor: null } })
  })

  await input.page.route(/\/trip-occurrences\/[^/?]+$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    const id = new URL(route.request().url()).pathname.split('/').pop()
    const item = FEED_ITEMS.find((candidate) => candidate.id === id)
    if (item === undefined) {
      return route.fulfill({
        body: JSON.stringify({ error: { code: 'TRIP_OCCURRENCE_NOT_FOUND' } }),
        contentType: 'application/json',
        headers: CORS_HEADERS,
        status: 404,
      })
    }
    return fulfillJson(route, { data: item })
  })

  await input.page.route(/\/trip-occurrences\/[^/]+\/timeline$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    const id = new URL(route.request().url()).pathname.split('/').at(-2)
    return fulfillJson(route, {
      data: id === DOCUMENT_OCCURRENCE_ID ? DOCUMENT_TIMELINE : STOP_TIMELINE,
    })
  })

  await input.page.route(/\/trip-occurrences\/[^/]+\/attachments$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    return fulfillJson(route, { data: [] })
  })

  await mockOccurrenceConversationApi(input.page)
  await mockQuickRepliesApi(input.page)
}

const CONTRACTOR_CONTACT = {
  contractorId: '00000000-0000-4000-8000-000000183020',
  email: 'compras@alfa.example.test',
  id: '00000000-0000-4000-8000-000000183030',
  name: 'Maria Souza',
  phone: '5511987654321',
  preferredChannel: 'email',
  roleLabel: 'Compras',
  status: 'active',
  types: ['occurrences', 'approves_charges'],
  whatsappOptInAt: null,
} as const

const CONVERSATION_MESSAGES = [
  {
    author: { kind: 'operation', name: 'Operadora Lima', userId: 'user-operator' },
    bodyText:
      'Bom dia. O recebedor está cobrando taxa de descarga de R$ 180,00 para liberar a doca. Autorizam o pagamento?',
    channel: 'email',
    createdAt: '2026-09-24T14:20:00.000Z',
    direction: 'outbound',
    id: 'conversation-message-1',
    status: 'delivered',
    statusTimes: {
      delivered: '2026-09-24T14:20:09.000Z',
      queued: '2026-09-24T14:20:00.000Z',
      sent: '2026-09-24T14:20:03.000Z',
    },
  },
  {
    author: {
      identity: {
        arrivedAs: 'Compras@Alfa.example.test',
        contact: CONTRACTOR_CONTACT,
        inactive: false,
        kind: 'contact',
        profileName: null,
      },
      kind: 'contractor',
      userId: null,
    },
    bodyText: 'Autorizado. Pode pagar e mandar o comprovante junto com o canhoto.',
    channel: 'email',
    createdAt: '2026-09-24T14:41:00.000Z',
    direction: 'inbound',
    id: 'conversation-message-2',
    status: null,
    statusTimes: {},
  },
  {
    author: {
      identity: {
        arrivedAs: 'joao.lima@alfa.example.test',
        displayName: 'João Lima',
        kind: 'unknown',
        suggestion: { email: 'joao.lima@alfa.example.test', name: 'João Lima', phone: null },
      },
      kind: 'contractor',
      userId: null,
    },
    bodyText: 'Complementando: a nota de serviço da descarga vem no nome da Alfa.',
    channel: 'email',
    createdAt: '2026-09-24T14:52:00.000Z',
    direction: 'inbound',
    id: 'conversation-message-3',
    status: null,
    statusTimes: {},
  },
] as const

/** Spec 183 T603: a conversa com o motorista pelo app. */
const DRIVER_MESSAGES = [
  {
    author: { kind: 'operation', name: 'Operadora Lima', userId: 'user-operator' },
    bodyText:
      'O recebedor quer cobrar descarga. Aguarde na doca até eu confirmar com a contratante.',
    channel: 'app',
    createdAt: '2026-09-24T14:22:00.000Z',
    direction: 'outbound',
    id: 'driver-message-1',
    status: 'read',
    statusTimes: {
      delivered: '2026-09-24T14:22:30.000Z',
      queued: '2026-09-24T14:22:00.000Z',
      read: '2026-09-24T14:24:00.000Z',
    },
  },
  {
    author: { kind: 'driver', name: 'Motorista Sintético Alves', userId: 'user-driver' },
    bodyText: 'Certo, estou aguardando aqui.',
    channel: 'app',
    createdAt: '2026-09-24T14:25:00.000Z',
    direction: 'inbound',
    id: 'driver-message-2',
    status: null,
    statusTimes: {},
  },
] as const

/** O que a aba Motorista mandou: o smoke confere o corpo e a chave. */
export const SENT_DRIVER_MESSAGES: { body: unknown; idempotencyKey: null | string }[] = []

/** O que o diálogo mandou: o smoke do envio confere o corpo e a chave. */
export const SENT_CONTRACTOR_MAILS: { body: unknown; idempotencyKey: null | string }[] = []

/**
 * Spec 183 T654: o canal Portal da ocorrência de nota. Fechado por padrão — os prints da T407 são a
 * contratante sem conta no portal —, e o smoke do portal abre antes de navegar.
 */
export const CONTRACTOR_PORTAL = { available: false }

/** O que a aba Contratante mandou pelo portal: o smoke confere o corpo e a chave. */
export const SENT_PORTAL_MESSAGES: { body: unknown; idempotencyKey: null | string }[] = []

/**
 * Spec 183 T407: a conversa com a contratante da ocorrência de nota (a de parada não tem). O envio
 * acrescenta a mensagem "na fila", como a API faria.
 */
async function mockOccurrenceConversationApi(page: Page): Promise<void> {
  const messages: unknown[] = [...CONVERSATION_MESSAGES]
  const driverMessages: unknown[] = [...DRIVER_MESSAGES]

  /** Spec 183 T603: a mensagem ao motorista pelo app entra "na fila", como a API faria. */
  await page.route(/\/conversations\/driver\/messages$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    const body = route.request().postDataJSON() as { body: string }
    SENT_DRIVER_MESSAGES.push({
      body,
      idempotencyKey: route.request().headers()['idempotency-key'] ?? null,
    })
    driverMessages.push({
      author: { kind: 'operation', name: 'Operadora Lima', userId: 'user-operator' },
      bodyText: body.body,
      channel: 'app',
      createdAt: '2026-09-24T15:10:00.000Z',
      direction: 'outbound',
      id: `driver-message-${String(driverMessages.length + 1)}`,
      status: 'queued',
      statusTimes: { queued: '2026-09-24T15:10:00.000Z' },
    })
    return route.fulfill({
      body: JSON.stringify({ data: { conversationId: 'conversation-driver' } }),
      contentType: 'application/json',
      headers: CORS_HEADERS,
      status: 202,
    })
  })

  await page.route(/\/trip-occurrences\/[^/]+\/conversations$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    const id = new URL(route.request().url()).pathname.split('/').at(-2)
    if (id !== DOCUMENT_OCCURRENCE_ID) return fulfillJson(route, { data: { conversations: [] } })
    return fulfillJson(route, {
      data: {
        contractorPortal: { available: CONTRACTOR_PORTAL.available },
        conversations: [
          {
            id: 'conversation-contractor',
            messages,
            participant: 'contractor',
            status: 'open',
            unreadCount: 0,
          },
          {
            id: 'conversation-driver',
            messages: driverMessages,
            participant: 'driver',
            status: 'open',
            unreadCount: 0,
          },
        ],
      },
    })
  })

  await page.route(/\/conversations\/contractor\/mail-preview$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    const typed = (route.request().postDataJSON() ?? {}) as { body?: string; subject?: string }
    const bodyText =
      typed.body ??
      'Ocorrência na NF 4512/1: recebedor cobrando taxa de descarga para liberar a doca.'
    return fulfillJson(route, {
      data: {
        bodyText,
        contractorName: 'Contratante Alfa Indústria',
        html: `<p>${bodyText}</p>`,
        recipients: [
          {
            approvesCharges: true,
            contactId: CONTRACTOR_CONTACT.id,
            email: CONTRACTOR_CONTACT.email,
            name: CONTRACTOR_CONTACT.name,
            preselected: true,
            roleLabel: 'Compras',
          },
          {
            approvesCharges: false,
            contactId: '00000000-0000-4000-8000-000000183031',
            email: 'expedicao@alfa.example.test',
            name: '',
            preselected: false,
            roleLabel: '',
          },
        ],
        subject: typed.subject ?? 'Ocorrência — NF 4512/1',
        suggested: typed.body === undefined,
        text: `${bodyText}\n\n—\nOperadora Lima\nTransportadora Sintética`,
      },
    })
  })

  await page.route(/\/conversations\/contractor\/messages$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    const body = route.request().postDataJSON() as { body: string; channel: string }
    const idempotencyKey = route.request().headers()['idempotency-key'] ?? null
    /** Spec 183 T654: pelo portal a mensagem nasce entregue, como a API grava. */
    if (body.channel === 'portal') {
      SENT_PORTAL_MESSAGES.push({ body, idempotencyKey })
      messages.push({
        author: { kind: 'operation', name: 'Operadora Lima', userId: 'user-operator' },
        bodyText: body.body,
        channel: 'portal',
        createdAt: '2026-09-24T15:07:00.000Z',
        direction: 'outbound',
        id: `conversation-message-${String(messages.length + 1)}`,
        status: 'delivered',
        statusTimes: { delivered: '2026-09-24T15:07:00.000Z' },
      })
      return route.fulfill({
        body: JSON.stringify({
          data: { conversationId: 'conversation-contractor', conversationMessageId: 'm-portal' },
        }),
        contentType: 'application/json',
        headers: CORS_HEADERS,
        status: 202,
      })
    }
    SENT_CONTRACTOR_MAILS.push({ body, idempotencyKey })
    messages.push({
      author: { kind: 'operation', name: 'Operadora Lima', userId: 'user-operator' },
      bodyText: body.body,
      channel: 'email',
      createdAt: '2026-09-24T15:05:00.000Z',
      direction: 'outbound',
      id: `conversation-message-${String(messages.length + 1)}`,
      status: 'queued',
      statusTimes: { queued: '2026-09-24T15:05:00.000Z' },
    })
    return route.fulfill({
      body: JSON.stringify({ data: { conversationId: 'conversation-contractor' } }),
      contentType: 'application/json',
      headers: CORS_HEADERS,
      status: 202,
    })
  })

  await page.route(/\/occurrence-conversations\/[^/]+\/read$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    return fulfillJson(route, { data: { unreadCount: 0 } })
  })
}

type QuickReplyRow = {
  active: boolean
  audience: 'contractor' | 'driver'
  id: string
  position: number
  text: string
}

/** Spec 183 T701: o cadastro das respostas rápidas, em memória por página, como a API faria. */
export const QUICK_REPLIES: QuickReplyRow[] = []

function seedQuickReplies(): void {
  QUICK_REPLIES.splice(
    0,
    QUICK_REPLIES.length,
    {
      active: true,
      audience: 'contractor',
      id: '00000000-0000-4000-8000-000000183701',
      position: 0,
      text: 'Podem confirmar a autorização da descarga?',
    },
    {
      active: false,
      audience: 'contractor',
      id: '00000000-0000-4000-8000-000000183702',
      position: 1,
      text: 'Segue o comprovante em anexo.',
    },
    {
      active: true,
      audience: 'driver',
      id: '00000000-0000-4000-8000-000000183703',
      position: 0,
      text: 'Pode descarregar, a contratante autorizou.',
    },
  )
}

export async function mockQuickRepliesApi(page: Page): Promise<void> {
  seedQuickReplies()
  const sorted = () =>
    QUICK_REPLIES.toSorted((left, right) =>
      left.audience === right.audience
        ? left.position - right.position
        : left.audience.localeCompare(right.audience),
    )

  await page.route(/\/occurrence-quick-replies\?audience=(contractor|driver)$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return fulfillOptions(route)
    const audience = new URL(route.request().url()).searchParams.get('audience')
    return fulfillJson(route, {
      data: sorted().filter((reply) => reply.audience === audience && reply.active),
    })
  })

  await page.route(/\/company-settings\/quick-replies(\/[^/]+)?$/, async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return fulfillOptions(route)
    const path = new URL(request.url()).pathname
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as { audience: 'contractor' | 'driver'; text: string }
      const reply = {
        active: true,
        audience: body.audience,
        id: `00000000-0000-4000-8000-${String(183800 + QUICK_REPLIES.length).padStart(12, '0')}`,
        position: QUICK_REPLIES.filter((item) => item.audience === body.audience).length,
        text: body.text,
      }
      QUICK_REPLIES.push(reply)
      return fulfillJson(route, { data: reply })
    }
    if (request.method() === 'PUT' && path.endsWith('/order')) {
      const body = request.postDataJSON() as { ids: string[] }
      body.ids.forEach((id, position) => {
        const reply = QUICK_REPLIES.find((item) => item.id === id)
        if (reply !== undefined) reply.position = position
      })
      return fulfillJson(route, { data: sorted() })
    }
    if (request.method() === 'PATCH') {
      const id = path.split('/').at(-1)
      const body = request.postDataJSON() as { active?: boolean; text?: string }
      const reply = QUICK_REPLIES.find((item) => item.id === id)
      if (reply !== undefined) Object.assign(reply, body)
      return fulfillJson(route, { data: reply })
    }
    return fulfillJson(route, { data: sorted() })
  })
}
