/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317: o detalhe da ocorrência de parada traz a cobrança no recebimento — valor, quem pagou, o PIX do motorista
 * (só com `trip.financials`) e as fotos das vagas (placa, extrato). Bloco ausente ou malformado vira `null` e a
 * página abre igual: a leitura é tolerante, nunca derruba o detalhe.
 */
import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'

const CHARGE = {
  declaredAmount: '50.00',
  driverPix: { key: '16993056772', type: 'phone' },
  paidBy: 'driver',
  photos: [
    {
      expiresAt: '2026-11-17T20:00:00.000Z',
      label: 'Placa do veículo',
      slotKey: 'plate',
      url: 'https://signed.example/placa',
    },
    {
      expiresAt: '2026-11-17T20:00:00.000Z',
      label: 'Extrato do pagamento',
      slotKey: 'payment_receipt',
      url: 'https://signed.example/extrato',
    },
  ],
}

function buildDetail(extra: Readonly<Record<string, unknown>>) {
  return {
    actorName: null,
    case: null,
    channel: 'office',
    createdAt: '2026-11-17T20:13:00.000Z',
    description: 'dsfasdfasdfasdf',
    document: null,
    driver: null,
    driverName: 'Anderson',
    hasAttachment: true,
    id: '4b581a02-3dba-4df9-a20b-20ac66163fa1',
    invoiceNumber: null,
    invoiceSeries: null,
    items: [],
    notifies: false,
    onBehalfOfDriverName: null,
    source: 'document',
    stage: 'delivery',
    stopLabel: 'R FRANCISCO MARQUES, 650',
    tripId: 'trip-1',
    typeName: 'Cobrança inesperada',
    vehiclePlate: 'FVB5I89',
    ...extra,
  }
}

function readDetail(extra: Readonly<Record<string, unknown>>) {
  return createTripOccurrenceFeedClient({
    apiUrl: 'https://api.example.test',
    fetch: () => Promise.resolve(Response.json({ data: buildDetail(extra) })),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  }).readOccurrence({ occurrenceId: 'occurrence-1' })
}

describe('cobrança no recebimento no detalhe da ocorrência (spec 317)', () => {
  test('lê valor, quem pagou, PIX e as duas fotos das vagas', async () => {
    const detail = await readDetail({ receivingCharge: CHARGE })
    expect(detail.receivingCharge?.declaredAmount).toBe('50.00')
    expect(detail.receivingCharge?.paidBy).toBe('driver')
    expect(detail.receivingCharge?.driverPix).toEqual({ key: '16993056772', type: 'phone' })
    expect(detail.receivingCharge?.photos.map((photo) => photo.slotKey)).toEqual([
      'plate',
      'payment_receipt',
    ])
  })

  test('sem trip.financials o PIX chega nulo e o resto continua', async () => {
    const detail = await readDetail({ receivingCharge: { ...CHARGE, driverPix: null } })
    expect(detail.receivingCharge?.driverPix).toBeNull()
    expect(detail.receivingCharge?.photos).toHaveLength(2)
  })

  test('API anterior (sem a chave) e ocorrência sem cobrança abrem igual', async () => {
    expect((await readDetail({})).receivingCharge ?? null).toBeNull()
    expect((await readDetail({ receivingCharge: null })).receivingCharge ?? null).toBeNull()
  })

  test('bloco malformado vira nulo e não derruba o detalhe', async () => {
    const malformed = [
      { ...CHARGE, declaredAmount: 50 },
      { ...CHARGE, paidBy: 'bank' },
      { ...CHARGE, driverPix: { key: 'x', type: 'carrier_pigeon' } },
      { ...CHARGE, photos: [{ label: 'sem url' }] },
      'texto',
    ]
    for (const receivingCharge of malformed) {
      const detail = await readDetail({ receivingCharge })
      expect(detail.receivingCharge ?? null).toBeNull()
      expect(detail.typeName).toBe('Cobrança inesperada')
    }
  })
})
