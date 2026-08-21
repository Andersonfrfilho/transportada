/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ENGLISH_LOCALE_PATH = 'src/modules/company-settings/locales/companySettings.en.locale.json'
const FIELDS_PATH = 'src/modules/company-settings/components/CompanyProfileFields.component.tsx'
const HOOK_PATH = 'src/modules/company-settings/hooks/useProfilePostalCodeLookup.hook.ts'
const LOCALE_PATH = 'src/modules/company-settings/locales/companySettings.locale.json'

const STATUS_KEY = [
  'postalCodeLookupFound',
  'postalCodeLookupMissing',
  'postalCodeLookupPending',
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readDictionary(filePath: string): Promise<Readonly<Record<string, unknown>>> {
  return JSON.parse(await readApplicationFile(filePath)) as Readonly<Record<string, unknown>>
}

describe('company profile postal code lookup contract', () => {
  /** O CEP da empresa preenche os mesmos quatro campos do motorista, pelo mesmo hook partilhado. */
  test('o hook do cadastro consulta pela rota da nossa API', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain("from '@/modules/shared/usePostalCodeLookup.hook'")
    expect(hook).toContain('usePostalCodeLookup<Profile>')
    expect(hook).toContain("city: 'city'")
    expect(hook).toContain("district: 'district'")
    expect(hook).toContain("state: 'state'")
    expect(hook).toContain("street: 'street'")
    for (const key of STATUS_KEY) expect(hook).toContain(key)
    expect(hook).not.toContain('brasilapi')
    expect(hook).not.toContain('viacep')
  })

  /**
   * O campo do CEP passa a escrever pelo controlador: digitar continua digitando, e o CEP completo
   * dispara a consulta. O que não achou vira texto de status — não desabilita e não limpa nada.
   */
  test('o campo do CEP busca e mostra o status ao lado', async () => {
    const fields = await readApplicationFile(FIELDS_PATH)

    expect(fields).toContain('useProfilePostalCodeLookup')
    expect(fields).toContain("definition.field === 'postalCode'")
    expect(fields).toContain('statusKey')
    expect(fields).toContain('styles.fieldHint')
    expect(fields).not.toContain('readOnly')
  })

  test('os rótulos de status existem nos dois dicionários, acentuados', async () => {
    const [portuguese, english] = await Promise.all([
      readDictionary(LOCALE_PATH),
      readDictionary(ENGLISH_LOCALE_PATH),
    ])

    for (const key of STATUS_KEY) {
      expect(`${key}:${typeof portuguese[key]}`).toBe(`${key}:string`)
      expect(`${key}:${typeof english[key]}`).toBe(`${key}:string`)
    }
    expect(portuguese.postalCodeLookupPending).toContain('CEP')
    expect(portuguese.postalCodeLookupMissing).toContain('não')
    expect(portuguese.postalCodeLookupFound).toContain('Endereço')
  })
})
