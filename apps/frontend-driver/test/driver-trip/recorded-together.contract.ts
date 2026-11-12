/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import {
  appendFieldReportNotices,
  dismissFieldReportNotice,
  toFieldReportNotice,
} from '../../src/modules/driver-trip/shared/fieldReportNotice.service'
import { parseFieldReportResponse } from '../../src/modules/driver-trip/shared/fieldReportResponse.service'
import {
  listStepsToRecordTogether,
  toRecordedTogetherTextKey,
} from '../../src/modules/driver-trip/shared/recordedTogether.service'

const NOTHING_DONE = { isArrived: false, isCompleted: false, isEnRoute: false } as const

/** Spec 294 RF3/RF5: o espelho local de `resolveStopEventSequence` — o aviso antes do toque. */
describe('as etapas que a baixa marca junto (RF3/RF5)', () => {
  it.each([
    ['delivered', NOTHING_DONE, ['departed', 'arrived']],
    ['returned', NOTHING_DONE, ['departed', 'arrived']],
    ['delivered', { ...NOTHING_DONE, isEnRoute: true }, ['arrived']],
    ['delivered', { ...NOTHING_DONE, isArrived: true }, []],
    ['delivered', { ...NOTHING_DONE, isCompleted: true }, []],
    ['arrived', NOTHING_DONE, ['departed']],
    ['arrived', { ...NOTHING_DONE, isEnRoute: true }, []],
  ] as const)('%s com %j marca %j', (requestedEvent, state, expected) => {
    expect(listStepsToRecordTogether({ ...state, requestedEvent })).toEqual(expected)
  })

  it('a API antiga, sem rastreio de "a caminho", só avisa da chegada', () => {
    expect(
      listStepsToRecordTogether({
        ...NOTHING_DONE,
        isLegacyEnRouteTracking: true,
        requestedEvent: 'delivered',
      }),
    ).toEqual(['arrived'])
  })

  it('escolhe a frase pelas etapas', () => {
    expect(toRecordedTogetherTextKey(['departed', 'arrived'])).toBe('departedAndArrived')
    expect(toRecordedTogetherTextKey(['arrived'])).toBe('arrived')
    expect(toRecordedTogetherTextKey(['departed'])).toBe('departed')
    expect(toRecordedTogetherTextKey([])).toBeUndefined()
  })

  it('a frase de confirmação diz "Cheguei junto" e existe nos dois idiomas', () => {
    expect(driverTrip.recordedTogether.confirm.arrived).toContain('Cheguei junto')
    for (const locale of [driverTrip, driverTripEn]) {
      for (const mode of ['confirm', 'notice'] as const) {
        expect(Object.keys(locale.recordedTogether[mode]).sort()).toEqual([
          'arrived',
          'departed',
          'departedAndArrived',
        ])
      }
    }
  })
})

describe('a resposta do toque de campo (RF5)', () => {
  it('lê as etapas marcadas junto', () => {
    expect(
      parseFieldReportResponse({ data: { id: 'e1', recordedTogether: ['departed', 'arrived'] } }),
    ).toEqual({ recordedTogether: ['departed', 'arrived'] })
  })

  it('a API antiga (sem o campo) e valores desconhecidos viram lista vazia, nunca erro', () => {
    expect(parseFieldReportResponse({ data: { id: 'e1' } })).toEqual({ recordedTogether: [] })
    expect(parseFieldReportResponse({ data: { recordedTogether: ['x', 'arrived'] } })).toEqual({
      recordedTogether: ['arrived'],
    })
    expect(parseFieldReportResponse({})).toBeUndefined()
    expect(parseFieldReportResponse(null)).toBeUndefined()
  })

  it('o cliente devolve o que a API respondeu ao deliver', async () => {
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ data: { id: 'x', recordedTogether: ['arrived'] } }), {
            headers: { 'content-type': 'application/json' },
            status: 201,
          }),
        ),
      getAccessToken: () => Promise.resolve('token'),
    })
    const response = await client.send({
      report: {
        documentId: 'doc-1',
        idempotencyKey: 'key-1',
        kind: 'deliver',
        lateRegistration: true,
        location: null,
      },
      stamp: undefined,
    })
    expect(response).toEqual({ recordedTogether: ['arrived'] })
  })
})

describe('os avisos pós-baixa (RF5)', () => {
  const together = { recordedTogether: ['arrived'] } as const

  it('só vira aviso a chegada ou a baixa que marcou algo junto', () => {
    expect(toFieldReportNotice({ key: 'k1', kind: 'deliver', response: together })).toEqual({
      key: 'k1',
      kind: 'deliver',
      recordedTogether: ['arrived'],
    })
    expect(
      toFieldReportNotice({ key: 'k2', kind: 'deliver', response: { recordedTogether: [] } }),
    ).toBeUndefined()
    expect(toFieldReportNotice({ key: 'k3', kind: 'depart', response: together })).toBeUndefined()
    expect(toFieldReportNotice({ key: 'k4', kind: 'deliver', response: undefined })).toBeUndefined()
  })

  it('o mesmo toque não duplica o aviso e "Entendi" o tira', () => {
    const notice = toFieldReportNotice({ key: 'k1', kind: 'return', response: together })
    if (notice === undefined) throw new Error('aviso esperado')
    const once = appendFieldReportNotices([], [notice])
    expect(appendFieldReportNotices(once, [notice])).toHaveLength(1)
    expect(dismissFieldReportNotice(once, 'k1')).toEqual([])
  })
})
