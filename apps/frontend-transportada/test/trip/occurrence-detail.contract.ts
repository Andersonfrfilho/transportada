/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  buildOccurrenceDriverContact,
  formatOccurrenceItemQuantity,
} from '@/modules/trip/shared/tripOccurrenceDetail.service'
import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import {
  buildTripOccurrenceRoute,
  parseTripOccurrenceRoute,
  TRIP_OCCURRENCES_ROUTE,
} from '@/modules/trip/shared/tripOccurrenceRoute.service'
import { resolveTripTimelineOccurrenceHref } from '@/modules/trip/shared/tripTimelineLink.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const API_URL = 'https://api.example.test'
const OCCURRENCE_ID = '00000000-0000-4000-8000-00000000d001'

const DRIVER = {
  driverId: 'driver-1',
  email: 'motorista@example.test',
  name: 'Motorista Alves',
  phone: '11999990001',
  picturePath: '/public/company-users/token/picture',
  whatsappPhone: '5511999990001',
} as const

const DETAIL = {
  actorName: 'Operador',
  case: null,
  channel: 'driver_app',
  createdAt: '2026-09-24T14:12:00.000Z',
  description: 'Recebedor cobrando descarga.',
  document: {
    contractor: { contractorId: 'contractor-1', name: 'Contratante Alfa', taxId: '11222333000181' },
    destination: {
      city: 'Guarulhos',
      label: 'Avenida da Doca, 500',
      origin: 'delivery',
      postalCode: '07000000',
      recipientName: 'Galpão de entrega',
      state: 'SP',
    },
    nfeDocumentId: 'nfe-1',
    totalValue: '48320.0000',
  },
  driver: DRIVER,
  driverName: 'Motorista Alves',
  hasAttachment: true,
  id: OCCURRENCE_ID,
  invoiceNumber: '4512',
  invoiceSeries: '1',
  items: [
    { code: 'ZG-4410', description: 'Azulejo 30x30 caixa', quantity: '3.500', unit: 'CX' },
    { code: 'ZG-9999', description: '', quantity: null, unit: null },
  ],
  notifies: false,
  onBehalfOfDriverName: null,
  source: 'document',
  stage: 'delivery',
  stopLabel: 'Parada 2',
  tripId: 'trip-1',
  typeName: 'Cobrança inesperada',
  vehiclePlate: 'ABC1D23',
} as const

function createClient(input: { readonly requests: Request[]; readonly payload: unknown }) {
  return createTripOccurrenceFeedClient({
    apiUrl: API_URL,
    fetch: (resource, init) => {
      input.requests.push(new Request(resource, init))
      return Promise.resolve(Response.json(input.payload))
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

/**
 * Spec 183 T204 (P1/P2): a linha de `/ocorrencias` abre `/ocorrencias/:id`. Sem router no app, a
 * rota é um par build/parse como `tripRoute.service.ts`; a página lê `GET /trip-occurrences/:id`.
 */
describe('a rota do detalhe da ocorrência', () => {
  test('monta e lê /ocorrencias/:id, e só isso', () => {
    expect(TRIP_OCCURRENCES_ROUTE).toBe('/ocorrencias')
    expect(buildTripOccurrenceRoute(OCCURRENCE_ID)).toBe(`/ocorrencias/${OCCURRENCE_ID}`)
    expect(parseTripOccurrenceRoute(`/ocorrencias/${OCCURRENCE_ID}`)).toBe(OCCURRENCE_ID)
    expect(parseTripOccurrenceRoute(`/ocorrencias/${OCCURRENCE_ID}/`)).toBe(OCCURRENCE_ID)
    expect(parseTripOccurrenceRoute('/ocorrencias')).toBeNull()
    expect(parseTripOccurrenceRoute('/ocorrencias/')).toBeNull()
    expect(parseTripOccurrenceRoute(`/ocorrencias/${OCCURRENCE_ID}/extra`)).toBeNull()
    expect(parseTripOccurrenceRoute(`/trips/${OCCURRENCE_ID}`)).toBeNull()
  })

  test('o id viaja codificado e volta decodificado', () => {
    expect(buildTripOccurrenceRoute('a b')).toBe('/ocorrencias/a%20b')
    expect(parseTripOccurrenceRoute('/ocorrencias/a%20b')).toBe('a b')
  })

  test('o shell resolve a rota do detalhe para o mesmo item de menu e renderiza a página', () => {
    const main = readFileSync(new URL('src/main.tsx', APPLICATION_ROOT), 'utf8')
    expect(main).toContain(
      "parseTripOccurrenceRoute(window.location.pathname) !== null) return 'trip-occurrences'",
    )
    expect(main).toContain('<TripOccurrenceDetailPage occurrenceId={occurrenceId} />')
  })

  test('o evento de ocorrência da linha do tempo da viagem aponta para o detalhe (180 RF15)', () => {
    expect(resolveTripTimelineOccurrenceHref(OCCURRENCE_ID)).toBe(`/ocorrencias/${OCCURRENCE_ID}`)
  })
})

describe('cliente: GET /trip-occurrences/:id', () => {
  test('lê o detalhe no caminho da ocorrência, autenticado e sem cache', async () => {
    const requests: Request[] = []
    const client = createClient({ payload: { data: DETAIL }, requests })

    const detail = await client.readOccurrence({ occurrenceId: OCCURRENCE_ID })

    expect(detail).toEqual(DETAIL)
    const [request] = requests
    expect(request?.url).toBe(`${API_URL}/trip-occurrences/${OCCURRENCE_ID}`)
    expect(request?.method).toBe('GET')
    expect(request?.cache).toBe('no-store')
    expect(request?.headers.get('authorization')).toBe('Bearer synthetic-token')
  })

  test('aceita ocorrência sem nota e viagem sem motorista', async () => {
    const client = createClient({
      payload: { data: { ...DETAIL, document: null, driver: null, source: 'stop', stage: null } },
      requests: [],
    })

    const detail = await client.readOccurrence({ occurrenceId: OCCURRENCE_ID })

    expect(detail.document).toBeNull()
    expect(detail.driver).toBeNull()
  })

  test('valor da nota que não é string decimal é resposta inválida — dinheiro nunca vira number', async () => {
    const client = createClient({
      payload: { data: { ...DETAIL, document: { ...DETAIL.document, totalValue: 48320 } } },
      requests: [],
    })

    let failure: unknown = null
    try {
      await client.readOccurrence({ occurrenceId: OCCURRENCE_ID })
    } catch (caught) {
      failure = caught
    }
    expect(failure).toBeInstanceOf(Error)
  })

  test('quantidade do item que não é string decimal é resposta inválida (T207)', async () => {
    const client = createClient({
      payload: {
        data: { ...DETAIL, items: [{ code: 'A', description: '', quantity: 3.5, unit: 'CX' }] },
      },
      requests: [],
    })

    let failure: unknown = null
    try {
      await client.readOccurrence({ occurrenceId: OCCURRENCE_ID })
    } catch (caught) {
      failure = caught
    }
    expect(failure).toBeInstanceOf(Error)
  })

  test('motorista sem o formato combinado é resposta inválida', async () => {
    const client = createClient({
      payload: { data: { ...DETAIL, driver: { ...DRIVER, phone: undefined } } },
      requests: [],
    })

    let failure: unknown = null
    try {
      await client.readOccurrence({ occurrenceId: OCCURRENCE_ID })
    } catch (caught) {
      failure = caught
    }
    expect(failure).toBeInstanceOf(Error)
  })
})

describe('o contato do motorista no detalhe (P2)', () => {
  test('liga, abre o WhatsApp verificado e mostra a foto pela API', () => {
    const contact = buildOccurrenceDriverContact({ apiUrl: API_URL, driver: DRIVER })

    expect(contact).toEqual({
      emailHref: 'mailto:motorista@example.test',
      initials: 'MA',
      name: 'Motorista Alves',
      phone: '11999990001',
      pictureUrl: `${API_URL}/public/company-users/token/picture`,
      telHref: 'tel:11999990001',
      whatsappHref: 'https://wa.me/5511999990001',
    })
  })

  test('sem WhatsApp verificado não oferece o WhatsApp; sem telefone não oferece ligar', () => {
    const contact = buildOccurrenceDriverContact({
      apiUrl: API_URL,
      driver: { ...DRIVER, email: '', phone: '', picturePath: null, whatsappPhone: null },
    })

    expect(contact?.whatsappHref).toBeNull()
    expect(contact?.telHref).toBeNull()
    expect(contact?.emailHref).toBeNull()
    expect(contact?.pictureUrl).toBeNull()
  })

  test('sem motorista não há bloco de contato', () => {
    expect(buildOccurrenceDriverContact({ apiUrl: API_URL, driver: null })).toBeNull()
  })
})

describe('os itens da ocorrência no detalhe (T207)', () => {
  test('quantidade formatada com a unidade da nota; sem quantidade, só o item', () => {
    expect(
      formatOccurrenceItemQuantity({ quantity: '3.500', unit: 'CX' }, (value) => `n:${value}`),
    ).toBe('n:3.500 CX')
    expect(formatOccurrenceItemQuantity({ quantity: null, unit: null }, (value) => value)).toBe('')
  })
})
