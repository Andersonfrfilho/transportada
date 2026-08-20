/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const MUNICIPALITY_SERVICE = '../../src/modules/fleet/shared/municipality.service'
const CITY_FIELD_PATH = 'src/modules/fleet/components/DriverCityField.component.tsx'
const ADDRESS_FIELDS_PATH = 'src/modules/fleet/components/DriverAddressFields.component.tsx'
const LOOKUP_HOOK_PATH = 'src/modules/fleet/hooks/useDriverAddressLookup.hook.ts'

type MunicipalityChoice = Readonly<{ label: string; value: string }>

type MunicipalityModule = Readonly<{
  MUNICIPALITY_QUERY_KEY: string
  MUNICIPALITY_STALE_TIME_MS: number
  buildMunicipalityChoices: (
    input: Readonly<{ municipalities: readonly string[]; selected: string }>,
  ) => readonly MunicipalityChoice[]
  listMunicipalities: (
    input: Readonly<{ fetch: typeof globalThis.fetch; signal: AbortSignal; state: string }>,
  ) => Promise<readonly string[]>
  normalizeMunicipalityName: (value: string) => string
  resolveMunicipalityEntryMode: (
    input: Readonly<{ choiceCount: number; hasState: boolean; isLoading: boolean }>,
  ) => string
  toMunicipalityLabel: (value: string) => string
}>

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function loadMunicipalityService(): Promise<MunicipalityModule> {
  return loadFutureModule<MunicipalityModule>(MUNICIPALITY_SERVICE)
}

function respondWith(payload: unknown, init?: ResponseInit): typeof globalThis.fetch {
  return (() =>
    Promise.resolve(
      new Response(JSON.stringify(payload), init),
    )) as unknown as typeof globalThis.fetch
}

describe('fleet driver city select contract', () => {
  /**
   * O IBGE devolve caixa alta e o provedor de CEP devolve caixa mista: sem uma grafia só, o mesmo
   * município entra duas vezes na base.
   */
  test('normalizes the IBGE spelling into the spelling the CEP provider fills', async () => {
    const { toMunicipalityLabel } = await loadMunicipalityService()

    expect(toMunicipalityLabel('SÃO PAULO')).toBe('São Paulo')
    expect(toMunicipalityLabel('RIO DE JANEIRO')).toBe('Rio de Janeiro')
    expect(toMunicipalityLabel('EMBU DAS ARTES')).toBe('Embu das Artes')
    expect(toMunicipalityLabel("SANTA BÁRBARA D'OESTE")).toBe("Santa Bárbara d'Oeste")
    expect(toMunicipalityLabel('MOJI-MIRIM')).toBe('Moji-Mirim')
    expect(toMunicipalityLabel('  belo   horizonte ')).toBe('Belo Horizonte')
  })

  test('folds accent, case and spacing into one municipality', async () => {
    const { normalizeMunicipalityName } = await loadMunicipalityService()

    expect(normalizeMunicipalityName('São Paulo')).toBe(
      normalizeMunicipalityName('  SAO   PAULO  '),
    )
  })

  /**
   * O gatilho do select casa a opção pelo valor: trocar a grafia gravada pela do IBGE deixaria o
   * campo mostrando o placeholder com cidade preenchida.
   */
  test('keeps the stored spelling when it collides with the provider spelling', async () => {
    const { buildMunicipalityChoices } = await loadMunicipalityService()

    const choices = buildMunicipalityChoices({
      municipalities: ['Campinas', 'São Paulo'],
      selected: 'SAO PAULO',
    })

    expect(choices).toEqual([
      { label: 'Campinas', value: 'Campinas' },
      { label: 'SAO PAULO', value: 'SAO PAULO' },
    ])
  })

  test('keeps a stored city the provider does not list', async () => {
    const { buildMunicipalityChoices } = await loadMunicipalityService()

    const choices = buildMunicipalityChoices({
      municipalities: ['Campinas'],
      selected: 'Vila Antiga',
    })

    expect(choices.map((choice) => choice.value)).toEqual(['Campinas', 'Vila Antiga'])
  })

  test('offers no option when nothing is stored and nothing was listed', async () => {
    const { buildMunicipalityChoices } = await loadMunicipalityService()

    expect(buildMunicipalityChoices({ municipalities: [], selected: '' })).toEqual([])
    expect(buildMunicipalityChoices({ municipalities: [], selected: '   ' })).toEqual([])
  })

  /**
   * Sem UF não há lista, e lista vazia é provedor fora do ar: nos dois casos o campo volta a ser
   * teclado. Carregando ele fica na lista, senão o esqueleto pisca para um input e volta.
   */
  test('falls back to typing without a state or without a list', async () => {
    const { resolveMunicipalityEntryMode } = await loadMunicipalityService()

    expect(
      resolveMunicipalityEntryMode({ choiceCount: 640, hasState: true, isLoading: false }),
    ).toBe('list')
    expect(
      resolveMunicipalityEntryMode({ choiceCount: 1, hasState: false, isLoading: false }),
    ).toBe('text')
    expect(resolveMunicipalityEntryMode({ choiceCount: 0, hasState: true, isLoading: false })).toBe(
      'text',
    )
    expect(resolveMunicipalityEntryMode({ choiceCount: 0, hasState: false, isLoading: true })).toBe(
      'list',
    )
  })

  test('never asks the provider for a state that does not exist', async () => {
    const { listMunicipalities } = await loadMunicipalityService()
    let calls = 0
    const fetchImplementation = (() => {
      calls += 1
      return Promise.resolve(new Response('[]'))
    }) as unknown as typeof globalThis.fetch

    const municipalities = await listMunicipalities({
      fetch: fetchImplementation,
      signal: new AbortController().signal,
      state: 'XX',
    })

    expect(municipalities).toEqual([])
    expect(calls).toBe(0)
  })

  test('reads the municipality names in pt-BR order and skips malformed entries', async () => {
    const { listMunicipalities } = await loadMunicipalityService()

    const municipalities = await listMunicipalities({
      fetch: respondWith([
        { nome: 'SÃO PAULO' },
        { nome: '   ' },
        { codigo_ibge: '1' },
        'campinas',
        { nome: 'ÁGUAS DE LINDÓIA' },
      ]),
      signal: new AbortController().signal,
      state: 'sp',
    })

    expect(municipalities).toEqual(['Águas de Lindóia', 'São Paulo'])
  })

  /** Provedor fora do ar propaga: sem lista a consulta fica sem dado e o campo volta a ser teclado. */
  test('propagates a provider failure instead of pretending the state has no city', async () => {
    const { listMunicipalities } = await loadMunicipalityService()

    expect(
      listMunicipalities({
        fetch: respondWith({ message: 'down' }, { status: 502 }),
        signal: new AbortController().signal,
        state: 'SP',
      }),
    ).rejects.toThrow('FLEET_MUNICIPALITY_REQUEST_FAILED')
  })

  test('caches the list for a day instead of refetching it on every keystroke', async () => {
    const { MUNICIPALITY_QUERY_KEY, MUNICIPALITY_STALE_TIME_MS } = await loadMunicipalityService()

    expect(MUNICIPALITY_QUERY_KEY).toBe('fleet-municipalities')
    expect(MUNICIPALITY_STALE_TIME_MS).toBe(86_400_000)
  })

  test('keeps the query in the hook and the choices in the declarative field', async () => {
    const hook = await readApplicationFile(LOOKUP_HOOK_PATH)
    const field = await readApplicationFile(CITY_FIELD_PATH)

    expect(hook).toContain('listMunicipalities')
    expect(hook).toContain("enabled: addressState !== ''")
    expect(hook).toContain('queryKey: [MUNICIPALITY_QUERY_KEY, addressState]')
    expect(hook).toContain('isLoadingCities: municipalityQuery.isLoading')
    expect(field).not.toContain('useQuery')
    expect(field).not.toContain('listMunicipalities')
  })

  test('wires the city field beside the state select, with the state first', async () => {
    const fieldset = await readApplicationFile(ADDRESS_FIELDS_PATH)

    expect(fieldset).toContain('<DriverCityField')
    expect(fieldset).toContain('choices={lookup.cityChoices}')
    expect(fieldset).toContain('hasState={lookup.hasCityState}')
    expect(fieldset).toContain('isLoading={lookup.isLoadingCities}')
    expect(fieldset.indexOf("t('driverAddressState')")).toBeLessThan(
      fieldset.indexOf('<DriverCityField'),
    )
    expect(fieldset).not.toMatch(/FleetField[\s\S]{0,120}driverAddressCity/)
  })

  test('publishes the city field as a searchable select of the design system', async () => {
    const field = await readApplicationFile(CITY_FIELD_PATH)

    expect(field).toContain("from '@/components/ui/select'")
    expect(field).toContain("searchPlaceholder={t('driverAddressCitySearch')}")
    expect(field).toContain("placeholder={t('driverAddressCityUnset')}")
    expect(field).toContain("t('driverAddressCityStateFirst')")
    expect(field).toContain('SkeletonGroup')
    expect(field).not.toContain('<select')
  })

  test('shares one entry mode vocabulary with the vehicle catalog field', async () => {
    const types = await readApplicationFile('src/modules/fleet/shared/fleet.types.ts')
    const catalog = await readApplicationFile(
      'src/modules/fleet/shared/vehicleCatalogChoices.service.ts',
    )

    expect(types).toContain("FLEET_FIELD_ENTRY_MODE = { LIST: 'list', TEXT: 'text' } as const")
    expect(catalog).toContain('VEHICLE_CATALOG_ENTRY_MODE = FLEET_FIELD_ENTRY_MODE')
    expect(catalog).not.toContain("{ LIST: 'list', TEXT: 'text' }")
  })

  test('names the city field in both locales', async () => {
    const ptBr = JSON.parse(
      await readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
    ) as Record<string, unknown>
    const english = JSON.parse(
      await readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ) as Record<string, unknown>

    for (const key of [
      'driverAddressCity',
      'driverAddressCitySearch',
      'driverAddressCityStateFirst',
      'driverAddressCityUnset',
    ]) {
      expect(typeof ptBr[key]).toBe('string')
      expect(typeof english[key]).toBe('string')
    }
  })
})
