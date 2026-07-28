/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  MdfeFiscalSettings,
  MdfeManifestRepositoryPort,
} from '../../src/mdfe-manifests/application/mdfe-manifest.port.js'
import { createPreviewMdfeManifestUseCase } from '../../src/mdfe-manifests/application/preview-mdfe-manifest.use-case.js'
import {
  MDFE_BLOCK_REASON,
  type MdfeCandidateDocument,
} from '../../src/mdfe-manifests/domain/mdfe-manifest-eligibility.policy.js'
import {
  MdfeFiscalSettingsMissingError,
  MdfeManifestMultipleOriginStatesError,
  MdfeManifestTooManyLoadingCitiesError,
} from '../../src/mdfe-manifests/domain/mdfe-manifest.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000009a1'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000009a2'
const USER_ID = '00000000-0000-4000-8000-0000000009a3'

const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID }

const SAO_PAULO_KEY = '35260712345678000195570010000000011000000010'
const BELO_HORIZONTE_KEY = '31260712345678000195570010000000021000000029'
const SECOND_SAO_PAULO_KEY = '35260712345678000195570010000000031000000038'

const candidate = (
  overrides: Partial<MdfeCandidateDocument> & { readonly fiscalDocumentId: string },
): MdfeCandidateDocument => ({
  accessKey: SAO_PAULO_KEY,
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

const THREE_DOCUMENTS = [
  candidate({ fiscalDocumentId: 'doc-1' }),
  candidate({
    accessKey: BELO_HORIZONTE_KEY,
    cargoValue: '900.50',
    cargoWeight: '120.5000',
    dischargeCityCode: '3106200',
    dischargeCityName: 'Belo Horizonte',
    dischargeState: 'MG',
    fiscalDocumentId: 'doc-2',
    originCityCode: '4205407',
    originCityName: 'Florianopolis',
    originState: 'PR',
  }),
  candidate({
    accessKey: SECOND_SAO_PAULO_KEY,
    cargoValue: '49.50',
    cargoWeight: '29.5000',
    fiscalDocumentId: 'doc-3',
  }),
]

type FixtureParams = {
  readonly candidates: readonly MdfeCandidateDocument[]
  readonly settings?: MdfeFiscalSettings | null
}

function createFixture(params: FixtureParams) {
  const listCalls: { readonly companyId: string; readonly fiscalDocumentIds: string[] }[] = []
  const settingsCalls: string[] = []
  const repository: Pick<
    MdfeManifestRepositoryPort,
    'findFiscalSettings' | 'listCandidateDocuments'
  > = {
    async findFiscalSettings(input) {
      settingsCalls.push(input.companyId)
      return params.settings === undefined
        ? { environment: 'homologation', rntrc: '12345678' }
        : params.settings
    },
    async listCandidateDocuments(input) {
      listCalls.push({
        companyId: input.companyId,
        fiscalDocumentIds: [...input.fiscalDocumentIds],
      })
      return params.candidates
    },
  }

  return { listCalls, settingsCalls, useCase: createPreviewMdfeManifestUseCase({ repository }) }
}

describe('MDF-e manifest preview', () => {
  test('derives municipalities, states and totals from the selected CT-es', async () => {
    const fixture = createFixture({ candidates: THREE_DOCUMENTS })

    const preview = await fixture.useCase.execute({
      context: CONTEXT,
      documentIds: ['doc-1', 'doc-2', 'doc-3'],
    })

    expect(preview.blocked).toEqual([])
    expect(preview.fiscalEnvironment).toBe('homologation')
    expect(preview.loadingCities).toEqual([
      { cityCode: '4106902', cityName: 'Curitiba', state: 'PR' },
      { cityCode: '4205407', cityName: 'Florianopolis', state: 'PR' },
    ])
    expect(preview.dischargeCities).toEqual([
      {
        accessKeys: [SAO_PAULO_KEY, SECOND_SAO_PAULO_KEY],
        cityCode: '3550308',
        cityName: 'Sao Paulo',
        state: 'SP',
      },
      {
        accessKeys: [BELO_HORIZONTE_KEY],
        cityCode: '3106200',
        cityName: 'Belo Horizonte',
        state: 'MG',
      },
    ])
    expect(preview.originState).toBe('PR')
    expect(preview.totals).toEqual({
      cargoValue: '2200.00',
      cargoWeight: '1000.0000',
      cteCount: 3,
    })
  })

  test('takes the company from the authenticated context, never from the payload', async () => {
    const fixture = createFixture({ candidates: [candidate({ fiscalDocumentId: 'doc-1' })] })

    const payloadCarryingACompany = {
      companyId: OTHER_COMPANY_ID,
      context: CONTEXT,
      documentIds: ['doc-1'],
    }

    await fixture.useCase.execute(payloadCarryingACompany)

    expect(fixture.settingsCalls).toEqual([COMPANY_ID])
    expect(fixture.listCalls).toEqual([{ companyId: COMPANY_ID, fiscalDocumentIds: ['doc-1'] }])
  })

  test('blocks a CT-e that leaked from another company instead of totalling it', async () => {
    const fixture = createFixture({
      candidates: [candidate({ companyId: OTHER_COMPANY_ID, fiscalDocumentId: 'doc-1' })],
    })

    const preview = await fixture.useCase.execute({ context: CONTEXT, documentIds: ['doc-1'] })

    expect(preview.documents).toEqual([])
    expect(preview.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.otherCompany },
    ])
    expect(preview.totals).toEqual({ cargoValue: '0.00', cargoWeight: '0.0000', cteCount: 0 })
  })

  test('keeps the eligible CT-es and reports each blocked one with its reason', async () => {
    const fixture = createFixture({
      candidates: [
        candidate({ fiscalDocumentId: 'doc-1', status: 'cancelled' }),
        candidate({ fiscalDocumentId: 'doc-2', liveManifestId: 'manifest-9' }),
        candidate({ fiscalDocumentId: 'doc-3' }),
      ],
    })

    const preview = await fixture.useCase.execute({
      context: CONTEXT,
      documentIds: ['doc-1', 'doc-2', 'doc-3', 'doc-4'],
    })

    expect(preview.documents.map((document) => document.fiscalDocumentId)).toEqual(['doc-3'])
    expect(preview.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.notAuthorized },
      { fiscalDocumentId: 'doc-2', reason: MDFE_BLOCK_REASON.alreadyManifested },
      { fiscalDocumentId: 'doc-4', reason: MDFE_BLOCK_REASON.notFound },
    ])
  })

  test('blocks a CT-e whose loading municipality the MDF-e cannot declare', async () => {
    const fixture = createFixture({
      candidates: [
        candidate({ fiscalDocumentId: 'doc-1', originCityCode: null }),
        candidate({ fiscalDocumentId: 'doc-2', originState: '  ' }),
      ],
    })

    const preview = await fixture.useCase.execute({
      context: CONTEXT,
      documentIds: ['doc-1', 'doc-2'],
    })

    expect(preview.loadingCities).toEqual([])
    expect(preview.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.missingLoadingCity },
      { fiscalDocumentId: 'doc-2', reason: MDFE_BLOCK_REASON.missingLoadingCity },
    ])
  })

  test('offers the discharge states instead of guessing an ambiguous UF de fim', async () => {
    const fixture = createFixture({ candidates: THREE_DOCUMENTS })

    const preview = await fixture.useCase.execute({
      context: CONTEXT,
      documentIds: ['doc-1', 'doc-2', 'doc-3'],
    })

    expect(preview.destinationState).toBe('')
    expect(preview.destinationStateOptions).toEqual(['SP', 'MG'])
  })

  test('derives the destination UF when every CT-e unloads in the same state', async () => {
    const fixture = createFixture({
      candidates: [
        candidate({ fiscalDocumentId: 'doc-1' }),
        candidate({
          accessKey: SECOND_SAO_PAULO_KEY,
          dischargeCityCode: '3509502',
          dischargeCityName: 'Campinas',
          fiscalDocumentId: 'doc-3',
        }),
      ],
    })

    const preview = await fixture.useCase.execute({
      context: CONTEXT,
      documentIds: ['doc-1', 'doc-3'],
    })

    expect(preview.destinationState).toBe('SP')
    expect(preview.destinationStateOptions).toEqual(['SP'])
  })

  test('refuses a selection that starts in more than one UF', async () => {
    const fixture = createFixture({
      candidates: [
        candidate({ fiscalDocumentId: 'doc-1' }),
        candidate({
          fiscalDocumentId: 'doc-2',
          originCityCode: '3550308',
          originCityName: 'Sao Paulo',
          originState: 'SP',
        }),
      ],
    })

    await expect(
      fixture.useCase.execute({ context: CONTEXT, documentIds: ['doc-1', 'doc-2'] }),
    ).rejects.toThrow(MdfeManifestMultipleOriginStatesError)
  })

  test('refuses more loading municipalities than the MDF-e layout accepts', async () => {
    const candidates = Array.from({ length: 51 }, (unused, index) =>
      candidate({
        fiscalDocumentId: `doc-${index}`,
        originCityCode: `41069${String(index).padStart(2, '0')}`,
        originCityName: `Cidade ${index}`,
      }),
    )
    const fixture = createFixture({ candidates })

    await expect(
      fixture.useCase.execute({
        context: CONTEXT,
        documentIds: candidates.map((document) => document.fiscalDocumentId),
      }),
    ).rejects.toThrow(MdfeManifestTooManyLoadingCitiesError)
  })

  test('refuses to preview while the company has no fiscal settings', async () => {
    const fixture = createFixture({ candidates: THREE_DOCUMENTS, settings: null })

    await expect(
      fixture.useCase.execute({ context: CONTEXT, documentIds: ['doc-1'] }),
    ).rejects.toThrow(MdfeFiscalSettingsMissingError)
  })

  test('blocks a CT-e issued in the environment the company is not using', async () => {
    const fixture = createFixture({
      candidates: [candidate({ fiscalDocumentId: 'doc-1', fiscalEnvironment: 'production' })],
      settings: { environment: 'homologation', rntrc: '12345678' },
    })

    const preview = await fixture.useCase.execute({ context: CONTEXT, documentIds: ['doc-1'] })

    expect(preview.blocked).toEqual([
      { fiscalDocumentId: 'doc-1', reason: MDFE_BLOCK_REASON.environmentMismatch },
    ])
  })

  test('answers an empty selection without asking the repository for documents', async () => {
    const fixture = createFixture({ candidates: [] })

    const preview = await fixture.useCase.execute({ context: CONTEXT, documentIds: [] })

    expect(preview).toEqual({
      blocked: [],
      destinationState: '',
      destinationStateOptions: [],
      dischargeCities: [],
      documents: [],
      fiscalEnvironment: 'homologation',
      loadingCities: [],
      originState: '',
      totals: { cargoValue: '0.00', cargoWeight: '0.0000', cteCount: 0 },
    })
    expect(fixture.listCalls).toEqual([])
  })
})
