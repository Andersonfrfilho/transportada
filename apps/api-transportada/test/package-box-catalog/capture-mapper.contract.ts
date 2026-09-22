/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 162, RF03 — CA01 (conversão de unidade) e CA02 (fixture torta rejeitada pela sanidade da
 * spec 160, `evaluatePackageBoxCatalogSanity`, reusada sem alteração).
 */
import { describe, expect, test } from 'bun:test'

import {
  CROOKED_CAPTURE_LINE,
  FOUND_CM_KG_CAPTURE_LINE,
  FOUND_CM_KG_EXPECTED_CANDIDATE,
  FOUND_MANUAL_LADO_CAPTURE_LINE,
  FOUND_MANUAL_LADO_EXPECTED_CANDIDATE,
  NO_DIMENSIONS_CAPTURE_LINE,
} from '../fixtures/package-box-catalog-capture.fixture.js'
import { mapPackageBoxCatalogCaptureLine } from '../../src/nfe-documents/domain/package-box-catalog-capture.mapper.js'
import { packageBoxCatalogCaptureLineSchema } from '../../src/nfe-documents/domain/package-box-catalog-capture.schema.js'
import { evaluatePackageBoxCatalogSanity } from '../../src/nfe-documents/domain/package-box-catalog-sanity.policy.js'

describe('packageBoxCatalogCaptureLineSchema (spec 162, RF03)', () => {
  test('aceita a linha real found (cm/kg) e a linha found_manual (lado1..3)', () => {
    expect(packageBoxCatalogCaptureLineSchema.safeParse(FOUND_CM_KG_CAPTURE_LINE).success).toBe(
      true,
    )
    expect(
      packageBoxCatalogCaptureLineSchema.safeParse(FOUND_MANUAL_LADO_CAPTURE_LINE).success,
    ).toBe(true)
  })

  test('linha inválida (status ausente) não derruba o parse do lote — só essa linha falha', () => {
    const result = packageBoxCatalogCaptureLineSchema.safeParse({
      extracted: { edges: {} },
      unitGtin: '123',
    })
    expect(result.success).toBe(false)
  })
})

describe('mapPackageBoxCatalogCaptureLine (spec 162, RF03, CA01)', () => {
  test('CA01: "330,0 cm" → 3300 mm e "0,010 kg" → 10 g, pela unidade declarada', () => {
    const result = mapPackageBoxCatalogCaptureLine(FOUND_CM_KG_CAPTURE_LINE)

    expect(result.accepted).toBe(true)
    if (!result.accepted) throw new Error('esperava aceite')
    expect(result.candidate).toEqual(FOUND_CM_KG_EXPECTED_CANDIDATE)
  })

  test('CA01: linha found_manual com lado1..3 mapeia na ordem comprimento/largura/altura', () => {
    const result = mapPackageBoxCatalogCaptureLine(FOUND_MANUAL_LADO_CAPTURE_LINE)

    expect(result.accepted).toBe(true)
    if (!result.accepted) throw new Error('esperava aceite')
    expect(result.candidate).toEqual(FOUND_MANUAL_LADO_EXPECTED_CANDIDATE)
  })

  test('status fora de found/found_manual é IGNORED_STATUS, nunca gravado', () => {
    const result = mapPackageBoxCatalogCaptureLine(NO_DIMENSIONS_CAPTURE_LINE)

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.code).toBe('IGNORED_STATUS')
  })

  test('CA01: unidade ausente na aresta → UNIT_MISSING, nunca suposição de unidade', () => {
    const result = mapPackageBoxCatalogCaptureLine({
      ...FOUND_CM_KG_CAPTURE_LINE,
      extracted: {
        ...FOUND_CM_KG_CAPTURE_LINE.extracted,
        edges: {
          altura: { unit: 'cm', value: '200,0 cm' },
          comprimento: { unit: '', value: '330,0' },
          largura: { unit: 'cm', value: '160,0 cm' },
        },
      },
    })

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.code).toBe('UNIT_MISSING')
  })

  test('CA01: peso bruto ausente vira 0 g — a sanidade (não o parser) rejeita o que for implausível', () => {
    const result = mapPackageBoxCatalogCaptureLine({
      ...FOUND_CM_KG_CAPTURE_LINE,
      extracted: { edges: FOUND_CM_KG_CAPTURE_LINE.extracted.edges },
    })

    expect(result.accepted).toBe(true)
    if (!result.accepted) throw new Error('esperava aceite')
    expect(result.candidate.grossWeightGrams).toBe(0)
  })

  test('sem carton_gtin de topo, não há chave de casamento: CARTON_GTIN_MISSING', () => {
    const result = mapPackageBoxCatalogCaptureLine({
      ...FOUND_CM_KG_CAPTURE_LINE,
      cartonGtin: undefined,
    })

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.code).toBe('CARTON_GTIN_MISSING')
  })

  test('arestas incompletas (nem comprimento/altura/largura, nem lado1..3): EDGES_INCOMPLETE', () => {
    const result = mapPackageBoxCatalogCaptureLine({
      ...FOUND_CM_KG_CAPTURE_LINE,
      extracted: { edges: { altura: { unit: 'cm', value: '200,0 cm' } } },
    })

    expect(result.accepted).toBe(false)
    if (result.accepted) throw new Error('esperava rejeição')
    expect(result.code).toBe('EDGES_INCOMPLETE')
  })

  test('CA02: a linha torta do Tixan mapeia para uma candidata que a sanidade da spec 160 rejeita por EDGE_TOO_LARGE — nada é gravado', () => {
    const mapped = mapPackageBoxCatalogCaptureLine(CROOKED_CAPTURE_LINE)
    expect(mapped.accepted).toBe(true)
    if (!mapped.accepted) throw new Error('esperava aceite do parser')

    const sanity = evaluatePackageBoxCatalogSanity(mapped.candidate, {
      unitNetWeightGrams: 1600,
    })

    expect(sanity.accepted).toBe(false)
    if (sanity.accepted) throw new Error('esperava rejeição da sanidade')
    expect(sanity.reasons).toContain('EDGE_TOO_LARGE')
  })
})
