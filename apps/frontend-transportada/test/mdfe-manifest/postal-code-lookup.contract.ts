/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ENGLISH_LOCALE_PATH = 'src/modules/mdfe-manifest/locales/mdfeManifest.en.locale.json'
const FIELDS_PATH = 'src/modules/mdfe-manifest/components/MdfeManifestLotacaoFields.component.tsx'
const HOOK_PATH = 'src/modules/mdfe-manifest/hooks/useLotacaoPostalCodeLookup.hook.ts'
const LOCALE_PATH = 'src/modules/mdfe-manifest/locales/mdfeManifest.locale.json'

const STATUS_KEY = [
  'postalCodeLookupFound',
  'postalCodeLookupMissing',
  'postalCodeLookupPending',
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readCreationDictionary(
  filePath: string,
): Promise<Readonly<Record<string, unknown>>> {
  const dictionary = JSON.parse(await readApplicationFile(filePath)) as Readonly<
    Record<string, unknown>
  >
  return (dictionary.creation ?? {}) as Readonly<Record<string, unknown>>
}

describe('mdfe lotacao postal code lookup contract', () => {
  /**
   * A lotação não tem endereço: a SEFAZ pede o CEP, e o único campo que o CEP alcança nesta tela é a
   * UF de destino. O de carregamento busca só para dizer se o CEP existe — a UF de origem é do
   * emitente, e não está no rascunho.
   */
  test('a descarga preenche a UF de destino e o carregamento só confere o CEP', async () => {
    const hook = await readApplicationFile(HOOK_PATH)

    expect(hook).toContain("from '@/modules/shared/usePostalCodeLookup.hook'")
    expect(hook).toContain("state: 'destinationState'")
    expect(hook).toContain('fields: {}')
    for (const key of STATUS_KEY) expect(hook).toContain(key)
    expect(hook).not.toContain('brasilapi')
    expect(hook).not.toContain('viacep')
  })

  test('os dois campos de CEP mostram o status ao lado', async () => {
    const fields = await readApplicationFile(FIELDS_PATH)

    expect(fields).toContain('useLotacaoPostalCodeLookup')
    expect(fields).toContain('postalCode.loading.change')
    expect(fields).toContain('postalCode.discharge.change')
    expect(fields).toContain('postalCode.loading.statusKey')
    expect(fields).toContain('postalCode.discharge.statusKey')
    expect(fields).not.toContain('readOnly')
  })

  test('os rótulos de status existem nos dois dicionários, acentuados', async () => {
    const [portuguese, english] = await Promise.all([
      readCreationDictionary(LOCALE_PATH),
      readCreationDictionary(ENGLISH_LOCALE_PATH),
    ])

    for (const key of STATUS_KEY) {
      expect(`${key}:${typeof portuguese[key]}`).toBe(`${key}:string`)
      expect(`${key}:${typeof english[key]}`).toBe(`${key}:string`)
    }
    expect(portuguese.postalCodeLookupPending).toContain('CEP')
    expect(portuguese.postalCodeLookupMissing).toContain('não')
  })
})
