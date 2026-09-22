/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  cancelTrip,
  type CancelTripPort,
} from '../../src/trips/application/cancel-trip.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000a11'
const ACTOR_USER_ID = '00000000-0000-4000-8000-000000000a22'

function port(input: { readonly status: null | Parameters<typeof build>[0] }) {
  return build(input.status)
}

function build(
  status: null | 'draft' | 'route_planned' | 'dispatched' | 'completed' | 'cancelled',
) {
  const calls: Parameters<CancelTripPort['markCancelled']>[0][] = []
  const repository: CancelTripPort = {
    markCancelled: async (received) => {
      calls.push(received)
      return 'cancelled'
    },
    readTripStatus: async () => status,
  }

  return { calls, repository }
}

describe('cancelar devolve a carga (spec 102)', () => {
  /**
   * ⚠️ O buraco que esta spec fecha: `markCancelled` só trocava `trips.status`, e quem decide se a
   * nota está disponível olha `released_at`, nunca o status da viagem. Cancelar prendia a carga
   * **para sempre**, e nada na tela dizia por quê.
   */
  it('cancelar chama a persistência que libera as notas', async () => {
    const { calls, repository } = build('route_planned')

    const result = await cancelTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('cancelled')
    expect(calls).toEqual([
      {
        actorUserId: ACTOR_USER_ID,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        companyId: COMPANY_ID,
        onBehalfOfDriverId: null,
        tripId: TRIP_ID,
      },
    ])
  })

  /**
   * ⚠️ D3: idempotente por desenho. Viagem já cancelada **não** escreve de novo — e portanto uma
   * viagem cancelada antes desta spec, com carga presa, não é destravada por um segundo
   * cancelamento. É passivo conhecido, e migration de dados é decisão à parte.
   */
  it('viagem já cancelada não escreve de novo', async () => {
    const { calls, repository } = build('cancelled')

    const result = await cancelTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(result.tripStatus).toBe('cancelled')
    expect(calls).toEqual([])
  })

  it('viagem concluída não é cancelável', async () => {
    const { repository } = build('completed')

    await expect(
      cancelTrip({
        actorUserId: ACTOR_USER_ID,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        companyId: COMPANY_ID,
        repository,
        tripId: TRIP_ID,
      }),
    ).rejects.toThrow()
  })

  it('viagem inexistente é ausência', async () => {
    const { repository } = port({ status: null })

    await expect(
      cancelTrip({
        actorUserId: ACTOR_USER_ID,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        companyId: COMPANY_ID,
        repository,
        tripId: TRIP_ID,
      }),
    ).rejects.toThrow()
  })

  /** Cancelar vale com o motorista na rua — é incidente, não fluxo (ADR-0043 §1). */
  it('cancela viagem já despachada', async () => {
    const { calls, repository } = build('dispatched')

    await cancelTrip({
      actorUserId: ACTOR_USER_ID,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: COMPANY_ID,
      repository,
      tripId: TRIP_ID,
    })

    expect(calls).toHaveLength(1)
  })
})
