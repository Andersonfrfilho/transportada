/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T5: o painel da coleta de canhoto — seletores da aba Tipos, o encaixe pelo escritório e a flag com
 * tooltip. Tudo tolerante: o painel vai antes da API (ADR-0081 §9), então campo ausente é "API anterior".
 */
import { describe, expect, it } from 'bun:test'

import settingsEn from '@/modules/company-settings/locales/companySettings.en.locale.json'
import settingsPt from '@/modules/company-settings/locales/companySettings.locale.json'
import tripEn from '@/modules/trip/locales/trip.en.locale.json'
import tripPt from '@/modules/trip/locales/trip.locale.json'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import { hasValidContractorReplyTypeFields } from '@/modules/trip/shared/occurrenceContractorReply.validation'
import { buildOccurrenceTypeUpdate } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import {
  hasCanhotoRetainedMarker,
  isCanhotoPickup,
  splitCanhotoPickupsForTrip,
  type CanhotoPickup,
} from '@/modules/trip/shared/canhotoPickup.service'
import {
  CanhotoPickupRequestError,
  createCanhotoPickupClient,
} from '@/modules/trip/shared/canhotoPickupClient.service'

const TYPE = {
  active: true,
  allowsMultipleItems: false,
  attachmentMode: 'optional',
  emailTemplateKey: null,
  flow: 'document',
  id: 'type-1',
  leavesDocumentBehind: false,
  name: 'Canhoto retido pelo cliente',
  notifies: true,
  redeliveryPolicy: 'unset',
  stage: 'delivery',
} as unknown as OccurrenceType

function pickup(overrides: Partial<CanhotoPickup> = {}): CanhotoPickup {
  return {
    createdAt: '2026-11-11T10:00:00.000Z',
    documentNumber: '1234',
    id: 'pickup-1',
    nfeDocumentId: 'nfe-1',
    occurrenceId: 'occ-1',
    originStopLabel: 'Rua A, 10',
    originTripDocumentId: 'doc-1',
    originTripId: 'trip-origin',
    pickupStopId: null,
    pickupTripId: null,
    status: 'pending',
    ...overrides,
  }
}

describe('seletores do tipo (spec 321 RF1)', () => {
  it('a resposta aceita as três marcas ausentes (API anterior) ou booleanas, e recusa o resto', () => {
    expect(hasValidContractorReplyTypeFields({})).toBe(true)
    for (const key of [
      'blocksContractorNotice',
      'countsCargoOnPickupTrip',
      'createsCanhotoPickup',
    ]) {
      expect(hasValidContractorReplyTypeFields({ [key]: false })).toBe(true)
      expect(hasValidContractorReplyTypeFields({ [key]: 'sim' })).toBe(false)
    }
  })

  it('a edição manda só o que mudou, e as três chaves juntas quando a coleta liga', () => {
    expect(buildOccurrenceTypeUpdate(TYPE, { name: 'X' })).not.toHaveProperty(
      'createsCanhotoPickup',
    )
    expect(buildOccurrenceTypeUpdate(TYPE, { name: 'X' })).not.toHaveProperty(
      'blocksContractorNotice',
    )
    expect(
      buildOccurrenceTypeUpdate(TYPE, {
        countsCargoOnPickupTrip: false,
        createsCanhotoPickup: true,
      }),
    ).toMatchObject({ countsCargoOnPickupTrip: false, createsCanhotoPickup: true })
  })

  it('rótulo e dica existem nos dois idiomas', () => {
    for (const locale of [settingsPt, settingsEn]) {
      for (const key of [
        'blocksContractorNotice',
        'createsCanhotoPickup',
        'countsCargoOnPickupTrip',
      ]) {
        expect(
          locale.occurrenceTypeCatalog[key as keyof typeof locale.occurrenceTypeCatalog],
        ).toBeString()
        expect(
          locale.occurrenceTypeCatalog[`${key}Hint` as keyof typeof locale.occurrenceTypeCatalog],
        ).toBeString()
      }
    }
  })
})

describe('a coleta de canhoto (spec 321 RF4, D6)', () => {
  it('o guarda lê a visão da API com chaves exatas', () => {
    expect(isCanhotoPickup(pickup())).toBe(true)
    expect(isCanhotoPickup({ ...pickup(), extra: 1 })).toBe(false)
    expect(isCanhotoPickup({ ...pickup(), status: 'done' })).toBe(false)
  })

  it('separa o que está encaixado nesta viagem do que ela ainda pode receber, nunca a viagem de origem', () => {
    const pickups = [
      pickup({ id: 'a' }),
      pickup({ id: 'b', pickupTripId: 'trip-new', status: 'scheduled' }),
      pickup({ id: 'c', pickupTripId: 'trip-other', status: 'scheduled' }),
      pickup({ id: 'd', originTripId: 'trip-new' }),
    ]
    const result = splitCanhotoPickupsForTrip({ pickups, tripId: 'trip-new' })
    expect(result.scheduled.map((entry) => entry.id)).toEqual(['b'])
    expect(result.available.map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  it('a flag da nota de origem só aparece com `true` (ausente é API anterior)', () => {
    expect(hasCanhotoRetainedMarker({})).toBe(false)
    expect(hasCanhotoRetainedMarker({ canhotoRetained: false })).toBe(false)
    expect(hasCanhotoRetainedMarker({ canhotoRetained: true })).toBe(true)
  })

  it('o tooltip da coleta diz que peso e dimensão não entram na carga, nos dois idiomas', () => {
    expect(tripPt.canhotoPickup.flag.pickup.hint).toBe(
      'Esta nota volta só para buscar o canhoto; peso e dimensão não entram na carga desta viagem.',
    )
    expect(tripEn.canhotoPickup.flag.pickup.hint).toBeString()
    expect(Object.keys(tripPt.canhotoPickup.errors)).toEqual(
      Object.keys(tripEn.canhotoPickup.errors),
    )
  })
})

describe('cliente das rotas da T3', () => {
  function clientWith(respond: (request: Request) => Response) {
    const seen: Request[] = []
    const client = createCanhotoPickupClient({
      apiBaseUrl: 'http://api.test',
      fetch: (request) => {
        seen.push(request)
        return Promise.resolve(respond(request))
      },
      getAccessToken: () => Promise.resolve('token'),
    })

    return { client, seen }
  }

  it('lista as abertas, encaixa com { tripId } e desencaixa sem corpo', async () => {
    const { client, seen } = clientWith((request) =>
      Response.json({
        data: request.method === 'GET' ? [pickup()] : pickup({ status: 'scheduled' }),
      }),
    )
    expect(await client.list(['pending', 'scheduled'])).toHaveLength(1)
    await client.schedule({ pickupId: 'pickup-1', tripId: 'trip-new' })
    await client.unschedule('pickup-1')
    const urls = seen.map(
      (request) =>
        `${request.method} ${new URL(request.url).pathname}${new URL(request.url).search}`,
    )
    expect(urls).toEqual([
      'GET /trip-canhoto-pickups?status=pending&status=scheduled&limit=200',
      'POST /trip-canhoto-pickups/pickup-1/schedule',
      'POST /trip-canhoto-pickups/pickup-1/unschedule',
    ])
    expect(await seen[1]?.json()).toEqual({ tripId: 'trip-new' })
    expect(seen[0]?.headers.get('authorization')).toBe('Bearer token')
  })

  it('a recusa da API vira o código; resposta fora do formato é recusada', async () => {
    const refused = clientWith(() =>
      Response.json({ error: { code: 'CANHOTO_PICKUP_ORIGIN_TRIP' } }, { status: 422 }),
    )
    const refusal = await refused.client
      .schedule({ pickupId: 'p', tripId: 't' })
      .catch((error: unknown) => error)
    expect(refusal).toBeInstanceOf(CanhotoPickupRequestError)
    expect((refusal as Error).message).toBe('CANHOTO_PICKUP_ORIGIN_TRIP')
    const malformed = clientWith(() => Response.json({ data: [{ id: 1 }] }))
    const invalid = await malformed.client.list(['pending']).catch((error: unknown) => error)
    expect((invalid as Error).message).toBe('RESPONSE_INVALID')
  })
})
