/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'
import { isSettingsResolutionView } from '@/modules/trip/shared/settingsResolution.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

/**
 * Spec 247 T4.6: os JSONs de referência são o que a API serializa de verdade (a integração
 * `driver-snapshot-products` e o contrato `driver-snapshot-products` da API os comparam byte a byte
 * com a resposta). Os parsers do painel recebem o payload real com os campos novos, não uma fixture
 * escrita à mão para agradar o guard.
 */
function readFixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>
}

const adapters = createTripResponseAdapters()

describe('o painel aceita o payload real da API com os campos da spec 247 (T4.6)', () => {
  it('o snapshot do motorista com produtos e tipo efetivo passa no parser do painel', () => {
    const document = readFixture('driver-snapshot-document.golden.json')

    const snapshot = toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        pendingProofs: [],
        score: null,
        trips: [
          {
            createdAt: '2026-10-07T00:00:00.000Z',
            id: 'trip-1',
            manifest: null,
            status: 'in_transit',
            stops: [
              {
                arrivedAt: null,
                completedAt: null,
                documents: [document],
                id: 'stop-1',
                label: 'Centro, 100',
                latitude: null,
                longitude: null,
                sequence: 1,
              },
            ],
            vehiclePlate: 'ABC1D23',
          },
        ],
      },
    })

    expect(snapshot.trips[0]?.stops[0]?.documents[0]?.number).toBe('680481')
  })

  it('o tipo efetivo do documento real passa na lista de tipos de rua do escritório', () => {
    const document = readFixture('driver-snapshot-document.golden.json')

    const types = adapters.fieldOccurrenceTypesFromApi(document.occurrenceTypes)

    expect(types[0]).toMatchObject({
      declaredAmountScope: 'item',
      referenceNumberLabel: 'Número da NFD',
      referenceNumberMode: 'required',
    })
  })

  it('a verificação real, com os onze campos e a camada de cada um, passa no guard da tela', () => {
    expect(isSettingsResolutionView(readFixture('settings-resolution.golden.json'))).toBe(true)
  })
})
