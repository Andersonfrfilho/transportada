/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'

function buildSnapshot(schedule: unknown): unknown {
  return {
    data: {
      isRegisteredDriver: true,
      trips: [
        {
          id: 'trip',
          manifest: null,
          status: 'in_transit',
          stops: [
            {
              arrivedAt: null,
              completedAt: null,
              deliveryWindowEnd: null,
              deliveryWindowStart: null,
              documents: [],
              id: 'stop',
              label: 'Loja Central',
              latitude: null,
              longitude: null,
              schedule,
              sequence: 1,
            },
          ],
          vehiclePlate: 'GCQ8E47',
        },
      ],
    },
  }
}

describe('a hora marcada no bolso do motorista (spec 060 T013)', () => {
  /** A maioria das paradas não exige agendamento: ausência é o caso normal, não defeito. */
  it('aceita parada sem agendamento', () => {
    const snapshot = toDriverTripSnapshot(buildSnapshot(null))

    expect(snapshot.trips[0]?.stops[0]?.schedule).toBeNull()
  })

  it('lê hora, protocolo e estado quando o agendamento existe', () => {
    const snapshot = toDriverTripSnapshot(
      buildSnapshot({
        protocol: 'AG-4471',
        scheduledAt: '2026-08-28T11:00:00.000Z',
        status: 'confirmed',
      }),
    )

    expect(snapshot.trips[0]?.stops[0]?.schedule).toEqual({
      protocol: 'AG-4471',
      scheduledAt: '2026-08-28T11:00:00.000Z',
      status: 'confirmed',
    })
  })

  /**
   * Agendamento pedido e ainda não confirmado **não tem hora** — e isso precisa atravessar, porque a
   * tela diz "aguardando" em vez de inventar um horário.
   */
  it('aceita agendamento ainda sem hora marcada', () => {
    const snapshot = toDriverTripSnapshot(
      buildSnapshot({ protocol: '', scheduledAt: null, status: 'requested' }),
    )

    expect(snapshot.trips[0]?.stops[0]?.schedule?.status).toBe('requested')
  })

  /** Sem estado não há o que dizer ao motorista: agendamento pela metade é pior que nenhum. */
  it('recusa agendamento sem estado', () => {
    expect(() => toDriverTripSnapshot(buildSnapshot({ protocol: 'AG-1' }))).toThrow()
  })
})
