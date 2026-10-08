/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T7.2 (R2, painel): o detalhe da ocorrência traz `referenceNumber`, `declaredAmount` e `itemValues`
 * no nível da ocorrência. O golden é o que a API serializa de verdade; sem as chaves (API ou ocorrência
 * antigas) nada reprova, e com forma errada a resposta é recusada. Dinheiro é sempre texto.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { createTripOccurrenceFeedClient } from '@/modules/trip/shared/tripOccurrenceFeedClient.service'

const golden = JSON.parse(
  readFileSync(
    new URL('../fixtures/occurrence-detail-values.golden.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown>

function buildDetail(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    actorName: null,
    case: null,
    channel: 'office',
    createdAt: '2026-10-03T12:00:00.000Z',
    description: '',
    document: null,
    driver: null,
    driverName: '',
    hasAttachment: false,
    id: '4b581a02-3dba-4df9-a20b-20ac66163fa1',
    invoiceNumber: null,
    invoiceSeries: null,
    items: [],
    notifies: false,
    onBehalfOfDriverName: null,
    source: 'document',
    stage: 'delivery',
    stopLabel: null,
    tripId: 'trip-1',
    typeName: 'Devolução',
    vehiclePlate: 'ABC1D23',
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

describe('detalhe da ocorrência: número, valor pago e valores por linha (spec 247 R2)', () => {
  test('o golden da API é lido como veio, com dinheiro em texto', async () => {
    const detail = await readDetail(golden)
    expect(detail.referenceNumber).toBe('NFD 45029')
    expect(detail.declaredAmount).toBeNull()
    expect(detail.itemValues).toEqual(golden.itemValues as never)
    expect(typeof detail.itemValues?.[0]?.declaredAmount).toBe('string')
    expect(detail.itemValues?.[1]?.declaredAmount).toBe('0.00')
  })

  test('os requisitos efetivos do tipo vêm como o contrato da API os serializa', async () => {
    const detail = await readDetail(golden)
    expect(detail.requirements).toEqual(golden.requirements as never)
  })

  test('requirements ausente ou nulo (ocorrência, API ou parada sem nota antigas) passa', async () => {
    expect(await readDetail({})).not.toHaveProperty('requirements')
    expect((await readDetail({ requirements: null })).requirements).toBeNull()
  })

  test('requirements com forma errada é recusado: modo fora do vocabulário, rótulo vazio, nível', async () => {
    const requirements = golden.requirements as Record<string, unknown>
    const refused = await Promise.all(
      [
        { requirements: { ...requirements, referenceNumberMode: 'maybe' } },
        { requirements: { ...requirements, declaredAmountLabel: '' } },
        { requirements: { ...requirements, declaredAmountScope: 'order' } },
        { requirements: { ...requirements, itemsMode: undefined } },
        { requirements: 'x' },
      ].map((extra) =>
        readDetail(extra).then(
          () => false,
          () => true,
        ),
      ),
    )
    expect(refused).toEqual([true, true, true, true, true])
  })

  test('sem as três chaves a leitura passa e elas continuam ausentes', async () => {
    const detail = await readDetail({})
    expect(detail).not.toHaveProperty('referenceNumber')
    expect(detail).not.toHaveProperty('declaredAmount')
    expect(detail).not.toHaveProperty('itemValues')
  })

  test('o valor da ocorrência em duas casas, inclusive zero, é texto', async () => {
    const detail = await readDetail({
      declaredAmount: '0.00',
      itemValues: [],
      referenceNumber: null,
    })
    expect(detail.declaredAmount).toBe('0.00')
    expect(detail.itemValues).toEqual([])
    expect(detail.referenceNumber).toBeNull()
  })

  test('forma errada é recusada: número como valor, dinheiro como número, linha sem código', async () => {
    const line = (golden.itemValues as readonly Record<string, unknown>[])[0] ?? {}
    const refused = await Promise.all(
      [
        { declaredAmount: 12.5 },
        { referenceNumber: 45029 },
        { itemValues: 'x' },
        { itemValues: [{ ...line, declaredAmount: 50 }] },
        { itemValues: [{ ...line, productCode: undefined }] },
        { itemValues: [{ ...line, unitValue: '19,995' }] },
      ].map((extra) =>
        readDetail(extra).then(
          () => false,
          () => true,
        ),
      ),
    )
    expect(refused).toEqual([true, true, true, true, true, true])
  })
})
