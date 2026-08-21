/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  addCityCoverage,
  addRegionCoverage,
  coverageKey,
  describeDriverCoveragePills,
  removeDriverCoverage,
  toDriverCoverageEntries,
  type FleetDriverCoverage,
} from '@/modules/fleet/shared/driverCoverage.service'
import type { FreightRegion } from '@/modules/fleet/shared/freightRegion.types'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const FIELDS_PATH = 'src/modules/fleet/components/DriverCoverageFields.component.tsx'
const FORM_PATH = 'src/modules/fleet/components/DriverForm.component.tsx'
const HOOK_PATH = 'src/modules/fleet/hooks/useDriverRegions.hook.ts'
const COVERAGE_HOOK_PATH = 'src/modules/fleet/hooks/useDriverCoverage.hook.ts'
const DRIVER_FORM_HOOK_PATH = 'src/modules/fleet/hooks/useDriverForm.hook.ts'
const QUICK_CREATE_PATH = 'src/modules/fleet/components/DriverQuickCreateDialog.component.tsx'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

const BARRETOS: FreightRegion = {
  cities: [
    { city: 'BARRINHA', state: 'SP' },
    { city: 'PONTAL', state: 'SP' },
  ],
  code: '1.000',
  createdAt: '2026-08-02T12:00:00.000Z',
  id: 'region-barretos',
  name: 'BARRETOS',
  rates: [],
  status: 'active',
  updatedAt: '2026-08-02T12:00:00.000Z',
  version: '1',
  zone: 1,
}

const FRANCA: FreightRegion = {
  cities: [{ city: 'BARRINHA', state: 'SP' }],
  code: '7.003',
  createdAt: '2026-08-03T12:00:00.000Z',
  id: 'region-franca',
  name: 'FRANCA',
  rates: [],
  status: 'active',
  updatedAt: '2026-08-03T12:00:00.000Z',
  version: '1',
  zone: 3,
}

function keysOf(coverage: readonly FleetDriverCoverage[]): readonly string[] {
  return coverage.map(coverageKey)
}

describe('fleet driver coverage contract', () => {
  /** A pergunta é "onde este motorista roda", e ela aceita as duas respostas na mesma lista. */
  test('mistura zona inteira e cidade solta na mesma cobertura', () => {
    const withZone = addRegionCoverage({ coverage: [], region: BARRETOS })
    const both = addCityCoverage({
      city: { city: 'BARRINHA', state: 'SP' },
      coverage: withZone,
      region: FRANCA,
    })

    expect(withZone).toEqual([
      {
        city: null,
        code: '1.000',
        name: 'BARRETOS',
        regionId: 'region-barretos',
        scope: 'region',
        state: null,
        zone: 1,
      },
    ])
    expect(both.map((entry) => entry.scope)).toEqual(['region', 'city'])
    expect(both[1]?.city).toBe('BARRINHA')
  })

  /** BARRINHA/SP está em duas rotas: a cobertura de uma não é a cobertura da outra. */
  test('a mesma cidade em duas rotas são duas coberturas', () => {
    const coverage = addCityCoverage({
      city: { city: 'BARRINHA', state: 'SP' },
      coverage: addCityCoverage({
        city: { city: 'BARRINHA', state: 'SP' },
        coverage: [],
        region: BARRETOS,
      }),
      region: FRANCA,
    })

    expect(coverage).toHaveLength(2)
    expect(new Set(keysOf(coverage)).size).toBe(2)
  })

  test('a mesma cidade da mesma rota não entra duas vezes, nem com outra caixa', () => {
    const once = addCityCoverage({
      city: { city: 'pontal', state: 'sp' },
      coverage: [],
      region: BARRETOS,
    })
    const twice = addCityCoverage({
      city: { city: '  PONTAL  ', state: 'SP' },
      coverage: once,
      region: BARRETOS,
    })

    expect(twice).toHaveLength(1)
    expect(twice[0]?.city).toBe('PONTAL')
    expect(twice[0]?.state).toBe('SP')
    expect(
      addRegionCoverage({
        coverage: addRegionCoverage({ coverage: [], region: BARRETOS }),
        region: BARRETOS,
      }),
    ).toHaveLength(1)
  })

  /**
   * A zona cobre as cidades dela por definição (T001). Deixar as duas formas na lista mandaria
   * para a API uma cobertura que diz duas vezes a mesma coisa, e a tela mostraria a cidade como
   * se ela fosse um recorte a menos do que a zona já dá.
   */
  test('marcar a zona inteira recolhe as cidades soltas daquela rota', () => {
    const cities = addCityCoverage({
      city: { city: 'PONTAL', state: 'SP' },
      coverage: addCityCoverage({
        city: { city: 'BARRINHA', state: 'SP' },
        coverage: [],
        region: BARRETOS,
      }),
      region: BARRETOS,
    })
    const withFranca = addCityCoverage({
      city: { city: 'BARRINHA', state: 'SP' },
      coverage: cities,
      region: FRANCA,
    })
    const zoned = addRegionCoverage({ coverage: withFranca, region: BARRETOS })

    expect(cities).toHaveLength(2)
    expect(zoned.map((entry) => entry.regionId)).toEqual(['region-barretos', 'region-franca'])
    expect(zoned[0]?.scope).toBe('region')
    // A cidade de outra rota não é recolhida: a zona de Barretos não cobre Franca
    expect(zoned[1]?.scope).toBe('city')
  })

  test('cidade de rota já coberta pela zona não vira linha nova', () => {
    const zoned = addRegionCoverage({ coverage: [], region: BARRETOS })
    const same = addCityCoverage({
      city: { city: 'PONTAL', state: 'SP' },
      coverage: zoned,
      region: BARRETOS,
    })

    expect(same).toEqual(zoned)
  })

  test('a lista ordena por código da rota e depois por cidade', () => {
    const coverage = addCityCoverage({
      city: { city: 'PONTAL', state: 'SP' },
      coverage: addCityCoverage({
        city: { city: 'BARRINHA', state: 'SP' },
        coverage: addRegionCoverage({ coverage: [], region: FRANCA }),
        region: BARRETOS,
      }),
      region: BARRETOS,
    })

    expect(coverage.map((entry) => entry.city)).toEqual(['BARRINHA', 'PONTAL', null])
  })

  /** `exactOptionalPropertyTypes`: cobertura de zona não manda `city: undefined`, manda sem a chave. */
  test('o corpo do PUT leva cidade só quando a cobertura é de cidade', () => {
    const coverage = addCityCoverage({
      city: { city: 'PONTAL', state: 'SP' },
      coverage: addRegionCoverage({ coverage: [], region: FRANCA }),
      region: BARRETOS,
    })
    const entries = toDriverCoverageEntries(coverage)

    expect(entries).toEqual([
      { city: 'PONTAL', regionId: 'region-barretos', scope: 'city', state: 'SP' },
      { regionId: 'region-franca', scope: 'region' },
    ])
    expect('city' in (entries[1] ?? {})).toBe(false)
  })

  test('toda cobertura vira pílula removível, e a remoção é pela chave', () => {
    const coverage = addCityCoverage({
      city: { city: 'PONTAL', state: 'SP' },
      coverage: addRegionCoverage({ coverage: [], region: FRANCA }),
      region: BARRETOS,
    })
    const pills = describeDriverCoveragePills(coverage)

    expect(pills.map((pill) => pill.labelKey)).toEqual([
      'driverCoverage.cityPill',
      'driverCoverage.zonePill',
    ])
    expect(pills[0]?.value).toBe('PONTAL/SP · 1.000 BARRETOS')
    expect(pills[1]?.value).toBe('7.003 FRANCA')
    for (const pill of pills) {
      expect(removeDriverCoverage(coverage, pill.key)).toHaveLength(1)
    }
    expect(removeDriverCoverage(coverage, 'nao-existe')).toHaveLength(2)
  })

  test('o campo de cobertura mora no formulário do motorista, sobre o design system', async () => {
    const fields = await readApplicationFile(FIELDS_PATH)
    const form = await readApplicationFile(FORM_PATH)
    const hook = await readApplicationFile(HOOK_PATH)

    expect(fields).toContain("from '@/components/ui/filter-pills'")
    expect(fields).toContain("from '@/components/ui/select'")
    expect(form).toContain('<DriverCoverageFields')
    expect(hook).toContain('export function useDriverRegions')
  })

  /**
   * O cadastro rápido nasce do formulário do veículo, e é onde o agregado é cadastrado de fato:
   * sem a cobertura ali, quem cadastra pelo atalho tem de reabrir a ficha só para dizer a zona.
   */
  test('o cadastro rápido pergunta a zona, e grava a cobertura depois de criar o motorista', async () => {
    const dialog = await readApplicationFile(QUICK_CREATE_PATH)
    const coverageHook = await readApplicationFile(COVERAGE_HOOK_PATH)
    const driverFormHook = await readApplicationFile(DRIVER_FORM_HOOK_PATH)

    expect(coverageHook).toContain('export function useDriverCoverage')
    expect(coverageHook).toContain('export type DriverCoverageController')
    // Um controlador só para os dois formulários: a marcação da zona não é regra duplicada
    expect(driverFormHook).toContain('useDriverCoverage(')
    expect(driverFormHook).toContain('toDriverCoverageEntries(')
    expect(dialog).toContain('useDriverForm({')
    expect(dialog).toContain('<DriverCoverageFields')
    // A cobertura é vínculo: ela só pode ser gravada depois de o motorista existir
    expect(driverFormHook.indexOf('regions.replace(')).toBeGreaterThan(
      driverFormHook.indexOf('await (driver === undefined'),
    )
  })
})
