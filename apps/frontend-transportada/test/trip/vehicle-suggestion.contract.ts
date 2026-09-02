/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  resolveSuggestedVehicleId,
  type ResolveSuggestedVehicleInput,
} from '@/modules/trip/shared/vehicleSuggestion.service'

const DRIVER = 'driver-1'
const TRUCK = 'vehicle-truck'
const TRAILER = 'vehicle-trailer'

function buildInput(
  overrides: Partial<ResolveSuggestedVehicleInput> = {},
): ResolveSuggestedVehicleInput {
  return {
    currentVehicleId: '',
    driverIds: [DRIVER],
    driverVehicles: [{ vehicle: { id: TRUCK } }],
    selectableVehicleIds: [TRUCK, TRAILER],
    ...overrides,
  }
}

describe('sugestão de veículo na criação da viagem', () => {
  test('um motorista com um veículo preenche o campo vazio', () => {
    expect(resolveSuggestedVehicleId(buildInput())).toBe(TRUCK)
  })

  /** É o que faz "deixar alterar" ser verdade: escolha feita manda, e a sugestão se cala. */
  test('campo já preenchido nunca é sobrescrito', () => {
    expect(resolveSuggestedVehicleId(buildInput({ currentVehicleId: TRAILER }))).toBeNull()
  })

  test('dois motoristas não sugerem nada — não existe "o veículo dele"', () => {
    expect(resolveSuggestedVehicleId(buildInput({ driverIds: [DRIVER, 'driver-2'] }))).toBeNull()
  })

  test('nenhum motorista escolhido não sugere nada', () => {
    expect(resolveSuggestedVehicleId(buildInput({ driverIds: [] }))).toBeNull()
  })

  test('dois veículos vinculados não sugerem nada — adivinhar erra em silêncio', () => {
    const driverVehicles = [{ vehicle: { id: TRUCK } }, { vehicle: { id: TRAILER } }]
    expect(resolveSuggestedVehicleId(buildInput({ driverVehicles }))).toBeNull()
  })

  test('motorista sem veículo vinculado não sugere nada', () => {
    expect(resolveSuggestedVehicleId(buildInput({ driverVehicles: [] }))).toBeNull()
  })

  /**
   * O vínculo sobrevive ao veículo sair do select (suspenso, ou implemento que não traciona).
   * Sugerir um id que o select não oferece deixaria o campo com placeholder e valor por baixo.
   */
  test('veículo fora do select não é sugerido', () => {
    expect(resolveSuggestedVehicleId(buildInput({ selectableVehicleIds: [TRAILER] }))).toBeNull()
  })
})
