/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  formatShortTripId,
  SHORT_TRIP_ID_LENGTH,
} from '@/modules/driver-trip/shared/tripIdentifier.service'

/**
 * Pedido do usuário (01/10): "utilizar o mesmo que usa na listagem de viagens". O identificador só
 * serve se motorista e escritório lerem o MESMO código ao telefone — por isso a paridade com o
 * painel é contrato, não coincidência.
 */
describe('identificador curto da viagem no app do motorista (pedido do usuário 01/10)', () => {
  it('é o recorte de 8 caracteres do UUID, sem mexer na caixa', () => {
    expect(formatShortTripId('0f8c2a71-9b3d-4e55-8a10-6c2f5d4b7e90')).toBe('0f8c2a71')
    expect(SHORT_TRIP_ID_LENGTH).toBe(8)
  })

  it('id mais curto que o recorte sai inteiro, sem completar nada', () => {
    expect(formatShortTripId('abc')).toBe('abc')
    expect(formatShortTripId('')).toBe('')
  })

  /**
   * A listagem do escritório é a origem da convenção (`TripTable.component.tsx`). Se ela trocar de
   * forma, este teste cai — e quem trocar descobre aqui que o app do motorista depende disso, em
   * vez de o motorista ditar um código que o escritório não acha.
   */
  it('o painel continua mostrando o mesmo recorte na listagem de viagens', () => {
    const table = readFileSync(
      new URL(
        '../../../frontend-transportada/src/modules/trip/components/TripTable.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )

    expect(table).toInclude('trip.id.slice(0, 8)')
  })

  it('a tela da viagem mostra o código ao lado da placa', () => {
    const page = readFileSync(
      new URL('../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx', import.meta.url),
      'utf8',
    )

    expect(page).toInclude('formatShortTripId(trip.id)')
  })
})
