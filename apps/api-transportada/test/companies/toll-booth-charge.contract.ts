/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  ACTOR_USER_ID,
  adjustChargeRequest,
  CATALOG,
  clearChargeRequest,
  COMPANY_ID,
  createTollBoothChargeHttpFixture,
  FRONTEND_ORIGIN,
  listChargesRequest,
  TOLL_BOOTH_CHARGES_PATH,
  UPDATED_AT,
} from '../fixtures/toll-booth-charge-http.fixture'

describe('GET /company-settings/toll-booth-charges HTTP contract', () => {
  test('answers only the praças already corrected by the company, with catalog and effective values', async () => {
    const fixture = await createTollBoothChargeHttpFixture()

    const response = await fixture.handle(listChargesRequest({ origin: FRONTEND_ORIGIN }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: [
        {
          actorUserId: ACTOR_USER_ID,
          catalog: { chargeCar: '10.50', chargePerAxle: '10.50', observedOn: '2026-06-01' },
          chargeCarSource: 'manual',
          chargePerAxleSource: 'manual',
          effectiveChargeCar: '11.00',
          effectiveChargePerAxle: '11.00',
          name: 'Praça SP-330',
          observedOn: '2026-08-01',
          operator: 'CCR',
          osmNodeId: 111,
          source: 'manual',
          updatedAt: UPDATED_AT.toISOString(),
        },
      ],
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(fixture.listCalls).toEqual([COMPANY_ID])
  })

  // Corrigir praça por onde ninguém passa é trabalho jogado fora (spec 095) — nunca as 166 do catálogo
  test('answers empty when the company has never corrected any toll booth', async () => {
    const fixture = await createTollBoothChargeHttpFixture({ adjustments: [] })

    const response = await fixture.handle(listChargesRequest())

    expect(await response.json()).toEqual({ data: [] })
  })
})

describe('PUT /company-settings/toll-booth-charges/{osmNodeId} HTTP contract', () => {
  test('records the correction with the actor and the informed date', async () => {
    const fixture = await createTollBoothChargeHttpFixture()

    const response = await fixture.handle(
      adjustChargeRequest({
        body: { chargePerAxle: '9.9000', observedOn: '2026-09-07' },
        osmNodeId: '222',
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        actorUserId: ACTOR_USER_ID,
        catalog: { chargeCar: null, chargePerAxle: null, observedOn: '2026-06-01' },
        /** ⚠️ Só o por eixo foi corrigido; o de carro segue sendo o do mapa (que aqui não sabe). */
        chargeCarSource: 'catalog',
        chargePerAxleSource: 'manual',
        effectiveChargeCar: null,
        effectiveChargePerAxle: '9.9000',
        name: 'Praça SP-291',
        observedOn: '2026-09-07',
        operator: null,
        osmNodeId: 222,
        source: 'manual',
        updatedAt: UPDATED_AT.toISOString(),
      },
    })
    expect(fixture.adjustCalls).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        chargeCar: null,
        chargePerAxle: '9.9000',
        companyId: COMPANY_ID,
        observedOn: '2026-09-07',
        osmNodeId: 222,
      },
    ])
  })

  // Ajuste sem nenhum dos dois campos não corrige nada — seria trabalho jogado fora
  test('refuses a body with neither chargePerAxle nor chargeCar', async () => {
    const fixture = await createTollBoothChargeHttpFixture()

    const response = await fixture.handle(
      adjustChargeRequest({ body: { observedOn: '2026-09-07' }, osmNodeId: '111' }),
    )

    expect(response.status).toBe(400)
    expect(fixture.adjustCalls).toEqual([])
  })

  test('refuses a malformed osmNodeId as a bad request, never a lookup', async () => {
    const fixture = await createTollBoothChargeHttpFixture()

    const response = await fixture.handle(adjustChargeRequest({ osmNodeId: 'abc' }))

    expect(response.status).toBe(400)
    expect(fixture.adjustCalls).toEqual([])
  })
})

describe('DELETE /company-settings/toll-booth-charges/{osmNodeId} HTTP contract', () => {
  // Apaga o ajuste — nunca grava zero. Depois do DELETE a praça volta a valer o catálogo.
  test('clears the adjustment and answers 204', async () => {
    const fixture = await createTollBoothChargeHttpFixture()

    const response = await fixture.handle(clearChargeRequest('111'))

    expect(response.status).toBe(204)
    expect(fixture.clearCalls).toEqual([{ companyId: COMPANY_ID, osmNodeId: 111 }])

    const afterDelete = await fixture.handle(listChargesRequest())
    expect(await afterDelete.json()).toEqual({ data: [] })
  })
})

test('the catalog fixture stays consistent with what the routes advertise', () => {
  expect(CATALOG.map((entry) => entry.osmNodeId)).toEqual([111, 222])
  expect(TOLL_BOOTH_CHARGES_PATH).toBe('/company-settings/toll-booth-charges')
})
