/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163, P1 + RF03 + RF04 + RNF02 — gravar a unidade e recalcular a estimativa, sem nunca tocar
 * na medida real da caixa.
 */
import { describe, expect, test } from 'bun:test'

import type {
  PackageBoxUnitRepositoryPort,
  SavePackageBoxUnitInput,
} from '../../src/nfe-documents/application/package-box-unit.port.js'
import { createRecordPackageBoxUnit } from '../../src/nfe-documents/application/record-package-box-unit.use-case.js'
import { PackageBoxNotFoundError } from '../../src/nfe-documents/domain/package-box-measurement.error.js'
import { PackageBoxUnitRejectedError } from '../../src/nfe-documents/domain/package-box-unit.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const BOX_ID = '00000000-0000-4000-8000-0000000000b1'
const LUX_UNIT = { grossWeightGrams: 85, heightMm: 30, lengthMm: 60, widthMm: 90 } as const
const FIXED_NOW = new Date('2026-09-22T12:00:00.000Z')

function createFakeRepository(target: { readonly unitsPerBox: number } | null): {
  readonly repository: PackageBoxUnitRepositoryPort
  readonly saved: SavePackageBoxUnitInput[]
} {
  const saved: SavePackageBoxUnitInput[] = []
  return {
    repository: {
      async findUnitTarget(input) {
        return input.companyId === COMPANY_ID && input.boxId === BOX_ID ? target : null
      },
      async saveUnit(input) {
        saved.push(input)
        return true
      },
    },
    saved,
  }
}

function createUseCase(repository: PackageBoxUnitRepositoryPort) {
  return createRecordPackageBoxUnit({ now: () => FIXED_NOW, repository })
}

describe('createRecordPackageBoxUnit (spec 163, P1/RF04)', () => {
  test('grava a unidade e a estimativa calculada (Lux 24 un. → 2x2x6)', async () => {
    const fake = createFakeRepository({ unitsPerBox: 24 })
    const result = await createUseCase(fake.repository).execute({
      boxId: BOX_ID,
      context: { companyId: COMPANY_ID },
      source: 'typed',
      unit: LUX_UNIT,
    })

    expect(result.estimate?.arrangement).toBe('2x2x6')
    expect(fake.saved).toHaveLength(1)
    const [saved] = fake.saved
    expect(saved?.companyId).toBe(COMPANY_ID)
    expect(saved?.unit).toEqual(LUX_UNIT)
    expect(saved?.unitSource).toBe('typed')
    expect(saved?.estimate).toEqual({
      arrangement: '2x2x6',
      estimatedAt: FIXED_NOW,
      grossWeightGrams: 2142,
      heightMm: 128,
      lengthMm: 188,
      volumeCm3: 4524,
      widthMm: 188,
    })
  })

  test('RNF02: o que vai ao repositório nunca carrega medida real nem measurement_source', async () => {
    const fake = createFakeRepository({ unitsPerBox: 24 })
    await createUseCase(fake.repository).execute({
      boxId: BOX_ID,
      context: { companyId: COMPANY_ID },
      source: 'typed',
      unit: LUX_UNIT,
    })
    const keys = Object.keys(fake.saved[0] ?? {})
    for (const forbidden of [
      'lengthMm',
      'widthMm',
      'heightMm',
      'measurementSource',
      'measurement',
    ]) {
      expect(keys).not.toContain(forbidden)
    }
  })

  test('RF04: units_per_box novo informado junto recalcula com ele', async () => {
    const fake = createFakeRepository({ unitsPerBox: 1 })
    await createUseCase(fake.repository).execute({
      boxId: BOX_ID,
      context: { companyId: COMPANY_ID },
      source: 'typed',
      unit: LUX_UNIT,
      unitsPerBox: 24,
    })
    expect(fake.saved[0]?.unitsPerBox).toBe(24)
    expect(fake.saved[0]?.estimate?.arrangement).toBe('2x2x6')
  })

  test('units_per_box = 1 → grava a unidade e limpa a estimativa (null)', async () => {
    const fake = createFakeRepository({ unitsPerBox: 1 })
    const result = await createUseCase(fake.repository).execute({
      boxId: BOX_ID,
      context: { companyId: COMPANY_ID },
      source: 'catalog',
      unit: LUX_UNIT,
    })
    expect(result.estimate).toBeUndefined()
    expect(fake.saved[0]?.estimate).toBeNull()
  })

  test('estimativa fora da faixa gravável (1x1xn gigante) não é gravada', async () => {
    const fake = createFakeRepository({ unitsPerBox: 97 })
    await createUseCase(fake.repository).execute({
      boxId: BOX_ID,
      context: { companyId: COMPANY_ID },
      source: 'typed',
      unit: { heightMm: 100, lengthMm: 100, widthMm: 100 },
    })
    expect(fake.saved[0]?.estimate).toBeNull()
  })

  test('CA03: unidade de 2160 mm é rejeitada com UNIT_EDGE_OUT_OF_RANGE e nada é gravado', async () => {
    const fake = createFakeRepository({ unitsPerBox: 24 })
    const promise = createUseCase(fake.repository).execute({
      boxId: BOX_ID,
      context: { companyId: COMPANY_ID },
      source: 'manual:drogasil.com.br',
      unit: { ...LUX_UNIT, heightMm: 2160 },
    })
    await expect(promise).rejects.toBeInstanceOf(PackageBoxUnitRejectedError)
    await expect(promise).rejects.toMatchObject({ code: 'UNIT_EDGE_OUT_OF_RANGE', status: 422 })
    expect(fake.saved).toHaveLength(0)
  })

  test('caixa de outra empresa → PackageBoxNotFoundError, nada gravado', async () => {
    const fake = createFakeRepository({ unitsPerBox: 24 })
    const promise = createUseCase(fake.repository).execute({
      boxId: BOX_ID,
      context: { companyId: '00000000-0000-4000-8000-000000000002' },
      source: 'typed',
      unit: LUX_UNIT,
    })
    await expect(promise).rejects.toBeInstanceOf(PackageBoxNotFoundError)
    expect(fake.saved).toHaveLength(0)
  })
})
