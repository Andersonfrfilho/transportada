/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  digitsWithOptionalCheckDigit,
  formatBankAccountNumber,
  formatCnpj,
  formatDigitGroups,
  formatPostalCode,
  normalizeCompanySettingsMasks,
  stripNonDigits,
  stripStateRegistrationMask,
} from '@/modules/company-settings/shared/companySettingsMask.service'
import {
  describeCompanySettingsFieldError,
  validateCompanySettings,
} from '@/modules/company-settings/shared/companySettingsFormValidation.service'
import { createDefaultCompanySettings } from '@/modules/company-settings/shared/companySettings.constant'
import { normalizeRntrc } from '@/modules/shared/rntrc.service'
import {
  detectPixKeyType,
  normalizePixKey,
} from '@/modules/company-settings/shared/pixKeyType.service'
import type { CompanySettingsUpdate } from '@/modules/company-settings/shared/companySettings.types'

const COMPLETE_PROFILE: CompanySettingsUpdate['profile'] = {
  city: 'Belo Horizonte',
  cityIbgeCode: '3106200',
  cnpj: '12345678000199',
  complement: '',
  district: 'Centro',
  email: '',
  legalName: 'Transportadora Exemplo',
  municipalRegistration: '',
  number: '100',
  phone: '',
  postalCode: '30110000',
  rntrc: '12345678',
  state: 'MG',
  stateRegistration: '062.307.904/0081',
  street: 'Avenida Afonso Pena',
  taxRegime: '3',
  tradeName: '',
}

function buildSettings(overrides: Partial<CompanySettingsUpdate> = {}): CompanySettingsUpdate {
  return { ...createDefaultCompanySettings(), profile: COMPLETE_PROFILE, ...overrides }
}

describe('company settings mask contract', () => {
  test.each([
    ['groups the state registration digits by three', '062307904', '062.307.904'],
    ['leaves a short registration untouched', '62', '62'],
    ['leaves an exempt registration untouched', 'ISENTO', 'ISENTO'],
    ['leaves an alphanumeric registration untouched', '123ABC', '123ABC'],
    ['leaves an empty registration untouched', '', ''],
  ])('%s', (_name, value, expected) => {
    expect(formatDigitGroups(value)).toBe(expected)
  })

  // A IE de MG chega com barra: deixá-la no payload manda um caractere de máscara para a SEFAZ.
  test.each([
    ['drops the grouping dots', '062.307.904', '062307904'],
    ['drops the MG slash', '062.307.904/0081', '0623079040081'],
    ['keeps an exempt registration readable', 'ISENTO', 'ISENTO'],
  ])('%s', (_name, value, expected) => {
    expect(stripStateRegistrationMask(value)).toBe(expected)
  })

  test.each([
    ['keeps the digits of a plain account', '123456', '123456'],
    ['keeps the X check digit uppercase', '12345x', '12345X'],
    ['drops the display hyphen', '12345-6', '123456'],
    ['drops any other punctuation', '12.345-6', '123456'],
    ['drops letters that are not the X check digit', '12A34', '1234'],
  ])('%s', (_name, value, expected) => {
    expect(digitsWithOptionalCheckDigit(value)).toBe(expected)
  })

  test.each([
    ['separates the check digit for display', '123456', '12345-6'],
    ['separates an X check digit for display', '12345X', '12345-X'],
    ['leaves a single digit alone', '7', '7'],
    ['leaves an empty account alone', '', ''],
  ])('%s', (_name, value, expected) => {
    expect(formatBankAccountNumber(value)).toBe(expected)
  })

  test('cleans the legacy masked values the user never touched', () => {
    const normalized = normalizeCompanySettingsMasks(
      buildSettings({
        billing: {
          bankAccount: '12.345-6',
          bankBranch: '0001',
          bankCode: '707',
          bankName: 'Banco Daycoval',
          observations: '',
          pixKey: '123.456.789-01',
        },
      }),
    )

    expect(normalized.billing.bankAccount).toBe('123456')
    expect(normalized.billing.pixKey).toBe('12345678901')
    expect(normalized.profile.stateRegistration).toBe('0623079040081')
    expect(normalized.billing.bankCode).toBe('707')
  })
})

describe('company settings pix key contract', () => {
  test.each([
    ['an email key', 'financeiro@transportadora.com.br', 'email'],
    ['a random key', '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91', 'evp'],
    ['a phone with the plus sign', '+5511987654321', 'phone'],
    ['a phone without the plus sign', '5511987654321', 'phone'],
    ['a landline with the country code', '551133334444', 'phone'],
    ['a masked CPF', '123.456.789-01', 'cpf'],
    ['a masked CNPJ', '12.345.678/0001-99', 'cnpj'],
    ['a plain CNPJ', '12345678000199', 'cnpj'],
    ['a CPF that no phone could be', '12345678901', 'cpf'],
    ['a mobile number without the country code', '11987654321', undefined],
    ['an empty key', '', undefined],
    ['a key that is only spaces', '   ', undefined],
    ['a number that is neither document nor phone', '12345', undefined],
    ['free text', 'chave pix', undefined],
  ])('detects %s', (_name, value, expected) => {
    expect(detectPixKeyType(value)).toBe(expected as never)
  })

  test.each([
    ['strips the CPF mask', '123.456.789-01', '12345678901'],
    ['strips the CNPJ mask', '12.345.678/0001-99', '12345678000199'],
    [
      'keeps the random key hyphens',
      '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91',
      '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91',
    ],
    [
      'keeps the email untouched',
      'financeiro@transportadora.com.br',
      'financeiro@transportadora.com.br',
    ],
    ['keeps the phone plus sign', '+5511987654321', '+5511987654321'],
    ['trims the surrounding spaces', '  12345678901  ', '12345678901'],
  ])('%s', (_name, value, expected) => {
    expect(normalizePixKey(value)).toBe(expected)
  })
})

describe('company settings form validation contract', () => {
  test('accepts a profile with every required field filled', () => {
    expect(validateCompanySettings(buildSettings())).toEqual([])
  })

  test.each([
    ['legalName'],
    ['cnpj'],
    ['rntrc'],
    ['street'],
    ['number'],
    ['district'],
    ['city'],
    ['state'],
    ['postalCode'],
    ['cityIbgeCode'],
  ])('reports %s when it is empty', (field) => {
    const settings = buildSettings({ profile: { ...COMPLETE_PROFILE, [field]: '' } })

    expect(validateCompanySettings(settings)).toEqual([
      { field: field as never, fieldId: `field-profile-${field}`, reason: 'required' },
    ])
  })

  test.each([
    ['tradeName'],
    ['complement'],
    ['stateRegistration'],
    ['municipalRegistration'],
    ['phone'],
    ['email'],
  ])('accepts %s empty because it is optional', (field) => {
    const settings = buildSettings({ profile: { ...COMPLETE_PROFILE, [field]: '' } })

    expect(validateCompanySettings(settings)).toEqual([])
  })

  test('treats a field with only spaces as empty', () => {
    const settings = buildSettings({ profile: { ...COMPLETE_PROFILE, city: '   ' } })

    expect(validateCompanySettings(settings)).toEqual([
      { field: 'city', fieldId: 'field-profile-city', reason: 'required' },
    ])
  })

  test('reports every empty field at once instead of the first one', () => {
    const settings = buildSettings({
      profile: { ...COMPLETE_PROFILE, cnpj: '', legalName: '', rntrc: '' },
    })

    expect(validateCompanySettings(settings).map((error) => error.field)).toEqual([
      'legalName',
      'cnpj',
      'rntrc',
    ])
  })
})

// O certificado da ANTT traz 058151044 e o CT-e autorizado leva 58151044: o zero é da folha, não do registro.
describe('rntrc normalization contract', () => {
  test.each([
    ['drops the ANTT leading zero', '058151044', '58151044'],
    ['leaves the eight-digit registration untouched', '58151044', '58151044'],
    ['keeps a leading zero that belongs to the registration', '05815104', '05815104'],
    ['keeps every digit of a short registration', '5815104', '5815104'],
    ['drops both zeros when the sheet pads to ten', '0058151044', '58151044'],
    ['leaves an over-long registration for the validation to report', '581510441', '581510441'],
    ['strips separators typed from the certificate', '058.151.044', '58151044'],
    ['leaves an empty field empty', '', ''],
  ])('%s', (_name, value, expected) => {
    expect(normalizeRntrc(value)).toBe(expected)
  })

  test('salva o registro como o certificado o imprime, com o zero na frente', () => {
    const settings = buildSettings({ profile: { ...COMPLETE_PROFILE, rntrc: '058.151.044' } })

    expect(normalizeCompanySettingsMasks(settings).profile.rntrc).toBe('058151044')
  })

  test('accepts the certificate value as valid instead of demanding the user drop the zero', () => {
    const settings = buildSettings({ profile: { ...COMPLETE_PROFILE, rntrc: '058151044' } })

    expect(validateCompanySettings(settings)).toEqual([])
  })
})

// O corte silencioso do nono dígito gravou 05815104 no lugar de 058151044 e foi parar no XML do CT-e.
describe('company settings digit length contract', () => {
  test.each([
    ['cityIbgeCode', '31062009', 7],
    ['cnpj', '123456780001999', 14],
    ['postalCode', '301100001', 8],
    ['rntrc', '581510441', 8],
  ])('reports %s when it carries one digit too many', (field, value, expectedLength) => {
    const settings = buildSettings({ profile: { ...COMPLETE_PROFILE, [field]: value } })

    expect(validateCompanySettings(settings)).toEqual([
      {
        expectedLength,
        field: field as never,
        fieldId: `field-profile-${field}`,
        reason: 'digitLength',
      },
    ])
  })

  test.each([
    ['cityIbgeCode', '310620', 7],
    ['cnpj', '1234567800019', 14],
    ['postalCode', '3011000', 8],
    ['rntrc', '5815104', 8],
  ])('reports %s when it carries one digit too few', (field, value, expectedLength) => {
    const settings = buildSettings({ profile: { ...COMPLETE_PROFILE, [field]: value } })

    expect(validateCompanySettings(settings)).toEqual([
      {
        expectedLength,
        field: field as never,
        fieldId: `field-profile-${field}`,
        reason: 'digitLength',
      },
    ])
  })

  test('reports the empty required field as missing, never as the wrong length', () => {
    const settings = buildSettings({ profile: { ...COMPLETE_PROFILE, rntrc: '' } })

    expect(validateCompanySettings(settings)).toEqual([
      { field: 'rntrc', fieldId: 'field-profile-rntrc', reason: 'required' },
    ])
  })

  test('names the expected length in the message so the user sees what is wrong', () => {
    const [error] = validateCompanySettings(
      buildSettings({ profile: { ...COMPLETE_PROFILE, rntrc: '581510441' } }),
    )
    const translate = (key: string, values: Readonly<Record<string, number | string>>) =>
      Object.keys(values).length === 0 ? key : `${key}:${JSON.stringify(values)}`

    expect(describeCompanySettingsFieldError({ error: error as never, translate })).toBe(
      'validationDigitLength:{"field":"rntrc","length":8}',
    )
  })

  test('names the field in the message when it is only missing', () => {
    const [error] = validateCompanySettings(
      buildSettings({ profile: { ...COMPLETE_PROFILE, rntrc: '' } }),
    )
    const translate = (key: string, values: Readonly<Record<string, number | string>>) =>
      Object.keys(values).length === 0 ? key : `${key}:${JSON.stringify(values)}`

    expect(describeCompanySettingsFieldError({ error: error as never, translate })).toBe(
      'validationRequiredField:{"field":"rntrc"}',
    )
  })

  test('keeps every digit the user typed instead of cutting the excess', () => {
    expect(stripNonDigits('05 815-104/4')).toBe('058151044')
  })

  test.each([
    ['shows the extra cnpj digit raw instead of hiding it', '123456780001999', '123456780001999'],
    ['masks the cnpj that fits', '12345678000199', '12.345.678/0001-99'],
    ['masks the partial cnpj while it is typed', '123456', '12.345.6'],
  ])('%s', (_name, value, expected) => {
    expect(formatCnpj(value)).toBe(expected)
  })

  test.each([
    ['shows the extra postal code digit raw instead of hiding it', '301100001', '301100001'],
    ['masks the postal code that fits', '30110000', '30110-000'],
    ['masks the partial postal code while it is typed', '30110', '30110'],
  ])('%s', (_name, value, expected) => {
    expect(formatPostalCode(value)).toBe(expected)
  })
})
