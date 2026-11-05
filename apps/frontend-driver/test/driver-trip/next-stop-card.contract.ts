/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import {
  isNextStopStillPending,
  toFieldReportNotice,
} from '../../src/modules/driver-trip/shared/fieldReportNotice.service'
import { parseFieldReportResponse } from '../../src/modules/driver-trip/shared/fieldReportResponse.service'
import { toDriverTripSnapshot } from '../../src/modules/driver-trip/shared/driverTripResponse.validation'

const NEXT_STOP_PAYLOAD = {
  address: 'Rua das Flores, 10',
  coordinate: null,
  documents: [
    { id: 'd1', number: '17234' },
    { id: 'd2', number: '17235' },
  ],
  id: 'stop-4',
  isAddressReliable: false,
  precision: 'city',
  recipientName: 'Padaria Sol',
  sequence: 4,
  totalStops: 6,
}

/** Spec 294 RF8/RF11/RF12: a próxima parada que a baixa que fecha a parada devolve. */
describe('a próxima parada na resposta da baixa (RF11)', () => {
  it('lê a oferta com notas, cliente e o aviso de endereço', () => {
    const response = parseFieldReportResponse({
      data: { id: 'x', nextStop: NEXT_STOP_PAYLOAD, recordedTogether: [] },
    })
    expect(response?.nextStop).toEqual({
      address: 'Rua das Flores, 10',
      documentNumbers: ['17234', '17235'],
      id: 'stop-4',
      isAddressReliable: false,
      recipientName: 'Padaria Sol',
      sequence: 4,
      totalStops: 6,
    })
  })

  it('oferta malformada some; sem o campo de confiança o aviso não acende', () => {
    expect(
      parseFieldReportResponse({ data: { nextStop: { id: 'stop-4' }, recordedTogether: [] } })
        ?.nextStop,
    ).toBeUndefined()
    const legacy: Record<string, unknown> = { ...NEXT_STOP_PAYLOAD }
    delete legacy.isAddressReliable
    expect(
      parseFieldReportResponse({ data: { nextStop: legacy } })?.nextStop?.isAddressReliable,
    ).toBe(true)
  })

  it('a oferta sozinha já vira aviso (baixa sem etapa junto)', () => {
    const response = parseFieldReportResponse({ data: { nextStop: NEXT_STOP_PAYLOAD } })
    const notice = toFieldReportNotice({ key: 'k1', kind: 'deliver', response })
    expect(notice?.nextStop?.id).toBe('stop-4')
    expect(notice?.recordedTogether).toEqual([])
  })

  it('a oferta só vale enquanto a parada não saiu, não chegou e não fechou', () => {
    const open = { arrivedAt: null, completedAt: null, enRouteSince: null, id: 'stop-4' }
    const trips = (stop: object) => [{ stops: [stop] }] as never
    expect(isNextStopStillPending(trips(open), 'stop-4')).toBe(true)
    expect(isNextStopStillPending(trips({ ...open, enRouteSince: 'x' }), 'stop-4')).toBe(false)
    expect(isNextStopStillPending(trips({ ...open, arrivedAt: 'x' }), 'stop-4')).toBe(false)
    expect(isNextStopStillPending(trips({ ...open, completedAt: 'x' }), 'stop-4')).toBe(false)
    expect(isNextStopStillPending(trips(open), 'outra')).toBe(false)
    expect(isNextStopStillPending(trips(open), undefined)).toBe(false)
  })
})

describe('a correção do endereço pelo Cheguei (RF14)', () => {
  it.each(['applied', 'suggested'] as const)('"%s" vira aviso', (addressCorrection) => {
    const response = parseFieldReportResponse({
      data: { addressCorrection, id: 'x', recordedTogether: [] },
    })
    expect(toFieldReportNotice({ key: 'k1', kind: 'arrive', response })?.addressCorrection).toBe(
      addressCorrection,
    )
  })

  it.each(['ignored', 'failed'] as const)('"%s" não diz nada ao motorista', (addressCorrection) => {
    const response = parseFieldReportResponse({
      data: { addressCorrection, id: 'x', recordedTogether: [] },
    })
    expect(toFieldReportNotice({ key: 'k1', kind: 'arrive', response })).toBeUndefined()
  })

  it('valor desconhecido é ignorado', () => {
    expect(
      parseFieldReportResponse({ data: { addressCorrection: 'x', recordedTogether: [] } })
        ?.addressCorrection,
    ).toBeUndefined()
  })
})

describe('o snapshot traz a confiança do endereço (RF12/RF13)', () => {
  const stop = (extra: object) => ({
    arrivedAt: null,
    completedAt: null,
    documents: [],
    id: 's1',
    label: 'Parada',
    latitude: null,
    longitude: null,
    sequence: 1,
    ...extra,
  })
  const snapshotOf = (stops: object[]) =>
    toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        pendingProofs: [],
        score: null,
        trips: [
          {
            createdAt: '',
            id: 't1',
            manifest: null,
            status: 'dispatched',
            stops,
            vehiclePlate: 'AAA',
          },
        ],
      },
    })

  it('lê isAddressReliable e a API antiga, sem o campo, não avisa', () => {
    expect(
      snapshotOf([stop({ isAddressReliable: false })]).trips[0]?.stops[0]?.isAddressReliable,
    ).toBe(false)
    expect(snapshotOf([stop({})]).trips[0]?.stops[0]?.isAddressReliable).toBeUndefined()
  })
})

describe('os textos da próxima parada existem nos dois idiomas', () => {
  it('nextStop e addressCorrection', () => {
    for (const locale of [driverTrip, driverTripEn]) {
      expect(Object.keys(locale.nextStop).sort()).toEqual([
        'documents',
        'notNow',
        'start',
        'title',
        'unreliableAddress',
      ])
      expect(Object.keys(locale.addressCorrection).sort()).toEqual(['applied', 'suggested'])
    }
    expect(driverTrip.nextStop.start).toBe('Iniciar rota')
  })
})
