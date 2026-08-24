/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import enLocale from '../../src/modules/fleet/locales/fleet.en.locale.json'
import ptBrLocale from '../../src/modules/fleet/locales/fleet.locale.json'
import type { FleetDriverDetail } from '../../src/modules/fleet/shared/fleet.types'
import {
  createDriverDraft,
  toDriverBody,
  toDriverFormState,
} from '../../src/modules/fleet/shared/fleetForm.service'
import { DRIVER_DETAIL } from './fleet.fixture'

const PERSONAL_LABEL_KEYS = [
  'driverBirthCity',
  'driverBirthState',
  'driverBirthStateUnset',
  'driverFatherName',
  'driverIdentityDocument',
  'driverIdentityDocumentIssuer',
  'driverIdentityDocumentIssuerUnset',
  'driverIdentityDocumentState',
  'driverIdentityDocumentStateUnset',
  'driverLicenseIssuedCity',
  'driverLicenseIssuedState',
  'driverLicenseIssuedStateUnset',
  'driverMotherName',
  'driverNationality',
  'driverPersonalHint',
  'driverPersonalLegend',
] as const

const PERSONAL_DETAIL = {
  ...DRIVER_DETAIL,
  birthCity: 'Ribeirão Preto',
  birthState: 'SP',
  fatherName: 'Antônio da Silva',
  identityDocument: '12.345.678-9',
  identityDocumentIssuer: 'SSP',
  identityDocumentState: 'SP',
  licenseIssuedCity: 'Campinas',
  licenseIssuedState: 'SP',
  motherName: 'Maria da Silva',
  nationality: 'Brasileira',
} as unknown as FleetDriverDetail

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('driver personal fields contract', () => {
  test('opens the ten personal fields blank on a new driver', () => {
    const draft = createDriverDraft()

    expect(draft.nationality).toBe('Brasileiro')
    expect(draft.birthCity).toBe('')
    expect(draft.birthState).toBe('')
    expect(draft.fatherName).toBe('')
    expect(draft.motherName).toBe('')
    expect(draft.identityDocument).toBe('')
    expect(draft.identityDocumentIssuer).toBe('')
    expect(draft.identityDocumentState).toBe('')
    expect(draft.licenseIssuedCity).toBe('')
    expect(draft.licenseIssuedState).toBe('')
  })

  test('carries every personal field into the body', () => {
    const body = toDriverBody({
      ...createDriverDraft(),
      birthCity: 'Ribeirão Preto',
      birthState: 'SP',
      fatherName: 'Antônio da Silva',
      identityDocument: '12.345.678-9',
      identityDocumentIssuer: 'SSP',
      identityDocumentState: 'SP',
      licenseIssuedCity: 'Campinas',
      licenseIssuedState: 'SP',
      motherName: 'Maria da Silva',
      nationality: 'Brasileira',
    })

    expect(body.nationality).toBe('Brasileira')
    expect(body.birthCity).toBe('Ribeirão Preto')
    expect(body.birthState).toBe('SP')
    expect(body.fatherName).toBe('Antônio da Silva')
    expect(body.motherName).toBe('Maria da Silva')
    expect(body.identityDocument).toBe('12.345.678-9')
    expect(body.identityDocumentIssuer).toBe('SSP')
    expect(body.identityDocumentState).toBe('SP')
    expect(body.licenseIssuedCity).toBe('Campinas')
    expect(body.licenseIssuedState).toBe('SP')
  })

  // O CHECK do banco só aceita a UF em caixa alta; a lista sobe a caixa, o teclado não
  test('raises every state to upper case on the way out', () => {
    const body = toDriverBody({
      ...createDriverDraft(),
      birthState: 'sp',
      identityDocumentState: 'rj',
      licenseIssuedState: 'mg',
    })

    expect(body.birthState).toBe('SP')
    expect(body.identityDocumentState).toBe('RJ')
    expect(body.licenseIssuedState).toBe('MG')
  })

  test('reads the personal fields back from a loaded record', () => {
    const state = toDriverFormState(PERSONAL_DETAIL)

    expect(state.nationality).toBe('Brasileira')
    expect(state.birthCity).toBe('Ribeirão Preto')
    expect(state.birthState).toBe('SP')
    expect(state.fatherName).toBe('Antônio da Silva')
    expect(state.motherName).toBe('Maria da Silva')
    expect(state.identityDocument).toBe('12.345.678-9')
    expect(state.identityDocumentIssuer).toBe('SSP')
    expect(state.identityDocumentState).toBe('SP')
    expect(state.licenseIssuedCity).toBe('Campinas')
    expect(state.licenseIssuedState).toBe('SP')
  })

  test('names every personal label in both locales', () => {
    for (const key of PERSONAL_LABEL_KEYS) {
      expect(ptBrLocale[key]).toBeString()
      expect(enLocale[key]).toBeString()
    }
  })

  /**
   * A ficha só guarda o que a tela mostra, e o diálogo do cadastro de veículo é a mesma ficha:
   * ele também corrige motorista já gravado, e o campo que só existe num dos dois é campo que
   * some quando a ficha é aberta pelo outro caminho.
   */
  test('renders the personal group inside both driver forms', () => {
    for (const path of [
      'src/modules/fleet/components/DriverForm.component.tsx',
      'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx',
    ]) {
      const form = readSource(path)

      expect(form).toContain('<DriverPersonalFields')
      expect(form).toContain(
        "import { DriverPersonalFields } from './DriverPersonalFields.component'",
      )
    }
  })

  test('offers both cities as the IBGE field and both states as the closed list', () => {
    const group = readSource('src/modules/fleet/components/DriverPersonalFields.component.tsx')

    for (const key of ['driverBirthCity', 'driverLicenseIssuedCity']) {
      expect(group).toContain(`label={t('${key}')}`)
    }
    expect(group.match(/<DriverCityField/g)).toHaveLength(2)
    expect(group.match(/options=\{BRAZIL_STATE\}/g)).toHaveLength(3)
    expect(group).not.toContain('<input')
  })
})

describe('driver nationality default', () => {
  test('a ficha em branco já nasce com a nacionalidade da maioria', () => {
    expect(createDriverDraft().nationality).toBe('Brasileiro')
  })

  test('o rascunho salvo vence o padrão — o operador já escolheu', () => {
    expect(createDriverDraft({ nationality: 'Paraguaio' }).nationality).toBe('Paraguaio')
  })

  test('a ficha carregada mostra o que está gravado, mesmo em branco', () => {
    expect(toDriverFormState({ ...PERSONAL_DETAIL, nationality: '' }).nationality).toBe('')
  })
})
