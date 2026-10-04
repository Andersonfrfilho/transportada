/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 T1.1 (etapa 1, painel tolerante): `itemsMode`, `typeItemsMode`, `typeAllowsMultipleItems`
 * e `occurrenceTypeId` nascem na API depois do painel. Ausentes, nada reprova e nada some; presentes,
 * passam; com forma errada, a resposta é recusada — a mesma tolerância que a B7 deu a
 * `allowsMultipleItems`.
 */
import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'
import { EMPTY_TRIP_OCCURRENCE_FILTERS } from '@/modules/trip/shared/tripOccurrenceFeed.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

const TYPE_ID = '54ed0225-f293-47c3-84fe-0b66eff68784'
const NEW_KEYS = ['occurrenceTypeId', 'typeAllowsMultipleItems', 'typeItemsMode'] as const

function buildOccurrenceType(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    active: true,
    allowsMultipleItems: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TYPE_ID,
    name: 'Cliente pediu segunda via do boleto',
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'delivery',
    ...extra,
  }
}

function buildFeedItem(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    case: null,
    createdAt: '2026-10-03T12:00:00.000Z',
    description: 'Avaria na nota inteira',
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
    typeName: 'Avaria',
    vehiclePlate: 'ABC1D23',
    ...extra,
  }
}

function buildDetail(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    ...buildFeedItem(),
    actorName: null,
    channel: 'whatsapp',
    document: null,
    driver: null,
    items: [],
    onBehalfOfDriverName: null,
    ...extra,
  }
}

function createClient(response: Response) {
  return createTripOccurrenceFeedClient({
    apiUrl: 'https://api.example.test',
    fetch: () => Promise.resolve(response),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

const LIST_INPUT = {
  cursor: null,
  filters: EMPTY_TRIP_OCCURRENCE_FILTERS,
  order: 'desc',
  perPage: 20,
} as const

const NEW_FIELDS = {
  occurrenceTypeId: TYPE_ID,
  typeAllowsMultipleItems: false,
  typeItemsMode: 'off',
} as const

describe('tipo do cadastro: itemsMode', () => {
  test('presente (off e optional) é lido como veio', () => {
    for (const itemsMode of ['off', 'optional'] as const) {
      const [type] = adapters.occurrenceTypesFromApi([buildOccurrenceType({ itemsMode })])
      expect(type?.itemsMode).toBe(itemsMode)
    }
  })

  test('ausente passa e continua ausente: o painel não inventa o que a API não disse', () => {
    const [type] = adapters.occurrenceTypesFromApi([buildOccurrenceType()])
    expect(type).toBeDefined()
    expect(type?.itemsMode).toBeUndefined()
  })

  test('presente com vocabulário fora do combinado é recusado', () => {
    for (const itemsMode of ['sometimes', 1, null]) {
      expect(() => adapters.occurrenceTypesFromApi([buildOccurrenceType({ itemsMode })])).toThrow()
    }
  })
})

describe('feed e detalhe: occurrenceTypeId, typeItemsMode, typeAllowsMultipleItems', () => {
  test('o feed aceita o item sem nenhuma das três chaves, e elas continuam ausentes', async () => {
    const client = createClient(
      Response.json({ data: [buildFeedItem()], pagination: { nextCursor: null } }),
    )
    const [item] = (await client.listOccurrences(LIST_INPUT)).items
    expect(item).toBeDefined()
    for (const key of NEW_KEYS) expect(item).not.toHaveProperty(key)
  })

  test('o feed aceita e preserva as três chaves presentes', async () => {
    const client = createClient(
      Response.json({ data: [buildFeedItem(NEW_FIELDS)], pagination: { nextCursor: null } }),
    )
    const [item] = (await client.listOccurrences(LIST_INPUT)).items
    expect(item?.occurrenceTypeId).toBe(TYPE_ID)
    expect(item?.typeItemsMode).toBe('off')
    expect(item?.typeAllowsMultipleItems).toBe(false)
  })

  test('o detalhe aceita com e sem as chaves', async () => {
    const withKeys = await createClient(
      Response.json({ data: buildDetail(NEW_FIELDS) }),
    ).readOccurrence({
      occurrenceId: 'x',
    })
    expect(withKeys.typeItemsMode).toBe('off')
    const without = await createClient(Response.json({ data: buildDetail() })).readOccurrence({
      occurrenceId: 'x',
    })
    expect(without.typeItemsMode).toBeUndefined()
  })

  test('forma errada em qualquer das três recusa o item', async () => {
    const broken = [
      { typeItemsMode: 'sometimes' },
      { typeAllowsMultipleItems: 'yes' },
      { occurrenceTypeId: 7 },
    ]
    for (const extra of broken) {
      const client = createClient(
        Response.json({ data: [buildFeedItem(extra)], pagination: { nextCursor: null } }),
      )
      const outcome = await client.listOccurrences(LIST_INPUT).then(
        () => 'resolved',
        () => 'rejected',
      )
      expect(outcome).toBe('rejected')
    }
  })
})

describe('lista da nota: typeItemsMode e typeAllowsMultipleItems', () => {
  const BASE = {
    createdAt: '2026-10-03T12:00:00.000Z',
    id: 'occurrence-1',
    note: '',
    occurrenceTypeId: TYPE_ID,
    productCode: '',
    stage: 'delivery',
    typeName: 'Avaria',
  }

  test('aceita sem as chaves novas (API anterior)', () => {
    const [item] = adapters.occurrencesFromApi([BASE])
    expect(item).toBeDefined()
    expect(item).not.toHaveProperty('typeItemsMode')
  })

  test('aceita e preserva as chaves presentes', () => {
    const [item] = adapters.occurrencesFromApi([
      { ...BASE, typeAllowsMultipleItems: false, typeItemsMode: 'off' },
    ])
    expect(item?.typeItemsMode).toBe('off')
    expect(item?.typeAllowsMultipleItems).toBe(false)
  })

  test('forma errada é recusada', () => {
    expect(() => adapters.occurrencesFromApi([{ ...BASE, typeItemsMode: 'sometimes' }])).toThrow()
    expect(() =>
      adapters.occurrencesFromApi([{ ...BASE, typeAllowsMultipleItems: 'yes' }]),
    ).toThrow()
  })
})
