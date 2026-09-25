/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { isFieldOnlyUser } from '@/modules/driver-trip/shared/driverWorkspace.service'

describe('a tela de entrada de quem é do campo', () => {
  it('o motorista e o agregado abrem na viagem deles', () => {
    expect(isFieldOnlyUser(['trip.read', 'trip.report'])).toBe(true)
  })

  /** O separador tem `trip.report`? Não — mas tem `trip.manage`, e é gente de barracão. */
  it('o separador não é do campo: ele monta a viagem', () => {
    expect(isFieldOnlyUser(['invoices.read', 'fleet.read', 'trip.read', 'trip.manage'])).toBe(false)
  })

  it('o operador do escritório continua na tela de sempre', () => {
    expect(isFieldOnlyUser(['invoices.import', 'fleet.manage', 'trip.manage'])).toBe(false)
  })

  it('conta sem nenhuma permissão de viagem não é do campo', () => {
    expect(isFieldOnlyUser(['invoices.read'])).toBe(false)
  })
})
