/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 TP.1/TP.2 (ADR-0081 §9, painel tolerante antes da API): a lista de tipos de rua do
 * escritório e a tela de verificação passam a receber os requisitos efetivos da devolução
 * (número de referência e valor declarado). Os dois guards toleram presença e ausência — e seguem
 * recusando valor fora do vocabulário.
 */
import { describe, expect, it } from 'bun:test'

import { isSettingsResolutionView } from '@/modules/trip/shared/settingsResolution.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

const TYPE_ID = '54ed0225-f293-47c3-84fe-0b66eff68784'

const RETURN_FIELDS = {
  declaredAmountLabel: 'Valor pago',
  declaredAmountMode: 'optional',
  declaredAmountScope: 'item',
  referenceNumberLabel: 'Protocolo',
  referenceNumberMode: 'required',
} as const

function buildFieldType(extra: Readonly<Record<string, unknown>> = {}) {
  return { id: TYPE_ID, name: 'Devolução', ...extra }
}

describe('a lista de tipos de rua tolera os requisitos da devolução (spec 247 TP.1)', () => {
  it('aceita sem as chaves (API anterior) e com elas (API nova)', () => {
    expect(adapters.fieldOccurrenceTypesFromApi([buildFieldType()])).toHaveLength(1)
    const types = adapters.fieldOccurrenceTypesFromApi([buildFieldType(RETURN_FIELDS)])
    expect(types).toHaveLength(1)
    expect(types[0]?.declaredAmountScope).toBe('item')
    expect(types[0]?.referenceNumberMode).toBe('required')
  })

  it('aceita o escopo occurrence e os modos off e optional', () => {
    expect(
      adapters.fieldOccurrenceTypesFromApi([
        buildFieldType({
          declaredAmountMode: 'off',
          declaredAmountScope: 'occurrence',
          referenceNumberMode: 'optional',
        }),
      ]),
    ).toHaveLength(1)
  })

  it('recusa vocabulário inválido e rótulo fora da regra', () => {
    for (const extra of [
      { referenceNumberMode: 'sometimes' },
      { declaredAmountMode: 1 },
      { declaredAmountScope: 'both' },
      { referenceNumberLabel: '' },
      { declaredAmountLabel: 'x'.repeat(41) },
      { declaredAmountLabel: 7 },
    ]) {
      expect(() => adapters.fieldOccurrenceTypesFromApi([buildFieldType(extra)])).toThrow()
    }
  })
})

const PROOF_SETTINGS = {
  cargo: 'off',
  cargoMinimumCount: 1,
  photo: 'optional',
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'off',
}

const LEGACY_RESOLUTION_TYPE = {
  attachmentMode: 'optional',
  flow: 'document',
  id: TYPE_ID,
  name: 'Devolução',
  stage: 'delivery',
}

function buildResolution(occurrenceType: Readonly<Record<string, unknown>>) {
  return { deliveryProof: PROOF_SETTINGS, occurrenceTypes: [occurrenceType] }
}

describe('a verificação tolera os requisitos da devolução (spec 247 TP.2)', () => {
  it('aceita sem as chaves e com elas, com a camada de cada campo', () => {
    expect(isSettingsResolutionView(buildResolution(LEGACY_RESOLUTION_TYPE))).toBe(true)
    expect(
      isSettingsResolutionView(
        buildResolution({
          ...LEGACY_RESOLUTION_TYPE,
          ...RETURN_FIELDS,
          sources: {
            declaredAmountLabel: 'type',
            declaredAmountMode: 'recipient',
            declaredAmountScope: 'type',
            referenceNumberLabel: 'type',
            referenceNumberMode: 'type',
          },
        }),
      ),
    ).toBe(true)
  })

  it('recusa vocabulário inválido, rótulo fora da regra e camada que não é texto', () => {
    for (const extra of [
      { referenceNumberMode: 'sometimes' },
      { declaredAmountMode: null },
      { declaredAmountScope: 'both' },
      { referenceNumberLabel: '' },
      { declaredAmountLabel: 'x'.repeat(41) },
      { sources: { declaredAmountScope: 1 } },
    ]) {
      expect(
        isSettingsResolutionView(buildResolution({ ...LEGACY_RESOLUTION_TYPE, ...extra })),
      ).toBe(false)
    }
  })
})
