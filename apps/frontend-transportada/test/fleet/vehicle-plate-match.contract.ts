/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { findVehicleWithSamePlate } from '@/modules/fleet/shared/vehiclePlateMatch.service'

import { VEHICLE_DETAIL } from './fleet.fixture'

const REGISTERED = { ...VEHICLE_DETAIL, plate: 'GCQ8E47' }

describe('a placa lida do documento contra a frota', () => {
  it('encontra o veículo já cadastrado', () => {
    expect(findVehicleWithSamePlate([REGISTERED], 'GCQ8E47')).toBe(REGISTERED)
  })

  it('ignora pontuação e caixa da placa lida', () => {
    expect(findVehicleWithSamePlate([REGISTERED], 'gcq-8e47')).toBe(REGISTERED)
  })

  /** `plateContains` devolve vizinhança: quem decide a duplicidade é a igualdade, não o filtro. */
  it('não confunde vizinhança do filtro com placa igual', () => {
    expect(findVehicleWithSamePlate([REGISTERED], 'GCQ8E4')).toBeUndefined()
  })

  it('placa vazia não casa com nada', () => {
    expect(findVehicleWithSamePlate([REGISTERED], '')).toBeUndefined()
  })
})
