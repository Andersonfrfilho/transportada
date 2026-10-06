/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.1/T2.2/T2.4 (ADR-0081 §9, painel tolerante antes da API): a API passa a mandar os
 * modos resolvidos em cada tipo de rua, `noteMode`/`signatureMode` no catálogo e os campos
 * resolvidos com a camada que decidiu na verificação. O guard do painel tolera presença e ausência —
 * e continua recusando valor fora do vocabulário.
 *
 * ⚠️ A lista de tipos de rua do escritório já recebia `flow`, `itemsMode` e `stopKind` da API e o
 * guard de chave exata os reprovava: `fieldOccurrenceTypesFromApi` jogava a resposta inteira fora.
 */
import { describe, expect, it } from 'bun:test'

import { isSettingsResolutionView } from '@/modules/trip/shared/settingsResolution.service'
import { createTripResponseAdapters } from '@/modules/trip/shared/tripResponse.validation'

const adapters = createTripResponseAdapters()

const TYPE_ID = '54ed0225-f293-47c3-84fe-0b66eff68784'

function buildFieldType(extra: Readonly<Record<string, unknown>> = {}) {
  return { id: TYPE_ID, name: 'Recusa total', ...extra }
}

const RESOLVED_FIELDS = {
  attachmentMode: 'required',
  flow: 'document',
  itemsMinimumCount: null,
  itemsMode: 'required',
  noteMode: 'required',
  photoMinimumCount: 2,
  photoMode: 'required',
  signatureMode: 'off',
  stopKind: null,
} as const

describe('a lista de tipos de rua tolera os modos resolvidos (spec 246)', () => {
  it('aceita só id e name, da API anterior', () => {
    expect(adapters.fieldOccurrenceTypesFromApi([buildFieldType()])).toHaveLength(1)
  })

  it('aceita o que a API já mandava (`flow`, `itemsMode`, `stopKind`) e o que passa a mandar', () => {
    const types = adapters.fieldOccurrenceTypesFromApi([buildFieldType(RESOLVED_FIELDS)])

    expect(types).toHaveLength(1)
    expect(types[0]?.photoMinimumCount).toBe(2)
  })

  it('recusa modo fora do vocabulário, mínimo fora da faixa e chave desconhecida', () => {
    for (const extra of [
      { noteMode: 'sometimes' },
      { signatureMode: 7 },
      { photoMinimumCount: 0 },
      { photoMinimumCount: 6 },
      { itemsMinimumCount: 0 },
      { flow: 'both' },
      { unknownField: 'x' },
    ]) {
      expect(() => adapters.fieldOccurrenceTypesFromApi([buildFieldType(extra)])).toThrow()
    }
  })
})

function buildCatalogType(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: TYPE_ID,
    name: 'Recusa total',
    notifies: false,
    stage: 'delivery',
    ...extra,
  }
}

describe('o catálogo tolera noteMode e signatureMode (spec 246 T2.4)', () => {
  it('aceita presentes ou ausentes', () => {
    expect(
      adapters.occurrenceTypesFromApi([
        buildCatalogType({ noteMode: 'required', signatureMode: 'optional' }),
      ]),
    ).toHaveLength(1)
    expect(adapters.occurrenceTypesFromApi([buildCatalogType()])).toHaveLength(1)
  })

  it('recusa valor fora do vocabulário', () => {
    expect(() =>
      adapters.occurrenceTypesFromApi([buildCatalogType({ noteMode: 'always' })]),
    ).toThrow()
    expect(() =>
      adapters.occurrenceTypesFromApi([buildCatalogType({ signatureMode: null })]),
    ).toThrow()
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

function buildResolution(occurrenceType: Readonly<Record<string, unknown>>) {
  return { deliveryProof: PROOF_SETTINGS, occurrenceTypes: [occurrenceType] }
}

describe('a verificação tolera os campos resolvidos e as camadas (spec 246 RF12)', () => {
  const legacy = {
    attachmentMode: 'optional',
    flow: 'document',
    id: TYPE_ID,
    name: 'X',
    stage: 'delivery',
  }

  it('aceita a forma anterior e a nova, com a camada de cada campo', () => {
    expect(isSettingsResolutionView(buildResolution(legacy))).toBe(true)
    expect(
      isSettingsResolutionView(
        buildResolution({
          ...legacy,
          itemsMinimumCount: null,
          itemsMode: 'required',
          noteMode: 'required',
          photoMinimumCount: 1,
          photoMode: 'optional',
          signatureMode: 'off',
          sources: { photoMode: 'recipient', noteMode: 'type' },
        }),
      ),
    ).toBe(true)
  })

  it('segue recusando chave desconhecida', () => {
    expect(isSettingsResolutionView(buildResolution({ ...legacy, unknownField: 1 }))).toBe(false)
  })
})
