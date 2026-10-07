/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: construtores de linha da prévia e de nota candidata para a política de vínculo.
 * Valores sintéticos; nenhum dado real.
 */
import type {
  CargoPreviewCandidateDocument,
  CargoPreviewMatchItem,
  ResolveCargoPreviewMatchesParams,
} from '../../src/cargo-receiving/domain/cargo-preview-matching.types.js'

export function previewItem(
  itemKey: string,
  overrides: Partial<CargoPreviewMatchItem> = {},
): CargoPreviewMatchItem {
  return {
    city: 'SAO CARLOS',
    itemKey,
    postalCode: undefined,
    recipientCode: undefined,
    recipientName: undefined,
    routeName: 'FR.S.CAR',
    value: '100.00',
    weightKg: '10.000',
    ...overrides,
  }
}

export function candidate(
  id: string,
  overrides: Partial<CargoPreviewCandidateDocument> = {},
): CargoPreviewCandidateDocument {
  return {
    grossWeightKg: '10.000',
    id,
    issuedAt: '2026-09-25T19:00:00-03:00',
    loadReference: undefined,
    number: id.replace(/\D/gu, ''),
    recipientCity: 'SAO CARLOS',
    recipientName: undefined,
    recipientPostalCode: undefined,
    recipientTaxId: `990000000000${id.replace(/\D/gu, '').padStart(2, '0')}`,
    totalValue: '100.00',
    ...overrides,
  }
}

export function matchParams(
  overrides: Partial<ResolveCargoPreviewMatchesParams>,
): ResolveCargoPreviewMatchesParams {
  return {
    budget: { check: () => undefined },
    candidates: [],
    items: [],
    knownAliases: [],
    knownRoutePairs: [],
    weightTolerancePercent: 0,
    ...overrides,
  }
}
