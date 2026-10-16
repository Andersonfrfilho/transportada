/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createOccurrenceConversationClient } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import { EMPTY_TRIP_OCCURRENCE_FILTERS } from '@/modules/trip/shared/tripOccurrenceFeed.service'
import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const API_URL = 'https://api.example.test'
const LIST_INPUT = {
  cursor: null,
  filters: EMPTY_TRIP_OCCURRENCE_FILTERS,
  order: 'desc',
  perPage: 20,
} as const

function buildFeedItem(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    case: null,
    createdAt: '2026-10-16T19:03:10.795Z',
    description: 'Avaria no transporte',
    driverName: 'Motorista',
    hasAttachment: false,
    id: '4b581a02-3dba-4df9-a20b-20ac66163fa1',
    invoiceNumber: null,
    invoiceSeries: null,
    notifies: true,
    source: 'document',
    stage: 'delivery',
    stopLabel: null,
    tripId: 'trip-1',
    typeName: 'Devolução',
    vehiclePlate: 'ABC1D23',
    ...extra,
  }
}

function feedClientFor(response: unknown) {
  return createTripOccurrenceFeedClient({
    apiUrl: API_URL,
    fetch: () => Promise.resolve(Response.json(response)),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

/**
 * Spec 269 T1.3 (ADR-0106, ADR-0081 §9): o painel publicado antes da API aceita o aviso "Tipo sem modelo de
 * notificação" e o modelo do envio, e a resposta do registro sem o `email` que a API vai parar de mandar.
 */
describe('spec 269 T1.3: tolerância ao aviso e ao modelo do e-mail da ocorrência', () => {
  test('o feed aceita missingNotificationTemplate no item', async () => {
    const client = feedClientFor({
      data: [buildFeedItem({ missingNotificationTemplate: true })],
      pagination: { nextCursor: null },
    })

    const page = await client.listOccurrences(LIST_INPUT)

    expect(page.items).toHaveLength(1)
  })

  test('a prévia do diálogo aceita templateId e missingNotificationTemplate', async () => {
    const client = createOccurrenceConversationClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json({
            data: {
              bodyText: 'Texto',
              contractorName: 'Contratante Alfa',
              missingNotificationTemplate: false,
              recipients: [],
              subject: 'Assunto',
              suggested: true,
              templateId: 'template-1',
              text: 'Texto',
            },
          }),
        ),
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })

    const preview = await client.previewContractorMail({ occurrenceId: 'occurrence-1' })

    expect(preview.subject).toBe('Assunto')
  })

  test('a resposta do registro sem email passa', () => {
    const adapters = createTripResponseAdapters()

    const registered = adapters.registeredOccurrenceFromApi({
      attachments: [],
      createdAt: '2026-10-16T19:03:10.795Z',
      id: 'occurrence-1',
      note: '',
      occurrenceTypeId: 'type-1',
      productCode: '',
      stage: 'delivery',
      typeName: 'Devolução',
    })

    expect(registered.id).toBe('occurrence-1')
  })

  test('a resposta do registro de uma API anterior, com email, ainda passa e o email não vaza', () => {
    const adapters = createTripResponseAdapters()

    const registered = adapters.registeredOccurrenceFromApi({
      attachments: [],
      createdAt: '2026-10-16T19:03:10.795Z',
      email: { body: 'Corpo', subject: 'Assunto' },
      id: 'occurrence-1',
      note: '',
      occurrenceTypeId: 'type-1',
      productCode: '',
      stage: 'delivery',
      typeName: 'Devolução',
    })

    expect('email' in registered).toBe(false)
  })
})
