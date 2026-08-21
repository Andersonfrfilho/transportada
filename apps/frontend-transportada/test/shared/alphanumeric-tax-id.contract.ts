/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { createDefaultCompanySettings } from '@/modules/company-settings/shared/companySettings.constant'
import {
  describeCompanySettingsFieldError,
  validateCompanySettings,
} from '@/modules/company-settings/shared/companySettingsFormValidation.service'
import { formatCnpj } from '@/modules/company-settings/shared/companySettingsMask.service'
import {
  detectPixKeyType,
  normalizePixKey,
} from '@/modules/company-settings/shared/pixKeyType.service'
import type { CompanySettingsUpdate } from '@/modules/company-settings/shared/companySettings.types'
import { buildNfseCredentialSubmission } from '@/modules/nfse-invoice/shared/nfseCredentialForm.service'

/**
 * O CNPJ alfanumérico (IN RFB 2229/2024) tem letra nas doze posições da base e dígito verificador
 * numérico. O frontend não importa `@adatechnology/fiscal-provider` — a regra é reescrita aqui, e é
 * este contrato que garante que ela diz a mesma coisa.
 */
const OFFICIAL_MASKED = '12.ABC.345/01DE-35'
const OFFICIAL_CANONICAL = '12ABC34501DE35'

// Caminho por variável: o módulo ainda não existe e o typecheck não pode reprovar por causa disso.
const TAX_ID_SERVICE_PATH = '../../src/modules/shared/taxId.service'

type TaxIdService = Readonly<{
  CNPJ_LENGTH: number
  CNPJ_PATTERN: RegExp
  hasValidCnpjCharacterSet: (value: string) => boolean
  normalizeTaxId: (value: string) => string
}>

function loadTaxIdService(): Promise<TaxIdService> {
  return import(TAX_ID_SERVICE_PATH) as Promise<TaxIdService>
}

function readSource(path: string): Promise<string> {
  return Bun.file(new URL(path, import.meta.url)).text()
}

/** Recorta o elemento JSX do campo para a asserção não pegar o campo vizinho. */
function fieldElement(source: string, labelKey: string): string {
  const anchor = source.indexOf(`label={t('${labelKey}')}`)
  expect(anchor).toBeGreaterThan(-1)
  const openings = [...source.slice(0, anchor).matchAll(/<[A-Z][A-Za-z]*/g)]
  const start = openings[openings.length - 1]?.index ?? 0
  return source.slice(start, source.indexOf('/>', anchor) + 2)
}

const COMPLETE_PROFILE: CompanySettingsUpdate['profile'] = {
  city: 'Belo Horizonte',
  cityIbgeCode: '3106200',
  cnpj: OFFICIAL_CANONICAL,
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

function buildSettings(cnpj: string): CompanySettingsUpdate {
  return { ...createDefaultCompanySettings(), profile: { ...COMPLETE_PROFILE, cnpj } }
}

function translate(key: string, values: Readonly<Record<string, number | string>>): string {
  return Object.keys(values).length === 0 ? key : `${key}:${JSON.stringify(values)}`
}

describe('alphanumeric tax id contract', () => {
  test('a base do CNPJ tem catorze posições, como sempre teve', async () => {
    const { CNPJ_LENGTH } = await loadTaxIdService()

    expect(CNPJ_LENGTH).toBe(14)
  })

  test.each([
    ['tira a máscara oficial', OFFICIAL_MASKED, OFFICIAL_CANONICAL],
    ['sobe a caixa do que o usuário digitou em minúscula', '12abc34501de35', OFFICIAL_CANONICAL],
    ['sobe a caixa com a máscara junto', '12.abc.345/01de-35', OFFICIAL_CANONICAL],
    ['não mexe no CNPJ numérico', '12.345.678/0001-99', '12345678000199'],
    ['não mexe no CPF', '123.456.789-01', '12345678901'],
    ['tira o espaço colado da cópia', ' 12 ABC 345 01DE 35 ', OFFICIAL_CANONICAL],
    ['deixa o campo vazio vazio', '', ''],
  ])('%s', async (_name, value, expected) => {
    const { normalizeTaxId } = await loadTaxIdService()

    expect(normalizeTaxId(value)).toBe(expected)
  })

  // Subir a caixa é mapa de um caractere para um caractere: por construção não move o cursor.
  test('a caixa sobe sem mudar o comprimento em nenhum ponto da digitação', async () => {
    const { normalizeTaxId } = await loadTaxIdService()

    for (let size = 0; size <= OFFICIAL_CANONICAL.length; size += 1) {
      const typed = '12abc34501de35'.slice(0, size)

      expect(normalizeTaxId(typed)).toHaveLength(typed.length)
    }
  })

  test.each([
    ['aceita o exemplo oficial', OFFICIAL_CANONICAL, true],
    ['aceita o CNPJ inteiramente numérico', '12345678000199', true],
    ['recusa letra no dígito verificador', '12ABC34501DEX5', false],
    ['recusa minúscula, que é a forma não canônica', '12abc34501de35', false],
    ['recusa a máscara', OFFICIAL_MASKED, false],
    ['recusa um caractere fora do conjunto', '12@BC34501DE35', false],
    ['recusa comprimento curto', '12ABC34501DE3', false],
  ])('o padrão %s', async (_name, value, expected) => {
    const { CNPJ_PATTERN } = await loadTaxIdService()

    expect(CNPJ_PATTERN.test(value)).toBe(expected)
  })

  // O conjunto é conferido posição a posição para o campo pela metade não acusar erro de conjunto.
  test.each([
    ['o começo alfanumérico ainda incompleto', '12ABC', true],
    ['a base inteira', '12ABC34501DE', true],
    ['o documento inteiro', OFFICIAL_CANONICAL, true],
    ['a letra que caiu no dígito verificador', '12ABC34501DEX5', false],
    ['o caractere que não é letra nem dígito', '12@BC34501DE35', false],
  ])('o conjunto aceita %s', async (_name, value, expected) => {
    const { hasValidCnpjCharacterSet } = await loadTaxIdService()

    expect(hasValidCnpjCharacterSet(value)).toBe(expected)
  })
})

describe('alphanumeric cnpj mask contract', () => {
  test.each([
    ['mascara o CNPJ alfanumérico', OFFICIAL_CANONICAL, OFFICIAL_MASKED],
    ['mascara a base parcial com letra', '12ABC', '12.ABC'],
    ['mascara a base com o terceiro grupo fechado', '12ABC345', '12.ABC.345'],
    ['mascara até a raiz do estabelecimento', '12ABC34501', '12.ABC.345/01'],
    ['mascara o CNPJ numérico como sempre mascarou', '12345678000199', '12.345.678/0001-99'],
    ['mascara o numérico parcial como sempre mascarou', '123456', '12.345.6'],
    ['mostra cru o que passou do tamanho', '12ABC34501DE355', '12ABC34501DE355'],
  ])('%s', (_name, value, expected) => {
    expect(formatCnpj(value)).toBe(expected)
  })
})

describe('alphanumeric cnpj validation contract', () => {
  test('aceita o CNPJ alfanumérico sem reclamar de nada', () => {
    expect(validateCompanySettings(buildSettings(OFFICIAL_CANONICAL))).toEqual([])
  })

  test('aceita o que foi digitado em minúscula, canonicalizando antes de conferir', () => {
    expect(validateCompanySettings(buildSettings('12abc34501de35'))).toEqual([])
  })

  test.each([
    ['a letra no dígito verificador', '12ABC34501DEX5'],
    ['o caractere fora do conjunto', '12@BC34501DE35'],
  ])('acusa %s como erro de conjunto, não de comprimento', (_name, cnpj) => {
    expect(validateCompanySettings(buildSettings(cnpj))).toEqual([
      { field: 'cnpj', fieldId: 'field-profile-cnpj', reason: 'characterSet' as never },
    ])
  })

  test.each([
    ['falta uma posição', '12ABC34501DE3'],
    ['sobra uma posição', '12ABC34501DE355'],
  ])('acusa comprimento quando %s e o conjunto está certo', (_name, cnpj) => {
    expect(validateCompanySettings(buildSettings(cnpj))).toEqual([
      {
        expectedLength: 14,
        field: 'cnpj',
        fieldId: 'field-profile-cnpj',
        reason: 'digitLength',
      },
    ])
  })

  test('o campo vazio continua sendo obrigatório, nunca erro de conjunto', () => {
    expect(validateCompanySettings(buildSettings(''))).toEqual([
      { field: 'cnpj', fieldId: 'field-profile-cnpj', reason: 'required' },
    ])
  })

  test('a mensagem de conjunto é própria, para o usuário não procurar dígito faltando', () => {
    const [error] = validateCompanySettings(buildSettings('12ABC34501DEX5'))

    expect(describeCompanySettingsFieldError({ error: error as never, translate })).toBe(
      'validationCharacterSet:{"field":"cnpj"}',
    )
  })

  test.each([['companySettings.locale.json'], ['companySettings.en.locale.json']])(
    '%s traz a mensagem de conjunto',
    async (file) => {
      const locale = (await Bun.file(
        new URL(`../../src/modules/company-settings/locales/${file}`, import.meta.url),
      ).json()) as Readonly<Record<string, string>>

      expect(locale.validationCharacterSet).toContain('{{field}}')
    },
  )
})

describe('alphanumeric cnpj pix key contract', () => {
  test.each([
    ['a chave alfanumérica crua', OFFICIAL_CANONICAL, 'cnpj'],
    ['a chave alfanumérica mascarada', OFFICIAL_MASKED, 'cnpj'],
    ['a chave alfanumérica em minúscula', '12abc34501de35', 'cnpj'],
    ['o CNPJ numérico', '12345678000199', 'cnpj'],
    ['o CPF', '12345678901', 'cpf'],
  ])('reconhece %s', (_name, value, expected) => {
    expect(detectPixKeyType(value)).toBe(expected as never)
  })

  test.each([
    ['tira a máscara alfanumérica', OFFICIAL_MASKED, OFFICIAL_CANONICAL],
    ['sobe a caixa da chave alfanumérica', '12.abc.345/01de-35', OFFICIAL_CANONICAL],
    ['deixa o CPF como está', '123.456.789-01', '12345678901'],
    [
      'deixa a chave aleatória em minúscula, que é como ela foi gerada',
      '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91',
      '018f6a45-2d9d-7e60-bb42-5b1a4c4d3e91',
    ],
    [
      'deixa o e-mail como está',
      'financeiro@transportadora.com.br',
      'financeiro@transportadora.com.br',
    ],
  ])('%s', (_name, value, expected) => {
    expect(normalizePixKey(value)).toBe(expected)
  })
})

describe('alphanumeric cnpj nfse credential contract', () => {
  const draft = {
    apiToken: 'token-de-teste',
    fiscalEnvironment: 'homologation',
    municipalRegistration: '12345',
    status: 'active',
  } as const

  test('aceita a credencial de um CNPJ alfanumérico', () => {
    const submission = buildNfseCredentialSubmission({ ...draft, taxId: OFFICIAL_MASKED })

    expect(submission).toEqual({
      body: {
        apiToken: 'token-de-teste',
        fiscalEnvironment: 'homologation',
        municipalRegistration: '12345',
        status: 'active',
        taxId: OFFICIAL_CANONICAL,
      },
      status: 'ready',
    })
  })

  test('canonicaliza a caixa antes de mandar para a API', () => {
    const submission = buildNfseCredentialSubmission({ ...draft, taxId: '12abc34501de35' })

    expect(submission).toEqual({
      body: { ...draft, taxId: OFFICIAL_CANONICAL },
      status: 'ready',
    })
  })

  test('continua recusando o documento com letra no dígito verificador', () => {
    expect(buildNfseCredentialSubmission({ ...draft, taxId: '12ABC34501DEX5' })).toEqual({
      reason: 'taxIdInvalid',
      status: 'blocked',
    })
  })
})

// O teclado numérico do celular não tem letra: deixá-lo no campo de CNPJ trancaria o usuário fora.
describe('alphanumeric cnpj field contract', () => {
  test.each([
    ['../../src/modules/fleet/components/DriverForm.component.tsx', 'driverLinkedTaxId'],
    ['../../src/modules/fleet/components/VehicleOwnerFields.component.tsx', 'ownerTaxId'],
    ['../../src/modules/cte-profiles/components/CteProfileMatcherFields.component.tsx', 'taxId'],
  ])('%s mantém o limite mascarado e libera a letra', async (path, labelKey) => {
    const element = fieldElement(await readSource(path), labelKey)

    expect(element).toContain('maxLength={18}')
    expect(element).not.toContain('inputMode="numeric"')
  })

  test('o campo de CPF do motorista continua com teclado numérico', async () => {
    const source = await readSource('../../src/modules/fleet/components/DriverForm.component.tsx')

    expect(fieldElement(source, 'driverTaxId')).toContain('inputMode="numeric"')
  })

  test('o CNPJ das configurações não declara teclado numérico', async () => {
    const source = await readSource(
      '../../src/modules/company-settings/components/CompanyProfileFields.component.tsx',
    )
    const definition = source.slice(
      source.indexOf("{ field: 'cnpj'"),
      source.indexOf('\n', source.indexOf("{ field: 'cnpj'")),
    )

    expect(definition).not.toContain('numeric')
    expect(source).toContain('normalizeTaxId')
  })
})
