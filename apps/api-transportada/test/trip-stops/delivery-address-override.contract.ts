/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { listDeliveryAddressHistory } from '../../src/trips/application/list-delivery-address-history.use-case.js'
import {
  overrideDeliveryAddress,
  type DeliveryAddressOverrideRecord,
  type OverrideDeliveryAddressPort,
} from '../../src/trips/application/override-delivery-address.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const ACTOR_USER_ID = '44444444-4444-4444-8444-444444444444'

const NEW_ADDRESS = { cityCode: '3543402', number: '100', postalCode: '14010100' }

function createFakePort(
  input: {
    readonly tripExists?: boolean
    readonly tripStatus?: 'cancelled' | 'completed' | 'dispatched' | 'draft'
  } = {},
): OverrideDeliveryAddressPort & { readonly applyOverrideCalls: unknown[] } {
  const applyOverrideCalls: unknown[] = []
  return {
    applyOverrideCalls,
    async applyOverride(call) {
      applyOverrideCalls.push(call)
      const record: DeliveryAddressOverrideRecord = {
        actorUserId: call.actorUserId,
        createdAt: '2026-08-01T10:00:00.000Z',
        id: 'override-1',
        newAddress: call.newAddress,
        newLabel: call.newLabel,
        previousAddress: { cityCode: null, number: null, postalCode: null },
        previousLabel: '',
        reason: call.reason,
        requestedBy: call.requestedBy,
        tripDocumentId: call.tripDocumentId,
      }
      return record
    },
    async readPreconditions() {
      if (input.tripExists === false) return null
      return { tripId: TRIP_ID, tripStatus: input.tripStatus ?? 'draft' }
    },
  }
}

describe('delivery address override contract', () => {
  test('applies the override when the trip is open', async () => {
    const repository = createFakePort()

    const result = await overrideDeliveryAddress({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      newAddress: NEW_ADDRESS,
      newLabel: 'Barrinha/SP',
      reason: 'Redespacho a pedido do cliente',
      repository,
      requestedBy: 'Cliente por telefone',
      tripDocumentId: DOCUMENT_ID,
    })

    expect(result.newAddress).toEqual(NEW_ADDRESS)
    expect(repository.applyOverrideCalls).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        newAddress: NEW_ADDRESS,
        newLabel: 'Barrinha/SP',
        reason: 'Redespacho a pedido do cliente',
        requestedBy: 'Cliente por telefone',
        tripDocumentId: DOCUMENT_ID,
        tripId: TRIP_ID,
      },
    ])
  })

  test('refuses when the document does not exist in this company', async () => {
    const repository = createFakePort({ tripExists: false })

    const error = await overrideDeliveryAddress({
      actorUserId: ACTOR_USER_ID,
      companyId: COMPANY_ID,
      newAddress: NEW_ADDRESS,
      newLabel: 'Barrinha/SP',
      reason: 'Redespacho',
      repository,
      requestedBy: 'Cliente',
      tripDocumentId: DOCUMENT_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('TRIP_DOCUMENT_NOT_FOUND')
    expect(repository.applyOverrideCalls).toEqual([])
  })

  test.each(['dispatched', 'completed', 'cancelled'] as const)(
    'refuses once the trip is %s',
    async (tripStatus) => {
      const repository = createFakePort({ tripStatus })

      const error = await overrideDeliveryAddress({
        actorUserId: ACTOR_USER_ID,
        companyId: COMPANY_ID,
        newAddress: NEW_ADDRESS,
        newLabel: 'Barrinha/SP',
        reason: 'Redespacho',
        repository,
        requestedBy: 'Cliente',
        tripDocumentId: DOCUMENT_ID,
      }).catch((caught: unknown) => caught)

      expect((error as ApiError).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
      expect((error as ApiError).status).toBe(409)
      expect(repository.applyOverrideCalls).toEqual([])
    },
  )
})

describe('delivery address history contract', () => {
  test('lists the history for an existing document', async () => {
    const record: DeliveryAddressOverrideRecord = {
      actorUserId: ACTOR_USER_ID,
      createdAt: '2026-08-01T10:00:00.000Z',
      id: 'override-1',
      newAddress: NEW_ADDRESS,
      newLabel: 'Barrinha/SP',
      previousAddress: { cityCode: null, number: null, postalCode: null },
      previousLabel: '',
      reason: 'Redespacho',
      requestedBy: 'Cliente',
      tripDocumentId: DOCUMENT_ID,
    }
    const repository = {
      async listHistory() {
        return [record]
      },
    }

    const result = await listDeliveryAddressHistory({
      companyId: COMPANY_ID,
      repository,
      tripDocumentId: DOCUMENT_ID,
    })

    expect(result).toEqual({ overrides: [record] })
  })

  test('refuses when the document does not exist', async () => {
    const repository = {
      async listHistory() {
        return null
      },
    }

    const error = await listDeliveryAddressHistory({
      companyId: COMPANY_ID,
      repository,
      tripDocumentId: DOCUMENT_ID,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('TRIP_DOCUMENT_NOT_FOUND')
  })
})
