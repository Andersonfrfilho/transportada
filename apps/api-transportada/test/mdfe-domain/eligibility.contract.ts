/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  MDFE_BLOCK_REASON,
  selectManifestableDocuments,
  type MdfeCandidateDocument,
} from '../../src/mdfe-manifests/domain/mdfe-manifest-eligibility.policy.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'

const candidate = (
  overrides: Partial<MdfeCandidateDocument> & { readonly fiscalDocumentId: string },
): MdfeCandidateDocument => ({
  accessKey: '35260712345678000195570010000000011000000010',
  cargoValue: '1250.00',
  cargoWeight: '850.0000',
  companyId: COMPANY_ID,
  dischargeCityCode: '3550308',
  dischargeCityName: 'Sao Paulo',
  dischargeState: 'SP',
  fiscalEnvironment: 'homologation',
  liveManifestId: null,
  originCityCode: '4106902',
  originCityName: 'Curitiba',
  originState: 'PR',
  status: 'authorized',
  ...overrides,
})

const selection = (
  candidates: readonly MdfeCandidateDocument[],
  requestedDocumentIds: readonly string[],
) =>
  selectManifestableDocuments({
    candidates,
    companyId: COMPANY_ID,
    fiscalEnvironment: 'homologation',
    requestedDocumentIds,
  })

describe('MDF-e document eligibility', () => {
  test('accepts authorized CT-es of the company that are not in a live manifest', () => {
    const first = candidate({ fiscalDocumentId: 'doc-1' })
    const second = candidate({
      dischargeCityCode: '3106200',
      dischargeCityName: 'Belo Horizonte',
      dischargeState: 'MG',
      fiscalDocumentId: 'doc-2',
    })

    const result = selection([first, second], ['doc-1', 'doc-2'])

    expect(result.blocked).toEqual([])
    expect(result.manifestable).toEqual([
      {
        accessKey: first.accessKey,
        cargoValue: '1250.00',
        cargoWeight: '850.0000',
        dischargeCityCode: '3550308',
        dischargeCityName: 'Sao Paulo',
        dischargeState: 'SP',
        fiscalDocumentId: 'doc-1',
        originCityCode: '4106902',
        originCityName: 'Curitiba',
        originState: 'PR',
      },
      {
        accessKey: second.accessKey,
        cargoValue: '1250.00',
        cargoWeight: '850.0000',
        dischargeCityCode: '3106200',
        dischargeCityName: 'Belo Horizonte',
        dischargeState: 'MG',
        fiscalDocumentId: 'doc-2',
        originCityCode: '4106902',
        originCityName: 'Curitiba',
        originState: 'PR',
      },
    ])
  })

  test('keeps the requested order instead of the order the repository returned', () => {
    const result = selection(
      [candidate({ fiscalDocumentId: 'doc-2' }), candidate({ fiscalDocumentId: 'doc-1' })],
      ['doc-1', 'doc-2'],
    )

    expect(result.manifestable.map((document) => document.fiscalDocumentId)).toEqual([
      'doc-1',
      'doc-2',
    ])
  })

  test('blocks a CT-e that is not authorized', () => {
    for (const status of ['closed', 'cancelled', 'draft']) {
      const result = selection([candidate({ fiscalDocumentId: 'doc-1', status })], ['doc-1'])

      expect(result.manifestable).toEqual([])
      expect(result.blocked).toEqual([
        { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.notAuthorized },
      ])
    }
  })

  test('blocks a CT-e already living in a non-cancelled manifest', () => {
    const result = selection(
      [candidate({ fiscalDocumentId: 'doc-1', liveManifestId: 'manifest-9' })],
      ['doc-1'],
    )

    expect(result.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.alreadyManifested },
    ])
  })

  // ADR-0017: descartar carimba released_at, o vínculo morre e o CT-e volta a ser manifestável
  test('lets a CT-e released by a discarded manifest be manifested again', () => {
    const result = selection(
      [candidate({ fiscalDocumentId: 'doc-1', liveManifestId: null })],
      ['doc-1'],
    )

    expect(result.blocked).toEqual([])
    expect(result.manifestable.map((document) => document.fiscalDocumentId)).toEqual(['doc-1'])
  })

  test('blocks a CT-e of another company even when the repository leaks it', () => {
    const result = selection(
      [candidate({ companyId: OTHER_COMPANY_ID, fiscalDocumentId: 'doc-1' })],
      ['doc-1'],
    )

    expect(result.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.otherCompany },
    ])
  })

  test('blocks a CT-e issued in another fiscal environment', () => {
    const result = selection(
      [candidate({ fiscalDocumentId: 'doc-1', fiscalEnvironment: 'production' })],
      ['doc-1'],
    )

    expect(result.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.environmentMismatch },
    ])
  })

  test('blocks a CT-e without the discharge municipality the MDF-e requires', () => {
    const withoutCode = selection(
      [candidate({ dischargeCityCode: null, fiscalDocumentId: 'doc-1' })],
      ['doc-1'],
    )
    const withoutName = selection(
      [candidate({ dischargeCityName: '  ', fiscalDocumentId: 'doc-1' })],
      ['doc-1'],
    )
    const withoutState = selection(
      [candidate({ dischargeState: null, fiscalDocumentId: 'doc-1' })],
      ['doc-1'],
    )

    for (const result of [withoutCode, withoutName, withoutState]) {
      expect(result.blocked).toEqual([
        { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.missingDischargeCity },
      ])
    }
  })

  test('blocks a CT-e without the loading municipality the MDF-e requires', () => {
    const withoutCode = selection(
      [candidate({ fiscalDocumentId: 'doc-1', originCityCode: null })],
      ['doc-1'],
    )
    const withoutName = selection(
      [candidate({ fiscalDocumentId: 'doc-1', originCityName: '  ' })],
      ['doc-1'],
    )
    const withoutState = selection(
      [candidate({ fiscalDocumentId: 'doc-1', originState: null })],
      ['doc-1'],
    )

    for (const result of [withoutCode, withoutName, withoutState]) {
      expect(result.manifestable).toEqual([])
      expect(result.blocked).toEqual([
        { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.missingLoadingCity },
      ])
    }
  })

  test('blocks a CT-e without cargo value or weight to total', () => {
    const withoutValue = selection(
      [candidate({ cargoValue: '0.00', fiscalDocumentId: 'doc-1' })],
      ['doc-1'],
    )
    const withoutWeight = selection(
      [candidate({ cargoWeight: '0.0000', fiscalDocumentId: 'doc-1' })],
      ['doc-1'],
    )

    expect(withoutValue.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.missingTotals },
    ])
    expect(withoutWeight.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.missingTotals },
    ])
  })

  test('blocks an id the repository did not return', () => {
    const result = selection([candidate({ fiscalDocumentId: 'doc-1' })], ['doc-1', 'doc-2'])

    expect(result.manifestable.map((document) => document.fiscalDocumentId)).toEqual(['doc-1'])
    expect(result.blocked).toEqual([
      { fiscalDocumentId: 'doc-2', reason: MDFE_BLOCK_REASON.notFound },
    ])
  })

  test('reports a repeated id once instead of manifesting it twice', () => {
    const result = selection([candidate({ fiscalDocumentId: 'doc-1' })], ['doc-1', 'doc-1'])

    expect(result.manifestable.map((document) => document.fiscalDocumentId)).toEqual(['doc-1'])
    expect(result.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.duplicated },
    ])
  })

  test('reports an empty request as nothing manifestable, without inventing a block', () => {
    const result = selection([], [])

    expect(result.manifestable).toEqual([])
    expect(result.blocked).toEqual([])
  })

  test('reports every blocked document instead of stopping at the first', () => {
    const result = selection(
      [
        candidate({ fiscalDocumentId: 'doc-1', status: 'cancelled' }),
        candidate({ fiscalDocumentId: 'doc-2', liveManifestId: 'manifest-9' }),
        candidate({ fiscalDocumentId: 'doc-3' }),
      ],
      ['doc-1', 'doc-2', 'doc-3'],
    )

    expect(result.manifestable.map((document) => document.fiscalDocumentId)).toEqual(['doc-3'])
    expect(result.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.notAuthorized },
      { fiscalDocumentId: 'doc-2', reason: MDFE_BLOCK_REASON.alreadyManifested },
    ])
  })
})
