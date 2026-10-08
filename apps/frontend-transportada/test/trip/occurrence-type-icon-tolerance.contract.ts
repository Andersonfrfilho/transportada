/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 255 T1.1 (ADR-0081 §9, painel antes da API): o tipo de ocorrência passa a trazer `iconName`
 * (nome do ícone do design system). Ausente é API anterior ao campo; `null` é sem ícone.
 * O painel tolera a chave antes da API publicá-la.
 */
import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

function buildOccurrenceType(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    active: true,
    allowsMultipleItems: false,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: '54ed0225-f293-47c3-84fe-0b66eff68784',
    name: 'Item avariado',
    notifies: true,
    redeliveryPolicy: 'allowed',
    stage: 'separation',
    ...extra,
  }
}

function buildTripOccurrence(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    createdAt: '2026-10-07T10:00:00Z',
    id: 'occurrence-001',
    note: 'Item danificado na entrega',
    occurrenceTypeId: '54ed0225-f293-47c3-84fe-0b66eff68784',
    productCode: 'SKU-123',
    stage: 'delivery' as const,
    typeName: 'Item avariado',
    ...extra,
  }
}

describe('tolerância a iconName opcional no tipo de ocorrência (spec 255 T1.1)', () => {
  it('aceita tipo com iconName string', () => {
    const [type] = adapters.occurrenceTypesFromApi([buildOccurrenceType({ iconName: 'truck' })])

    expect(type?.id).toBe('54ed0225-f293-47c3-84fe-0b66eff68784')
    expect(type?.iconName).toBe('truck')
  })

  it('aceita tipo com iconName null (sem ícone), que é tratado como ausente', () => {
    const [type] = adapters.occurrenceTypesFromApi([buildOccurrenceType({ iconName: null })])

    expect(type?.id).toBe('54ed0225-f293-47c3-84fe-0b66eff68784')
    expect(type?.iconName).toBeUndefined()
  })

  it('aceita tipo sem iconName (API anterior)', () => {
    const [type] = adapters.occurrenceTypesFromApi([buildOccurrenceType()])

    expect(type?.id).toBe('54ed0225-f293-47c3-84fe-0b66eff68784')
    expect(type?.iconName).toBeUndefined()
  })

  it('recusa iconName com forma errada', () => {
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ iconName: 123 })]),
    ).toThrow()
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ iconName: ['truck'] })]),
    ).toThrow()
  })

  it('recusa chave desconhecida — a guarda continua de chave exata', () => {
    expect(() =>
      adapters.occurrenceTypesFromApi([buildOccurrenceType({ unknownIconField: 'x' })]),
    ).toThrow()
  })

  it('aceita ocorrência da viagem com typeIconName string', () => {
    const occurrence = adapters.tripOccurrenceFromApi(
      buildTripOccurrence({ typeIconName: 'truck' }),
    )

    expect((occurrence as unknown as Record<string, unknown>).typeIconName).toBe('truck')
  })

  it('aceita ocorrência da viagem com typeIconName null (como ausente)', () => {
    const occurrence = adapters.tripOccurrenceFromApi(buildTripOccurrence({ typeIconName: null }))

    expect(
      (occurrence as unknown as Record<string, unknown>).typeIconName ?? undefined,
    ).toBeUndefined()
  })

  it('aceita ocorrência da viagem sem typeIconName (API anterior)', () => {
    const occurrence = adapters.tripOccurrenceFromApi(buildTripOccurrence())

    expect((occurrence as unknown as Record<string, unknown>).typeIconName).toBeUndefined()
  })
})
