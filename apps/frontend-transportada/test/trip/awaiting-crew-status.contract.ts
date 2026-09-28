/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './trip.fixture'

type TripTypesModule = Readonly<{ TRIP_STATUS: readonly string[] }>

/**
 * Spec 217 (RF1/D1, T501): `awaiting_crew` é a viagem sem motorista **e** veículo — o primeiro da
 * máquina de estados que o bundle conhece. Sem esta entrada, nenhuma tela consegue comparar
 * `trip.status === 'awaiting_crew'` sem o TypeScript recusar a comparação.
 */
describe('trip awaiting-crew status contract', () => {
  test('awaiting_crew entra em TRIP_STATUS', async () => {
    const { TRIP_STATUS } = await loadFutureModule<TripTypesModule>(
      '../../src/modules/trip/shared/trip.types',
    )

    expect(TRIP_STATUS).toContain('awaiting_crew')
  })
})
