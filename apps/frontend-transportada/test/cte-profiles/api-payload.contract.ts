/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './cte-profiles.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const RESPONSE_INVALID = 'CTE_PROFILES_RESPONSE_INVALID'
const PROFILE_ID = 'c59f7008-2501-4b4c-82b9-f8bd87b183b3'
const PREDOMINANT_PRODUCT_OPTION = 'predominantProductOption'

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json() as Promise<Record<string, unknown>>
}

// Corpo capturado de GET /cte-emission-profiles?statusEq=active na stack local. Chaves, enums e
// escalas decimais são verbatim; nome, rótulo e CNPJ foram neutralizados para não versionar dado
// identificável de cliente.
const API_LIST_RESPONSE = {
  data: [
    {
      cargoInsuranceDeclared: false,
      cfopInternal: '5353',
      cfopInterstate: '6353',
      chargeComponentLabel: 'Frete 4,5',
      components: [],
      createdAt: '2026-07-27T22:43:13.649Z',
      deliveryDays: '0',
      freightRule: {
        maximumAmount: null,
        minimumAmount: null,
        percentage: '0.045000',
        validFrom: '2026-01-01T00:00:00.000Z',
        validUntil: null,
      },
      freightRuleId: '2bd0860c-02f1-4f0d-b1aa-ca6d8d44c358',
      groupingMode: 'per_invoice',
      icmsBaseReductionRate: '0.000000',
      icmsCst: '90',
      icmsRate: '0.000000',
      id: PROFILE_ID,
      matchers: [{ matchRole: 'sender', taxId: '11222333000181' }],
      matchMode: 'sender_tax_id',
      modal: '01',
      name: 'Perfil 4,5% - homologacao',
      observations: 'EMPRESA OPTANTE PELO SIMPLES NACIONAL',
      operationNature: 'Prestacao de servico de transporte a estabelecimento comerci',
      pickupDetails: '',
      pickupIndicator: '1',
      predominantProductMode: 'highest_value',
      predominantProductName: '',
      priority: '1',
      receiverIeIndicator: '1',
      serviceType: '0',
      status: 'active',
      taker: '0',
      updatedAt: '2026-07-27T22:43:24.353Z',
      version: '2',
    },
  ],
  page: { nextCursor: null },
} as const

function withSettings(overrides: Record<string, unknown>): unknown {
  return {
    ...API_LIST_RESPONSE,
    data: [{ ...API_LIST_RESPONSE.data[0], ...overrides }],
  }
}

describe('cte emission profiles api payload contract', () => {
  test('accepts the profile listing exactly as the api serializes it', async () => {
    const { createCteProfileResponseAdapters } = await loadFutureModule<ResponseAdaptersModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesResponse.validation',
    )

    const page = createCteProfileResponseAdapters().profileListFromApi(API_LIST_RESPONSE)

    expect(page.nextCursor).toBeNull()
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.id).toBe(PROFILE_ID)
    expect(page.items[0]?.status).toBe('active')
    expect(page.items[0]?.name).toBe('Perfil 4,5% - homologacao')
    expect(page.items[0]?.freightRule.percentage).toBe('0.045000')
  })

  test('refuses rates written outside the contract scale, as the api once serialized them', async () => {
    const { createCteProfileResponseAdapters } = await loadFutureModule<ResponseAdaptersModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesResponse.validation',
    )
    const adapters = createCteProfileResponseAdapters()

    expect(() => adapters.profileListFromApi(withSettings({ icmsRate: '0' }))).toThrow(
      RESPONSE_INVALID,
    )
    expect(() => adapters.profileListFromApi(withSettings({ icmsBaseReductionRate: '0' }))).toThrow(
      RESPONSE_INVALID,
    )
  })

  test('accepts a profile served in the highest quantity predominant product mode', async () => {
    const { createCteProfileResponseAdapters } = await loadFutureModule<ResponseAdaptersModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesResponse.validation',
    )

    const page = createCteProfileResponseAdapters().profileListFromApi(
      withSettings({ predominantProductMode: 'highest_quantity' }),
    )

    expect(page.items[0]?.predominantProductMode).toBe('highest_quantity')
  })

  test('offers every predominant product mode translated in both locales', async () => {
    const { CTE_PROFILE_PREDOMINANT_PRODUCT_MODE } = await loadFutureModule<ProfileTypesModule>(
      '../../src/modules/cte-profiles/shared/cteProfiles.types',
    )
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/cte-profiles/locales/cteProfiles.locale.json'),
      readLocale('src/modules/cte-profiles/locales/cteProfiles.en.locale.json'),
    ])
    const portugueseOptions = portuguese[PREDOMINANT_PRODUCT_OPTION] as Record<string, unknown>
    const englishOptions = english[PREDOMINANT_PRODUCT_OPTION] as Record<string, unknown>

    expect(CTE_PROFILE_PREDOMINANT_PRODUCT_MODE).toContain('highest_quantity')
    for (const mode of CTE_PROFILE_PREDOMINANT_PRODUCT_MODE) {
      expect(typeof portugueseOptions[mode], `pt-BR ${mode}`).toBe('string')
      expect(typeof englishOptions[mode], `en ${mode}`).toBe('string')
    }
    expect(portugueseOptions.highest_quantity).toBe('Item de maior quantidade')
    expect(englishOptions.highest_quantity).toBe('Highest quantity item')
    expect(Object.keys(englishOptions)).toEqual(Object.keys(portugueseOptions))
  })

  /**
   * O nome do perfil não diz quanto ele cobra, e a mesma transportadora costuma ter mais de uma
   * alíquota para o mesmo cliente: sem o percentual no rótulo o operador escolhe às cegas.
   */
  test('lists the automatic option followed by every profile served by the api, with its rate', async () => {
    const { buildProfileSelectOptions } = await loadFutureModule<EmissionServiceModule>(
      '../../src/modules/nfe-workspace/shared/cteEmission.service',
    )
    const { createCteProfileResponseAdapters } = await loadFutureModule<ResponseAdaptersModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesResponse.validation',
    )
    const page = createCteProfileResponseAdapters().profileListFromApi(API_LIST_RESPONSE)

    expect(
      buildProfileSelectOptions({
        automaticLabel: 'Automático (pelo CNPJ do emitente)',
        profiles: page.items.map((profile) => ({
          id: profile.id,
          name: profile.name,
          percentage: profile.freightRule.percentage,
        })),
      }),
    ).toEqual([
      { label: 'Automático (pelo CNPJ do emitente)', value: 'auto' },
      { label: 'Perfil 4,5% - homologacao 4.50%', value: PROFILE_ID },
    ])
  })

  /** Perfil sem alíquota conhecida fica com o nome cru — rótulo inventado seria pior que nenhum. */
  test('keeps the bare name when the profile arrives without a rate', async () => {
    const { buildProfileSelectOptions } = await loadFutureModule<EmissionServiceModule>(
      '../../src/modules/nfe-workspace/shared/cteEmission.service',
    )

    expect(
      buildProfileSelectOptions({
        automaticLabel: 'Automático',
        profiles: [{ id: PROFILE_ID, name: 'Spani' }],
      }),
    ).toEqual([
      { label: 'Automático', value: 'auto' },
      { label: 'Spani', value: PROFILE_ID },
    ])
  })

  test('keeps the automatic option alone while the listing has not arrived', async () => {
    const { buildProfileSelectOptions } = await loadFutureModule<EmissionServiceModule>(
      '../../src/modules/nfe-workspace/shared/cteEmission.service',
    )

    expect(buildProfileSelectOptions({ automaticLabel: 'Automático', profiles: [] })).toEqual([
      { label: 'Automático', value: 'auto' },
    ])
  })
})

type ResponseAdaptersModule = {
  readonly createCteProfileResponseAdapters: () => {
    readonly profileListFromApi: (input: unknown) => {
      readonly items: readonly {
        readonly freightRule: { readonly percentage: string }
        readonly id: string
        readonly name: string
        readonly predominantProductMode: string
        readonly status: string
      }[]
      readonly nextCursor: null | string
    }
  }
}

type ProfileTypesModule = {
  readonly CTE_PROFILE_PREDOMINANT_PRODUCT_MODE: readonly string[]
}

type EmissionServiceModule = {
  readonly buildProfileSelectOptions: (
    input: Readonly<{
      automaticLabel: string
      profiles: readonly Readonly<{ id: string; name: string; percentage?: string }>[]
    }>,
  ) => readonly Readonly<{ label: string; value: string }>[]
}
