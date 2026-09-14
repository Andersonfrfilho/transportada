/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  showsCteFiscalFields,
  toFormState,
  toNfseProfileOptions,
  toProfileBody,
} from '../../src/modules/cte-profiles/shared/cteProfilesForm.service'
import { createCteProfileResponseAdapters } from '../../src/modules/cte-profiles/shared/cteProfilesResponse.validation'
import { PROFILE_DETAIL } from './cte-profiles.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const NFSE_PROFILE_ID = '00000000-0000-4000-8000-0000000a0001'
const RESPONSE_INVALID = 'CTE_PROFILES_RESPONSE_INVALID'

function readSource(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json() as Promise<Record<string, unknown>>
}

const OUTPUT_FIELDS = new Set(['nfseEmissionProfileId', 'outputDocument'])

/** O corpo que a API anterior à spec 144 serve: sem os dois campos. */
function legacyDetail(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(PROFILE_DETAIL).filter(([key]) => !OUTPUT_FIELDS.has(key)),
  )
}

describe('o documento de saída do perfil (spec 144 D3)', () => {
  /** A API sobe primeiro: a resposta sem os campos não pode esvaziar a lista de perfis. */
  test('o guard aceita a resposta sem os dois campos e a lê como CT-e', () => {
    const profile = createCteProfileResponseAdapters().profileFromApi(legacyDetail())

    expect(profile.outputDocument).toBe('cte')
    expect(profile.nfseEmissionProfileId).toBeNull()
  })

  test('o guard aceita NFS-e com ponteiro e recusa documento fora do catálogo', () => {
    const adapters = createCteProfileResponseAdapters()

    expect(
      adapters.profileFromApi({
        ...PROFILE_DETAIL,
        nfseEmissionProfileId: NFSE_PROFILE_ID,
        outputDocument: 'nfse',
      }).nfseEmissionProfileId,
    ).toBe(NFSE_PROFILE_ID)
    expect(() => adapters.profileFromApi({ ...PROFILE_DETAIL, outputDocument: 'mdfe' })).toThrow(
      RESPONSE_INVALID,
    )
    expect(() => adapters.profileFromApi({ ...PROFILE_DETAIL, nfseEmissionProfileId: 7 })).toThrow(
      RESPONSE_INVALID,
    )
  })

  test('em NFS-e o corpo leva o perfil apontado e nunca bloqueia serviço municipal', () => {
    const body = toProfileBody({
      ...toFormState(),
      municipalServicePolicy: 'block',
      nfseEmissionProfileId: NFSE_PROFILE_ID,
      outputDocument: 'nfse',
    })

    expect(body.settings.outputDocument).toBe('nfse')
    expect(body.settings.nfseEmissionProfileId).toBe(NFSE_PROFILE_ID)
    expect(body.settings.municipalServicePolicy).toBe('allow')
  })

  test('voltar para CT-e solta o perfil NFS-e escolhido antes', () => {
    const body = toProfileBody({
      ...toFormState(),
      municipalServicePolicy: 'block',
      nfseEmissionProfileId: NFSE_PROFILE_ID,
      outputDocument: 'cte',
    })

    expect(body.settings.nfseEmissionProfileId).toBeNull()
    expect(body.settings.municipalServicePolicy).toBe('block')
  })

  test('o seletor oferece só os perfis NFS-e ativos', () => {
    expect(
      toNfseProfileOptions([
        { id: 'a', name: 'Ativo', status: 'active' },
        { id: 'b', name: 'Rascunho', status: 'draft' },
        { id: 'c', name: 'Inativo', status: 'inactive' },
      ]),
    ).toEqual([{ label: 'Ativo', value: 'a' }])
  })

  test('em NFS-e a tela esconde tomador, regra de frete, CFOP e ICMS', async () => {
    const [fiscal, form] = await Promise.all([
      readSource('src/modules/cte-profiles/components/CteProfileFiscalFields.component.tsx'),
      readSource('src/modules/cte-profiles/components/CteProfileForm.component.tsx'),
    ])

    expect(showsCteFiscalFields('cte')).toBe(true)
    expect(showsCteFiscalFields('nfse')).toBe(false)
    expect(fiscal).toContain('const isCte = showsCteFiscalFields(state.outputDocument)')
    for (const field of ['cfopInternal', 'cfopInterstate', 'icmsCst', 'icmsRate', 'taker']) {
      const guard = fiscal.lastIndexOf('{isCte ? (', fiscal.indexOf(`label={t('${field}')}`))
      expect(guard, field).toBeGreaterThan(-1)
    }
    expect(form).toMatch(
      /showsCteFiscalFields\(form\.state\.outputDocument\) \? \(\s*<CteProfileChargeFields/u,
    )
  })

  test('o perfil NFS-e é escolhido pelo select do design system', async () => {
    const source = await readSource(
      'src/modules/cte-profiles/components/CteProfileOutputFields.component.tsx',
    )

    expect(source).toContain("from '@/components/ui/select'")
    expect(source).not.toContain('<select')
    expect(source).toContain('CTE_PROFILE_OUTPUT_DOCUMENT')
  })

  test('os rótulos novos existem nos dois idiomas', async () => {
    const keys = [
      'outputLegend',
      'outputDocument',
      'nfseEmissionProfile',
      'nfseEmissionProfilePlaceholder',
      'nfseEmissionProfileEmpty',
      'nfseOutputHint',
      'outputDocumentIncoherent',
      'nfseProfileNotActive',
    ]
    for (const file of [
      'src/modules/cte-profiles/locales/cteProfiles.locale.json',
      'src/modules/cte-profiles/locales/cteProfiles.en.locale.json',
    ]) {
      const locale = await readLocale(file)
      const options = locale.outputDocumentOption as Record<string, string> | undefined

      for (const key of keys) expect(locale[key], `${file} ${key}`).toBeString()
      expect(options?.cte).toBeString()
      expect(options?.nfse).toBeString()
    }
  })
})
