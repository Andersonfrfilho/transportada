/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 255 T1.2 (ADR-0081 §9, app do motorista antes da API): o tipo de ocorrência passa a trazer
 * `iconName` (nome do ícone do design system). Ausente é API anterior ao campo; `null` é sem ícone.
 * O app tolera a chave antes da API publicá-la.
 */
import { describe, expect, it } from 'bun:test'

import { isDriverOccurrenceType } from '@/modules/driver-trip/shared/driverTrip.types'

function buildOccurrenceType(
  extra: Readonly<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: '54ed0225-f293-47c3-84fe-0b66eff68784',
    name: 'Item avariado',
    attachmentMode: 'optional',
    flow: 'document',
    ...extra,
  }
}

describe('tolerância a iconName opcional no tipo de ocorrência (spec 255 T1.2)', () => {
  it('aceita tipo com iconName string', () => {
    const candidate = buildOccurrenceType({ iconName: 'truck' })
    expect(isDriverOccurrenceType(candidate)).toBe(true)
  })

  it('aceita tipo com iconName null (sem ícone)', () => {
    const candidate = buildOccurrenceType({ iconName: null })
    expect(isDriverOccurrenceType(candidate)).toBe(true)
  })

  it('aceita tipo sem iconName (API anterior)', () => {
    const candidate = buildOccurrenceType()
    expect(isDriverOccurrenceType(candidate)).toBe(true)
  })

  it('recusa iconName com forma errada (número)', () => {
    const candidate = buildOccurrenceType({ iconName: 123 })
    expect(isDriverOccurrenceType(candidate)).toBe(false)
  })

  it('recusa iconName com forma errada (array)', () => {
    const candidate = buildOccurrenceType({ iconName: ['truck'] })
    expect(isDriverOccurrenceType(candidate)).toBe(false)
  })

  it('recusa chave desconhecida — a guarda continua de chave exata', () => {
    const candidate = buildOccurrenceType({ unknownIconField: 'x' })
    expect(isDriverOccurrenceType(candidate)).toBe(false)
  })
})
