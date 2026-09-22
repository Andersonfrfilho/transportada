/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 163, RF05 (T009) — o importador da 162 aceita a linha "Unidade" do Cosmos e o `unitEdges`
 * da captura manual; linha só com unidade é válida (não é mais `ignored_status`).
 */
import { describe, expect, test } from 'bun:test'

import type {
  PackageBoxCatalogImportGroup,
  PackageBoxCatalogImportRepositoryPort,
  PackageBoxCatalogImportUnit,
} from '../../src/nfe-documents/application/package-box-catalog-import.port.js'
import { createImportPackageBoxCatalog } from '../../src/nfe-documents/application/import-package-box-catalog.use-case.js'
import {
  mapPackageBoxCatalogCaptureLine,
  mapPackageBoxCatalogCaptureUnit,
} from '../../src/nfe-documents/domain/package-box-catalog-capture.mapper.js'
import {
  packageBoxCatalogCaptureLineSchema,
  type PackageBoxCatalogCaptureLine,
} from '../../src/nfe-documents/domain/package-box-catalog-capture.schema.js'
import {
  FOUND_CM_KG_CAPTURE_LINE,
  FOUND_CM_KG_EXPECTED_CANDIDATE,
  NO_DIMENSIONS_CAPTURE_LINE,
} from '../fixtures/package-box-catalog-capture.fixture.js'

const LUX_UNIT_EDGES = {
  altura: { unit: 'cm', value: '3,0 cm' },
  comprimento: { unit: 'cm', value: '6,0 cm' },
  largura: { unit: 'cm', value: '9,0 cm' },
}

/** Cosmos com a caixa e a linha "Unidade" da mesma tabela. */
const FOUND_WITH_UNIT_LINE: PackageBoxCatalogCaptureLine = {
  ...FOUND_CM_KG_CAPTURE_LINE,
  extracted: {
    ...FOUND_CM_KG_CAPTURE_LINE.extracted,
    unitEdges: LUX_UNIT_EDGES,
    unitGrossWeight: { unit: 'g', value: '85 g' },
  },
}

/** Cosmos sem a caixa, só com a unidade — antes era `ignored_status`. */
const NO_DIMENSIONS_WITH_UNIT_LINE: PackageBoxCatalogCaptureLine = {
  ...NO_DIMENSIONS_CAPTURE_LINE,
  cartonGtin: '17891150039503',
  extracted: { edges: {}, unitEdges: LUX_UNIT_EDGES },
}

/** Alt+U do userscript: `found_unit_manual`, arestas sem rótulo (`lado1..3`). */
const FOUND_UNIT_MANUAL_LINE: PackageBoxCatalogCaptureLine = {
  capturedAt: '2026-09-22T10:00:00.000Z',
  cartonGtin: '17891150039503',
  extracted: {
    edges: {},
    unitEdges: {
      lado1: { unit: 'cm', value: '6' },
      lado2: { unit: 'cm', value: '9' },
      lado3: { unit: 'cm', value: '3' },
    },
    unitGrossWeight: { unit: 'kg', value: '0,085' },
  },
  pageUrl: 'https://www.drogaria.com.br/lux-85g',
  source: 'www.drogaria.com.br',
  status: 'found_unit_manual',
  unitGtin: '7891150039506',
}

describe('mapPackageBoxCatalogCaptureUnit (spec 163, RF05)', () => {
  test('o schema aceita unitEdges e unitGrossWeight', () => {
    expect(packageBoxCatalogCaptureLineSchema.safeParse(FOUND_UNIT_MANUAL_LINE).success).toBe(true)
  })

  test('linha "Unidade" do Cosmos vira unidade de origem catalog, em mm e g', () => {
    expect(mapPackageBoxCatalogCaptureUnit(FOUND_WITH_UNIT_LINE)).toEqual({
      accepted: true,
      unit: {
        cartonGtin: '67891150059841',
        grossWeightGrams: 85,
        heightMm: 30,
        lengthMm: 60,
        source: 'catalog',
        unitGtin: '7891150059849',
        widthMm: 90,
      },
    })
  })

  test('a caixa da mesma linha continua mapeada como antes (a unidade não muda a 162)', () => {
    const result = mapPackageBoxCatalogCaptureLine(FOUND_WITH_UNIT_LINE)
    expect(result).toEqual({ accepted: true, candidate: FOUND_CM_KG_EXPECTED_CANDIDATE })
  })

  test('no_dimensions com unidade é aceita (antes ignorada)', () => {
    const result = mapPackageBoxCatalogCaptureUnit(NO_DIMENSIONS_WITH_UNIT_LINE)
    expect(result?.accepted).toBe(true)
  })

  test('found_unit_manual vira manual:<domínio>, peso sem unidade na string', () => {
    expect(mapPackageBoxCatalogCaptureUnit(FOUND_UNIT_MANUAL_LINE)).toEqual({
      accepted: true,
      unit: {
        cartonGtin: '17891150039503',
        grossWeightGrams: 85,
        heightMm: 30,
        lengthMm: 60,
        source: 'manual:www.drogaria.com.br',
        unitGtin: '7891150039506',
        widthMm: 90,
      },
    })
  })

  test('linha sem unitEdges → undefined (não há unidade a importar)', () => {
    expect(mapPackageBoxCatalogCaptureUnit(FOUND_CM_KG_CAPTURE_LINE)).toBeUndefined()
  })

  test('unidade sem unidade declarada → UNIT_MISSING; aresta faltando → EDGES_INCOMPLETE', () => {
    expect(
      mapPackageBoxCatalogCaptureUnit({
        ...FOUND_UNIT_MANUAL_LINE,
        extracted: {
          edges: {},
          unitEdges: { ...LUX_UNIT_EDGES, altura: { unit: '', value: '3' } },
        },
      }),
    ).toEqual({ accepted: false, code: 'UNIT_MISSING' })
    expect(
      mapPackageBoxCatalogCaptureUnit({
        ...FOUND_UNIT_MANUAL_LINE,
        extracted: { edges: {}, unitEdges: { comprimento: LUX_UNIT_EDGES.comprimento } },
      }),
    ).toEqual({ accepted: false, code: 'EDGES_INCOMPLETE' })
  })

  test('sem cartonGtin → CARTON_GTIN_MISSING', () => {
    // JSON descarta o `undefined`: a linha sai do jeito que o JSONL a traria, sem `cartonGtin`.
    const withoutCarton = packageBoxCatalogCaptureLineSchema.parse(
      JSON.parse(JSON.stringify({ ...FOUND_UNIT_MANUAL_LINE, cartonGtin: undefined })),
    )
    expect(mapPackageBoxCatalogCaptureUnit(withoutCarton)).toEqual({
      accepted: false,
      code: 'CARTON_GTIN_MISSING',
    })
  })
})

describe('createImportPackageBoxCatalog com unidade (spec 163, RF05)', () => {
  function createFakeRepository(): {
    readonly calls: {
      groups: readonly PackageBoxCatalogImportGroup[]
      units: readonly PackageBoxCatalogImportUnit[]
    }[]
    readonly repository: PackageBoxCatalogImportRepositoryPort
  } {
    const calls: {
      groups: readonly PackageBoxCatalogImportGroup[]
      units: readonly PackageBoxCatalogImportUnit[]
    }[] = []
    return {
      calls,
      repository: {
        async importCandidates(input) {
          calls.push({ groups: input.groups, units: input.units })
          return input.units.map((unit) => ({
            cartonGtin: unit.cartonGtin,
            outcome: 'unit_recorded' as const,
          }))
        },
      },
    }
  }

  test('linha só com unidade não é ignored_status e chega ao repositório', async () => {
    const fake = createFakeRepository()
    const report = await createImportPackageBoxCatalog({ repository: fake.repository }).execute({
      apply: false,
      lines: [JSON.stringify(FOUND_UNIT_MANUAL_LINE), JSON.stringify(NO_DIMENSIONS_CAPTURE_LINE)],
    })

    expect(report.ignoredStatus).toBe(1)
    expect(report.parseRejected.EDGES_INCOMPLETE).toBe(0)
    expect(report.outcomes.unit_recorded).toBe(1)
    expect(fake.calls[0]?.groups).toEqual([])
    expect(fake.calls[0]?.units.map((unit) => unit.source)).toEqual(['manual:www.drogaria.com.br'])
  })

  test('unidade implausível (2160 mm) é rejeitada com UNIT_EDGE_OUT_OF_RANGE, nunca gravada', async () => {
    const fake = createFakeRepository()
    const report = await createImportPackageBoxCatalog({ repository: fake.repository }).execute({
      apply: true,
      lines: [
        JSON.stringify({
          ...FOUND_UNIT_MANUAL_LINE,
          extracted: {
            edges: {},
            unitEdges: {
              ...FOUND_UNIT_MANUAL_LINE.extracted.unitEdges,
              lado3: { unit: 'cm', value: '216' },
            },
          },
        }),
      ],
    })

    expect(report.unitRejected).toBe(1)
    expect(report.rejections[0]?.codes).toEqual(['UNIT_EDGE_OUT_OF_RANGE'])
    expect(fake.calls).toHaveLength(0)
  })

  test('caixa e unidade da mesma linha seguem juntas para o repositório', async () => {
    const fake = createFakeRepository()
    await createImportPackageBoxCatalog({ repository: fake.repository }).execute({
      apply: false,
      lines: [
        JSON.stringify({
          ...FOUND_WITH_UNIT_LINE,
          extracted: {
            ...FOUND_WITH_UNIT_LINE.extracted,
            edges: {
              altura: { unit: 'cm', value: '12,8 cm' },
              comprimento: { unit: 'cm', value: '18,8 cm' },
              largura: { unit: 'cm', value: '18,8 cm' },
            },
            grossWeight: { unit: 'kg', value: '2,2 kg' },
            unitsPerCarton: 24,
          },
        }),
      ],
    })
    expect(fake.calls[0]?.groups).toHaveLength(1)
    expect(fake.calls[0]?.units).toHaveLength(1)
  })
})
