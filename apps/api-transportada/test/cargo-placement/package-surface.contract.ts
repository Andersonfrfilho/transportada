/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import * as cargoPlacement from '@adatechnology/cargo-placement'
import * as decimalService from '../../src/shared/decimal.service.js'
import * as loadingAccess from '../../src/shared/loading-access.constant.js'

const PACKAGE_NAME = '@adatechnology/cargo-placement'
const TRIPS_DOMAIN = new URL('../../src/trips/domain/', import.meta.url)

/**
 * Spec 145 D2: o empacotador vive no pacote e a app só importa. Estes contratos são a superfície
 * que a app promete continuar enxergando — se o pacote renomear algo, quebra aqui, não em produção.
 */
describe('cargo placement package surface (spec 145)', () => {
  test('exposes the packer, the layout, the plan and the grid', () => {
    for (const name of [
      'resolveCargoPlacement',
      'resolveStopArrangement',
      'resolveGridLanes',
      'resolveCargoLayout',
      'resolveBedDimensions',
      'sumVolumes',
      'resolveCargoPlanLayers',
      'countBoxesToMeasure',
      'stampCargoNote',
      'createEdgeGrid',
      'isBaseSupported',
    ] as const) {
      expect(typeof cargoPlacement[name], name).toBe('function')
    }
    expect(cargoPlacement.MIN_SUPPORTED_BASE_FRACTION).toBeDefined()
    expect(cargoPlacement.STABLE_STACK_SLENDERNESS).toBeDefined()
    expect(cargoPlacement.UNPLACED_REASONS).toBeDefined()
    expect(cargoPlacement.LOADING_ACCESS_KINDS).toEqual(['rear', 'rear_and_side', 'open'])
  })

  test('keeps the decimal service reachable at the old path, backed by the package', () => {
    expect(decimalService.parseScaledDecimal).toBe(cargoPlacement.parseScaledDecimal)
    expect(decimalService.formatScaledDecimal).toBe(cargoPlacement.formatScaledDecimal)
    expect(decimalService.divideHalfUp).toBe(cargoPlacement.divideHalfUp)
    expect(decimalService.MEASURE_SCALE).toBe(cargoPlacement.MEASURE_SCALE)
    expect(Object.keys(decimalService).sort()).toEqual(
      [
        'applyRate',
        'divideHalfUp',
        'FISCAL_MONEY_SCALE',
        'formatDecimalAtScale',
        'formatFiscalMoney',
        'formatScaledDecimal',
        'isDecimalString',
        'MEASURE_SCALE',
        'MONEY_SCALE',
        'normalizeDecimal',
        'parseScaledDecimal',
        'PERCENTAGE_FACTOR',
        'PERCENTAGE_SCALE',
        'rescaleHalfUp',
        'roundDecimalToInteger',
      ].sort(),
    )
  })

  test('keeps the loading access vocabulary in one place', () => {
    expect(loadingAccess.LOADING_ACCESS_KINDS).toBe(cargoPlacement.LOADING_ACCESS_KINDS)
    expect(loadingAccess.LOADING_ACCESS_MAX_LENGTH).toBe(20)
    expect(loadingAccess.resolveDefaultLoadingAccess('05')).toBe('open')
  })

  test('no copy of the packer survives in the app', () => {
    for (const file of [
      'cargo-placement.policy.ts',
      'cargo-layout.policy.ts',
      'cargo-edge-grid.ts',
      'cargo-plan.policy.ts',
    ]) {
      expect(() => readFileSync(new URL(file, TRIPS_DOMAIN))).toThrow()
    }
    const preview = readFileSync(new URL('cargo-preview.policy.ts', TRIPS_DOMAIN), 'utf8')
    expect(preview).toContain(PACKAGE_NAME)
  })
})
